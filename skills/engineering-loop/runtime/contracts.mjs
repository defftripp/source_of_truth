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
