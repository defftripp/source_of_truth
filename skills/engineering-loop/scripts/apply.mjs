import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readlink, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isSafeProjectPath,
  sha256,
  validateMigrationManifest,
} from "../runtime/contracts.mjs";
import {
  CANONICAL_PROJECT_SHELL_PATHS,
  materializeCanonicalShellEntry,
} from "./shell.mjs";

/**
 * @param {string} targetInput
 * @param {unknown} manifest
 * @param {string} approvedHash
 * @param {(target: string) => Promise<{ readiness: any, prepared: any }>} validatePrepared
 * @param {unknown} [overrides]
 */
export async function applyMigrationManifest(
  targetInput,
  manifest,
  approvedHash,
  validatePrepared,
  overrides,
) {
  const target = path.resolve(targetInput);
  const actions = await preflight(target, manifest, approvedHash, overrides);
  const candidate = /** @type {{ hash: string, actions: any[] }} */ (manifest);
  const transaction = path.join(path.dirname(target), `.engineering-migration-${randomUUID()}`);
  /** @type {{ kind: "CREATE" | "DELETE" | "MOVE" | "REWRITE", path: string, backup?: string, destination?: string }[]} */
  const mutations = [];
  await mkdir(transaction);
  try {
    for (const action of actions) {
      if (action.action === "CREATE") {
        mutations.push({ kind: "CREATE", path: action.path });
        await materializeCanonicalShellEntry(target, action.path);
      } else if (action.action === "DELETE") {
        const backup = path.join(transaction, "deleted", ...action.path.split("/"));
        await mkdir(path.dirname(backup), { recursive: true });
        await rename(path.join(target, ...action.path.split("/")), backup);
        mutations.push({ kind: "DELETE", path: action.path, backup });
      } else if (action.action === "MOVE") {
        const destination = path.join(target, ...action.destination.split("/"));
        await rename(path.join(target, ...action.path.split("/")), destination);
        mutations.push({ kind: "MOVE", path: action.path, destination: action.destination });
      } else if (action.action === "REWRITE") {
        const backup = path.join(transaction, "rewritten", ...action.path.split("/"));
        await mkdir(path.dirname(backup), { recursive: true });
        await rename(path.join(target, ...action.path.split("/")), backup);
        mutations.push({ kind: "REWRITE", path: action.path, backup });
        await writeFile(
          path.join(target, ...action.path.split("/")),
          Buffer.from(action.contentBase64, "base64"),
        );
      }
    }
    await verifyPreservedSources(target, actions);
    const { readiness, prepared } = await validatePrepared(target);
    await writeFile(
      path.join(transaction, "journal.json"),
      `${JSON.stringify({ schemaVersion: 1, target, manifestHash: candidate.hash, mutations }, null, 2)}\n`,
      "utf8",
    );
    return {
      ...prepared,
      manifestHash: candidate.hash,
      overridesApplied: actions.filter((action) => action.overridden).map(({ path, action }) => ({ path, action })),
      readiness,
      rollbackToken: transaction,
    };
  } catch (error) {
    await rollbackMutations(target, mutations);
    await rm(transaction, { recursive: true, force: true });
    throw error;
  }
}

/** @param {string} targetInput @param {string} tokenInput */
export async function rollbackMigration(targetInput, tokenInput) {
  const target = path.resolve(targetInput);
  const token = path.resolve(tokenInput);
  if (
    path.dirname(token) !== path.dirname(target) ||
    !path.basename(token).startsWith(".engineering-migration-")
  ) {
    throw new Error("Rollback token does not belong to the Target Project location.");
  }
  const journal = JSON.parse(await readFile(path.join(token, "journal.json"), "utf8"));
  if (
    !journal ||
    journal.schemaVersion !== 1 ||
    journal.target !== target ||
    typeof journal.manifestHash !== "string" ||
    !Array.isArray(journal.mutations)
  ) {
    throw new Error("Rollback token journal is invalid for this Target Project.");
  }
  for (const mutation of journal.mutations) {
    if (
      !mutation ||
      !["CREATE", "DELETE", "MOVE", "REWRITE"].includes(mutation.kind) ||
      !isSafeProjectPath(mutation.path)
    ) {
      throw new Error("Rollback token contains an invalid mutation.");
    }
    if (["DELETE", "REWRITE"].includes(mutation.kind)) {
      const backup = typeof mutation.backup === "string" ? path.resolve(mutation.backup) : "";
      const relative = path.relative(token, backup);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Rollback token contains an invalid backup path.");
      }
    }
    if (mutation.kind === "MOVE" && !isSafeProjectPath(mutation.destination)) {
      throw new Error("Rollback token contains an invalid MOVE destination.");
    }
  }
  await rollbackMutations(target, journal.mutations);
  await rm(token, { recursive: true, force: true });
  return {
    schemaVersion: 1,
    status: "NORMALIZATION_ROLLED_BACK",
    terminal: true,
    target: { path: target, kind: "directory" },
    manifestHash: journal.manifestHash,
  };
}

/** @param {string} target @param {unknown} manifest @param {string} approvedHash @param {unknown} overrides */
async function preflight(target, manifest, approvedHash, overrides) {
  const validation = validateMigrationManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Migration Manifest is invalid: ${validation.errors.join("; ")}`);
  }
  const candidate = /** @type {{ hash: string, actions: any[] }} */ (manifest);
  if (approvedHash !== candidate.hash) {
    throw new Error("Approval hash does not match the exact Migration Manifest hash.");
  }
  const actions = applyOverrides(candidate, overrides);
  const moveDestinations = new Set();
  const createdPaths = new Set(
    actions.filter((action) => action.action === "CREATE").map((action) => action.path),
  );
  for (const action of actions) {
    const absolute = path.join(target, ...action.path.split("/"));
    const stats = await lstat(absolute).catch(() => null);
    if (action.action === "CREATE") {
      if (!CANONICAL_PROJECT_SHELL_PATHS.includes(action.path)) {
        throw new Error(`CREATE path is not part of the Canonical Project Shell: ${action.path}`);
      }
      if (stats) {
        throw new Error(`CREATE path already exists: ${action.path}`);
      }
      continue;
    }
    if (!stats) {
      throw new Error(`Manifest source path is stale or missing: ${action.path}`);
    }
    if (action.sourceSha256) {
      const actual = await currentSourceHash(absolute, stats);
      if (actual !== action.sourceSha256) {
        throw new Error(`Manifest source hash is stale for ${action.path}`);
      }
    }
    if (
      ["MOVE", "REWRITE", "DELETE"].includes(action.action) &&
      (stats.isFile() || stats.isSymbolicLink()) &&
      !action.sourceSha256
    ) {
      throw new Error(`Destructive action requires a source hash for ${action.path}`);
    }
    if (action.action === "MOVE") {
      if (moveDestinations.has(action.destination)) {
        throw new Error(`MOVE destination is duplicated: ${action.destination}`);
      }
      moveDestinations.add(action.destination);
      const destination = path.join(target, ...action.destination.split("/"));
      if (await lstat(destination).catch(() => null)) {
        throw new Error(`MOVE destination already exists: ${action.destination}`);
      }
      const parent = await lstat(path.dirname(destination)).catch(() => null);
      const destinationParent = path.posix.dirname(action.destination);
      if (!parent?.isDirectory() && !createdPaths.has(destinationParent)) {
        throw new Error(`MOVE destination parent is missing: ${action.destination}`);
      }
    }
  }
  return actions;
}

/** @param {{ hash: string, actions: any[] }} manifest @param {unknown} value */
function applyOverrides(manifest, value) {
  if (value === undefined) {
    return manifest.actions;
  }
  if (!value || typeof value !== "object") {
    throw new Error("Migration overrides must be an object.");
  }
  const document = /** @type {Record<string, any>} */ (value);
  if (document.schemaVersion !== 1 || document.manifestHash !== manifest.hash) {
    throw new Error("Migration overrides must bind schema 1 to the exact manifest hash.");
  }
  if (!Array.isArray(document.overrides) || document.overrides.length === 0) {
    throw new Error("Migration overrides must contain at least one exact path/action.");
  }
  const actionByPath = new Map(manifest.actions.map((action) => [action.path, action]));
  const seen = new Set();
  for (const override of document.overrides) {
    if (!override || typeof override !== "object" || typeof override.path !== "string") {
      throw new Error("Each migration override must name an exact manifest path.");
    }
    if (seen.has(override.path)) {
      throw new Error(`Migration override path is duplicated: ${override.path}`);
    }
    seen.add(override.path);
    const original = actionByPath.get(override.path);
    if (!original) {
      throw new Error(`Migration override cannot expand scope to ${override.path}`);
    }
    if (!["KEEP", "PROTECT", "DELETE"].includes(override.action)) {
      throw new Error(`Migration override action is unsupported: ${override.action ?? ""}`);
    }
    actionByPath.set(override.path, {
      ...original,
      action: override.action,
      destructive: override.action === "DELETE",
      overridden: true,
    });
  }
  return manifest.actions.map((action) => actionByPath.get(action.path));
}

/** @param {string} target @param {any[]} actions */
async function verifyPreservedSources(target, actions) {
  for (const action of actions) {
    if (!["KEEP", "PROTECT"].includes(action.action) || !action.sourceSha256) {
      continue;
    }
    const absolute = path.join(target, ...action.path.split("/"));
    const actual = await currentSourceHash(absolute);
    if (actual !== action.sourceSha256) {
      throw new Error(`Protected source changed during normalization: ${action.path}`);
    }
  }
}

/** @param {string} absolute @param {import("node:fs").Stats | null} [knownStats] */
async function currentSourceHash(absolute, knownStats) {
  const stats = knownStats ?? (await lstat(absolute));
  if (stats.isFile()) {
    return sha256(await readFile(absolute));
  }
  if (stats.isSymbolicLink()) {
    return sha256(await readlink(absolute));
  }
  return null;
}

/** @param {string} target @param {{ kind: "CREATE" | "DELETE" | "MOVE" | "REWRITE", path: string, backup?: string, destination?: string }[]} mutations */
async function rollbackMutations(target, mutations) {
  for (const mutation of [...mutations].reverse()) {
    const destination = path.join(target, ...mutation.path.split("/"));
    if (mutation.kind === "CREATE") {
      await rm(destination, { recursive: true, force: true });
    } else if (mutation.kind === "MOVE" && mutation.destination) {
      await rename(path.join(target, ...mutation.destination.split("/")), destination);
    } else if (mutation.backup) {
      if (mutation.kind === "REWRITE") {
        await rm(destination, { recursive: true, force: true });
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(mutation.backup, destination);
    }
  }
}
