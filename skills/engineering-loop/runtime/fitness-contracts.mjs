const FITNESS_ORDER = Object.freeze([
  "VERSION_DETECTION",
  "DOCUMENTATION",
  "COMPARISON",
  "VERDICT",
]);
const FITNESS_STATUSES = new Set(["PASS", "DEGRADED", "BLOCKED"]);
const EVIDENCE_KINDS = new Set([
  "INSTRUMENTAL",
  "PRIMARY",
  "REPOSITORY",
  "REVIEWER_OPINION",
]);

/**
 * @param {unknown} value
 * @returns {{ required: boolean, reasons: string[] }}
 */
export function selectFitnessTrigger(value) {
  const triggers = objectValue(value);
  const keys = ["dependencyApi", "repositoryPrecedent", "substantialComplexity"];
  if (
    !triggers ||
    !hasExactKeys(triggers, keys) ||
    keys.some((key) => typeof triggers[key] !== "boolean")
  ) {
    throw new Error("Solution Fitness triggers must be an explicit boolean matrix.");
  }
  const reasons = [
    ...(triggers.repositoryPrecedent ? ["REPOSITORY_PRECEDENT"] : []),
    ...(triggers.dependencyApi ? ["DEPENDENCY_API"] : []),
    ...(triggers.substantialComplexity ? ["SUBSTANTIAL_COMPLEXITY"] : []),
  ];
  return { required: reasons.length > 0, reasons };
}

/**
 * @param {{
 *   contract: {
 *     packetHash: string,
 *     codeFingerprint: string,
 *     reviewRound: number,
 *     risk: string,
 *     triggers: Record<string, boolean>,
 *     writeLease: string[],
 *     contextPaths: string[],
 *     verificationIds: string[],
 *     ticketVerificationId: string,
 *   },
 *   version: unknown,
 *   documentation: unknown,
 *   comparison: unknown,
 * }} input
 */
export function validateSolutionFitnessArtifact(input) {
  const contract = validateContract(input.contract);
  const trigger = selectFitnessTrigger(contract.triggers);
  if (!trigger.required) {
    throw new Error("Solution Fitness artifact is invalid without a trigger.");
  }

  const version = validateFitnessVersionEvidence(input.version);
  const documentation = validateFitnessDocumentationEvidence(input.documentation, version);
  const comparison = validateComparison(input.comparison, contract);
  const evidence = [
    version.evidence,
    ...documentation.sources,
    ...comparison.evidence,
  ];
  const evidenceById = indexEvidence(evidence);
  validateEvidenceReferences(comparison, documentation, evidenceById);

  const verdictEvidence = comparison.verdict.evidenceIds.map(
    (/** @type {string} */ id) => evidenceById.get(id),
  );
  if (
    !verdictEvidence.some(
      (/** @type {Record<string, any> | undefined} */ entry) =>
        entry?.kind === "INSTRUMENTAL" || entry?.kind === "PRIMARY",
    )
  ) {
    throw new Error(
      "Solution Fitness verdict requires instrumental or primary-source evidence.",
    );
  }

  const primarySources = documentation.sources.filter((entry) => entry.kind === "PRIMARY");
  const missingPrimary = primarySources.length === 0;
  const missingMandatoryPrimary = contract.risk === "HIGH" && missingPrimary;
  const lowRiskVersionEvidenceGap =
    contract.risk === "LOW" && version.applicable && missingPrimary;
  const simplerBuiltIn = comparison.documentedBuiltIns.find(
    (builtIn) =>
      builtIn.viable &&
      builtIn.simpler &&
      builtIn.evidenceIds.some(
        (/** @type {string} */ id) => evidenceById.get(id)?.kind === "PRIMARY",
      ),
  );
  const customBlocked =
    comparison.solution.kind === "CUSTOM" &&
    comparison.solution.intentional &&
    simplerBuiltIn !== undefined;
  const evidenceBackedMisfit =
    comparison.taskFit.status === "MISFIT" ||
    (
      comparison.solution.kind === "CUSTOM" &&
      comparison.complexity.level === "HIGH" &&
      comparison.localPatterns.some((pattern) => pattern.relation === "CONFLICT")
    );
  const correctiveBlocked = customBlocked || evidenceBackedMisfit;
  const expectedStatus =
    missingMandatoryPrimary
      ? "BLOCKED"
      : correctiveBlocked
        ? "BLOCKED"
        : documentation.context7Status === "UNAVAILABLE" || lowRiskVersionEvidenceGap
          ? "DEGRADED"
          : "PASS";
  if (comparison.verdict.status !== expectedStatus) {
    throw new Error(
      `Unsupported Solution Fitness verdict: expected ${expectedStatus}, received ${comparison.verdict.status}.`,
    );
  }

  /** @type {Record<string, any>[]} */
  let findings = [];
  if (!missingMandatoryPrimary && correctiveBlocked) {
    findings = [
      validateFitnessFinding(
        comparison.verdict.finding,
        contract,
        new Set(comparison.verdict.evidenceIds),
      ),
    ];
  } else if (comparison.verdict.finding !== null) {
    throw new Error("Solution Fitness verdict includes an unsupported blocking finding.");
  }

  const unverified = [
    ...(missingPrimary
      ? [
          ...(missingMandatoryPrimary ? ["mandatory-primary-evidence"] : []),
          ...(lowRiskVersionEvidenceGap ? ["primary-evidence"] : []),
        ]
      : []),
    ...(
      documentation.context7Status === "UNAVAILABLE" && !missingPrimary
        ? ["context7-version-sensitive-evidence"]
        : []
    ),
  ];
  return {
    schemaVersion: 1,
    status: expectedStatus,
    context: {
      role: "SOLUTION_FITNESS",
      fresh: true,
      readOnly: true,
      packetHash: contract.packetHash,
      codeFingerprint: contract.codeFingerprint,
      reviewRound: contract.reviewRound,
    },
    triggers: trigger.reasons,
    ordering: FITNESS_ORDER,
    version,
    documentation,
    evidence,
    comparison: {
      localPatterns: comparison.localPatterns,
      documentedBuiltIns: comparison.documentedBuiltIns,
      viableAlternatives: comparison.viableAlternatives,
      complexity: comparison.complexity,
      taskFit: comparison.taskFit,
      solution: comparison.solution,
    },
    verdictEvidence: comparison.verdict.evidenceIds,
    unverified,
    findings,
  };
}

/**
 * @param {Record<string, any>} contract
 * @returns {Record<string, any>}
 */
function validateContract(contract) {
  const trigger = selectFitnessTrigger(contract?.triggers);
  if (
    !isHash(contract?.packetHash) ||
    !isHash(contract?.codeFingerprint) ||
    !Number.isInteger(contract?.reviewRound) ||
    contract.reviewRound < 1 ||
    !["LOW", "HIGH"].includes(contract?.risk) ||
    !isUniqueTextList(contract?.writeLease) ||
    !isUniqueTextList(contract?.contextPaths) ||
    !isEvidenceList(contract?.verificationIds) ||
    !isEvidenceId(contract?.ticketVerificationId) ||
    !contract.verificationIds.includes(contract.ticketVerificationId)
  ) {
    throw new Error("Solution Fitness contract is invalid.");
  }
  return {
    ...contract,
    triggers: {
      repositoryPrecedent: trigger.reasons.includes("REPOSITORY_PRECEDENT"),
      dependencyApi: trigger.reasons.includes("DEPENDENCY_API"),
      substantialComplexity: trigger.reasons.includes("SUBSTANTIAL_COMPLEXITY"),
    },
  };
}

/** @param {unknown} value */
export function validateFitnessVersionEvidence(value) {
  const version = objectValue(value);
  if (
    !version ||
    !hasExactKeys(version, [
      "applicable",
      "dependency",
      "evidence",
      "installedVersion",
      "schemaVersion",
    ]) ||
    version.schemaVersion !== 1 ||
    typeof version.applicable !== "boolean"
  ) {
    throw new Error("Installed dependency version evidence is invalid.");
  }
  const evidence = validateEvidence(version.evidence);
  if (
    version.applicable
      ? !isSingleLineText(version.dependency) ||
        !isSingleLineText(version.installedVersion) ||
        evidence.kind !== "INSTRUMENTAL"
      : version.dependency !== null || version.installedVersion !== null
  ) {
    throw new Error("Installed dependency version evidence is invalid.");
  }
  return {
    schemaVersion: 1,
    applicable: version.applicable,
    dependency: version.dependency,
    installedVersion: version.installedVersion,
    evidence,
  };
}

/** @param {unknown} value @param {Record<string, any>} version */
export function validateFitnessDocumentationEvidence(value, version) {
  const documentation = objectValue(value);
  if (
    !documentation ||
    !hasExactKeys(documentation, [
      "applicable",
      "builtIns",
      "context7Status",
      "dependency",
      "documentedVersion",
      "provider",
      "schemaVersion",
      "sources",
    ]) ||
    documentation.schemaVersion !== 1 ||
    documentation.applicable !== version.applicable ||
    !["CONTEXT7", "OFFICIAL", "NONE"].includes(documentation.provider) ||
    !["AVAILABLE", "UNAVAILABLE", "NOT_APPLICABLE", "NOT_REQUESTED"].includes(
      documentation.context7Status,
    ) ||
    !Array.isArray(documentation.sources) ||
    !Array.isArray(documentation.builtIns)
  ) {
    throw new Error("Primary documentation evidence is invalid.");
  }
  const sources = documentation.sources.map(validateEvidence);
  const sourceIds = new Set(sources.map((entry) => entry.id));
  if (
    sourceIds.size !== sources.length ||
    sources.some((entry) => entry.kind !== "PRIMARY")
  ) {
    throw new Error("Primary documentation sources must be unique primary evidence.");
  }
  const builtIns = documentation.builtIns.map((value) =>
    validateDocumentedBuiltIn(value, sourceIds)
  );
  if (new Set(builtIns.map((entry) => entry.id)).size !== builtIns.length) {
    throw new Error("Documented built-in IDs must be unique.");
  }

  if (!version.applicable) {
    if (
      documentation.dependency !== null ||
      documentation.documentedVersion !== null ||
      documentation.context7Status !== "NOT_APPLICABLE" ||
      (
        documentation.provider === "NONE"
          ? sources.length !== 0 || builtIns.length !== 0
          : documentation.provider !== "OFFICIAL" || sources.length === 0
      )
    ) {
      throw new Error("Non-applicable dependency documentation is invalid.");
    }
  } else {
    if (documentation.dependency !== version.dependency) {
      throw new Error("Primary documentation targets a different dependency.");
    }
    if (
      documentation.documentedVersion !== null &&
      documentation.documentedVersion !== version.installedVersion
    ) {
      throw new Error("Primary documentation does not match the installed dependency version.");
    }
    if (
      documentation.provider === "NONE"
        ? documentation.documentedVersion !== null ||
          sources.length !== 0 ||
          builtIns.length !== 0
        : documentation.documentedVersion !== version.installedVersion ||
          sources.length === 0
    ) {
      throw new Error("Primary documentation availability is inconsistent.");
    }
  }
  return {
    schemaVersion: 1,
    applicable: documentation.applicable,
    dependency: documentation.dependency,
    documentedVersion: documentation.documentedVersion,
    provider: documentation.provider,
    context7Status: documentation.context7Status,
    sources,
    builtIns,
  };
}

/** @param {unknown} value @param {Set<string>} sourceIds */
function validateDocumentedBuiltIn(value, sourceIds) {
  const builtIn = objectValue(value);
  if (
    !builtIn ||
    !hasExactKeys(builtIn, ["evidenceIds", "id"]) ||
    !isEvidenceId(builtIn.id) ||
    !isEvidenceList(builtIn.evidenceIds) ||
    !builtIn.evidenceIds.every((/** @type {string} */ id) => sourceIds.has(id))
  ) {
    throw new Error("Documented built-in evidence is invalid.");
  }
  return { id: builtIn.id, evidenceIds: builtIn.evidenceIds };
}

/** @param {unknown} value @param {Record<string, any>} contract */
function validateComparison(value, contract) {
  const comparison = objectValue(value);
  if (
    !comparison ||
    !hasExactKeys(comparison, [
      "codeFingerprint",
      "complexity",
      "documentedBuiltIns",
      "evidence",
      "localPatterns",
      "ordering",
      "packetHash",
      "schemaVersion",
      "solution",
      "taskFit",
      "verdict",
      "viableAlternatives",
    ]) ||
    comparison.schemaVersion !== 1 ||
    comparison.packetHash !== contract.packetHash ||
    comparison.codeFingerprint !== contract.codeFingerprint ||
    JSON.stringify(comparison.ordering) !== JSON.stringify(FITNESS_ORDER) ||
    !Array.isArray(comparison.evidence) ||
    !Array.isArray(comparison.localPatterns) ||
    comparison.localPatterns.length === 0 ||
    !Array.isArray(comparison.documentedBuiltIns) ||
    !Array.isArray(comparison.viableAlternatives) ||
    comparison.viableAlternatives.length === 0
  ) {
    throw new Error("Solution Fitness comparison artifact is invalid.");
  }
  const evidence = comparison.evidence.map(validateEvidence);
  const localPatterns = comparison.localPatterns.map((entry) =>
    validateComparisonEntry(entry, ["id", "relation", "evidenceIds"], (value) =>
      ["MATCH", "CONFLICT", "NONE"].includes(value.relation)
    )
  );
  const documentedBuiltIns = comparison.documentedBuiltIns.map((entry) =>
    validateComparisonEntry(
      entry,
      ["evidenceIds", "id", "simpler", "viable"],
      (value) => typeof value.viable === "boolean" && typeof value.simpler === "boolean",
    )
  );
  const viableAlternatives = comparison.viableAlternatives.map((entry) =>
    validateComparisonEntry(
      entry,
      ["evidenceIds", "id", "viable"],
      (value) => typeof value.viable === "boolean",
    )
  );
  const complexity = validateEvidenceBearingValue(
    comparison.complexity,
    "level",
    ["LOW", "MEDIUM", "HIGH"],
  );
  const taskFit = validateEvidenceBearingValue(
    comparison.taskFit,
    "status",
    ["FIT", "MISFIT"],
  );
  const solution = objectValue(comparison.solution);
  if (
    !solution ||
    !hasExactKeys(solution, ["intentional", "kind"]) ||
    !["BUILT_IN", "CUSTOM"].includes(solution.kind) ||
    typeof solution.intentional !== "boolean"
  ) {
    throw new Error("Solution Fitness solution classification is invalid.");
  }
  const verdict = objectValue(comparison.verdict);
  if (
    !verdict ||
    !hasExactKeys(verdict, ["evidenceIds", "finding", "status"]) ||
    !FITNESS_STATUSES.has(verdict.status) ||
    !isEvidenceList(verdict.evidenceIds) ||
    (verdict.finding !== null && !objectValue(verdict.finding))
  ) {
    throw new Error("Solution Fitness verdict is invalid.");
  }
  return {
    evidence,
    localPatterns,
    documentedBuiltIns,
    viableAlternatives,
    complexity,
    taskFit,
    solution: { kind: solution.kind, intentional: solution.intentional },
    verdict: {
      status: verdict.status,
      evidenceIds: verdict.evidenceIds,
      finding: verdict.finding,
    },
  };
}

/** @param {unknown} value @param {string[]} keys @param {(value: Record<string, any>) => boolean} extra */
function validateComparisonEntry(value, keys, extra) {
  const entry = objectValue(value);
  if (
    !entry ||
    !hasExactKeys(entry, keys) ||
    !isEvidenceId(entry.id) ||
    !isEvidenceList(entry.evidenceIds) ||
    !extra(entry)
  ) {
    throw new Error("Solution Fitness comparison category is invalid.");
  }
  return { ...entry };
}

/** @param {unknown} value @param {string} field @param {string[]} allowed */
function validateEvidenceBearingValue(value, field, allowed) {
  const entry = objectValue(value);
  if (
    !entry ||
    !hasExactKeys(entry, ["evidenceIds", field]) ||
    !allowed.includes(entry[field]) ||
    !isEvidenceList(entry.evidenceIds)
  ) {
    throw new Error(`Solution Fitness ${field} comparison is invalid.`);
  }
  return { [field]: entry[field], evidenceIds: entry.evidenceIds };
}

/**
 * @param {Record<string, any>} comparison
 * @param {Record<string, any>} documentation
 * @param {Map<string, Record<string, any>>} evidenceById
 */
function validateEvidenceReferences(comparison, documentation, evidenceById) {
  const categories = [
    ...comparison.localPatterns,
    ...comparison.documentedBuiltIns,
    ...comparison.viableAlternatives,
    comparison.complexity,
    comparison.taskFit,
    comparison.verdict,
  ];
  if (
    categories.some((entry) =>
      entry.evidenceIds.some((/** @type {string} */ id) => !evidenceById.has(id))
    )
  ) {
    throw new Error("Solution Fitness comparison references unknown evidence.");
  }
  for (const pattern of comparison.localPatterns) {
    if (
      !pattern.evidenceIds.some(
        (/** @type {string} */ id) => evidenceById.get(id)?.kind === "REPOSITORY",
      )
    ) {
      throw new Error("Solution Fitness local patterns require repository evidence.");
    }
  }
  for (const category of [
    ...comparison.viableAlternatives,
    comparison.complexity,
    comparison.taskFit,
  ]) {
    if (
      !category.evidenceIds.some(
        (/** @type {string} */ id) =>
          ["INSTRUMENTAL", "PRIMARY"].includes(evidenceById.get(id)?.kind),
      )
    ) {
      throw new Error(
        "Solution Fitness comparison requires instrumental or primary-source evidence.",
      );
    }
  }
  const documentedById = new Map(
    documentation.builtIns.map(
      (/** @type {Record<string, any>} */ entry) => [entry.id, entry],
    ),
  );
  if (
    JSON.stringify([...documentedById.keys()].sort(compareIds)) !==
    JSON.stringify(
      comparison.documentedBuiltIns
        .map((/** @type {Record<string, any>} */ entry) => entry.id)
        .sort(compareIds),
    )
  ) {
    throw new Error("Solution Fitness must compare every documented built-in.");
  }
  for (const builtIn of comparison.documentedBuiltIns) {
    const documented = documentedById.get(builtIn.id);
    if (
      !documented ||
      builtIn.evidenceIds.some(
        (/** @type {string} */ id) => !documented.evidenceIds.includes(id),
      )
    ) {
      throw new Error("Solution Fitness built-in is not supported by primary documentation.");
    }
    if (
      builtIn.viable &&
      !comparison.viableAlternatives.some(
        (/** @type {Record<string, any>} */ alternative) =>
          alternative.id === builtIn.id && alternative.viable,
      )
    ) {
      throw new Error("Solution Fitness viable built-in is missing from alternatives.");
    }
  }
}

/**
 * @param {unknown} value
 * @param {Record<string, any>} contract
 * @param {Set<string>} verdictEvidenceIds
 */
function validateFitnessFinding(value, contract, verdictEvidenceIds) {
  const finding = objectValue(value);
  const expectedKeys = [
    "blockers",
    "contextPaths",
    "evidence",
    "id",
    "requirementIds",
    "summary",
    "verificationIds",
    "writeLease",
  ];
  if (
    !finding ||
    !hasExactKeys(finding, expectedKeys) ||
    !isEvidenceId(finding.id) ||
    !isSingleLineText(finding.summary) ||
    !isEvidenceList(finding.evidence) ||
    !finding.evidence.every((/** @type {string} */ id) => verdictEvidenceIds.has(id)) ||
    JSON.stringify(finding.requirementIds) !== JSON.stringify(["solution-fitness"]) ||
    !isEvidenceArray(finding.blockers) ||
    finding.blockers.includes(finding.id) ||
    !isUniqueTextList(finding.writeLease) ||
    !finding.writeLease.every((/** @type {string} */ path) => contract.writeLease.includes(path)) ||
    !isEvidenceList(finding.verificationIds) ||
    !finding.verificationIds.includes(contract.ticketVerificationId) ||
    !finding.verificationIds.every(
      (/** @type {string} */ id) => contract.verificationIds.includes(id),
    ) ||
    !isUniqueTextList(finding.contextPaths) ||
    !finding.contextPaths.every(
      (/** @type {string} */ path) => contract.contextPaths.includes(path),
    )
  ) {
    throw new Error("Solution Fitness blocking finding is not a bounded corrective contract.");
  }
  return {
    id: finding.id,
    summary: finding.summary,
    evidence: finding.evidence,
    requirementIds: finding.requirementIds,
    blockers: [...finding.blockers].sort(compareIds),
    writeLease: finding.writeLease,
    verificationIds: finding.verificationIds,
    contextPaths: finding.contextPaths,
  };
}

/** @param {Record<string, any>[]} evidence */
function indexEvidence(evidence) {
  const result = new Map();
  for (const entry of evidence) {
    if (result.has(entry.id)) {
      throw new Error(`Solution Fitness evidence ID is duplicated: ${entry.id}.`);
    }
    result.set(entry.id, entry);
  }
  return result;
}

/** @param {unknown} value */
function validateEvidence(value) {
  const evidence = objectValue(value);
  if (
    !evidence ||
    !hasExactKeys(evidence, ["id", "kind", "source"]) ||
    !isEvidenceId(evidence.id) ||
    !EVIDENCE_KINDS.has(evidence.kind) ||
    !isSingleLineText(evidence.source)
  ) {
    throw new Error("Solution Fitness evidence entry is invalid.");
  }
  return { id: evidence.id, kind: evidence.kind, source: evidence.source };
}

/** @param {unknown} value */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, any>} */ (value)
    : null;
}

/** @param {Record<string, any>} value @param {string[]} keys */
function hasExactKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

/** @param {unknown} value */
function isHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

/** @param {unknown} value */
function isEvidenceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

/** @param {unknown} value */
function isEvidenceList(value) {
  return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length &&
    value.every(isEvidenceId);
}

/** @param {unknown} value */
function isEvidenceArray(value) {
  return Array.isArray(value) && new Set(value).size === value.length && value.every(isEvidenceId);
}

/** @param {unknown} value */
function isUniqueTextList(value) {
  return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length &&
    value.every((entry) => isSingleLineText(entry));
}

/** @param {unknown} value */
function isSingleLineText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512 &&
    !/[\r\n]/u.test(value);
}

/** @param {string} left @param {string} right */
function compareIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
