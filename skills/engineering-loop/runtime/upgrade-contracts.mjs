import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  computeMigrationManifestHash,
  migrationDestructiveScope,
  isSafeProjectPath,
  sha256,
  validateAdoptionMatrix,
  validateRuntimeManifest,
} from "./contracts.mjs";
import { diagnoseRuntime } from "./doctor-contracts.mjs";
import { buildRuntimeUpgradeCandidate } from "../scripts/shell.mjs";

const RUNS_PATH = ".engineering/runs";
const WINDOWS_POWERSHELL_PATH =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
/** @type {Promise<string> | undefined} */
let trustedGitPromise;
/** @type {Promise<string> | undefined} */
let trustedHooksPromise;

class UpgradeRecoveryGateError extends Error {
  /** @param {string} message @param {string} backupPath */
  constructor(message, backupPath) {
    super(message);
    this.name = "UpgradeRecoveryGateError";
    this.backupPath = backupPath;
  }
}

/**
 * @param {string} targetInput
 * @param {{
 *   dryRun?: boolean,
 *   approvedHash?: string,
 * }} [options]
 */
export async function upgradeRuntime(targetInput, options = {}) {
  const target = path.resolve(targetInput);
  const activeRuns = await findActiveEngineeringRuns(target);
  if (activeRuns.length > 0) {
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "BLOCKED",
      terminal: true,
      mutated: false,
      evidence: [
        {
          id: "active-engineering-runs",
          status: "BLOCKED",
          path: RUNS_PATH,
          runIds: activeRuns,
        },
      ],
      blocker: {
        reason: "ACTIVE_ENGINEERING_RUN",
        evidenceIds: ["active-engineering-runs"],
      },
    };
  }
  const installedManifest = await readJson(
    path.join(target, ".engineering", "runtime", "manifest.json"),
  );
  const installedAdoption = await readJson(
    path.join(target, ".engineering", "runtime", "upstream-adoption.json"),
  );
  const candidate = await buildRuntimeUpgradeCandidate();
  const candidateValidation = validateUpgradeCandidate(candidate);
  const installedManifestValidation = validateRuntimeManifest(installedManifest);
  const installedAdoptionValidation = validateAdoptionMatrix(installedAdoption);
  /** @type {Array<Record<string, any>>} */
  const evidence = [
    {
      id: "installed-runtime-contract",
      status:
        installedManifestValidation.valid && installedAdoptionValidation.valid
          ? "PASS"
          : "INVALID",
      details: [
        ...installedManifestValidation.errors,
        ...installedAdoptionValidation.errors,
      ],
    },
    {
      id: "upgrade-candidate-provenance",
      status: candidateValidation.valid ? "PASS" : "INVALID",
      details: candidateValidation.errors,
    },
  ];
  if (
    !installedManifestValidation.valid ||
    !installedAdoptionValidation.valid ||
    !candidateValidation.valid ||
    !candidate
  ) {
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "BLOCKED",
      terminal: true,
      mutated: false,
      evidence,
      blocker: {
        reason: "UPGRADE_PROVENANCE_INVALID",
        evidenceIds: evidence
          .filter((entry) => entry.status !== "PASS")
          .map((entry) => entry.id),
      },
    };
  }
  const runtimeDiff = {
    fromVersion: installedManifest.runtimeVersion,
    toVersion: candidate.runtimeVersion,
  };
  const upstreamDiff = diffUpstreamContracts(
    installedAdoption.entries,
    candidate.adoptionMatrix.entries,
  );
  const candidateProvenance = {
    runtimeVersion: candidate.runtimeVersion,
    runtimeManifest: candidate.manifest,
    adoptionMatrix: candidate.adoptionMatrix,
  };
  const preflightDoctor = await diagnoseRuntime(target);
  evidence.push({
    id: "installed-runtime-doctor",
    status: preflightDoctor.status === "READY" ? "PASS" : "BLOCKED",
    details:
      preflightDoctor.status === "READY"
        ? []
        : [`installed runtime Doctor status is ${preflightDoctor.status}`],
  });
  if (preflightDoctor.status !== "READY") {
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "BLOCKED",
      terminal: true,
      mutated: false,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
      blocker: {
        reason: "INSTALLED_RUNTIME_NOT_READY",
        evidenceIds: ["installed-runtime-doctor"],
      },
    };
  }
  const migrationManifest = await createUpgradeMigrationManifest(
    target,
    installedManifest,
    candidate,
  );
  if (
    migrationManifest &&
    options.approvedHash !== migrationManifest.hash
  ) {
    evidence.push({
      id: "upgrade-migration-manifest",
      status: "BLOCKED",
      hash: migrationManifest.hash,
      details: options.approvedHash
        ? ["provided approval hash does not match the exact upgrade scope"]
        : ["destructive runtime scope requires a Human Gate"],
    });
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "HUMAN_GATE",
      terminal: true,
      mutated: false,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
      migrationManifest,
      humanGate: {
        kind: "MIGRATION_MANIFEST",
        required: true,
        approved: false,
        hash: migrationManifest.hash,
      },
    };
  }
  if (options.dryRun) {
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      mode: "DRY_RUN",
      status: "READY",
      terminal: true,
      mutated: false,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
    };
  }
  if (
    migrationManifest === null &&
    JSON.stringify(installedManifest) === JSON.stringify(candidate.manifest) &&
    JSON.stringify(installedAdoption) ===
      JSON.stringify(candidate.adoptionMatrix)
  ) {
    evidence.push({
      id: "upgrade-current-version",
      status: "PASS",
      details: ["installed runtime already matches the pinned candidate"],
    });
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      mode: "UP_TO_DATE",
      status: "READY",
      terminal: true,
      mutated: false,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
    };
  }
  const compatibility = await runCandidateCompatibility(
    target,
    candidate,
    migrationManifest,
  );
  evidence.push({
    id: "upgrade-candidate-compatibility",
    status: compatibility.valid ? "PASS" : "INVALID",
    details: compatibility.errors,
  });
  if (!compatibility.valid) {
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "BLOCKED",
      terminal: true,
      mutated: false,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
      blocker: {
        reason: "COMPATIBILITY_FAILED",
        evidenceIds: ["upgrade-candidate-compatibility"],
      },
    };
  }
  const transactionCapability = await inspectUpgradeTransactionCapability();
  evidence.push({
    id: "upgrade-transaction-capability",
    status: transactionCapability.valid ? "PASS" : "BLOCKED",
    details: transactionCapability.errors,
  });
  if (!transactionCapability.valid) {
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "BLOCKED",
      terminal: true,
      mutated: false,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
      blocker: {
        reason: "SAFE_UPGRADE_TRANSACTION_UNAVAILABLE",
        evidenceIds: ["upgrade-transaction-capability"],
      },
    };
  }
  const gitStatus = await runGit(target, ["status", "--porcelain"]);
  if (gitStatus.stdout.trim() !== "") {
    evidence.push({
      id: "upgrade-git-precondition",
      status: "BLOCKED",
      details: ["Target Project worktree must be clean before upgrade"],
    });
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "BLOCKED",
      terminal: true,
      mutated: false,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
      blocker: {
        reason: "DIRTY_TARGET_WORKTREE",
        evidenceIds: ["upgrade-git-precondition"],
      },
    };
  }
  evidence.push({
    id: "upgrade-git-precondition",
    status: "PASS",
    details: [],
  });
  const managedPaths = upgradeManagedPaths(
    installedManifest,
    candidate.manifest,
    migrationManifest,
  );
  const rollback = await createRollbackJournal(
    target,
    managedPaths,
    installedManifest.runtimeVersion,
    candidate.runtimeVersion,
  );
  let mutated = false;
  let upgradeCommit = null;
  try {
    mutated = true;
    await atomicEngineeringMutation(target, (stagingTarget) =>
      applyCandidateRuntime(stagingTarget, candidate, migrationManifest),
    );
    await stageManagedPaths(target, managedPaths);
    const commit = await runGit(target, [
      "-c",
      `core.hooksPath=${rollback.hooksDirectory}`,
      "commit",
      "-m",
      `chore: upgrade project runtime to ${candidate.runtimeVersion}\n\nRuntime-Upgrade-Journal: ${rollback.journal.digest}`,
    ]);
    if (commit.code !== 0) {
      throw new Error(`upgrade checkpoint commit failed: ${commit.stderr}`);
    }
    upgradeCommit = (await runGit(target, ["rev-parse", "HEAD"])).stdout.trim();
    rollback.journal.upgradeCommit = upgradeCommit;
    await writeJson(rollback.token, rollback.journal);
    const doctor = await diagnoseRuntime(target);
    if (doctor.status !== "READY") {
      throw new Error(`post-upgrade Doctor status is ${doctor.status}`);
    }
    evidence.push({
      id: "post-upgrade-doctor",
      status: "PASS",
      revision: upgradeCommit,
      details: [],
    });
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "READY",
      terminal: true,
      mutated: true,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
      upgradeCommit,
      rollbackToken: rollback.token,
      doctor,
    };
  } catch (error) {
    const recoveryErrors = [];
    if (error instanceof UpgradeRecoveryGateError) {
      recoveryErrors.push(error.message);
    } else if (mutated) {
      try {
        await atomicEngineeringMutation(target, (stagingTarget) =>
          restoreRollbackJournal(stagingTarget, rollback.journal),
        );
        await stageManagedPaths(target, managedPaths);
        if (upgradeCommit) {
          const rewind = await runGit(target, [
            "update-ref",
            "HEAD",
            rollback.journal.fromCommit,
            upgradeCommit,
          ]);
          if (rewind.code !== 0) {
            throw new Error(`upgrade ref rewind failed: ${rewind.stderr}`);
          }
        }
      } catch (recoveryError) {
        recoveryErrors.push(
          recoveryError instanceof Error
            ? recoveryError.message.replace(/\s+/gu, " ").slice(0, 1000)
            : "upgrade recovery failed",
        );
      }
    }
    if (recoveryErrors.length === 0) {
      await rm(path.dirname(rollback.token), { recursive: true, force: true });
    }
    const detail =
      error instanceof Error
        ? error.message.replace(/\s+/gu, " ").slice(0, 1000)
        : "runtime upgrade failed";
    evidence.push({
      id: "upgrade-transaction",
      status: "INVALID",
      details: [detail, ...recoveryErrors],
    });
    return {
      schemaVersion: 1,
      operation: "UPGRADE",
      status: "BLOCKED",
      terminal: true,
      mutated: recoveryErrors.length > 0 ? true : mutated,
      evidence,
      runtimeDiff,
      upstreamDiff,
      candidateProvenance,
      blocker: {
        reason:
          recoveryErrors.length > 0
            ? "UPGRADE_RECOVERY_FAILED"
            : "UPGRADE_TRANSACTION_FAILED",
        evidenceIds: ["upgrade-transaction"],
      },
      ...(recoveryErrors.length > 0
        ? { recoveryToken: rollback.token }
        : {}),
    };
  }
}

async function inspectUpgradeTransactionCapability() {
  if (process.platform === "win32") {
    const entry = await lstat(WINDOWS_POWERSHELL_PATH).catch(() => null);
    if (entry?.isFile() && !entry.isSymbolicLink()) {
      return { valid: true, errors: [] };
    }
  }
  return {
    valid: false,
    errors: ["safe handle-pinned runtime upgrade is unavailable on this platform"],
  };
}

/** @param {string} targetInput @param {string} tokenInput */
export async function rollbackRuntimeUpgrade(targetInput, tokenInput) {
  const target = path.resolve(targetInput);
  const token = path.resolve(tokenInput);
  const journal = await readJson(token);
  const errors = [];
  const rollbackRoot = await validateRollbackTokenLocation(token);
  if (!rollbackRoot) {
    errors.push("rollback token is outside the launcher-owned temporary directory");
  }
  const targetRealPath = await realpath(target).catch(() => null);
  if (
    journal?.schemaVersion !== 1 ||
    journal?.kind !== "RUNTIME_UPGRADE_ROLLBACK"
  ) {
    errors.push("rollback token contract is invalid");
  }
  if (!targetRealPath || journal?.target !== targetRealPath) {
    errors.push("rollback token does not belong to the exact Target Project");
  }
  if (
    !Array.isArray(journal?.entries) ||
    journal.entries.some(
      (/** @type {any} */ entry) =>
        !isSafeProjectPath(entry?.path) ||
        typeof entry.existed !== "boolean" ||
        (entry.existed &&
          (typeof entry.contentBase64 !== "string" ||
            Buffer.from(entry.contentBase64, "base64").toString("base64") !==
              entry.contentBase64)),
    )
  ) {
    errors.push("rollback token entries are invalid");
  }
  if (
    !Array.isArray(journal?.managedPaths) ||
    journal.managedPaths.some(
      (/** @type {any} */ projectPath) =>
        !isSafeProjectPath(projectPath) ||
        !projectPath.startsWith(".engineering/"),
    ) ||
    [...new Set(journal?.managedPaths ?? [])].sort().join("\n") !==
      (journal?.entries ?? [])
        .map((/** @type {any} */ entry) => entry.path)
        .sort()
        .join("\n") ||
    journal?.digest !== rollbackJournalDigest(journal)
  ) {
    errors.push("rollback token write-set or digest is invalid");
  }
  const head = await runGit(target, ["rev-parse", "HEAD"]);
  if (head.code !== 0 || head.stdout.trim() !== journal?.upgradeCommit) {
    errors.push("Target Project HEAD is not the recorded upgrade checkpoint");
  }
  const commitMessage = await runGit(target, ["show", "-s", "--format=%B", "HEAD"]);
  if (
    commitMessage.code !== 0 ||
    !commitMessage.stdout.includes(
      `Runtime-Upgrade-Journal: ${journal?.digest}`,
    )
  ) {
    errors.push("rollback token is not bound to the upgrade checkpoint");
  }
  const status = await runGit(target, ["status", "--porcelain"]);
  if (status.code !== 0 || status.stdout.trim() !== "") {
    errors.push("Target Project worktree must be clean before rollback");
  }
  if (errors.length > 0) {
    return {
      schemaVersion: 1,
      operation: "UPGRADE_ROLLBACK",
      status: "BLOCKED",
      terminal: true,
      mutated: false,
      evidence: [
        {
          id: "upgrade-rollback-contract",
          status: "INVALID",
          details: errors,
        },
      ],
      blocker: {
        reason: "ROLLBACK_CONTRACT_INVALID",
        evidenceIds: ["upgrade-rollback-contract"],
      },
    };
  }
  const managedPaths = /** @type {string[]} */ (journal.entries
    .map((/** @type {any} */ entry) => entry.path)
    .sort());
  const recovery = await createRollbackJournal(
    target,
    managedPaths,
    journal.toVersion,
    journal.fromVersion,
  );
  const hooksDirectory = path.join(
    /** @type {string} */ (rollbackRoot),
    "empty-hooks",
  );
  let rollbackCommit = null;
  try {
    await atomicEngineeringMutation(target, (stagingTarget) =>
      restoreRollbackJournal(stagingTarget, journal),
    );
    await stageManagedPaths(target, managedPaths);
    await mkdir(hooksDirectory, { recursive: true });
    const commit = await runGit(target, [
      "-c",
      `core.hooksPath=${hooksDirectory}`,
      "commit",
      "-m",
      `revert: restore project runtime ${journal.fromVersion}`,
    ]);
    if (commit.code !== 0) {
      throw new Error(`rollback commit failed: ${commit.stderr}`);
    }
    rollbackCommit = (await runGit(target, ["rev-parse", "HEAD"])).stdout.trim();
    const doctor = await diagnoseRuntime(target);
    if (doctor.status !== "READY") {
      throw new Error(`post-rollback Doctor status is ${doctor.status}`);
    }
    await rm(/** @type {string} */ (rollbackRoot), {
      recursive: true,
      force: true,
    });
    await rm(path.dirname(recovery.token), { recursive: true, force: true });
    return {
      schemaVersion: 1,
      operation: "UPGRADE_ROLLBACK",
      status: "ROLLED_BACK",
      terminal: true,
      mutated: true,
      runtimeVersion: journal.fromVersion,
      rollbackCommit,
      doctor,
    };
  } catch (error) {
    const recoveryErrors = [];
    if (error instanceof UpgradeRecoveryGateError) {
      recoveryErrors.push(error.message);
    } else {
      try {
        await atomicEngineeringMutation(target, (stagingTarget) =>
          restoreRollbackJournal(stagingTarget, recovery.journal),
        );
        await stageManagedPaths(target, managedPaths);
        if (rollbackCommit) {
          const rewind = await runGit(target, [
            "update-ref",
            "HEAD",
            journal.upgradeCommit,
            rollbackCommit,
          ]);
          if (rewind.code !== 0) {
            throw new Error(`rollback ref rewind failed: ${rewind.stderr}`);
          }
        }
      } catch (recoveryError) {
        recoveryErrors.push(
          recoveryError instanceof Error
            ? recoveryError.message.replace(/\s+/gu, " ").slice(0, 1000)
            : "rollback recovery failed",
        );
      }
    }
    if (recoveryErrors.length === 0) {
      await rm(path.dirname(recovery.token), {
        recursive: true,
        force: true,
      });
    }
    const detail =
      error instanceof Error
        ? error.message.replace(/\s+/gu, " ").slice(0, 1000)
        : "runtime rollback failed";
    return {
      schemaVersion: 1,
      operation: "UPGRADE_ROLLBACK",
      status: "BLOCKED",
      terminal: true,
      mutated: recoveryErrors.length > 0,
      evidence: [
        {
          id: "upgrade-rollback-transaction",
          status: "INVALID",
          details: [detail, ...recoveryErrors],
        },
      ],
      blocker: {
        reason:
          recoveryErrors.length > 0
            ? "ROLLBACK_RECOVERY_FAILED"
            : "ROLLBACK_TRANSACTION_FAILED",
        evidenceIds: ["upgrade-rollback-transaction"],
      },
      ...(recoveryErrors.length > 0
        ? { recoveryToken: recovery.token }
        : {}),
    };
  }
}

/**
 * @param {Record<string, any>} installed
 * @param {Record<string, any>} candidate
 * @param {Record<string, any> | null} migrationManifest
 */
function upgradeManagedPaths(installed, candidate, migrationManifest) {
  return [
    ...new Set([
      ...installed.files.map((/** @type {any} */ entry) => entry.path),
      ...candidate.files.map((/** @type {any} */ entry) => entry.path),
      ...(migrationManifest?.actions ?? []).map(
        (/** @type {any} */ action) => action.path,
      ),
      ".engineering/runtime/manifest.json",
      ".engineering/state/project.json",
      ".engineering/verification/registry.json",
    ]),
  ].sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * @param {string} target
 * @param {string[]} managedPaths
 * @param {string} fromVersion
 * @param {string} toVersion
 */
async function createRollbackJournal(
  target,
  managedPaths,
  fromVersion,
  toVersion,
) {
  const rollbackRoot = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-rollback-"),
  );
  const entries = [];
  for (const projectPath of managedPaths) {
    const absolute = path.join(target, ...projectPath.split("/"));
    try {
      entries.push({
        path: projectPath,
        existed: true,
        contentBase64: (await readFile(absolute)).toString("base64"),
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        entries.push({ path: projectPath, existed: false });
        continue;
      }
      throw error;
    }
  }
  const token = path.join(rollbackRoot, "upgrade-rollback.json");
  const hooksDirectory = path.join(rollbackRoot, "empty-hooks");
  await mkdir(hooksDirectory, { recursive: true });
  const journal = /** @type {Record<string, any>} */ ({
    schemaVersion: 1,
    kind: "RUNTIME_UPGRADE_ROLLBACK",
    target: await realpath(target),
    fromVersion,
    toVersion,
    upgradeCommit: null,
    fromCommit: (await runGit(target, ["rev-parse", "HEAD"])).stdout.trim(),
    nonce: randomUUID(),
    managedPaths,
    entries,
  });
  journal.digest = rollbackJournalDigest(journal);
  await writeJson(token, journal);
  return { token, journal, hooksDirectory };
}

/**
 * @param {string} target
 * @param {(stagingTarget: string) => Promise<void>} mutate
 */
async function atomicEngineeringMutation(target, mutate) {
  const targetRealPath = await realpath(target);
  const engineeringPath = path.join(targetRealPath, ".engineering");
  const targetIdentity = await directoryIdentity(targetRealPath);
  const engineeringIdentity = await directoryIdentity(engineeringPath);
  const transactionId = randomUUID();
  const stagingTarget = path.join(
    targetRealPath,
    `.engineering-upgrade-stage-${transactionId}`,
  );
  const stagingEngineering = path.join(stagingTarget, ".engineering");
  const backupEngineering = path.join(
    targetRealPath,
    `.engineering-upgrade-backup-${transactionId}`,
  );
  await mkdir(stagingTarget);
  try {
    await cp(engineeringPath, stagingEngineering, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    await mutate(stagingTarget);
    const stagingIdentity = await directoryIdentity(stagingEngineering);
    if (process.platform !== "win32") {
      throw new Error(
        "safe handle-pinned runtime upgrade is unavailable on this platform",
      );
    }
    await swapWindowsEngineeringDirectories({
      target: targetRealPath,
      engineering: engineeringPath,
      staging: stagingEngineering,
      backup: backupEngineering,
      targetIdentity,
      engineeringIdentity,
      stagingIdentity,
    });
    await rm(backupEngineering, { recursive: true, force: true });
  } finally {
    await rm(stagingTarget, { recursive: true, force: true });
  }
}

/** @param {string} directory */
async function directoryIdentity(directory) {
  const entry = await lstat(directory);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`namespace is not a real directory: ${directory}`);
  }
  return {
    device: entry.dev,
    inode: entry.ino,
    resolved: await realpath(directory),
  };
}

/** @param {string} directory @param {{device: number, inode: number, resolved: string}} expected @param {boolean} [compareResolved] */
async function requireDirectoryIdentity(
  directory,
  expected,
  compareResolved = true,
) {
  const actual = await directoryIdentity(directory);
  if (
    actual.device !== expected.device ||
    actual.inode !== expected.inode ||
    (compareResolved && actual.resolved !== expected.resolved)
  ) {
    throw new Error(`managed namespace identity changed: ${directory}`);
  }
}

/**
 * @param {{
 *   target: string,
 *   engineering: string,
 *   staging: string,
 *   backup: string,
 *   targetIdentity: {device: number, inode: number, resolved: string},
 *   engineeringIdentity: {device: number, inode: number, resolved: string},
 *   stagingIdentity: {device: number, inode: number, resolved: string},
 * }} options
 */
async function swapWindowsEngineeringDirectories(options) {
  await access(WINDOWS_POWERSHELL_PATH);
  const helperSource = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class RuntimeUpgradeDirectorySwap {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName, uint desiredAccess, uint shareMode,
        IntPtr securityAttributes, uint creationDisposition,
        uint flagsAndAttributes, IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetFileInformationByHandle(
        SafeFileHandle file, int informationClass,
        IntPtr information, uint bufferSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
        SafeFileHandle file, StringBuilder path, uint pathLength, uint flags);

    public static SafeFileHandle OpenDirectory(string path, bool rename) {
        uint access = 0x00000001;
        if (rename) access |= 0x00010000;
        return CreateFileW(
            path, access, 0x00000001 | 0x00000002,
            IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
    }

    public static string FinalPath(SafeFileHandle file) {
        var buffer = new StringBuilder(32768);
        var length = GetFinalPathNameByHandleW(
            file, buffer, (uint)buffer.Capacity, 0);
        if (length == 0 || length >= buffer.Capacity) {
            throw new System.ComponentModel.Win32Exception(
                Marshal.GetLastWin32Error());
        }
        var value = buffer.ToString(0, (int)length);
        if (value.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) {
            value = @"\\" + value.Substring(8);
        } else if (value.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase)) {
            value = value.Substring(4);
        }
        return Path.GetFullPath(value);
    }

    public static void Rename(SafeFileHandle source, string destination) {
        if (destination.Length >= 3 && destination[1] == ':') {
            destination = @"\??\" + destination;
        }
        var name = Encoding.Unicode.GetBytes(destination);
        var rootOffset = IntPtr.Size == 8 ? 8 : 4;
        var lengthOffset = rootOffset + IntPtr.Size;
        var nameOffset = lengthOffset + 4;
        var size = nameOffset + name.Length + 2;
        var buffer = Marshal.AllocHGlobal(size);
        try {
            for (var index = 0; index < size; index++) {
                Marshal.WriteByte(buffer, index, 0);
            }
            Marshal.WriteByte(buffer, 0, 1);
            Marshal.WriteIntPtr(buffer, rootOffset, IntPtr.Zero);
            Marshal.WriteInt32(buffer, lengthOffset, name.Length);
            Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length);
            if (!SetFileInformationByHandle(source, 3, buffer, (uint)size)) {
                throw new System.ComponentModel.Win32Exception(
                    Marshal.GetLastWin32Error());
            }
        } finally {
            Marshal.FreeHGlobal(buffer);
        }
    }
}
"@

$configLine = [Console]::In.ReadLine()
$json = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String($configLine))
$config = ConvertFrom-Json $json
$target = $null
$original = $null
$staging = $null
$originalMoved = $false
$stagingMoved = $false
try {
    $target = [RuntimeUpgradeDirectorySwap]::OpenDirectory(
        [string]$config.target, $false)
    $original = [RuntimeUpgradeDirectorySwap]::OpenDirectory(
        [string]$config.engineering, $true)
    $staging = [RuntimeUpgradeDirectorySwap]::OpenDirectory(
        [string]$config.staging, $true)
    if ($target.IsInvalid -or $original.IsInvalid -or $staging.IsInvalid) {
        throw "Cannot pin runtime upgrade directories."
    }
    [Console]::Out.WriteLine("PINNED")
    [Console]::Out.Flush()
    $command = [Console]::In.ReadLine()
    if ($command -eq "SWAP") {
        [RuntimeUpgradeDirectorySwap]::Rename(
            $original, [string]$config.backup)
        $originalMoved = $true
        try {
            [RuntimeUpgradeDirectorySwap]::Rename(
                $staging, [string]$config.engineering)
            $stagingMoved = $true
        } catch {
            [RuntimeUpgradeDirectorySwap]::Rename(
                $original, [string]$config.engineering)
            $originalMoved = $false
            throw
        }
        [Console]::Out.WriteLine("SWAPPED")
        [Console]::Out.Flush()
        $decision = [Console]::In.ReadLine()
        if ($decision -eq "COMMIT") {
            $originalMoved = $false
            $stagingMoved = $false
        } elseif ($decision -eq "ROLLBACK") {
            [RuntimeUpgradeDirectorySwap]::Rename(
                $staging, [string]$config.staging)
            $stagingMoved = $false
            [RuntimeUpgradeDirectorySwap]::Rename(
                $original, [string]$config.engineering)
            $originalMoved = $false
            [Console]::Out.WriteLine("ROLLED_BACK")
            [Console]::Out.Flush()
        } else {
            throw "Runtime upgrade directory swap was not committed."
        }
    } elseif ($command -ne "ABORT") {
        throw "Invalid runtime upgrade directory swap command."
    }
} finally {
    if ($originalMoved) {
        if ($stagingMoved) {
            [RuntimeUpgradeDirectorySwap]::Rename(
                $staging, [string]$config.staging)
        }
        [RuntimeUpgradeDirectorySwap]::Rename(
            $original, [string]$config.engineering)
    }
    if ($null -ne $staging) { $staging.Dispose() }
    if ($null -ne $original) { $original.Dispose() }
    if ($null -ne $target) { $target.Dispose() }
}
`;
  const child = spawn(
    WINDOWS_POWERSHELL_PATH,
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(helperSource, "utf16le").toString("base64"),
    ],
    {
      cwd: path.dirname(process.execPath),
      env: {
        ...process.env,
        HOME: os.tmpdir(),
        USERPROFILE: os.tmpdir(),
        APPDATA: os.tmpdir(),
        LOCALAPPDATA: os.tmpdir(),
      },
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const close = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  child.stdin.write(
    `${Buffer.from(
      JSON.stringify({
        target: options.target,
        engineering: options.engineering,
        staging: options.staging,
        backup: options.backup,
      }),
      "utf8",
    ).toString("base64")}\n`,
  );
  await waitForChildLine(
    () => stdout,
    "PINNED",
    child,
    close,
    stderr,
    () => abortPinnedSwapHelper(child, close),
  );
  try {
    await requireDirectoryIdentity(options.target, options.targetIdentity);
    await requireDirectoryIdentity(
      options.engineering,
      options.engineeringIdentity,
    );
    await requireDirectoryIdentity(options.staging, options.stagingIdentity);
  } catch (error) {
    child.stdin.write("ABORT\n");
    child.stdin.end();
    await close;
    throw error;
  }
  child.stdin.write("SWAP\n");
  await waitForChildLine(
    () => stdout,
    "SWAPPED",
    child,
    close,
    stderr,
    () => recoverTimedOutSwap(child, close, options),
  );
  let verificationError = null;
  try {
    await requireDirectoryIdentity(options.target, options.targetIdentity);
    await requireDirectoryIdentity(
      options.backup,
      options.engineeringIdentity,
      false,
    );
    await requireDirectoryIdentity(
      options.engineering,
      options.stagingIdentity,
      false,
    );
  } catch (error) {
    verificationError = error;
  }
  if (verificationError) {
    child.stdin.write("ROLLBACK\n");
    await waitForChildLine(
      () => stdout,
      "ROLLED_BACK",
      child,
      close,
      stderr,
      () => recoverTimedOutSwap(child, close, options),
    );
  } else {
    child.stdin.write("COMMIT\n");
  }
  child.stdin.end();
  const result = /** @type {{code: number | null, signal: NodeJS.Signals | null}} */ (
    await close
  );
  if (verificationError) {
    throw verificationError;
  }
  if (result.code !== 0) {
    throw new Error(
      `pinned runtime directory swap failed: ${stderr.replace(/\s+/gu, " ").slice(0, 1000)}`,
    );
  }
}

/**
 * @param {() => string} output
 * @param {string} expected
 * @param {import("node:child_process").ChildProcess} child
 * @param {Promise<unknown>} close
 * @param {string} stderr
 * @param {() => Promise<never>} onTimeout
 */
async function waitForChildLine(
  output,
  expected,
  child,
  close,
  stderr,
  onTimeout,
) {
  const deadline = Date.now() + 15_000;
  while (!output().split(/\r?\n/u).includes(expected)) {
    if (Date.now() >= deadline) {
      await onTimeout();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @param {Promise<unknown>} close
 * @returns {Promise<never>}
 */
async function abortPinnedSwapHelper(child, close) {
  child.stdin?.write("ABORT\n");
  child.stdin?.end();
  if (!(await waitForCloseGrace(close))) {
    child.kill();
    await close;
  }
  throw new Error("pinned runtime directory swap timed out before mutation");
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @param {Promise<unknown>} close
 * @param {{
 *   target: string,
 *   engineering: string,
 *   staging: string,
 *   backup: string,
 *   targetIdentity: {device: number, inode: number, resolved: string},
 *   engineeringIdentity: {device: number, inode: number, resolved: string},
 *   stagingIdentity: {device: number, inode: number, resolved: string},
 * }} options
 * @returns {Promise<never>}
 */
async function recoverTimedOutSwap(child, close, options) {
  child.stdin?.write("ROLLBACK\n");
  child.stdin?.end();
  if (!(await waitForCloseGrace(close))) {
    child.kill();
    await close;
    await recoverInterruptedSwapNamespace(options);
  } else {
    await requireDirectoryIdentity(options.target, options.targetIdentity);
    await requireDirectoryIdentity(
      options.engineering,
      options.engineeringIdentity,
    );
  }
  throw new Error("pinned runtime directory swap timed out and was rolled back");
}

/** @param {Promise<unknown>} close */
async function waitForCloseGrace(close) {
  return Promise.race([
    close.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);
}

/**
 * @param {{
 *   target: string,
 *   engineering: string,
 *   staging: string,
 *   backup: string,
 *   targetIdentity: {device: number, inode: number, resolved: string},
 *   engineeringIdentity: {device: number, inode: number, resolved: string},
 *   stagingIdentity: {device: number, inode: number, resolved: string},
 * }} options
 */
async function recoverInterruptedSwapNamespace(options) {
  await requireDirectoryIdentity(options.target, options.targetIdentity);
  const engineering = await directoryIdentity(options.engineering).catch(
    () => null,
  );
  const backup = await directoryIdentity(options.backup).catch(() => null);
  if (
    engineering &&
    sameDirectoryIdentity(engineering, options.engineeringIdentity)
  ) {
    return;
  }
  if (!backup || !sameDirectoryIdentity(backup, options.engineeringIdentity)) {
    throw new Error("interrupted runtime swap cannot prove the original namespace");
  }
  if (
    engineering &&
    !sameDirectoryIdentity(engineering, options.stagingIdentity)
  ) {
    throw new Error("interrupted runtime swap installed an unknown namespace");
  }
  throw new UpgradeRecoveryGateError(
    `interrupted runtime swap retained the proven original at recovery gate: ${options.backup}`,
    options.backup,
  );
}

/**
 * @param {{device: number, inode: number}} left
 * @param {{device: number, inode: number}} right
 */
function sameDirectoryIdentity(left, right) {
  return left.device === right.device && left.inode === right.inode;
}

/**
 * @param {string} target
 * @param {any} candidate
 * @param {Record<string, any> | null} migrationManifest
 */
async function applyCandidateRuntime(target, candidate, migrationManifest) {
  await validateApprovedMigrationSources(target, migrationManifest);
  for (const file of candidate.files) {
    const destination = path.join(target, ...String(file.path).split("/"));
    await assertConfinedProjectPath(target, String(file.path));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  for (const action of migrationManifest?.actions ?? []) {
    if (action.action === "DELETE") {
      await assertConfinedProjectPath(target, String(action.path));
      await rm(path.join(target, ...String(action.path).split("/")), {
        force: true,
      });
    }
  }
  await assertConfinedProjectPath(
    target,
    ".engineering/runtime/manifest.json",
  );
  await writeJson(
    path.join(target, ".engineering", "runtime", "manifest.json"),
    candidate.manifest,
  );
  await assertConfinedProjectPath(target, ".engineering/state/project.json");
  await writeJson(
    path.join(target, ".engineering", "state", "project.json"),
    candidate.projectState,
  );
  await assertConfinedProjectPath(
    target,
    ".engineering/verification/registry.json",
  );
  await writeJson(
    path.join(
      target,
      ".engineering",
      "verification",
      "registry.json",
    ),
    candidate.verificationRegistry,
  );
}

/** @param {string} target @param {Record<string, any> | null} migrationManifest */
async function validateApprovedMigrationSources(target, migrationManifest) {
  for (const action of migrationManifest?.actions ?? []) {
    if (action.action !== "DELETE" && action.action !== "REWRITE") {
      continue;
    }
    await assertConfinedProjectPath(target, String(action.path));
    const sourcePath = path.join(target, ...String(action.path).split("/"));
    const source = await lstat(sourcePath).catch(() => null);
    if (
      !source ||
      !source.isFile() ||
      source.isSymbolicLink() ||
      sha256(await readFile(sourcePath)) !== action.sourceSha256
    ) {
      throw new Error(
        `approved migration source changed before mutation: ${action.path}`,
      );
    }
  }
}

/** @param {string} target @param {Record<string, any>} journal */
async function restoreRollbackJournal(target, journal) {
  for (const entry of journal.entries) {
    const destination = path.join(target, ...String(entry.path).split("/"));
    await assertConfinedProjectPath(target, String(entry.path));
    if (entry.existed) {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(entry.contentBase64, "base64"));
    } else {
      await rm(destination, { force: true });
    }
  }
}

/** @param {string} target @param {string} projectPath */
async function assertConfinedProjectPath(target, projectPath) {
  if (!isSafeProjectPath(projectPath)) {
    throw new Error(`unsafe managed project path: ${projectPath}`);
  }
  let cursor = await realpath(target);
  for (const segment of projectPath.split("/")) {
    cursor = path.join(cursor, segment);
    const entry = await lstat(cursor).catch(() => null);
    if (entry?.isSymbolicLink()) {
      throw new Error(`managed path traverses a symbolic link: ${projectPath}`);
    }
    if (entry && cursor !== path.join(await realpath(target), ...projectPath.split("/")) && !entry.isDirectory()) {
      throw new Error(`managed path parent is not a directory: ${projectPath}`);
    }
  }
}

/** @param {string} target @param {Record<string, any>} installed @param {Record<string, any>} candidate */
async function createUpgradeMigrationManifest(target, installed, candidate) {
  const candidatePaths = new Set(
    candidate.manifest.files.map((/** @type {any} */ entry) => entry.path),
  );
  const candidateContentByPath = new Map(
    candidate.files.map((/** @type {any} */ file) => [file.path, file.content]),
  );
  const actions = /** @type {Array<any>} */ (installed.files
    .filter((/** @type {any} */ entry) => !candidatePaths.has(entry.path))
    .map((/** @type {any} */ entry) => ({
      action: "DELETE",
      path: entry.path,
      ownership: migrationOwnership(entry.ownership),
      rationale:
        "Remove a runtime-owned path absent from the pinned upgrade candidate.",
      risk: "HIGH",
      rollback:
        "Restore the exact pre-upgrade runtime bytes from the rollback journal.",
      destructive: true,
      sourceSha256: entry.sha256,
    }))
    .concat(
      installed.files
        .filter(
          (/** @type {any} */ entry) =>
            candidatePaths.has(entry.path) &&
            (entry.ownership !== "PROJECT_RUNTIME" ||
              entry.generated !== true ||
              entry.protected !== false),
        )
        .map((/** @type {any} */ entry) => {
          const content = candidateContentByPath.get(entry.path);
          return {
            action: "REWRITE",
            path: entry.path,
            ownership: migrationOwnership(entry.ownership),
            rationale:
              "Replace a protected or locally owned runtime path only after exact Human Gate approval.",
            risk: "HIGH",
            rollback:
              "Restore the exact pre-upgrade runtime bytes from the rollback journal.",
            destructive: true,
            sourceSha256: entry.sha256,
            contentBase64: Buffer.from(content).toString("base64"),
            contentSha256: sha256(content),
          };
        }),
    )
    )
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const installedPaths = new Set(
    installed.files.map((/** @type {any} */ entry) => entry.path),
  );
  for (const file of candidate.files) {
    if (installedPaths.has(file.path)) {
      continue;
    }
    const destination = path.join(target, ...String(file.path).split("/"));
    const existing = await lstat(destination).catch(() => null);
    if (!existing) {
      continue;
    }
    const source = existing.isFile() ? await readFile(destination) : Buffer.alloc(0);
    actions.push({
      action: "REWRITE",
      path: file.path,
      ownership: "LOCAL_OVERRIDE",
      rationale:
        "Replace an existing unowned destination only after exact Human Gate approval.",
      risk: "HIGH",
      rollback:
        "Restore the exact pre-upgrade bytes from the rollback journal.",
      destructive: true,
      sourceSha256: sha256(source),
      contentBase64: Buffer.from(file.content).toString("base64"),
      contentSha256: sha256(file.content),
    });
  }
  actions.sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (actions.length === 0) {
    return null;
  }
  return {
    schemaVersion: 1,
    kind: "MIGRATION_MANIFEST",
    inventory: {
      ignoredPaths: [".git"],
      entries: actions.map((action) => ({ path: action.path, kind: "file" })),
      conventions: [],
      applicationCore: [],
    },
    actions,
    conflicts: [],
    destructiveScope: migrationDestructiveScope(actions),
    hashAlgorithm: "sha256",
    hash: computeMigrationManifestHash(actions),
    humanGate: { required: true, approved: false },
  };
}

/** @param {unknown} ownership */
function migrationOwnership(ownership) {
  return ownership === "LOCAL_OVERRIDE"
    ? "LOCAL_OVERRIDE"
    : ownership === "PROJECT_RUNTIME" || ownership === undefined
      ? "PROJECT_RUNTIME"
      : "PROJECT_CONVENTION";
}

/** @param {string} target @param {any} candidate @param {Record<string, any> | null} migrationManifest */
async function runCandidateCompatibility(target, candidate, migrationManifest) {
  const validationRoot = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-upgrade-candidate-"),
  );
  try {
    await cp(target, validationRoot, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(target, source);
        const firstSegment = relative.split(path.sep)[0];
        return (
          relative === "" ||
          (firstSegment !== ".git" && firstSegment !== "node_modules")
        );
      },
    });
    for (const file of candidate.files) {
      const destination = path.join(
        validationRoot,
        ...String(file.path).split("/"),
      );
      await assertConfinedProjectPath(validationRoot, String(file.path));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content);
    }
    for (const action of migrationManifest?.actions ?? []) {
      if (action.action === "DELETE") {
        await assertConfinedProjectPath(validationRoot, String(action.path));
        await rm(
          path.join(validationRoot, ...String(action.path).split("/")),
          { force: true },
        );
      }
    }
    await assertConfinedProjectPath(
      validationRoot,
      ".engineering/runtime/manifest.json",
    );
    await writeJson(
      path.join(validationRoot, ".engineering", "runtime", "manifest.json"),
      candidate.manifest,
    );
    await assertConfinedProjectPath(
      validationRoot,
      ".engineering/runtime/upstream-adoption.json",
    );
    await writeJson(
      path.join(
        validationRoot,
        ".engineering",
        "runtime",
        "upstream-adoption.json",
      ),
      candidate.adoptionMatrix,
    );
    await assertConfinedProjectPath(
      validationRoot,
      ".engineering/state/project.json",
    );
    await writeJson(
      path.join(validationRoot, ".engineering", "state", "project.json"),
      candidate.projectState,
    );
    await assertConfinedProjectPath(
      validationRoot,
      ".engineering/verification/registry.json",
    );
    await writeJson(
      path.join(
        validationRoot,
        ".engineering",
        "verification",
        "registry.json",
      ),
      candidate.verificationRegistry,
    );
    const enginePath = path.join(
      validationRoot,
      ".engineering",
      "runtime",
      "engine.mjs",
    );
    const result = await runProcess(process.execPath, [enginePath, "--smoke"], {
      cwd: validationRoot,
      timeoutMs: 30_000,
    });
    return result.code === 0
      ? { valid: true, errors: [] }
      : {
          valid: false,
          errors: [`candidate smoke exited with code ${result.code}`],
        };
  } catch (error) {
    return {
      valid: false,
      errors: [
        error instanceof Error
          ? error.message.replace(/\s+/gu, " ").slice(0, 1000)
          : "candidate compatibility failed",
      ],
    };
  } finally {
    await rm(validationRoot, { recursive: true, force: true });
  }
}

/** @param {string} cwd @param {string[]} args */
async function runGit(cwd, args) {
  const gitExecutable = await trustedGitExecutable();
  const hooksDirectory = await trustedHooksDirectory();
  return new Promise((resolve, reject) => {
    const child = spawn(
      gitExecutable,
      [
        "-c",
        "core.fsmonitor=false",
        "-c",
        "commit.gpgSign=false",
        "-c",
        "tag.gpgSign=false",
        "-c",
        `core.hooksPath=${hooksDirectory}`,
        ...args,
      ],
      {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 1024 * 1024) {
        stdout += chunk;
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) {
        stderr += chunk;
      }
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}

async function trustedHooksDirectory() {
  if (!trustedHooksPromise) {
    trustedHooksPromise = (async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "engineering-loop-empty-hooks-"),
      );
      return realpath(directory);
    })();
  }
  return trustedHooksPromise;
}

/** @param {string} target @param {string[]} managedPaths */
async function stageManagedPaths(target, managedPaths) {
  for (const projectPath of managedPaths) {
    const absolute = path.join(target, ...projectPath.split("/"));
    const entry = await lstat(absolute).catch(() => null);
    if (!entry) {
      const removed = await runGit(target, [
        "update-index",
        "--remove",
        "--",
        projectPath,
      ]);
      if (removed.code !== 0) {
        throw new Error(`failed to stage removal: ${projectPath}`);
      }
      continue;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`managed path is not a regular file: ${projectPath}`);
    }
    const hashed = await runGit(target, [
      "hash-object",
      "-w",
      "--no-filters",
      "--",
      projectPath,
    ]);
    const objectId = hashed.stdout.trim();
    if (hashed.code !== 0 || !/^[0-9a-f]{40,64}$/u.test(objectId)) {
      throw new Error(`failed to hash managed path: ${projectPath}`);
    }
    const staged = await runGit(target, [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${objectId},${projectPath}`,
    ]);
    if (staged.code !== 0) {
      throw new Error(`failed to stage managed path: ${projectPath}`);
    }
  }
}

async function trustedGitExecutable() {
  if (!trustedGitPromise) {
    trustedGitPromise = resolveTrustedGitExecutable();
  }
  return trustedGitPromise;
}

async function resolveTrustedGitExecutable() {
  const locator =
    process.platform === "win32"
      ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "where.exe")
      : "/usr/bin/which";
  await access(locator);
  const result = await runLocator(locator, process.platform === "win32" ? ["git.exe"] : ["git"]);
  const candidates = result.stdout
    .split(/\r?\n/u)
    .map((/** @type {string} */ value) => value.trim())
    .filter((/** @type {string} */ value) => path.isAbsolute(value));
  for (const candidate of candidates) {
    const resolved = await realpath(candidate).catch(() => null);
    const base = path.basename(resolved ?? "").toLowerCase();
    if (
      resolved &&
      (base === "git" || base === "git.exe") &&
      trustedGitInstallationPath(resolved)
    ) {
      await access(resolved);
      return resolved;
    }
  }
  throw new Error("trusted Git executable was not found");
}

/** @param {string} candidate */
function trustedGitInstallationPath(candidate) {
  if (process.platform !== "win32") {
    return (
      candidate === "/usr/bin/git" ||
      candidate === "/usr/local/bin/git"
    );
  }
  const normalized = candidate.toLowerCase();
  const programFiles = (process.env.ProgramFiles || "C:\\Program Files")
    .toLowerCase()
    .replace(/[\\/]+$/u, "");
  const executable = path.resolve(process.execPath).toLowerCase();
  const dependencyMarker = `${path.sep}dependencies${path.sep}`.toLowerCase();
  const dependencyIndex = executable.indexOf(dependencyMarker);
  const bundledRoot =
    dependencyIndex >= 0
      ? `${executable.slice(0, dependencyIndex + dependencyMarker.length)}native${path.sep}git${path.sep}`
      : null;
  return (
    normalized.startsWith(`${programFiles}${path.sep.toLowerCase()}git${path.sep.toLowerCase()}`) ||
    (bundledRoot !== null && normalized.startsWith(bundledRoot))
  );
}

/** @param {string} command @param {string[]} args */
function runLocator(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.dirname(process.execPath),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error("trusted Git executable was not found"));
        return;
      }
      resolve({ stdout });
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd: string, timeoutMs: number}} options
 */
function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("candidate compatibility timed out"));
    }, options.timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, signal });
    });
  });
}

/** @param {string} filePath @param {unknown} value */
async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** @param {any} candidate */
function validateUpgradeCandidate(candidate) {
  const errors = [];
  const manifestValidation = validateRuntimeManifest(candidate?.manifest);
  const adoptionValidation = validateAdoptionMatrix(candidate?.adoptionMatrix);
  errors.push(...manifestValidation.errors, ...adoptionValidation.errors);
  if (candidate?.runtimeVersion !== candidate?.manifest?.runtimeVersion) {
    errors.push("candidate runtime version does not match its manifest");
  }
  const contentByPath = new Map(
    Array.isArray(candidate?.files)
      ? candidate.files.map((/** @type {any} */ file) => [file.path, file.content])
      : [],
  );
  const candidatePaths = Array.isArray(candidate?.files)
    ? candidate.files.map((/** @type {any} */ file) => file?.path)
    : [];
  const manifestPaths = (candidate?.manifest?.files ?? []).map(
    (/** @type {any} */ entry) => entry.path,
  );
  if (
    candidatePaths.some((/** @type {any} */ value) => !isSafeProjectPath(value)) ||
    new Set(candidatePaths).size !== candidatePaths.length ||
    [...candidatePaths].sort().join("\n") !==
      [...manifestPaths].sort().join("\n")
  ) {
    errors.push("candidate runtime files must exactly match unique manifest paths");
  }
  if (
    candidate?.projectState?.schemaVersion !== 1 ||
    candidate?.projectState?.status !== "PREPARED_PROJECT" ||
    candidate?.projectState?.runtimeVersion !== candidate?.runtimeVersion
  ) {
    errors.push("candidate project state contract is invalid");
  }
  const smokeChecks = Array.isArray(candidate?.verificationRegistry?.checks)
    ? candidate.verificationRegistry.checks.filter(
        (/** @type {any} */ check) => check?.id === "prepared-project-smoke",
      )
    : [];
  if (
    candidate?.verificationRegistry?.schemaVersion !== 1 ||
    smokeChecks.length !== 1 ||
    typeof smokeChecks[0]?.command !== "string" ||
    smokeChecks[0].command.trim() === ""
  ) {
    errors.push("candidate verification registry contract is invalid");
  }
  for (const entry of candidate?.manifest?.files ?? []) {
    const content = contentByPath.get(entry.path);
    if (content === undefined || sha256(content) !== entry.sha256) {
      errors.push(`candidate runtime checksum mismatch: ${entry.path}`);
    }
  }
  for (const entry of candidate?.adoptionMatrix?.entries ?? []) {
    if (
      entry.adoption !== "EXCLUDE" &&
      (contentByPath.get(entry.artifact) === undefined ||
        sha256(contentByPath.get(entry.artifact)) !== entry.checksum)
    ) {
      errors.push(`candidate adoption checksum mismatch: ${entry.name}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** @param {string} token */
async function validateRollbackTokenLocation(token) {
  if (path.basename(token) !== "upgrade-rollback.json") {
    return null;
  }
  const temporaryRoot = await realpath(os.tmpdir()).catch(() => null);
  const tokenRealPath = await realpath(token).catch(() => null);
  if (!temporaryRoot || !tokenRealPath) {
    return null;
  }
  const rollbackRoot = path.dirname(tokenRealPath);
  if (
    path.dirname(rollbackRoot) !== temporaryRoot ||
    !path.basename(rollbackRoot).startsWith(
      "engineering-loop-upgrade-rollback-",
    )
  ) {
    return null;
  }
  return rollbackRoot;
}

/** @param {Record<string, any>} journal */
function rollbackJournalDigest(journal) {
  return sha256(
    JSON.stringify({
      schemaVersion: journal?.schemaVersion,
      kind: journal?.kind,
      target: journal?.target,
      fromVersion: journal?.fromVersion,
      toVersion: journal?.toVersion,
      fromCommit: journal?.fromCommit,
      nonce: journal?.nonce,
      managedPaths: journal?.managedPaths,
      entries: journal?.entries,
    }),
  );
}

/** @param {Array<any>} installedEntries @param {Array<any>} candidateEntries */
function diffUpstreamContracts(installedEntries, candidateEntries) {
  const installedByName = new Map(
    installedEntries.map((entry) => [entry.name, entry]),
  );
  const fields = [
    "source",
    "revision",
    "checksum",
    "license",
    "adoption",
    "artifact",
    "localDelta",
    "compatibilityEvidence",
    "upgradeProcedure",
  ];
  const candidateByName = new Map(
    candidateEntries.map((entry) => [entry.name, entry]),
  );
  const names = [...new Set([...installedByName.keys(), ...candidateByName.keys()])];
  return /** @type {Array<any>} */ (names
    .map((name) => {
      const candidate = candidateByName.get(name);
      const installed = installedByName.get(name);
      const changes =
        /** @type {Record<string, {from: any, to: any}>} */ ({});
      for (const field of fields) {
        const from = installed?.[field] ?? null;
        const to = candidate?.[field] ?? null;
        if (from !== to) {
          changes[field] = { from, to };
        }
      }
      return Object.keys(changes).length > 0
        ? { name, changes }
        : null;
    })
    .filter(Boolean))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

/** @param {string} target */
async function findActiveEngineeringRuns(target) {
  const runsRoot = path.join(target, ...RUNS_PATH.split("/"));
  const entries = await readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  const activeRuns = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const state = await readJson(path.join(runsRoot, entry.name, "state.json"));
    if (
      state?.schemaVersion === 1 &&
      state.runId === entry.name &&
      state.terminal === false
    ) {
      activeRuns.push(entry.name);
    }
  }
  return activeRuns.sort((left, right) => left.localeCompare(right, "en"));
}

/** @param {string} filePath */
async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}
