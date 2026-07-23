const REVIEW_STATUSES = new Set(["PASS", "BLOCKED"]);

/**
 * @param {unknown} reviewValue
 * @param {{
 *   role: string,
 *   packetHash: string,
 *   requirements: string[],
 *   writeLease: string[],
 *   contextPaths: string[],
 *   verificationIds: string[],
 *   ticketVerificationId: string,
 *   codeFingerprint: string,
 *   reviewRound: number,
 * }} contract
 */
export function validateIndependentReview(reviewValue, contract) {
  const review = objectValue(reviewValue);
  const expectedKeys = [
    "coverage",
    "evidence",
    "findings",
    "packetHash",
    "schemaVersion",
    "status",
    "unverified",
  ];
  if (
    !review ||
    JSON.stringify(Object.keys(review).sort()) !== JSON.stringify(expectedKeys) ||
    review.schemaVersion !== 1 ||
    !REVIEW_STATUSES.has(review.status) ||
    review.packetHash !== contract.packetHash ||
    !sameList(review.coverage, contract.requirements) ||
    !isEvidenceList(review.evidence) ||
    !isEvidenceArray(review.unverified) ||
    !Array.isArray(review.findings)
  ) {
    throw new Error(`${contract.role} requires coverage, evidence, and unverified areas.`);
  }

  const findings = review.findings.map((finding) => validateFinding(finding, contract));
  if (
    new Set(findings.map((finding) => finding.id)).size !== findings.length ||
    (review.status === "PASS" && findings.length !== 0) ||
    (review.status === "BLOCKED" && findings.length === 0)
  ) {
    throw new Error(`${contract.role} status must agree with its blocking findings.`);
  }

  return {
    schemaVersion: 1,
    status: review.status,
    context: {
      role: contract.role,
      fresh: true,
      readOnly: true,
      packetHash: contract.packetHash,
      codeFingerprint: contract.codeFingerprint,
      reviewRound: contract.reviewRound,
    },
    coverage: review.coverage,
    evidence: review.evidence,
    unverified: review.unverified,
    findings,
  };
}

/**
 * @param {{
 *   round: number,
 *   reviews: { artifact: string, review: Record<string, any> }[],
 *   existingTicketIds: string[],
 * }} input
 */
export function createCorrectiveTickets(input) {
  const sourceFindings = input.reviews.flatMap(({ artifact, review }) =>
    review.findings.map((/** @type {Record<string, any>} */ finding) => ({
      artifact,
      role: review.context.role,
      finding,
    }))
  ).sort((left, right) => compareIds(left.finding.id, right.finding.id));
  const findingIds = new Set(sourceFindings.map((entry) => entry.finding.id));
  if (findingIds.size !== sourceFindings.length) {
    throw new Error("Blocking finding IDs must be unique across both review roles.");
  }

  const ticketIdByFinding = new Map(
    sourceFindings.map((entry, index) => [
      entry.finding.id,
      `CORRECTION-R${input.round}-${index + 1}`,
    ]),
  );
  const existingTicketIds = new Set(input.existingTicketIds);
  for (const ticketId of ticketIdByFinding.values()) {
    if (existingTicketIds.has(ticketId)) {
      throw new Error(`Corrective ticket ID already exists: ${ticketId}.`);
    }
  }
  for (const { finding } of sourceFindings) {
    if (finding.blockers.some((/** @type {string} */ blocker) => !findingIds.has(blocker))) {
      throw new Error(`Blocking finding ${finding.id} references an unknown blocker.`);
    }
  }

  const tickets = sourceFindings.map(({ artifact, role, finding }) => ({
    id: ticketIdByFinding.get(finding.id),
    objective: `Correct blocking review finding ${finding.id}: ${finding.summary}`,
    acceptanceCriteria: finding.requirementIds,
    verificationIds: finding.verificationIds,
    dependencies: finding.blockers.map((/** @type {string} */ blocker) =>
      ticketIdByFinding.get(blocker)
    ).sort(compareIds),
    writeLease: finding.writeLease,
    contextPaths: finding.contextPaths,
    sourceFinding: {
      artifact,
      role,
      id: finding.id,
    },
    status: "OPEN",
    attempts: 0,
    verification: null,
    checkpointCommit: null,
    checkpointedAt: null,
  }));
  assertAcyclic(tickets);
  return {
    tickets,
    links: sourceFindings.map(({ artifact, finding }) => ({
      findingId: finding.id,
      reviewArtifact: artifact,
      correctiveTicketId: ticketIdByFinding.get(finding.id),
    })),
  };
}

/**
 * @param {{ artifacts?: { name?: string, sha256?: string }[] }[]} reviewRounds
 * @param {Record<string, string>} actualHashes
 */
export function validateImmutableReviewArtifacts(reviewRounds, actualHashes) {
  const errors = [];
  for (const round of reviewRounds) {
    for (const artifact of round.artifacts ?? []) {
      if (
        typeof artifact.name !== "string" ||
        typeof artifact.sha256 !== "string" ||
        actualHashes[artifact.name] !== artifact.sha256
      ) {
        errors.push(`review artifact changed after publication: ${artifact.name}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * @param {{
 *   reviewRounds: Record<string, any>[],
 *   tickets: Record<string, any>[],
 *   currentCodeFingerprint: string,
 *   fullVerification: Record<string, any> | null,
 *   executionCount: number,
 *   fitnessRequired?: boolean,
 * }} input
 */
export function validateReviewReleaseEvidence(input) {
  const errors = [];
  const latest = input.reviewRounds.at(-1);
  if (!latest) {
    errors.push("fresh Spec Review and Quality Review are required");
  } else {
    if ((latest.findings ?? []).length > 0) {
      errors.push("blocking corrections require a fresh repeated review round");
    }
    if (
      latest.reviews?.spec?.status !== "PASS" ||
      latest.reviews?.spec?.codeFingerprint !== input.currentCodeFingerprint
    ) {
      errors.push("latest Spec Review is stale");
    }
    if (
      latest.reviews?.quality?.status !== "PASS" ||
      latest.reviews?.quality?.codeFingerprint !== input.currentCodeFingerprint
    ) {
      errors.push("latest Quality Review is stale");
    }
    if (
      input.fitnessRequired === true &&
      (
        latest.fitness?.required !== true ||
        !["PASS", "DEGRADED"].includes(latest.fitness?.status) ||
        latest.fitness?.codeFingerprint !== input.currentCodeFingerprint
      )
    ) {
      errors.push("latest Solution Fitness Check is stale");
    }
  }

  const ticketById = new Map(input.tickets.map((ticket) => [ticket.id, ticket]));
  for (const round of input.reviewRounds) {
    for (const link of round.findings ?? []) {
      if (ticketById.get(link.correctiveTicketId)?.status !== "COMPLETE") {
        errors.push(`corrective ticket is incomplete: ${link.correctiveTicketId}`);
      }
    }
  }
  if (
    input.fullVerification?.status !== "PASS" ||
    input.fullVerification.codeFingerprint !== input.currentCodeFingerprint ||
    input.fullVerification.afterExecutionCount !== input.executionCount
  ) {
    errors.push("full relevant verification is stale");
  }
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} findingValue @param {Record<string, any>} contract */
function validateFinding(findingValue, contract) {
  const finding = objectValue(findingValue);
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
  const allowedRequirements = new Set(contract.requirements);
  const allowedWriteLease = new Set(contract.writeLease);
  const allowedContextPaths = new Set(contract.contextPaths);
  const allowedVerificationIds = new Set(contract.verificationIds);
  if (
    !finding ||
    JSON.stringify(Object.keys(finding).sort()) !== JSON.stringify(expectedKeys) ||
    !isEvidenceId(finding.id) ||
    !isSingleLineText(finding.summary) ||
    !isEvidenceList(finding.evidence) ||
    !isEvidenceList(finding.requirementIds) ||
    !finding.requirementIds.every((/** @type {string} */ id) => allowedRequirements.has(id)) ||
    !isEvidenceArray(finding.blockers) ||
    finding.blockers.includes(finding.id) ||
    !isUniqueTextList(finding.writeLease) ||
    !finding.writeLease.every((/** @type {string} */ value) => allowedWriteLease.has(value)) ||
    !isEvidenceList(finding.verificationIds) ||
    !finding.verificationIds.includes(contract.ticketVerificationId) ||
    !finding.verificationIds.every((/** @type {string} */ id) => allowedVerificationIds.has(id)) ||
    !isUniqueTextList(finding.contextPaths) ||
    !finding.contextPaths.every((/** @type {string} */ value) => allowedContextPaths.has(value))
  ) {
    throw new Error(`${contract.role} blocking finding is not a bounded corrective contract.`);
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

/** @param {Record<string, any>[]} tickets */
function assertAcyclic(tickets) {
  const completed = new Set();
  while (completed.size < tickets.length) {
    const frontier = tickets
      .filter((ticket) =>
        !completed.has(ticket.id) &&
        ticket.dependencies.every((/** @type {string} */ blocker) => completed.has(blocker))
      )
      .sort((left, right) => compareIds(left.id, right.id));
    if (frontier.length === 0) {
      throw new Error("Corrective finding blockers must form an acyclic graph.");
    }
    completed.add(frontier[0].id);
  }
}

/** @param {unknown} value */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, any>} */ (value)
    : null;
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
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

/** @param {unknown} value */
function isSingleLineText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 240 &&
    !/[\r\n]/u.test(value);
}

/** @param {unknown} left @param {unknown} right */
function sameList(left, right) {
  return Array.isArray(left) && JSON.stringify(left) === JSON.stringify(right);
}

/** @param {string} left @param {string} right */
function compareIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
