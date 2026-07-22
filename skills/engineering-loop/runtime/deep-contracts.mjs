import {
  computeMigrationManifestHash,
  isSafeProjectPath,
} from "./contracts.mjs";

const DECISION_RECORDS = new Set(["CONTEXT", "ADR"]);
const MIGRATION_ACTIONS = new Set(["MOVE", "REWRITE", "DELETE"]);

/** @param {unknown} researchValue @param {unknown} deepValue */
export function validateDeepResearchContract(researchValue, deepValue) {
  /** @type {string[]} */
  const errors = [];
  const research = objectValue(researchValue);
  const deep = objectValue(deepValue);
  const facts = Array.isArray(research?.facts) ? research.facts : [];
  const factIds = new Set(
    facts.filter((fact) => objectValue(fact) && isEvidenceId(fact.id)).map((fact) => fact.id),
  );
  const requiredEvidenceIds = Array.isArray(deep?.requiredEvidenceIds)
    ? deep.requiredEvidenceIds
    : [];
  if (
    requiredEvidenceIds.length === 0 ||
    new Set(requiredEvidenceIds).size !== requiredEvidenceIds.length ||
    !requiredEvidenceIds.every(isEvidenceId)
  ) {
    errors.push("requiredEvidenceIds must identify unique high-risk evidence");
  }
  for (const evidenceId of requiredEvidenceIds) {
    if (!factIds.has(evidenceId)) {
      errors.push(`required high-risk evidence is missing: ${evidenceId}`);
    }
  }

  const domainModel = objectValue(research?.domainModel);
  const boundaries = Array.isArray(domainModel?.boundaries) ? domainModel.boundaries : [];
  const decisions = Array.isArray(domainModel?.decisions) ? domainModel.decisions : [];
  const boundaryIds = new Set();
  if (boundaries.length === 0) {
    errors.push("domainModel.boundaries must be non-empty");
  }
  for (const boundaryValue of boundaries) {
    const boundary = objectValue(boundaryValue);
    if (
      !boundary ||
      !isEvidenceId(boundary.id) ||
      boundaryIds.has(boundary.id) ||
      !isText(boundary.name) ||
      !isTextList(boundary.responsibilities) ||
      !isEvidenceList(boundary.evidenceIds) ||
      boundary.evidenceIds.some((/** @type {string} */ id) => !factIds.has(id))
    ) {
      errors.push("every domain boundary must be unique and linked to repository evidence");
      continue;
    }
    boundaryIds.add(boundary.id);
  }
  if (decisions.length === 0) {
    errors.push("domainModel.decisions must record CONTEXT or ADR decisions");
  }
  const decisionIds = new Set();
  for (const decisionValue of decisions) {
    const decision = objectValue(decisionValue);
    if (
      !decision ||
      !isEvidenceId(decision.id) ||
      decisionIds.has(decision.id) ||
      !DECISION_RECORDS.has(decision.record) ||
      !isText(decision.statement) ||
      !isEvidenceList(decision.boundaryIds) ||
      decision.boundaryIds.some((/** @type {string} */ id) => !boundaryIds.has(id)) ||
      !isEvidenceList(decision.evidenceIds) ||
      decision.evidenceIds.some((/** @type {string} */ id) => !factIds.has(id))
    ) {
      errors.push("every domain decision must be allowed and linked to boundaries and evidence");
      continue;
    }
    decisionIds.add(decision.id);
  }
  const linkedEvidence = new Set(boundaries.flatMap((boundary) => boundary.evidenceIds ?? []));
  for (const evidenceId of requiredEvidenceIds) {
    if (factIds.has(evidenceId) && !linkedEvidence.has(evidenceId)) {
      errors.push(`required high-risk evidence is not linked to a domain boundary: ${evidenceId}`);
    }
  }
  return { valid: errors.length === 0, status: errors.length === 0 ? "READY" : "BLOCKED", errors };
}

/**
 * @param {unknown} planValue
 * @param {unknown} approvalValue
 * @param {{ writeLease?: string[], domainBoundaryIds?: string[] }} [expected]
 */
export function validateDeepPlanContract(planValue, approvalValue, expected = {}) {
  /** @type {string[]} */
  const errors = [];
  const plan = objectValue(planValue);
  const approval = objectValue(approvalValue);
  if (!plan || plan.schemaVersion !== 1) {
    errors.push("DEEP plan schemaVersion must equal 1");
    return { valid: false, status: "REVISE", errors };
  }
  if (!isGraph(plan.tickets)) {
    errors.push("tickets must form a non-empty dependency graph");
  }
  if (!isEvidenceList(plan.domainBoundaryIds)) {
    errors.push("domainBoundaryIds must link planning to the domain model");
  } else if (
    expected.domainBoundaryIds &&
    JSON.stringify([...plan.domainBoundaryIds].sort()) !==
      JSON.stringify([...expected.domainBoundaryIds].sort())
  ) {
    errors.push("domainBoundaryIds must exactly match researched domain boundaries");
  }
  const migration = objectValue(plan.migrationContract);
  if (
    !migration ||
    !isEvidenceId(migration.id) ||
    !isTextList(migration.preconditions) ||
    !isTextList(migration.postconditions)
  ) {
    errors.push("migrationContract must define preconditions and postconditions");
  }
  const rollback = objectValue(plan.rollbackPlan);
  if (
    !rollback ||
    !isEvidenceId(rollback.id) ||
    !isTextList(rollback.triggerConditions) ||
    !isTextList(rollback.steps) ||
    !isEvidenceList(rollback.verificationIds)
  ) {
    errors.push("rollbackPlan must define triggers, steps, and verification");
  }
  const manifest = objectValue(plan.migrationManifest);
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "MIGRATION_MANIFEST" ||
    manifest.hashAlgorithm !== "sha256" ||
    !Array.isArray(manifest.actions) ||
    manifest.actions.length === 0 ||
    !manifest.actions.every(isMigrationAction) ||
    new Set(manifest.actions.map((action) => action.path)).size !== manifest.actions.length
  ) {
    errors.push("migrationManifest must contain a complete destructive action scope");
  } else {
    const computedHash = computeMigrationManifestHash(manifest.actions);
    const destructivePaths = manifest.actions.flatMap((action) => [
      action.path,
      ...(action.action === "MOVE" ? [action.destination] : []),
    ]).sort();
    if (
      expected.writeLease &&
      JSON.stringify(destructivePaths) !== JSON.stringify([...expected.writeLease].sort())
    ) {
      errors.push("Migration Manifest destructive scope must exactly match the Write Lease");
    }
    if (manifest.hash !== computedHash) {
      errors.push("migrationManifest hash does not match its exact destructive scope");
    }
    if (
      !approval ||
      approval.schemaVersion !== 1 ||
      approval.approved !== true ||
      approval.manifestHash !== computedHash
    ) {
      errors.push("Migration Manifest approval must bind the exact manifest hash");
    }
  }
  return {
    valid: errors.length === 0,
    status: errors.length === 0 ? "READY_FOR_ADVISOR" : "REVISE",
    errors,
  };
}

/** @param {Record<string, any>} plan @param {string} manifestHash */
export function deepAdvisorEvidence(plan, manifestHash) {
  return [
    ...plan.domainBoundaryIds.map((/** @type {string} */ id) => `deep-domain-boundary-${id}`),
    `deep-manifest-approval-${manifestHash.slice(0, 16)}`,
    `deep-migration-contract-${plan.migrationContract.id}`,
    `deep-rollback-plan-${plan.rollbackPlan.id}`,
  ].sort();
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
function isText(value) {
  return typeof value === "string" && value.trim().length > 0 && !/[\r\n]/u.test(value);
}

/** @param {unknown} value */
function isTextList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isText);
}

/** @param {unknown} value */
function isEvidenceList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length &&
    value.every(isEvidenceId)
  );
}

/** @param {unknown} value */
function isGraph(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  const ids = new Set(value.map((ticket) => objectValue(ticket)?.id));
  if (ids.has(undefined) || ids.size !== value.length) {
    return false;
  }
  return value.every((ticketValue) => {
    const ticket = objectValue(ticketValue);
    return (
      ticket &&
      isEvidenceId(ticket.id) &&
      Array.isArray(ticket.dependencies) &&
      new Set(ticket.dependencies).size === ticket.dependencies.length &&
      ticket.dependencies.every((id) => isEvidenceId(id) && id !== ticket.id && ids.has(id))
    );
  });
}

/** @param {unknown} value */
function isMigrationAction(value) {
  const action = objectValue(value);
  if (!action || !MIGRATION_ACTIONS.has(action.action) || !isSafeProjectPath(action.path)) {
    return false;
  }
  if (!isSha256(action.sourceSha256)) {
    return false;
  }
  if (action.action === "MOVE") {
    return isSafeProjectPath(action.destination) && action.contentSha256 === undefined;
  }
  if (action.action === "REWRITE") {
    return isSha256(action.contentSha256) && action.destination === undefined;
  }
  return action.destination === undefined && action.contentSha256 === undefined;
}

/** @param {unknown} value */
function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
