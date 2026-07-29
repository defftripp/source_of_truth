import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FIXTURES = Object.freeze([
  "new-project",
  "unprepared-legacy",
  "healthy-prepared-project",
  "drifted-runtime",
  "dirty-worktree",
  "remote-divergence",
  "interrupted-resume",
]);
const REQUIRED_SCENARIOS = Object.freeze([
  "simple-without-bureaucracy",
  "ambiguous-task",
  "missing-tests",
  "ticket-code-conflict",
  "failed-advisor",
  "partial-worker",
  "false-green-review",
  "scope-expansion",
  "overlapping-writers",
  "restart-after-interruption",
]);
const REQUIRED_COMPONENTS = Object.freeze([
  "classifier",
  "state-transitions",
  "artifact-schemas",
  "manifest-hashing",
  "ownership",
  "git-safety",
  "sync-divergence",
  "capability-qualification",
]);

export const QUALIFICATION_SUITE = deepFreeze({
  schemaVersion: 1,
  id: "codex-engineering-loop-v1",
  seam: "BLACK_BOX_PUBLIC_RUNTIME",
  fixtures: [
    evidence(
      "new-project",
      "test/unit/onboarding.test.mjs",
      "Global Launcher onboards and delegates Engineering Runs to project-owned state",
    ),
    evidence(
      "unprepared-legacy",
      "test/unit/normalization.test.mjs",
      "exact hash approval applies a legacy manifest and reaches Prepared Project",
    ),
    evidence(
      "healthy-prepared-project",
      "test/unit/runtime-doctor.test.mjs",
      "healthy Prepared Project diagnosis is READY and read-only",
    ),
    evidence(
      "drifted-runtime",
      "test/unit/runtime-doctor.test.mjs",
      "missing and drifted owned generated runtime files are repairable and dry-run is read-only",
    ),
    evidence(
      "dirty-worktree",
      "test/unit/fast-run.test.mjs",
      "FAST restores and blocks direct mutation of the Integration worktree",
    ),
    evidence(
      "remote-divergence",
      "test/unit/standard-run.test.mjs",
      "remote divergence stops at a Human Gate without overwriting either history",
    ),
    evidence(
      "interrupted-resume",
      "test/unit/standard-run.test.mjs",
      "interrupted STANDARD graph resumes from durable state without chat history",
    ),
  ],
  scenarios: [
    evidence(
      "simple-without-bureaucracy",
      "test/unit/fast-run.test.mjs",
      "a small cross-file task completes the FAST lifecycle without spec or tickets",
    ),
    evidence(
      "ambiguous-task",
      "test/unit/standard-run.test.mjs",
      "ambiguous STANDARD records research before one durable decision gate and never starts Worker",
    ),
    evidence(
      "missing-tests",
      "test/unit/advisor-gate.test.mjs",
      "Advisor REVISE reports MISSING_VERIFICATION before Worker",
    ),
    evidence(
      "ticket-code-conflict",
      "test/unit/deep-parallel-run.test.mjs",
      "a conflicting Worker result creates BLOCKED corrective work without changing accepted integration",
    ),
    evidence(
      "failed-advisor",
      "test/unit/advisor-gate.test.mjs",
      "two unresolved Advisor REVISE rounds create a terminal Human Gate before Worker",
    ),
    evidence(
      "partial-worker",
      "test/unit/worker-contract-rejection.test.mjs",
      "partial-worker is rejected before a Root checkpoint",
    ),
    evidence(
      "false-green-review",
      "test/unit/fast-run.test.mjs",
      "a passing Quality Review cannot override a failing instrumental check",
    ),
    evidence(
      "scope-expansion",
      "test/unit/fast-run.test.mjs",
      "FAST blocks output beyond the exact Write Lease before committing",
    ),
    evidence(
      "overlapping-writers",
      "test/unit/deep-parallel-run.test.mjs",
      "overlapping DEEP Write Leases execute strictly sequentially",
    ),
    evidence(
      "restart-after-interruption",
      "test/unit/deep-parallel-run.test.mjs",
      "resume discards and replays a bounded pre-commit Worker result from durable HEAD",
    ),
  ],
  components: [
    evidence(
      "classifier",
      "test/unit/mode-policy.test.mjs",
      "the public policy contract excludes file count from Task Profile evidence",
      "DETERMINISTIC_CONTRACT",
    ),
    evidence(
      "state-transitions",
      "test/unit/standard-run.test.mjs",
      "one-ticket STANDARD run reaches READY_FOR_HUMAN through the bounded lifecycle",
      "DETERMINISTIC_CONTRACT",
    ),
    evidence(
      "artifact-schemas",
      "test/unit/review-contracts.test.mjs",
      "generic PASS without evidence is rejected",
      "DETERMINISTIC_CONTRACT",
    ),
    evidence(
      "manifest-hashing",
      "test/unit/normalization.test.mjs",
      "Migration Manifest is complete and its hash binds every path and action",
      "DETERMINISTIC_CONTRACT",
    ),
    evidence(
      "ownership",
      "test/unit/runtime-doctor.test.mjs",
      "working-tree ownership metadata without a committed manifest is never READY",
      "DETERMINISTIC_CONTRACT",
    ),
    evidence(
      "git-safety",
      "test/unit/fast-run.test.mjs",
      "FAST prevents protected ref mutation and preserves main",
      "DETERMINISTIC_CONTRACT",
    ),
    evidence(
      "sync-divergence",
      "test/unit/standard-run.test.mjs",
      "remote divergence stops at a Human Gate without overwriting either history",
      "DETERMINISTIC_CONTRACT",
    ),
    evidence(
      "capability-qualification",
      "test/unit/capability-qualification.test.mjs",
      "the installed Project Runtime exposes explicit capability qualification",
      "DETERMINISTIC_CONTRACT",
    ),
  ],
  requiredPlatform: "win32",
  additionalPlatform: {
    platform: "linux",
    status: "V1_LIMITATION",
    reason: "Additional platform execution is documented but not mandatory in V1.",
  },
});
export const CANONICAL_SUITE_HASH =
  "26de612dd877e2ceeb0411a8883bd95cc801eb2f7f708f2104df59bc097e5b86";

/** @param {Record<string, any>} suite */
function qualificationManifest(suite) {
  /** @param {Array<Record<string, any>>} entries */
  const select = (entries) =>
    entries?.map(({ id, mandatory, seam, testFile, testName }) => ({
      id,
      mandatory,
      seam,
      testFile,
      testName,
    })) ?? [];
  return {
    schemaVersion: suite?.schemaVersion,
    id: suite?.id,
    seam: suite?.seam,
    fixtures: select(suite?.fixtures),
    scenarios: select(suite?.scenarios),
    components: select(suite?.components),
    requiredPlatform: suite?.requiredPlatform,
    additionalPlatform: suite?.additionalPlatform,
  };
}

/** @param {unknown} value */
export function validateQualificationSuite(value) {
  const suite = /** @type {Record<string, any>} */ (value);
  const errors = [];
  if (
    suite?.schemaVersion !== 1 ||
    suite.id !== "codex-engineering-loop-v1" ||
    suite.seam !== "BLACK_BOX_PUBLIC_RUNTIME"
  ) {
    errors.push("suite identity or public seam is invalid");
  }
  validateEvidenceGroup(suite?.fixtures, REQUIRED_FIXTURES, "fixture", errors);
  validateEvidenceGroup(suite?.scenarios, REQUIRED_SCENARIOS, "scenario", errors);
  validateEvidenceGroup(suite?.components, REQUIRED_COMPONENTS, "component", errors);
  if (
    suite &&
    hashCanonical(qualificationManifest(suite)) !== CANONICAL_SUITE_HASH
  ) {
    errors.push("suite evidence mapping does not match the canonical manifest");
  }
  if (
    suite?.requiredPlatform !== "win32" ||
    suite?.additionalPlatform?.status !== "V1_LIMITATION" ||
    suite.additionalPlatform.platform !== "linux"
  ) {
    errors.push("cross-platform evidence contract is incomplete");
  }
  return { valid: errors.length === 0, errors };
}

/** @param {Record<string, any>} input */
export function evaluateQualification(input) {
  const suiteValidation = validateQualificationSuite(input?.suite);
  const expectedScenarioIds = new Set(
    input?.suite?.scenarios?.map((/** @type {any} */ entry) => entry.id) ?? [],
  );
  const expectedComponentIds = new Set(
    input?.suite?.components?.map((/** @type {any} */ entry) => entry.id) ?? [],
  );
  const expectedFixtureIds = new Set(
    input?.suite?.fixtures?.map((/** @type {any} */ entry) => entry.id) ?? [],
  );
  const fixtureResults = validResultGroup(
    input?.fixtureResults,
    expectedFixtureIds,
  );
  const scenarioResults = validResultGroup(
    input?.scenarioResults,
    expectedScenarioIds,
  );
  const componentResults = validResultGroup(
    input?.componentResults,
    expectedComponentIds,
  );
  const platformValid =
    input?.platform?.current === input?.suite?.requiredPlatform &&
    input?.platform?.required === input?.suite?.requiredPlatform &&
    input?.platform?.status === "PASS" &&
    isEvidenceIds(input?.platform?.evidenceIds);
  const failedMandatoryIds = [
    ...(input?.scenarioResults ?? [])
      .filter((/** @type {any} */ entry) => entry.status !== "PASS")
      .map((/** @type {any} */ entry) => entry.id),
    ...(input?.componentResults ?? [])
      .filter((/** @type {any} */ entry) => entry.status !== "PASS")
      .map((/** @type {any} */ entry) => entry.id),
    ...(input?.fixtureResults ?? [])
      .filter((/** @type {any} */ entry) => entry.status !== "PASS")
      .map((/** @type {any} */ entry) => `fixture:${entry.id}`),
    ...(platformValid ? [] : ["platform:win32"]),
    ...(input?.denyList?.status === "PASS" ? [] : ["deny-list"]),
  ];
  const status =
    suiteValidation.valid &&
    scenarioResults &&
    componentResults &&
    fixtureResults &&
    platformValid &&
    input?.denyList?.status === "PASS" &&
    failedMandatoryIds.length === 0
      ? "PASS"
      : "BLOCKED";
  return {
    schemaVersion: 1,
    suiteId: input?.suite?.id ?? null,
    status,
    terminal: true,
    rawLogsPersisted: false,
    chatTranscriptPersisted: false,
    failedMandatoryIds: [...new Set(failedMandatoryIds)].sort(),
    scenarioResults: input?.scenarioResults ?? [],
    componentResults: input?.componentResults ?? [],
    fixtureResults: input?.fixtureResults ?? [],
    platform: input?.platform ?? null,
    additionalPlatform: input?.suite?.additionalPlatform ?? null,
    denyList: input?.denyList ?? { status: "FAIL", findings: ["missing scan"] },
    suiteValidation,
  };
}

/** @param {unknown} payload */
export function scanQualificationPayload(payload) {
  const findings = [];
  let source;
  try {
    source = JSON.stringify(payload);
  } catch {
    return { status: "FAIL", findings: ["payload is not serializable"] };
  }
  if (Buffer.byteLength(source, "utf8") > 1024 * 1024) {
    findings.push("payload exceeds the 1 MiB report bound");
  }
  const forbiddenKeys = new Set([
    "token",
    "accesstoken",
    "refreshtoken",
    "password",
    "secret",
    "credential",
    "authorization",
    "apikey",
    "rawlog",
    "rawlogs",
    "stdout",
    "stderr",
    "commandoutput",
    "chattranscript",
    "providerpayload",
  ]);
  /** @param {unknown} value @param {string} pointer */
  const visit = (value, pointer) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${pointer}/${index}`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
        if (forbiddenKeys.has(normalizedKey)) {
          findings.push(`${pointer}/${key} uses a forbidden field`);
        }
        visit(entry, `${pointer}/${key}`);
      }
      return;
    }
    if (typeof value === "string") {
      if (
        /(?:X-Amz-Signature|X-Goog-Signature|[?&](?:sig|signature|token)=)/iu.test(value)
      ) {
        findings.push(`${pointer} contains a signed or credentialed URL`);
      }
      if (
        /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-(?:proj-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._~+/-]{8,}|(?:password|secret|token|api[_-]?key)[=:_ -][A-Za-z0-9._~+/-]{6,})/u.test(
          value,
        )
      ) {
        findings.push(`${pointer} contains secret-like material`);
      }
    }
  };
  visit(payload, "");
  return {
    status: findings.length === 0 ? "PASS" : "FAIL",
    findings: [...new Set(findings)].sort(),
  };
}

/**
 * @param {string} root
 * @param {{ allowNoRepository?: boolean }} [options]
 */
export async function scanTrackedQualificationArtifacts(root, options = {}) {
  const findings = [];
  const pathsResult = await runBoundedProcess(
    "git",
    [
      "ls-files",
      "-z",
      "--",
      ".engineering/runs",
      ".engineering/qualification",
    ],
    root,
  );
  if (pathsResult.code !== 0) {
    if (options.allowNoRepository) {
      const gitAvailable = await runBoundedProcess("git", ["--version"], root);
      let gitMetadataAbsent = false;
      try {
        await lstat(path.join(root, ".git"));
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
          gitMetadataAbsent = true;
        }
      }
      if (gitAvailable.code === 0 && gitMetadataAbsent) {
        return {
          status: "PASS",
          findings: [],
          scannedPaths: 0,
          scannedRevisions: 0,
          repositoryStatus: "NOT_APPLICABLE",
        };
      }
    }
    return {
      status: "FAIL",
      findings: ["tracked artifact inventory is unavailable"],
      scannedPaths: 0,
      scannedRevisions: 0,
    };
  }
  const trackedPaths = pathsResult.stdout.split("\u0000").filter(Boolean).sort();
  if (trackedPaths.length > 500) {
    findings.push("tracked engineering artifact inventory exceeds 500 paths");
  }
  let totalBytes = 0;
  for (const projectPath of trackedPaths.slice(0, 500)) {
    if (
      !isSafeProjectPath(projectPath) ||
      !projectPath.startsWith(".engineering/")
    ) {
      findings.push("tracked engineering artifact path is unsafe");
      continue;
    }
    try {
      const staged = await runBoundedProcess(
        "git",
        ["show", `:${projectPath}`],
        root,
      );
      if (staged.code !== 0 || staged.overflow) {
        findings.push(`${projectPath} staged blob could not be scanned`);
        continue;
      }
      const source = staged.stdout;
      const sourceBytes = Buffer.byteLength(source, "utf8");
      totalBytes += sourceBytes;
      if (sourceBytes > 256 * 1024 || totalBytes > 2 * 1024 * 1024) {
        findings.push("tracked engineering artifacts exceed the scan bound");
        break;
      }
      let payload = { content: source };
      if (projectPath.endsWith(".json")) {
        try {
          payload = JSON.parse(source);
        } catch {
          findings.push(`${projectPath} is not valid JSON`);
          continue;
        }
      }
      const scan = scanQualificationPayload(payload);
      findings.push(
        ...scan.findings.map((finding) => `${projectPath}: ${finding}`),
      );
    } catch {
      findings.push(`${projectPath} could not be scanned`);
    }
  }

  const revisionsResult = await runBoundedProcess(
    "git",
    [
      "rev-list",
      "--all",
      "--",
      ".engineering/runs",
      ".engineering/qualification",
    ],
    root,
  );
  const revisions =
    revisionsResult.code === 0
      ? revisionsResult.stdout.trim().split(/\r?\n/u).filter(Boolean)
      : [];
  if (revisionsResult.code !== 0 || revisions.length > 256) {
    findings.push("checkpoint revision inventory exceeds the scan contract");
  } else if (revisions.length > 0) {
    const historicalPattern =
      '(sk-(proj-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|Bearer[[:space:]]+[A-Za-z0-9._~+/-]{8,}|X-Amz-Signature|X-Goog-Signature|[?&](sig|signature|token)=|(password|secret|token|api[_-]?key)[=:_ -][A-Za-z0-9._~+/-]{6,}|"(token|accessToken|refreshToken|password|secret|credential|authorization|apiKey|api_key|rawLog|rawLogs|stdout|stderr|commandOutput|chatTranscript|providerPayload)"[[:space:]]*:)';
    const historical = await runBoundedProcess(
      "git",
      [
        "grep",
        "-I",
        "-n",
        "-i",
        "-E",
        historicalPattern,
        ...revisions,
        "--",
        ".engineering/runs",
        ".engineering/qualification",
      ],
      root,
    );
    if (historical.code === 0) {
      findings.push("checkpoint history contains forbidden artifact material");
    } else if (historical.code !== 1) {
      findings.push("checkpoint history deny-list scan could not complete");
    }
  }
  return {
    status: findings.length === 0 ? "PASS" : "FAIL",
    findings: [...new Set(findings)].sort(),
    scannedPaths: trackedPaths.length,
    scannedRevisions: revisions.length,
    repositoryStatus: "SCANNED",
  };
}

/** @param {string} root @param {Record<string, any>} suite */
async function qualificationSourceFingerprint(root, suite) {
  const pathResult = await runBoundedProcess(
    "git",
    [
      "ls-files",
      "-z",
      "--",
      "package.json",
      "package-lock.json",
      "skills/engineering-loop",
      "test",
      ...uniqueEvidence([
        ...suite.fixtures,
        ...suite.scenarios,
        ...suite.components,
      ]).map((entry) => entry.testFile),
    ],
    root,
  );
  if (pathResult.code !== 0) {
    throw new Error("Qualification source inventory is unavailable.");
  }
  const projectPaths = [...new Set(
    pathResult.stdout.split("\u0000").filter(Boolean),
  )].sort();
  const files = [];
  let totalBytes = 0;
  for (const projectPath of projectPaths) {
    const absolute = path.join(root, ...projectPath.split("/"));
    const stats = await lstat(absolute);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Qualification source is not regular: ${projectPath}`);
    }
    totalBytes += stats.size;
    if (stats.size > 2 * 1024 * 1024 || totalBytes > 32 * 1024 * 1024) {
      throw new Error("Qualification source fingerprint exceeds its bound.");
    }
    files.push({
      path: projectPath,
      sha256: sha256(await readFile(absolute)),
    });
  }
  const revision = await runBoundedProcess("git", ["rev-parse", "HEAD"], root);
  if (revision.code !== 0 || !/^[a-f0-9]{40}\r?\n?$/u.test(revision.stdout)) {
    throw new Error("Qualification base revision is unavailable.");
  }
  return {
    baseRevision: revision.stdout.trim(),
    files,
    fingerprint: hashCanonical({
      suiteHash: CANONICAL_SUITE_HASH,
      files,
    }),
  };
}

/**
 * @param {string} root
 * @param {Record<string, any>} [suite]
 * @param {{ executor?: (root: string, item: Record<string, any>) => Promise<Record<string, any>> }} [options]
 */
export async function runQualification(
  root,
  suite = QUALIFICATION_SUITE,
  options = {},
) {
  const validation = validateQualificationSuite(suite);
  if (!validation.valid) {
    return evaluateQualification({
      suite,
      scenarioResults: [],
      componentResults: [],
      fixtureResults: [],
      platform: {
        current: process.platform,
        required: "win32",
        status: "FAIL",
        evidenceIds: ["platform-contract"],
      },
      denyList: { status: "FAIL", findings: validation.errors },
    });
  }
  const allEvidence = [
    ...suite.fixtures,
    ...suite.scenarios,
    ...suite.components,
  ];
  const evidenceResults = new Map();
  const evidenceDirectory = await mkdtemp(
    path.join(os.tmpdir(), "engineering-loop-qualification-evidence-"),
  );
  try {
    const executor = options.executor ??
      ((target, item) => runNamedTest(target, item, evidenceDirectory));
    for (const item of uniqueEvidence(allEvidence)) {
      evidenceResults.set(
        evidenceKey(item),
        await executor(root, item),
      );
    }
  } finally {
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
  const scenarioResults = suite.scenarios.map((/** @type {any} */ entry) =>
    resultFor(entry, evidenceResults),
  );
  const componentResults = suite.components.map((/** @type {any} */ entry) =>
    resultFor(entry, evidenceResults),
  );
  const fixtureResults = suite.fixtures.map((/** @type {any} */ entry) =>
    resultFor(entry, evidenceResults),
  );
  const platformSmoke = await runNamedTest(root, {
    id: "platform-smoke",
    testFile: "test/smoke/platform.test.mjs",
    testName: "platform smoke returns the expected exit code and status",
  });
  const platform = {
    current: process.platform,
    required: suite.requiredPlatform,
    status:
      process.platform === suite.requiredPlatform &&
      platformSmoke.status === "PASS"
        ? "PASS"
        : "FAIL",
    evidenceIds: platformSmoke.evidenceIds,
  };
  const preliminary = {
    schemaVersion: 1,
    suiteId: suite.id,
    scenarioResults,
    componentResults,
    fixtureResults,
    platform,
    additionalPlatform: suite.additionalPlatform,
  };
  const artifactScan = await scanTrackedQualificationArtifacts(root);
  const payloadScan = scanQualificationPayload(preliminary);
  const fixtureArtifactScans = requiredFixtureArtifactScans(
    allEvidence,
    evidenceResults,
  );
  const fixtureArtifactsPass = fixtureArtifactScans.every(
    (scan) => scan.status === "PASS" && scan.scannedTargets > 0,
  );
  const denyList = {
    status:
      artifactScan.status === "PASS" &&
      payloadScan.status === "PASS" &&
      fixtureArtifactsPass
        ? "PASS"
        : "FAIL",
    findings: [
      ...artifactScan.findings,
      ...payloadScan.findings,
      ...fixtureArtifactScans.flatMap((scan) =>
        scan.findings.map(
          (/** @type {string} */ finding) =>
            `fixture:${scan.evidenceId}: ${finding}`,
        )
      ),
    ].sort(),
    scannedPaths: artifactScan.scannedPaths,
    scannedRevisions: artifactScan.scannedRevisions,
    fixtureScans: fixtureArtifactScans,
  };
  const source = await qualificationSourceFingerprint(root, suite);
  const report = evaluateQualification({
    suite,
    scenarioResults,
    componentResults,
    fixtureResults,
    platform,
    denyList,
  });
  return {
    ...report,
    execution: {
      seam: suite.seam,
      suiteHash: CANONICAL_SUITE_HASH,
      sourceFingerprint: source.fingerprint,
      sourceFiles: source.files,
      baseRevision: source.baseRevision,
      rawChildOutputPersisted: false,
      commands: uniqueEvidence(allEvidence).map((entry) => ({
        seam: entry.seam,
        testFile: entry.testFile,
        testName: entry.testName,
      })),
    },
  };
}

async function main() {
  const root = path.resolve(readOption("--target") ?? process.cwd());
  const outputOption =
    readOption("--output") ?? ".engineering/qualification/v1-report.json";
  if (!isQualificationOutputPath(outputOption)) {
    throw new Error(
      "Qualification output must be a JSON file directly under .engineering/qualification/.",
    );
  }
  const destination = path.join(root, ...outputOption.split("/"));
  if (await pathContainsLink(root, outputOption)) {
    throw new Error("Qualification output must stay within regular project paths.");
  }
  const injectedFailure = readOption("--inject-failure");
  if (
    injectedFailure &&
    !QUALIFICATION_SUITE.scenarios.some(
      (entry) => entry.id === injectedFailure,
    )
  ) {
    throw new Error("--inject-failure must name a mandatory scenario.");
  }
  const report = await runQualification(
    root,
    QUALIFICATION_SUITE,
    injectedFailure
      ? {
          executor: async (_target, item) => {
            if (item.id !== injectedFailure) {
              return {
                status: "PASS",
                evidenceIds: [`self-test-pass:${item.id}`],
              };
            }
            const injected = await runBoundedProcess(
              process.execPath,
              ["-e", "process.exit(7)"],
              root,
            );
            return {
              status: injected.code === 0 ? "PASS" : "FAIL",
              evidenceIds: [
                `self-test-child-exit:${injected.code ?? "UNKNOWN"}`,
              ],
            };
          },
        }
      : {},
  );
  const finalScan = scanQualificationPayload(report);
  if (finalScan.status !== "PASS") {
    report.status = "BLOCKED";
    report.failedMandatoryIds = [
      ...new Set([...report.failedMandatoryIds, "deny-list"]),
    ].sort();
    report.denyList = finalScan;
  }
  await writeJsonAtomic(root, outputOption, destination, report);
  process.stdout.write(
    `${JSON.stringify({
      status: report.status,
      reportPath: outputOption,
      failedMandatoryIds: report.failedMandatoryIds,
    })}\n`,
  );
  process.exitCode = report.status === "PASS" ? 0 : 1;
}

/**
 * @param {string} id
 * @param {string} testFile
 * @param {string} testName
 * @param {"BLACK_BOX_ENGINEERING_LOOP"|"DETERMINISTIC_CONTRACT"} [seam]
 */
function evidence(
  id,
  testFile,
  testName,
  seam = "BLACK_BOX_ENGINEERING_LOOP",
) {
  return { id, testFile, testName, seam, mandatory: true };
}

/** @param {unknown} group @param {readonly string[]} required @param {string} label @param {string[]} errors */
function validateEvidenceGroup(group, required, label, errors) {
  if (!Array.isArray(group)) {
    errors.push(`${label} evidence must be an array`);
    return;
  }
  const ids = group.map((entry) => entry?.id);
  for (const id of required) {
    if (!ids.includes(id)) {
      errors.push(`missing mandatory ${label}: ${id}`);
    }
  }
  if (
    ids.length !== required.length ||
    new Set(ids).size !== ids.length ||
    group.some(
      (entry) =>
        entry?.mandatory !== true ||
        entry?.seam !==
          (label === "component"
            ? "DETERMINISTIC_CONTRACT"
            : "BLACK_BOX_ENGINEERING_LOOP") ||
        !isSafeId(entry?.id) ||
        !isSafeProjectPath(entry?.testFile) ||
        !entry.testFile.startsWith("test/") ||
        typeof entry?.testName !== "string" ||
        entry.testName.length === 0 ||
        entry.testName.length > 200,
    )
  ) {
    errors.push(`${label} evidence contract is invalid`);
  }
}

/** @param {unknown} results @param {Set<string>} expectedIds */
function validResultGroup(results, expectedIds) {
  return Boolean(
    Array.isArray(results) &&
    results.length === expectedIds.size &&
    new Set(results.map((entry) => entry?.id)).size === results.length &&
    results.every(
      (entry) =>
        expectedIds.has(entry?.id) &&
        ["PASS", "FAIL"].includes(entry?.status) &&
        isEvidenceIds(entry?.evidenceIds),
    ),
  );
}

/** @param {unknown} value */
function isEvidenceIds(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry.length <= 240)
  );
}

/** @param {unknown} value */
function isSafeId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/u.test(value);
}

/** @param {unknown} value */
function isSafeProjectPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.includes("\\") &&
    !path.posix.isAbsolute(value) &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

/** @param {unknown} value */
function isQualificationOutputPath(value) {
  return (
    typeof value === "string" &&
    /^\.engineering\/qualification\/[a-z0-9][a-z0-9._-]{0,79}\.json$/u.test(
      value,
    )
  );
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** @param {Array<Record<string, any>>} entries */
function uniqueEvidence(entries) {
  const unique = new Map();
  for (const entry of entries) {
    const key = evidenceKey(entry);
    const existing = unique.get(key);
    if (
      !existing ||
      (existing.seam !== "BLACK_BOX_ENGINEERING_LOOP" &&
        entry.seam === "BLACK_BOX_ENGINEERING_LOOP")
    ) {
      unique.set(key, entry);
    }
  }
  return [...unique.values()];
}

/**
 * @param {Array<Record<string, any>>} entries
 * @param {Map<string, Record<string, any>>} results
 */
export function requiredFixtureArtifactScans(entries, results) {
  return entries
    .filter((entry) => entry.seam === "BLACK_BOX_ENGINEERING_LOOP")
    .map((entry) => ({
      evidenceId: entry.id,
      ...(results.get(evidenceKey(entry))?.artifactScan ?? {
        status: "FAIL",
        scannedTargets: 0,
        scannedPaths: 0,
        scannedRevisions: 0,
        findings: ["fixture artifact evidence is missing"],
      }),
    }));
}

/** @param {Record<string, any>} entry */
function evidenceKey(entry) {
  return `${entry.testFile}\u0000${entry.testName}`;
}

/** @param {Record<string, any>} entry @param {Map<string, Record<string, any>>} results */
function resultFor(entry, results) {
  const result = results.get(evidenceKey(entry));
  return {
    id: entry.id,
    status: result?.status ?? "FAIL",
    evidenceIds: result?.evidenceIds ?? [`missing:${entry.id}`],
  };
}

/**
 * @param {string} root
 * @param {Record<string, any>} item
 * @param {string} [evidenceDirectory]
 */
async function runNamedTest(root, item, evidenceDirectory) {
  const pattern = `^${escapeRegExp(item.testName)}$`;
  const artifactEvidenceKey = sha256(evidenceKey(item));
  const result = await runBoundedProcess(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      `--test-name-pattern=${pattern}`,
      item.testFile,
    ],
    root,
    evidenceDirectory
      ? {
          env: {
            QUALIFICATION_ARTIFACT_EVIDENCE_DIR: evidenceDirectory,
            QUALIFICATION_ARTIFACT_EVIDENCE_KEY: artifactEvidenceKey,
          },
        }
      : {},
  );
  const exactPass = result.stdout.includes(`# Subtest: ${item.testName}`) &&
    new RegExp(`^ok \\d+ - ${escapeRegExp(item.testName)}$`, "mu").test(result.stdout) &&
    /^# tests 1$/mu.test(result.stdout) &&
    /^# pass 1$/mu.test(result.stdout) &&
    /^# fail 0$/mu.test(result.stdout) &&
    /^# skipped 0$/mu.test(result.stdout);
  const artifactScan = item.seam === "BLACK_BOX_ENGINEERING_LOOP"
    ? await collectFixtureArtifactEvidence(
        evidenceDirectory,
        artifactEvidenceKey,
      )
    : undefined;
  return {
    status:
      result.code === 0 &&
      exactPass &&
      (!artifactScan || artifactScan.status === "PASS")
        ? "PASS"
        : "FAIL",
    evidenceIds: [
      `test:${item.testFile}:${item.testName}`,
      `exit-code:${result.code ?? "UNKNOWN"}`,
      ...(artifactScan
        ? [`fixture-artifact-scans:${artifactScan.scannedTargets}`]
        : []),
    ],
    ...(artifactScan ? { artifactScan } : {}),
  };
}

/** @param {string|undefined} directory @param {string} evidenceKeyHash */
async function collectFixtureArtifactEvidence(directory, evidenceKeyHash) {
  if (!directory) {
    return {
      status: "FAIL",
      scannedTargets: 0,
      scannedPaths: 0,
      scannedRevisions: 0,
      findings: ["fixture artifact evidence directory is missing"],
    };
  }
  const names = (await readdir(directory))
    .filter((name) => name.startsWith(`${evidenceKeyHash}-`) && name.endsWith(".json"))
    .sort();
  const records = [];
  for (const name of names.slice(0, 64)) {
    const absolute = path.join(directory, name);
    const stats = await lstat(absolute);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 64 * 1024) {
      records.push({
        status: "FAIL",
        scannedPaths: 0,
        scannedRevisions: 0,
        findings: ["fixture artifact evidence record is unsafe"],
      });
      continue;
    }
    try {
      records.push(JSON.parse(await readFile(absolute, "utf8")));
    } catch {
      records.push({
        status: "FAIL",
        scannedPaths: 0,
        scannedRevisions: 0,
        findings: ["fixture artifact evidence record is invalid"],
      });
    }
  }
  if (names.length > 64) {
    records.push({
      status: "FAIL",
      scannedPaths: 0,
      scannedRevisions: 0,
      findings: ["fixture artifact evidence exceeds 64 targets"],
    });
  }
  return {
    status:
      records.length > 0 &&
      records.every((record) => record.status === "PASS")
        ? "PASS"
        : "FAIL",
    scannedTargets: records.length,
    scannedPaths: records.reduce(
      (sum, record) => sum + Number(record.scannedPaths ?? 0),
      0,
    ),
    scannedRevisions: records.reduce(
      (sum, record) => sum + Number(record.scannedRevisions ?? 0),
      0,
    ),
    repositoryStatuses: [...new Set(
      records.map((record) => record.repositoryStatus ?? "UNKNOWN"),
    )].sort(),
    findings: [...new Set(
      records.flatMap((record) =>
        Array.isArray(record.findings) ? record.findings : ["invalid findings"]
      ),
    )].sort(),
  };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
function runBoundedProcess(command, args, cwd, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...options.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderrBytes = 0;
    let overflow = false;
    let settled = false;
    let terminationStarted = false;
    /** @type {NodeJS.Timeout | undefined} */
    let settleTimer;
    /** @param {number|null} code */
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(settleTimer);
      resolve({
        code: overflow ? null : code,
        stdout: overflow ? "" : stdout,
        overflow,
      });
    };
    const terminate = () => {
      if (terminationStarted) {
        return;
      }
      terminationStarted = true;
      overflow = true;
      void terminateProcessTree(child);
      settleTimer = setTimeout(() => finish(null), 10_000);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 256 * 1024) {
        terminate();
      }
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > 1024 * 1024) {
        terminate();
      }
    });
    const timer = setTimeout(() => {
      terminate();
    }, 15 * 60_000);
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
async function terminateProcessTree(child) {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "C:\\Windows\\System32\\taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          shell: false,
          windowsHide: true,
          stdio: "ignore",
        },
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

/** @param {string} option */
function readOption(option) {
  const index = process.argv.indexOf(option);
  if (index < 0) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

/**
 * @param {string} root
 * @param {string} projectPath
 * @param {string} destination
 * @param {unknown} value
 */
async function writeJsonAtomic(root, projectPath, destination, value) {
  const directory = path.dirname(destination);
  const temporary = path.join(
    directory,
    `${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  if (await pathContainsLink(root, projectPath)) {
    throw new Error("Qualification output path changed before publication.");
  }
  const rootReal = await realpath(root);
  const directoryReal = await realpath(directory);
  if (
    directoryReal !== rootReal &&
    !directoryReal.startsWith(`${rootReal}${path.sep}`)
  ) {
    throw new Error("Qualification output escaped the Target Project.");
  }
  const directoryBefore = await lstat(directory);
  try {
    const existing = await readFile(destination, "utf8")
      .then((source) => JSON.parse(source))
      .catch((error) => {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
          return null;
        }
        return {};
      });
    if (
      existing &&
      (existing.schemaVersion !== 1 ||
        existing.suiteId !== "codex-engineering-loop-v1")
    ) {
      throw new Error(
        "Qualification output destination contains unrelated project content.",
      );
    }
  } catch (error) {
    throw error;
  }
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    const directoryAfter = await lstat(directory);
    if (
      directoryAfter.isSymbolicLink() ||
      directoryAfter.dev !== directoryBefore.dev ||
      directoryAfter.ino !== directoryBefore.ino ||
      await pathContainsLink(root, projectPath) ||
      await realpath(directory) !== directoryReal
    ) {
      throw new Error("Qualification output namespace changed during publication.");
    }
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** @param {string} root @param {string} projectPath */
async function pathContainsLink(root, projectPath) {
  let current = root;
  for (const segment of projectPath.split("/")) {
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

/** @template T @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

/** @param {unknown} value */
function hashCanonical(value) {
  return sha256(canonicalJson(value));
}

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
