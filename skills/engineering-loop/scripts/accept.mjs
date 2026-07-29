import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanQualificationPayload } from "./qualify.mjs";

export const ACCEPTANCE_WEIGHTS = Object.freeze({
  "root-orchestration": 15,
  modes: 10,
  research: 10,
  "specs-artifacts": 10,
  "tickets-graph": 10,
  "planner-advisor": 10,
  worker: 10,
  reviews: 10,
  verification: 10,
  "safety-recovery": 5,
});

export const REQUIRED_ACCEPTANCE_STAGES = Object.freeze([
  "PROJECT_PREPARATION",
  "TASK_PROFILE_CLASSIFICATION",
  "RESEARCH",
  "PLANNING",
  "ADVISOR_GATE",
  "EXECUTION",
  "REMOTE_CHECKPOINT",
  "DURABLE_RESUME",
  "REVIEW_BLOCKED",
  "CONTROLLED_CORRECTION",
  "FRESH_REVIEWS",
  "FINAL_VERIFICATION",
  "REMOTE_SYNC",
  "READY_FOR_HUMAN",
]);

/** @param {unknown} value */
export function validateAcceptanceReport(value) {
  const report = /** @type {Record<string, any>} */ (value);
  const errors = [];
  const sourceFiles = Array.isArray(report?.execution?.sourceFiles)
    ? report.execution.sourceFiles
    : [];
  const sourcePaths = sourceFiles.map(
    (/** @type {any} */ entry) => entry?.path,
  );
  if (
    report?.schemaVersion !== 1 ||
    report.issue !== 37 ||
    report.status !== "READY_FOR_HUMAN" ||
    report.terminal !== true ||
    report.accepted !== false
  ) {
    errors.push("terminal acceptance identity is invalid");
  }
  if (
    !isSha(report?.execution?.baseRevision) ||
    !/^[a-f0-9]{64}$/u.test(report?.execution?.sourceFingerprint ?? "") ||
    sourceFiles.length === 0 ||
    sourceFiles.some(
      (/** @type {any} */ entry) =>
        typeof entry?.path !== "string" ||
        entry.path.includes("\\") ||
        path.posix.isAbsolute(entry.path) ||
        entry.path.split("/").includes("..") ||
        !/^[a-f0-9]{64}$/u.test(entry?.sha256 ?? ""),
    ) ||
    new Set(sourcePaths).size !== sourcePaths.length ||
    [...sourcePaths].sort().some((entry, index) => entry !== sourcePaths[index]) ||
    report.execution.sourceFingerprint !==
      createHash("sha256").update(JSON.stringify(sourceFiles)).digest("hex")
  ) {
    errors.push("acceptance source identity is missing");
  }
  if (
    report?.targetProject?.prepared !== true ||
    report.targetProject.taskProfile !== "STANDARD" ||
    report.targetProject.runBranch !== report?.remoteSync?.branch
  ) {
    errors.push("Target Project preparation evidence is inconsistent");
  }
  const chronology = Array.isArray(report?.chronology)
    ? report.chronology
    : [];
  const evidenceCatalog = Array.isArray(report?.evidenceCatalog)
    ? report.evidenceCatalog
    : [];
  const evidenceIds = new Set(evidenceCatalog);
  const aggregateFiles = Array.isArray(report?.aggregateDiff?.files)
    ? report.aggregateDiff.files
    : [];
  const artifactIds = new Set(
    aggregateFiles
      .filter((/** @type {unknown} */ file) => typeof file === "string")
      .map(
        (/** @type {string} */ file) =>
          `artifact:${path.posix.basename(file)}`,
      ),
  );
  if (
    evidenceCatalog.length === 0 ||
    new Set(evidenceCatalog).size !== evidenceCatalog.length ||
    evidenceCatalog.some(
      (id) =>
        typeof id !== "string" ||
        id.length === 0 ||
        id.length > 160 ||
        (id.startsWith("artifact:") && !artifactIds.has(id)) ||
        (id.startsWith("commit:") && !isSha(id.slice("commit:".length))),
    )
  ) {
    errors.push("evidence catalog is invalid");
  }
  if (
    chronology.length !== REQUIRED_ACCEPTANCE_STAGES.length ||
    chronology.some(
      (entry, index) =>
        entry?.sequence !== index + 1 ||
        entry.stage !== REQUIRED_ACCEPTANCE_STAGES[index] ||
        !isTimestamp(entry.observedAt) ||
        !isEvidenceIds(entry.evidenceIds) ||
        entry.evidenceIds.some(
          (/** @type {string} */ id) => !evidenceIds.has(id),
        ) ||
        (index > 0 &&
          Date.parse(entry.observedAt) <
            Date.parse(chronology[index - 1].observedAt)),
    )
  ) {
    errors.push("chronology does not cover the exact acceptance lifecycle");
  }
  if (
    report?.resume?.status !== "PASS" ||
    report.resume.fromRemoteCheckpoint !== true ||
    report.resume.chatHistoryUsed !== false ||
    !isSha(report.resume.checkpointCommit) ||
    !chronology
      .find((entry) => entry.stage === "REMOTE_CHECKPOINT")
      ?.evidenceIds.includes(`commit:${report.resume.checkpointCommit}`) ||
    !chronology
      .find((entry) => entry.stage === "DURABLE_RESUME")
      ?.evidenceIds.includes(`commit:${report.resume.checkpointCommit}`)
  ) {
    errors.push("durable resume evidence is incomplete");
  }
  if (
    report?.correction?.status !== "PASS" ||
    !isSha(report.correction.commit) ||
    report.correction.reviewRound !== 1 ||
    report.correction.freshReviewRound !== 2 ||
    !isSha(report.correction.freshReviewCommit) ||
    !isSha(report.correction.finalVerificationCommit) ||
    report.correction.freshReviewCommit === report.correction.commit ||
    report.correction.finalVerificationCommit === report.correction.commit ||
    report.correction.freshChecks !== true ||
    report.correction.freshReviewDescendsFromCorrection !== true ||
    report.correction.finalVerificationDescendsFromCorrection !== true ||
    report.correction.finalHeadDescendsFromCorrection !== true ||
    !chronology
      .find((entry) => entry.stage === "CONTROLLED_CORRECTION")
      ?.evidenceIds.includes(`commit:${report.correction.commit}`) ||
    !chronology
      .find((entry) => entry.stage === "FRESH_REVIEWS")
      ?.evidenceIds.includes(`commit:${report.correction.freshReviewCommit}`) ||
    !chronology
      .find((entry) => entry.stage === "FINAL_VERIFICATION")
      ?.evidenceIds.includes(
        `commit:${report.correction.finalVerificationCommit}`,
      )
  ) {
    errors.push("post-correction review and verification evidence is stale");
  } else {
    const correctionAt = Date.parse(report.correction.completedAt);
    const freshReviewsAt = Date.parse(report.correction.freshReviewsAt);
    const finalVerificationAt = Date.parse(
      report.correction.finalVerificationAt,
    );
    if (
      !Number.isFinite(correctionAt) ||
      !Number.isFinite(freshReviewsAt) ||
      !Number.isFinite(finalVerificationAt) ||
      freshReviewsAt <= correctionAt ||
      finalVerificationAt <= correctionAt
    ) {
      errors.push("post-correction timestamps are not fresh");
    }
  }
  if (
    report?.remoteSync?.status !== "PASS" ||
    !/^run\/standard\/[a-z0-9-]+$/u.test(report.remoteSync.branch ?? "") ||
    !isSha(report.remoteSync.head) ||
    !Array.isArray(report.remoteSync.changedRefs) ||
    report.remoteSync.changedRefs.length !== 1 ||
    report.remoteSync.changedRefs[0] !==
      `refs/heads/${report.remoteSync.branch}` ||
    report.remoteSync.head !== report?.correction?.freshReviewCommit ||
    report.remoteSync.head !== report?.correction?.finalVerificationCommit ||
    !chronology
      .find((entry) => entry.stage === "READY_FOR_HUMAN")
      ?.evidenceIds.includes(`commit:${report.remoteSync.head}`) ||
    report.remoteSync.forcePush !== false
  ) {
    errors.push("Remote Checkpoint Sync evidence is incomplete");
  }
  if (
    report?.protectedRefs?.status !== "PASS" ||
    !isSha(report.protectedRefs.developBefore) ||
    report.protectedRefs.developAfter !== report.protectedRefs.developBefore ||
    !isSha(report.protectedRefs.mainBefore) ||
    report.protectedRefs.mainAfter !== report.protectedRefs.mainBefore ||
    !isSha(report.protectedRefs.sourceHeadBefore) ||
    report.protectedRefs.sourceHeadAfter !==
      report.protectedRefs.sourceHeadBefore ||
    report.protectedRefs.sourceHeadBefore !== report?.execution?.baseRevision ||
    report.protectedRefs.developUnchanged !== true ||
    report.protectedRefs.mainUnchanged !== true ||
    report.protectedRefs.sourceRepositoryUnchanged !== true ||
    report.protectedRefs.deploymentTriggered !== false ||
    report.protectedRefs.issue16Closed !== false
  ) {
    errors.push("protected acceptance boundaries changed");
  }
  const scorecard = Array.isArray(report?.scorecard?.categories)
    ? report.scorecard.categories
    : [];
  const expectedCategories = Object.keys(ACCEPTANCE_WEIGHTS);
  if (
    report?.scorecard?.weightsTotal !== 100 ||
    scorecard.length !== expectedCategories.length ||
    scorecard.some(
      (/** @type {any} */ entry) =>
        ACCEPTANCE_WEIGHTS[
          /** @type {keyof typeof ACCEPTANCE_WEIGHTS} */ (entry?.id)
        ] !== entry?.weight ||
        !Number.isInteger(entry?.score) ||
        entry.score < 0 ||
        entry.score > 100 ||
        !isEvidenceIds(entry.evidenceIds) ||
        entry.evidenceIds.some(
          (/** @type {string} */ id) => !evidenceIds.has(id),
        ),
    ) ||
    new Set(scorecard.map((/** @type {any} */ entry) => entry.id)).size !==
      expectedCategories.length ||
    scorecard.reduce(
      (/** @type {number} */ sum, /** @type {any} */ entry) =>
        sum + entry.weight,
      0,
    ) !== 100
  ) {
    errors.push("weighted scorecard is invalid");
  } else {
    const weightedScore = scorecard.reduce(
      (/** @type {number} */ sum, /** @type {any} */ entry) =>
        sum + entry.weight * entry.score / 100,
      0,
    );
    if (
      report.scorecard.weightedScore !== weightedScore ||
      report.scorecard.weightedScore !== 100
    ) {
      errors.push("weighted score does not match category evidence");
    }
  }
  if (
    report?.redaction?.automatedScan !== "PASS" ||
    report.redaction.manualReview !== "PASS" ||
    !isTimestamp(report.redaction.reviewedAt) ||
    !/^[a-f0-9]{64}$/u.test(report.redaction.reviewedReportHash ?? "") ||
    report.redaction.reviewedReportHash !== pendingAcceptanceReportHash(report) ||
    report.redaction.rawLogsPersisted !== false ||
    report.redaction.chatTranscriptPersisted !== false ||
    report.redaction.providerPayloadPersisted !== false ||
    report.redaction.privateDataPersisted !== false ||
    report.redaction.signedUrlsPersisted !== false
  ) {
    errors.push("redaction evidence is incomplete");
  }
  if (
    report?.aggregateDiff?.status !== "PASS" ||
    !isSha(report.aggregateDiff.base) ||
    report.aggregateDiff.base !== report?.protectedRefs?.developBefore ||
    !isSha(report.aggregateDiff.head) ||
    report.aggregateDiff.head !== report?.remoteSync?.head ||
    !Array.isArray(report.aggregateDiff.files) ||
    report.aggregateDiff.files.length === 0 ||
    report.aggregateDiff.files.some(
      (/** @type {any} */ file) =>
        typeof file !== "string" ||
        file.includes("\\") ||
        path.posix.isAbsolute(file) ||
        file.split("/").includes(".."),
    ) ||
    new Set(report.aggregateDiff.files).size !== report.aggregateDiff.files.length ||
    !/^[a-f0-9]{64}$/u.test(report.aggregateDiff.hash ?? "") ||
    report.aggregateDiff.hash !==
      createHash("sha256")
        .update(
          JSON.stringify({
            base: report.aggregateDiff.base,
            head: report.aggregateDiff.head,
            files: report.aggregateDiff.files,
          }),
        )
        .digest("hex")
  ) {
    errors.push("aggregate diff evidence is missing");
  }
  return { valid: errors.length === 0, errors };
}

async function main() {
  const root = path.resolve(readOption("--target") ?? process.cwd());
  const destination = path.join(
    root,
    ".engineering",
    "acceptance",
    "v1-run-report.json",
  );
  const finalizeHash = readOption("--finalize-redaction");
  if (finalizeHash) {
    if (!/^[a-f0-9]{64}$/u.test(finalizeHash)) {
      throw new Error("--finalize-redaction requires the pending report hash.");
    }
    const report = JSON.parse(await readFile(destination, "utf8"));
    if (
      report?.redaction?.manualReview !== "PENDING" ||
      acceptanceReportHash(report) !== finalizeHash
    ) {
      throw new Error("Pending acceptance report does not match the review hash.");
    }
    const payloadScan = scanQualificationPayload(report);
    if (payloadScan.status !== "PASS") {
      throw new Error("Pending acceptance report failed automated redaction.");
    }
    report.redaction.manualReview = "PASS";
    report.redaction.reviewedAt = new Date().toISOString();
    report.redaction.reviewedReportHash = finalizeHash;
    const validation = validateAcceptanceReport(report);
    if (!validation.valid) {
      throw new Error(`Acceptance report is invalid: ${validation.errors.join("; ")}`);
    }
    await writeReport(root, destination, report);
    process.stdout.write(
      `${JSON.stringify({
        status: report.status,
        reportPath: ".engineering/acceptance/v1-run-report.json",
        manualRedactionReview: "PASS",
      })}\n`,
    );
    return;
  }
  const scratch = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-acceptance-"),
  );
  const evidenceFile = path.join(scratch, "evidence.json");
  try {
    const result = await runBounded(
      process.execPath,
      [
        "--test",
        "--test-reporter=tap",
        "--test-name-pattern=^the real V1 acceptance lifecycle stops at READY_FOR_HUMAN$",
        "test/unit/acceptance-lifecycle.test.mjs",
      ],
      root,
      {
        ENGINEERING_ACCEPTANCE_EVIDENCE_FILE: evidenceFile,
      },
    );
    if (result.code !== 0) {
      throw new Error("Real acceptance lifecycle failed.");
    }
    const report = JSON.parse(await readFile(evidenceFile, "utf8"));
    report.execution = await acceptanceSourceIdentity(root);
    report.redaction.manualReview = "PENDING";
    delete report.redaction.reviewedAt;
    delete report.redaction.reviewedReportHash;
    const payloadScan = scanQualificationPayload(report);
    report.redaction.automatedScan = payloadScan.status;
    if (payloadScan.status !== "PASS") {
      throw new Error(
        `Acceptance report is invalid: ${payloadScan.findings.join("; ")}`,
      );
    }
    await writeReport(root, destination, report);
    const pendingHash = acceptanceReportHash(report);
    process.stdout.write(
      `${JSON.stringify({
        status: "HUMAN_GATE",
        reportPath: ".engineering/acceptance/v1-run-report.json",
        manualRedactionReview: "PENDING",
        pendingReportHash: pendingHash,
      })}\n`,
    );
    process.exitCode = 2;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** @param {string} root */
async function acceptanceSourceIdentity(root) {
  const inventory = await runGit(root, [
    "ls-files",
    "-z",
    "--",
    "package.json",
    "package-lock.json",
    "skills/engineering-loop",
    "test/support",
    "test/fixtures/standard-run",
    "test/unit/acceptance-lifecycle.test.mjs",
  ]);
  const paths = inventory.split("\u0000").filter(Boolean).sort();
  if (paths.length === 0 || paths.length > 500) {
    throw new Error("Acceptance source inventory is invalid.");
  }
  const sourceFiles = [];
  let totalBytes = 0;
  for (const projectPath of paths) {
    const source = await readFile(
      path.join(root, ...projectPath.split("/")),
    );
    totalBytes += source.length;
    if (source.length > 2 * 1024 * 1024 || totalBytes > 32 * 1024 * 1024) {
      throw new Error("Acceptance source inventory exceeds its bound.");
    }
    sourceFiles.push({
      path: projectPath,
      sha256: createHash("sha256").update(source).digest("hex"),
    });
  }
  const revision = await runGit(root, ["rev-parse", "HEAD"]);
  if (!isSha(revision)) {
    throw new Error("Acceptance base revision is unavailable.");
  }
  return {
    baseRevision: revision,
    sourceFiles,
    sourceFingerprint: createHash("sha256")
      .update(JSON.stringify(sourceFiles))
      .digest("hex"),
  };
}

/** @param {string} cwd @param {string[]} args */
async function runGit(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.once("error", () => resolve(""));
    child.once("close", (code) => resolve(code === 0 ? stdout.trim() : ""));
  });
}

/** @param {string} root @param {string} destination @param {unknown} report */
async function writeReport(root, destination, report) {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true });
  if (await containsLink(root, destination)) {
    throw new Error("Acceptance report path contains a symbolic link.");
  }
  const rootReal = await realpath(root);
  const directoryReal = await realpath(directory);
  const directoryBefore = await lstat(directory);
  if (
    directoryBefore.isSymbolicLink() ||
    directoryReal !== path.join(rootReal, ".engineering", "acceptance")
  ) {
    throw new Error("Acceptance report escaped the project root.");
  }
  try {
    const existing = JSON.parse(await readFile(destination, "utf8"));
    if (existing.schemaVersion !== 1 || existing.issue !== 37) {
      throw new Error("Acceptance destination contains unrelated content.");
    }
  } catch (error) {
    if (
      /** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT"
    ) {
      throw error;
    }
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const directoryAfter = await lstat(directory);
    if (
      directoryAfter.isSymbolicLink() ||
      directoryAfter.dev !== directoryBefore.dev ||
      directoryAfter.ino !== directoryBefore.ino ||
      await containsLink(root, destination) ||
      await realpath(directory) !== directoryReal
    ) {
      throw new Error("Acceptance output namespace changed during publication.");
    }
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** @param {string} root @param {string} destination */
async function containsLink(root, destination) {
  const relative = path.relative(root, destination);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        return true;
      }
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }
  return false;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} extraEnv
 */
function runBounded(command, args, cwd, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv, NO_COLOR: "1" },
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true,
    });
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflow = false;
    let settled = false;
    let terminating = false;
    /** @type {NodeJS.Timeout | undefined} */
    let settleTimer;
    /** @param {number | null} code */
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(settleTimer);
      resolve({ code: overflow ? null : code, overflow });
    };
    const terminate = () => {
      if (terminating) return;
      terminating = true;
      overflow = true;
      void terminateTree(child);
      settleTimer = setTimeout(() => finish(null), 10_000);
    };
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 1024 * 1024) terminate();
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 256 * 1024) terminate();
    });
    const timer = setTimeout(terminate, 30 * 60_000);
    child.once("error", () => {
      overflow = true;
      finish(null);
    });
    child.once("close", (code) => {
      finish(code);
    });
  });
}

/** @param {import("node:child_process").ChildProcess} child */
async function terminateTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "C:\\Windows\\System32\\taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { shell: false, windowsHide: true, stdio: "ignore" },
      );
      const timer = setTimeout(() => {
        killer.kill();
        resolve(undefined);
      }, 5_000);
      killer.once("error", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
      killer.once("close", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/** @param {string} name */
function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** @param {unknown} value */
function isEvidenceIds(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/u.test(entry),
    )
  );
}

/** @param {unknown} value */
function isSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
}

/** @param {unknown} value */
function isTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/u.test(value)
  );
}

/** @param {unknown} value */
export function acceptanceReportHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

/** @param {unknown} value */
export function pendingAcceptanceReportHash(value) {
  const pending = /** @type {Record<string, any>} */ (structuredClone(value));
  if (
    typeof pending === "object" &&
    pending !== null &&
    typeof pending.redaction === "object" &&
    pending.redaction !== null
  ) {
    pending.redaction.manualReview = "PENDING";
    delete pending.redaction.reviewedAt;
    delete pending.redaction.reviewedReportHash;
  }
  return acceptanceReportHash(pending);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
