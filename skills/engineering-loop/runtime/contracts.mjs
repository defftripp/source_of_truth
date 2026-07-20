import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const ADOPTION_DECISIONS = Object.freeze([
  "USE_AS_IS",
  "WRAP",
  "ADAPT",
  "REPLACE",
  "EXCLUDE",
]);

/** @type {readonly MigrationActionKind[]} */
export const MIGRATION_ACTIONS = Object.freeze([
  "KEEP",
  "CREATE",
  "MOVE",
  "REWRITE",
  "DELETE",
  "PROTECT",
]);

/** @type {readonly MigrationOwner[]} */
export const MIGRATION_OWNERS = Object.freeze([
  "APPLICATION_CORE",
  "PROJECT_CONVENTION",
  "LOCAL_OVERRIDE",
  "PROJECT_RUNTIME",
]);
/** @type {readonly MigrationRisk[]} */
export const MIGRATION_RISKS = Object.freeze(["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const DESTRUCTIVE_MIGRATION_ACTIONS = new Set(["MOVE", "REWRITE", "DELETE"]);

const MATRIX_ENTRY_FIELDS = Object.freeze([
  "name",
  "source",
  "revision",
  "checksum",
  "license",
  "adoption",
  "localDelta",
  "compatibilityEvidence",
  "upgradeProcedure",
]);

/** @typedef {Record<string, unknown>} JsonObject */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} matrix */
export function validateAdoptionMatrix(matrix) {
  /** @type {string[]} */
  const errors = [];
  if (!matrix || typeof matrix !== "object") {
    return { valid: false, errors: ["matrix must be an object"] };
  }
  const candidate = /** @type {JsonObject} */ (matrix);
  if (candidate.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1");
  }
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) {
    errors.push("entries must be a non-empty array");
    return { valid: false, errors };
  }
  candidate.entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`entries[${index}] must be an object`);
      return;
    }
    const candidateEntry = /** @type {JsonObject} */ (entry);
    for (const field of MATRIX_ENTRY_FIELDS) {
      if (!isNonEmptyString(candidateEntry[field])) {
        errors.push(`entries[${index}].${field} must be a non-empty string`);
      }
    }
    if (
      isNonEmptyString(candidateEntry.revision) &&
      !/^[a-f0-9]{40}$/iu.test(candidateEntry.revision)
    ) {
      errors.push(`entries[${index}].revision must be a pinned Git commit`);
    }
    if (
      isNonEmptyString(candidateEntry.adoption) &&
      !ADOPTION_DECISIONS.includes(candidateEntry.adoption)
    ) {
      errors.push(`entries[${index}].adoption must be a supported decision`);
    }
    if (candidateEntry.adoption !== "EXCLUDE") {
      if (!isNonEmptyString(candidateEntry.artifact)) {
        errors.push(`entries[${index}].artifact must identify the adopted local artifact`);
      } else if (
        path.isAbsolute(candidateEntry.artifact) ||
        candidateEntry.artifact.split(/[\\/]/u).includes("..")
      ) {
        errors.push(`entries[${index}].artifact must stay within the Target Project`);
      }
    }
    if (
      isNonEmptyString(candidateEntry.checksum) &&
      !/^[a-f0-9]{64}$/iu.test(candidateEntry.checksum)
    ) {
      errors.push(`entries[${index}].checksum must be a SHA-256 digest`);
    }
  });
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} manifest */
export function validateRuntimeManifest(manifest) {
  /** @type {string[]} */
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["manifest must be an object"] };
  }
  const candidate = /** @type {JsonObject} */ (manifest);
  if (candidate.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1");
  }
  if (
    !isNonEmptyString(candidate.runtimeVersion) ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(candidate.runtimeVersion)
  ) {
    errors.push("runtimeVersion must be a pinned semantic version");
  }
  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    errors.push("files must be a non-empty array");
    return { valid: false, errors };
  }
  candidate.files.forEach((file, index) => {
    if (!file || typeof file !== "object") {
      errors.push(`files[${index}] must be an object`);
      return;
    }
    const candidateFile = /** @type {JsonObject} */ (file);
    if (!isNonEmptyString(candidateFile.path)) {
      errors.push(`files[${index}].path must be a non-empty string`);
    } else if (
      path.isAbsolute(candidateFile.path) ||
      candidateFile.path.split(/[\\/]/u).includes("..")
    ) {
      errors.push(`files[${index}].path must stay within the Target Project`);
    }
    if (
      !isNonEmptyString(candidateFile.sha256) ||
      !/^[a-f0-9]{64}$/iu.test(candidateFile.sha256)
    ) {
      errors.push(`files[${index}].sha256 must be a SHA-256 digest`);
    }
  });
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} manifest */
export function validateMigrationManifest(manifest) {
  /** @type {string[]} */
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["manifest must be an object"] };
  }
  const candidate = /** @type {JsonObject} */ (manifest);
  if (candidate.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1");
  }
  if (candidate.kind !== "MIGRATION_MANIFEST") {
    errors.push("kind must equal MIGRATION_MANIFEST");
  }
  if (candidate.hashAlgorithm !== "sha256") {
    errors.push("hashAlgorithm must equal sha256");
  }
  if (!isNonEmptyString(candidate.hash) || !/^[a-f0-9]{64}$/iu.test(candidate.hash)) {
    errors.push("hash must be a SHA-256 digest");
  }
  if (
    !candidate.humanGate ||
    typeof candidate.humanGate !== "object" ||
    /** @type {JsonObject} */ (candidate.humanGate).required !== true ||
    /** @type {JsonObject} */ (candidate.humanGate).approved !== false
  ) {
    errors.push("humanGate must require an unapproved Human Gate");
  }

  const inventory = validateMigrationInventory(candidate.inventory, errors);
  validateMigrationConflicts(candidate.conflicts, inventory, errors);
  if (!Array.isArray(candidate.actions) || candidate.actions.length === 0) {
    errors.push("actions must be a non-empty array");
    return { valid: false, errors };
  }

  /** @type {MigrationAction[]} */
  const actions = [];
  const actionPaths = new Set();
  candidate.actions.forEach((action, index) => {
    if (!action || typeof action !== "object") {
      errors.push(`actions[${index}] must be an object`);
      return;
    }
    const candidateAction = /** @type {JsonObject} */ (action);
    for (const field of ["action", "path", "ownership", "rationale", "risk", "rollback"]) {
      if (!isNonEmptyString(candidateAction[field])) {
        errors.push(`actions[${index}].${field} must be a non-empty string`);
      }
    }
    if (isNonEmptyString(candidateAction.action) && !isMigrationActionKind(candidateAction.action)) {
      errors.push(`actions[${index}].action must be a supported migration action`);
    }
    if (!isSafeProjectPath(candidateAction.path)) {
      errors.push(`actions[${index}].path must stay within the Target Project`);
    } else if (actionPaths.has(candidateAction.path)) {
      errors.push(`actions[${index}].path must be unique`);
    } else {
      actionPaths.add(candidateAction.path);
    }
    if (
      isNonEmptyString(candidateAction.ownership) &&
      !isMigrationOwner(candidateAction.ownership)
    ) {
      errors.push(`actions[${index}].ownership must be a supported owner`);
    }
    if (
      isNonEmptyString(candidateAction.risk) &&
      !isMigrationRisk(candidateAction.risk)
    ) {
      errors.push(`actions[${index}].risk must be a supported risk`);
    }
    const destructive = DESTRUCTIVE_MIGRATION_ACTIONS.has(
      isNonEmptyString(candidateAction.action) ? candidateAction.action : "",
    );
    if (candidateAction.destructive !== destructive) {
      errors.push(`actions[${index}].destructive must match its action`);
    }
    if (candidateAction.action === "MOVE") {
      if (!isSafeProjectPath(candidateAction.destination)) {
        errors.push(`actions[${index}].destination must stay within the Target Project`);
      }
    } else if (candidateAction.destination !== undefined) {
      errors.push(`actions[${index}].destination is only valid for MOVE`);
    }
    if (candidateAction.action === "REWRITE") {
      if (!isCanonicalBase64(candidateAction.contentBase64)) {
        errors.push(`actions[${index}].contentBase64 must be canonical base64 for REWRITE`);
      }
      if (
        !isNonEmptyString(candidateAction.contentSha256) ||
        !/^[a-f0-9]{64}$/iu.test(candidateAction.contentSha256)
      ) {
        errors.push(`actions[${index}].contentSha256 must be a SHA-256 digest for REWRITE`);
      } else if (
        isCanonicalBase64(candidateAction.contentBase64) &&
        sha256(Buffer.from(candidateAction.contentBase64, "base64")) !== candidateAction.contentSha256
      ) {
        errors.push(`actions[${index}].contentSha256 must match contentBase64`);
      }
    } else if (
      candidateAction.contentBase64 !== undefined ||
      candidateAction.contentSha256 !== undefined
    ) {
      errors.push(`actions[${index}].rewrite content is only valid for REWRITE`);
    }
    if (
      candidateAction.sourceSha256 !== undefined &&
      (!isNonEmptyString(candidateAction.sourceSha256) ||
        !/^[a-f0-9]{64}$/iu.test(candidateAction.sourceSha256))
    ) {
      errors.push(`actions[${index}].sourceSha256 must be a SHA-256 digest`);
    }
    actions.push(/** @type {MigrationAction} */ (action));
  });

  if (inventory) {
    const coveredPaths = new Set(actions.map((action) => action.path));
    for (const entry of inventory.entries) {
      if (entry.kind !== "directory" && !coveredPaths.has(entry.path)) {
        errors.push(`inventory path ${entry.path} must have a migration action`);
      }
    }
    for (const applicationPath of inventory.applicationCore) {
      const action = actions.find((candidateAction) => candidateAction.path === applicationPath);
      if (
        !action ||
        action.ownership !== "APPLICATION_CORE" ||
        !["KEEP", "PROTECT"].includes(action.action)
      ) {
        errors.push(`Application Core path ${applicationPath} must be kept or protected`);
      }
    }
    for (const action of actions) {
      if (action.action !== "CREATE" || !isSafeProjectPath(action.path)) {
        continue;
      }
      const blocker = findNonDirectoryAncestor(action.path, inventory.entries);
      if (blocker) {
        errors.push(`CREATE path ${action.path} has non-directory ancestor ${blocker.path}`);
      }
    }
  }

  const canComputeScope = actions.every(
    (action) => isSafeProjectPath(action.path) && MIGRATION_ACTIONS.includes(action.action),
  );
  if (canComputeScope) {
    const expectedScope = migrationDestructiveScope(actions);
    if (JSON.stringify(candidate.destructiveScope) !== JSON.stringify(expectedScope)) {
      errors.push("destructiveScope must exactly match every destructive action");
    }
    if (
      isNonEmptyString(candidate.hash) &&
      candidate.hash !== computeMigrationManifestHash(actions)
    ) {
      errors.push("hash must match the canonical migration action scope");
    }
  }
  return { valid: errors.length === 0, errors };
}

/** @param {MigrationAction[]} actions */
export function computeMigrationManifestHash(actions) {
  const scope = actions.map(migrationActionScope).sort(compareMigrationScopes);
  return sha256(JSON.stringify({ schemaVersion: 1, actions: scope }));
}

/** @param {MigrationAction[]} actions */
export function migrationDestructiveScope(actions) {
  return actions
    .filter((action) => DESTRUCTIVE_MIGRATION_ACTIONS.has(action.action))
    .map(migrationActionScope)
    .sort(compareMigrationScopes);
}

/**
 * @param {unknown} value
 * @param {string[]} errors
 */
function validateMigrationInventory(value, errors) {
  if (!value || typeof value !== "object") {
    errors.push("inventory must be an object");
    return null;
  }
  const inventory = /** @type {JsonObject} */ (value);
  if (!Array.isArray(inventory.entries)) {
    errors.push("inventory.entries must be an array");
    return null;
  }
  if (!Array.isArray(inventory.conventions)) {
    errors.push("inventory.conventions must be an array");
  }
  if (!Array.isArray(inventory.applicationCore)) {
    errors.push("inventory.applicationCore must be an array");
  }
  if (!Array.isArray(inventory.ignoredPaths)) {
    errors.push("inventory.ignoredPaths must be an array");
  }
  /** @type {{ path: string, kind: string }[]} */
  const entries = [];
  const entryPaths = new Set();
  inventory.entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`inventory.entries[${index}] must be an object`);
      return;
    }
    const candidateEntry = /** @type {JsonObject} */ (entry);
    if (!isSafeProjectPath(candidateEntry.path)) {
      errors.push(`inventory.entries[${index}].path must stay within the Target Project`);
      return;
    }
    if (entryPaths.has(candidateEntry.path)) {
      errors.push(`inventory.entries[${index}].path must be unique`);
    }
    entryPaths.add(candidateEntry.path);
    if (!isNonEmptyString(candidateEntry.kind)) {
      errors.push(`inventory.entries[${index}].kind must be a non-empty string`);
      return;
    }
    entries.push({ path: candidateEntry.path, kind: candidateEntry.kind });
  });
  const applicationCore = Array.isArray(inventory.applicationCore)
    ? inventory.applicationCore.filter(isNonEmptyString)
    : [];
  return { entries, applicationCore };
}

/**
 * @param {unknown} value
 * @param {{ entries: { path: string, kind: string }[], applicationCore: string[] } | null} inventory
 * @param {string[]} errors
 */
function validateMigrationConflicts(value, inventory, errors) {
  if (!Array.isArray(value)) {
    errors.push("conflicts must be an array");
    return;
  }
  value.forEach((conflict, index) => {
    if (!conflict || typeof conflict !== "object") {
      errors.push(`conflicts[${index}] must be an object`);
      return;
    }
    const candidate = /** @type {JsonObject} */ (conflict);
    if (!isSafeProjectPath(candidate.path)) {
      errors.push(`conflicts[${index}].path must stay within the Target Project`);
    }
    if (!isSafeProjectPath(candidate.blocker)) {
      errors.push(`conflicts[${index}].blocker must stay within the Target Project`);
    }
    if (!isNonEmptyString(candidate.rationale)) {
      errors.push(`conflicts[${index}].rationale must be a non-empty string`);
    }
    if (inventory && isSafeProjectPath(candidate.path) && isSafeProjectPath(candidate.blocker)) {
      const blocker = findNonDirectoryAncestor(candidate.path, inventory.entries);
      if (!blocker || blocker.path !== candidate.blocker) {
        errors.push(`conflicts[${index}] must identify its non-directory ancestor`);
      }
    }
  });
}

/**
 * @param {string} candidate
 * @param {{ path: string, kind: string }[]} entries
 */
function findNonDirectoryAncestor(candidate, entries) {
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const segments = candidate.split("/");
  for (let length = 1; length < segments.length; length += 1) {
    const ancestor = entryByPath.get(segments.slice(0, length).join("/"));
    if (ancestor && ancestor.kind !== "directory") {
      return ancestor;
    }
  }
  return null;
}

/** @param {unknown} value @returns {value is string} */
export function isSafeProjectPath(value) {
  return (
    isNonEmptyString(value) &&
    value !== "." &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/u).includes("..")
  );
}

/** @param {unknown} value @returns {value is string} */
function isCanonicalBase64(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/u.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

/** @param {unknown} value @returns {value is MigrationActionKind} */
function isMigrationActionKind(value) {
  return (
    typeof value === "string" &&
    MIGRATION_ACTIONS.includes(/** @type {MigrationActionKind} */ (value))
  );
}

/** @param {unknown} value @returns {value is MigrationOwner} */
function isMigrationOwner(value) {
  return (
    typeof value === "string" &&
    MIGRATION_OWNERS.includes(/** @type {MigrationOwner} */ (value))
  );
}

/** @param {unknown} value @returns {value is MigrationRisk} */
function isMigrationRisk(value) {
  return (
    typeof value === "string" &&
    MIGRATION_RISKS.includes(/** @type {MigrationRisk} */ (value))
  );
}

/** @param {MigrationAction} action */
function migrationActionScope(action) {
  return {
    action: action.action,
    path: action.path,
    ...(action.destination ? { destination: action.destination } : {}),
    ...(action.sourceSha256 ? { sourceSha256: action.sourceSha256 } : {}),
    ...(action.contentSha256 ? { contentSha256: action.contentSha256 } : {}),
  };
}

/** @param {ReturnType<typeof migrationActionScope>} left @param {ReturnType<typeof migrationActionScope>} right */
function compareMigrationScopes(left, right) {
  return (
    left.path.localeCompare(right.path, "en") ||
    left.action.localeCompare(right.action, "en") ||
    (left.destination ?? "").localeCompare(right.destination ?? "", "en") ||
    (left.sourceSha256 ?? "").localeCompare(right.sourceSha256 ?? "", "en")
  );
}

/** @param {string | Buffer} content */
export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * @param {string} root
 * @param {{ path: string, sha256: string }[]} files
 */
export async function verifyFileChecksums(root, files) {
  /** @type {string[]} */
  const errors = [];
  for (const file of files) {
    try {
      const content = await readFile(path.join(root, ...file.path.split("/")));
      const actual = sha256(content);
      if (actual !== file.sha256) {
        errors.push(`${file.path}: expected ${file.sha256}, received ${actual}`);
      }
    } catch {
      errors.push(`${file.path}: cannot be read`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * @typedef {{
 *   action: MigrationActionKind,
 *   path: string,
 *   ownership: MigrationOwner,
 *   rationale: string,
 *   risk: MigrationRisk,
 *   rollback: string,
 *   destructive: boolean,
 *   destination?: string,
 *   sourceSha256?: string,
 *   contentBase64?: string,
 *   contentSha256?: string
 * }} MigrationAction
 */

/** @typedef {"KEEP" | "CREATE" | "MOVE" | "REWRITE" | "DELETE" | "PROTECT"} MigrationActionKind */
/** @typedef {"APPLICATION_CORE" | "PROJECT_CONVENTION" | "LOCAL_OVERRIDE" | "PROJECT_RUNTIME"} MigrationOwner */
/** @typedef {"NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"} MigrationRisk */
