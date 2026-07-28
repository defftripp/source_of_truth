import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./contracts.mjs";

const SAFE_CAPABILITY_PERMISSIONS = new Set(["project-read"]);
const TRUST_EXPANSION_ACTIONS = Object.freeze([
  "globalInstall",
  "credentials",
  "writeEnabledMcp",
  "paidProbe",
]);

/** @param {unknown} value */
export function validateCapabilityGap(value) {
  const gap = /** @type {Record<string, any>} */ (value);
  if (
    !gap ||
    gap.schemaVersion !== 1 ||
    !isConcreteEvidenceText(gap.missingBehavior) ||
    /\b(fashionable|modern|popular|trendy)\b/iu.test(gap.missingBehavior) ||
    !isEvidenceIdList(gap.taskEvidenceIds) ||
    !isSafeEvidenceId(gap.requiredBehavior?.id) ||
    !isEvidenceTextList(gap.requiredBehavior?.inputs) ||
    !isEvidenceTextList(gap.requiredBehavior?.outputs) ||
    !isEvidenceIdList(gap.requiredBehavior?.verificationIds) ||
    gap.trigger?.kind !== "MISSING_REQUIRED_BEHAVIOR" ||
    gap.trigger?.behaviorId !== gap.requiredBehavior?.id ||
    gap.trigger?.status !== "FAIL" ||
    !isEvidenceIdList(gap.trigger?.evidenceIds) ||
    !Array.isArray(gap.existingCapabilitiesChecked) ||
    gap.existingCapabilitiesChecked.length === 0 ||
    !gap.existingCapabilitiesChecked.every(
      (/** @type {any} */ entry) =>
        isEvidenceText(entry?.id) &&
        isEvidenceText(entry?.evidenceId) &&
        isConcreteEvidenceText(entry?.reasonInsufficient) &&
        Array.isArray(entry?.missingBehaviorIds) &&
        entry.missingBehaviorIds.length > 0 &&
        entry.missingBehaviorIds.includes(gap.requiredBehavior.id) &&
        entry.missingBehaviorIds.every(isSafeEvidenceId) &&
        !/\b(fashionable|modern|popular|trendy)\b/iu.test(entry.reasonInsufficient),
    )
  ) {
    throw new Error(
      "Capability gap must name concrete missing behavior, task evidence, and exhausted existing capabilities.",
    );
  }
  return value;
}

/** @param {unknown} gapValue @param {unknown} candidateValue */
export function evaluateCapabilityCandidate(gapValue, candidateValue) {
  const gap = /** @type {Record<string, any>} */ (validateCapabilityGap(gapValue));
  const candidate = /** @type {Record<string, any>} */ (candidateValue);
  const findings = [];
  if (
    !candidate ||
    candidate.schemaVersion !== 1 ||
    !isPortableSegment(candidate.id) ||
    candidate.id !== candidate.id.toLowerCase()
  ) {
    findings.push("candidate identity is incomplete");
  }
  if (!["SKILL", "MCP", "CLI"].includes(candidate?.kind)) {
    findings.push("candidate kind is incomplete");
  }
  if (candidate?.provenance !== "VERIFIED") {
    findings.push("provenance is unknown or unverified");
  }
  if (
    !isEvidenceText(candidate?.source) ||
    !isSafeSourceUrl(candidate.source)
  ) {
    findings.push("source must be a verified HTTPS origin");
  }
  if (
    !isEvidenceText(candidate?.license) ||
    /^(?:unknown|unlicensed|none)$/iu.test(candidate.license)
  ) {
    findings.push("license evidence is missing");
  }
  if (!/^[a-f0-9]{40}$/u.test(candidate?.revision ?? "")) {
    findings.push("revision must be immutable and pinned");
  }
  if (!/^[a-f0-9]{64}$/u.test(candidate?.checksum ?? "")) {
    findings.push("checksum evidence is missing");
  }
  if (
    !Array.isArray(candidate?.permissions) ||
    candidate.permissions.length === 0 ||
    new Set(candidate.permissions).size !== candidate.permissions.length ||
    candidate.permissions.some(
      (/** @type {unknown} */ permission) =>
        typeof permission !== "string" || !SAFE_CAPABILITY_PERMISSIONS.has(permission),
    )
  ) {
    findings.push("permissions are missing or excessive");
  }
  if (!Array.isArray(candidate?.scripts) || candidate.scripts.length !== 0) {
    findings.push("scripts must be inspected and unsafe lifecycle scripts are forbidden");
  }
  if (
    candidate?.instructions?.status !== "COMPATIBLE" ||
    !isEvidenceText(candidate?.instructions?.evidenceId)
  ) {
    findings.push("instructions are missing or conflict with the Project Runtime");
  }
  if (
    candidate?.maintenance?.status !== "MAINTAINED" ||
    !isEvidenceText(candidate?.maintenance?.evidenceId)
  ) {
    findings.push("maintenance evidence is missing");
  }
  if (!Array.isArray(candidate?.conflicts) || candidate.conflicts.length !== 0) {
    findings.push("conflicts are unresolved");
  }
  if (
    candidate?.taskFit?.missingBehavior !== gap.missingBehavior ||
    candidate?.taskFit?.requiredBehaviorId !== gap.requiredBehavior.id ||
    !isEvidenceIdList(candidate?.taskFit?.evidenceIds)
  ) {
    findings.push("taskFit does not match the proven capability gap");
  }
  if (
    !candidate?.requestedActions ||
    TRUST_EXPANSION_ACTIONS.some(
      (action) => typeof candidate.requestedActions[action] !== "boolean",
    )
  ) {
    findings.push("requested actions are incomplete");
  }
  if (findings.length > 0) {
    return { status: "REJECTED", findings, humanGate: null };
  }
  const requestedActions = TRUST_EXPANSION_ACTIONS.filter(
    (action) => candidate.requestedActions[action],
  );
  if (requestedActions.length > 0) {
    return {
      status: "HUMAN_GATE",
      findings: [],
      humanGate: {
        schemaVersion: 1,
        kind: "CAPABILITY_TRUST_EXPANSION",
        approved: false,
        candidateId: candidate.id,
        requestedActions,
        approvalHash: sha256(canonicalJson({ gap, candidate })),
      },
    };
  }
  return { status: "QUALIFIED", findings: [], humanGate: null };
}

/**
 * @param {string} targetInput
 * @param {{ gap: unknown, candidate: unknown }} request
 */
export async function qualifyProjectLocalCapability(targetInput, request) {
  const target = path.resolve(targetInput);
  if (await pathContainsLink(target, ".engineering/capabilities")) {
    return {
      status: "REJECTED",
      findings: ["project-local capability namespace is not confined to regular paths"],
      humanGate: null,
    };
  }
  const releaseLock = await acquireQualificationLock(target);
  if (!releaseLock) {
    return {
      status: "REJECTED",
      findings: ["another project-local capability qualification is active"],
      humanGate: null,
    };
  }
  try {
    return await qualifyProjectLocalCapabilityLocked(target, request);
  } finally {
    await releaseLock();
  }
}

/**
 * @param {string} target
 * @param {{ gap: unknown, candidate: unknown }} request
 */
async function qualifyProjectLocalCapabilityLocked(target, request) {
  const recoveryFinding = await recoverCapabilityTransactions(target);
  if (recoveryFinding) {
    return { status: "REJECTED", findings: [recoveryFinding], humanGate: null };
  }
  const evaluation = evaluateCapabilityCandidate(request?.gap, request?.candidate);
  if (evaluation.status === "HUMAN_GATE" && evaluation.humanGate) {
    const artifactPath =
      `.engineering/capabilities/human-gates/${evaluation.humanGate.approvalHash}.json`;
    if (
      await pathContainsLink(target, ".engineering/capabilities") ||
      await pathContainsLink(target, artifactPath)
    ) {
      return {
        status: "REJECTED",
        findings: ["capability Human Gate path is not confined to regular project paths"],
        humanGate: null,
      };
    }
    const humanGate = { ...evaluation.humanGate, artifactPath };
    const absoluteArtifact = path.join(target, ...artifactPath.split("/"));
    await mkdir(path.dirname(absoluteArtifact), { recursive: true });
    await writeFile(
      absoluteArtifact,
      `${JSON.stringify(humanGate, null, 2)}\n`,
      "utf8",
    );
    return { ...evaluation, humanGate };
  }
  if (evaluation.status !== "QUALIFIED") {
    return evaluation;
  }
  const candidate = /** @type {Record<string, any>} */ (request.candidate);
  const packageFinding = await validateStagedPackage(
    target,
    candidate,
    /** @type {Record<string, any>} */ (request.gap),
  );
  if (packageFinding) {
    return { status: "REJECTED", findings: [packageFinding], humanGate: null };
  }
  const contentAssertion = await resolveRegisteredContentAssertion(
    target,
    candidate,
    /** @type {Record<string, any>} */ (request.gap),
  );
  if (typeof contentAssertion === "string") {
    return {
      status: "REJECTED",
      findings: [contentAssertion],
      humanGate: null,
    };
  }

  const capabilitiesRoot = path.join(target, ".engineering", "capabilities");
  const registryPath = path.join(capabilitiesRoot, "registry.json");
  if (
    await pathContainsLink(target, ".engineering/capabilities") ||
    await pathContainsLink(target, ".engineering/capabilities/registry.json")
  ) {
    return {
      status: "REJECTED",
      findings: ["project-local capability registry is not confined to regular paths"],
      humanGate: null,
    };
  }
  const installRelative = `.engineering/capabilities/${candidate.id}`;
  const installPath = path.join(target, ...installRelative.split("/"));
  const transactionId = randomUUID();
  const tempName = `.candidate-${candidate.id}-${transactionId}`;
  const tempRelative = `.engineering/capabilities/${tempName}`;
  const tempPath = path.join(capabilitiesRoot, tempName);
  const journalRelative =
    `.engineering/capabilities/.transactions/${transactionId}.json`;
  const journalPath = path.join(target, ...journalRelative.split("/"));
  const registrySource = await readFile(registryPath, "utf8");
  const registry = /** @type {Record<string, any>} */ (JSON.parse(registrySource));
  if (
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.entries) ||
    !registry.entries.every(isCapabilityRegistryEntry) ||
    new Set(
      registry.entries.map(
        (/** @type {any} */ entry) => entry.id.toLowerCase(),
      ),
    ).size !== registry.entries.length ||
    registry.entries.some(
      (/** @type {any} */ entry) =>
        String(entry?.id).toLowerCase() === candidate.id.toLowerCase(),
    )
  ) {
    return {
      status: "REJECTED",
      findings: ["project-local capability registry conflicts with the candidate"],
      humanGate: null,
    };
  }
  try {
    await lstat(installPath);
    return {
      status: "REJECTED",
      findings: ["project-local capability destination already exists"],
      humanGate: null,
    };
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") {
      throw error;
    }
  }

  const entry = {
    id: candidate.id,
    kind: candidate.kind,
    source: candidate.source,
    revision: candidate.revision,
    checksum: candidate.checksum,
    files: candidate.files,
    installPath: installRelative,
    smokeStatus: "PASS",
    qualification: {
      provenance: candidate.provenance,
      license: candidate.license,
      permissions: candidate.permissions,
      scripts: candidate.scripts,
      instructions: candidate.instructions,
      maintenance: candidate.maintenance,
      conflicts: candidate.conflicts,
      taskFit: candidate.taskFit,
    },
  };
  const stagedRoot = path.join(target, ...candidate.stagedPath.split("/"));
  const journal = {
    schemaVersion: 1,
    transactionId,
    candidateId: candidate.id,
    tempPath: tempRelative,
    installPath: installRelative,
    registrySource,
    registryEntry: entry,
  };
  await mkdir(path.dirname(journalPath), { recursive: true });
  await writeFileAtomic(
    path.dirname(journalPath),
    journalPath,
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  try {
    await mkdir(tempPath, { recursive: false });
    let copiedBytes = 0;
    for (const file of candidate.files) {
      const source = await readFile(path.join(stagedRoot, ...file.path.split("/")));
      copiedBytes += source.length;
      if (
        source.length > 2 * 1024 * 1024 ||
        copiedBytes > 10 * 1024 * 1024 ||
        sha256(source) !== file.sha256
      ) {
        await rm(tempPath, { recursive: true, force: true });
        await cleanupJournal(journalPath);
        return {
          status: "REJECTED",
          findings: ["project-local package changed after validation"],
          humanGate: null,
        };
      }
      const destination = path.join(tempPath, ...file.path.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, source);
    }
    const smokePassed = await runPinnedSmoke(tempPath, contentAssertion);
    if (!smokePassed) {
      await rm(tempPath, { recursive: true, force: true });
      await cleanupJournal(journalPath);
      return {
        status: "REJECTED",
        findings: ["project-local capability smoke failed"],
        humanGate: null,
      };
    }
    await rename(tempPath, installPath);
    await writeFileAtomic(
      capabilitiesRoot,
      registryPath,
      `${JSON.stringify(
        { schemaVersion: 1, entries: [...registry.entries, entry] },
        null,
        2,
      )}\n`,
    );
    await cleanupJournal(journalPath);
    return {
      status: "INSTALLED",
      findings: [],
      humanGate: null,
      projectLocal: true,
      installPath: installRelative,
      smoke: {
        status: "PASS",
        kind: contentAssertion.kind,
        evidenceId: contentAssertion.id,
      },
    };
  } catch (error) {
    const currentRegistrySource = await readFile(registryPath, "utf8");
    const publishedRegistrySource = `${JSON.stringify(
      { schemaVersion: 1, entries: [...registry.entries, entry] },
      null,
      2,
    )}\n`;
    if (
      canonicalJson(JSON.parse(currentRegistrySource)) ===
      canonicalJson(JSON.parse(publishedRegistrySource))
    ) {
      await writeFileAtomic(capabilitiesRoot, registryPath, registrySource);
    }
    await rm(tempPath, { recursive: true, force: true });
    if (await installedTreeMatches(installPath, entry.files)) {
      await rm(installPath, { recursive: true, force: true });
    }
    await cleanupJournal(journalPath);
    throw error;
  }
}

/**
 * @param {string} target
 * @param {Record<string, any>} candidate
 * @param {Record<string, any>} gap
 */
async function validateStagedPackage(target, candidate, gap) {
  if (
    !isPortableSegment(candidate.id) ||
    candidate.id !== candidate.id.toLowerCase() ||
    candidate.stagedPath !== `.engineering/capability-candidates/${candidate.id}` ||
    !Array.isArray(candidate.files) ||
    candidate.files.length === 0 ||
    candidate.files.length > 128 ||
    candidate.smoke?.schemaVersion !== 1 ||
    candidate.smoke?.kind !== "REGISTERED_CONTENT_ASSERTION" ||
    !isSafeEvidenceId(candidate.smoke?.evidenceId) ||
    !gap.requiredBehavior.verificationIds.includes(candidate.smoke.evidenceId)
  ) {
    return "project-local package contract is incomplete";
  }
  const filePaths = new Set();
  const portableFilePaths = new Set();
  for (const file of candidate.files) {
    const portablePath = file?.path?.toLowerCase();
    if (
      !isSafePackagePath(file?.path) ||
      !/^[a-f0-9]{64}$/u.test(file?.sha256 ?? "") ||
      filePaths.has(file.path) ||
      portableFilePaths.has(portablePath)
    ) {
      return "project-local package file evidence is invalid";
    }
    filePaths.add(file.path);
    portableFilePaths.add(portablePath);
  }
  if (candidate.checksum !== sha256(JSON.stringify(candidate.files))) {
    return "project-local package checksum or smoke evidence does not match";
  }
  const stagedRoot = path.join(target, ...candidate.stagedPath.split("/"));
  if (await pathContainsLink(target, candidate.stagedPath)) {
    return "project-local package quarantine contains a linked path";
  }
  let totalBytes = 0;
  for (const file of candidate.files) {
    const sourcePath = path.join(stagedRoot, ...file.path.split("/"));
    if (await pathContainsLink(target, `${candidate.stagedPath}/${file.path}`)) {
      return "project-local package file is not confined to regular paths";
    }
    let stat;
    try {
      stat = await lstat(sourcePath);
    } catch {
      return "project-local package file is missing";
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return "project-local package contains a non-regular file";
    }
    totalBytes += stat.size;
    if (stat.size > 2 * 1024 * 1024 || totalBytes > 10 * 1024 * 1024) {
      return "project-local package exceeds the bounded qualification workload";
    }
    if (sha256(await readFile(sourcePath)) !== file.sha256) {
      return "project-local package file checksum does not match";
    }
  }
  return null;
}

/**
 * @param {string} target
 * @param {Record<string, any>} candidate
 * @param {Record<string, any>} gap
 */
async function resolveRegisteredContentAssertion(target, candidate, gap) {
  const registryPath = path.join(
    target,
    ".engineering",
    "verification",
    "registry.json",
  );
  let registry;
  try {
    registry = JSON.parse(await readFile(registryPath, "utf8"));
  } catch {
    return "registered capability content assertion is missing";
  }
  const matches = Array.isArray(registry?.checks)
    ? registry.checks.filter(
        (/** @type {any} */ check) =>
          check?.id === candidate.smoke.evidenceId,
      )
    : [];
  const assertion = matches[0];
  if (
    registry?.schemaVersion !== 1 ||
    matches.length !== 1 ||
    assertion?.kind !== "CAPABILITY_CONTENT_ASSERTION" ||
    !isSafePackagePath(assertion?.path) ||
    !isEvidenceText(assertion?.includes) ||
    !gap.requiredBehavior.verificationIds.includes(assertion.id) ||
    !candidate.files.some(
      (/** @type {any} */ file) => file.path === assertion.path,
    )
  ) {
    return "registered capability content assertion contract is invalid";
  }
  return assertion;
}

/** @param {string} root @param {Record<string, any>} smoke */
async function runPinnedSmoke(root, smoke) {
  try {
    const source = await readFile(
      path.join(root, ...smoke.path.split("/")),
      "utf8",
    );
    return source.includes(smoke.includes);
  } catch {
    return false;
  }
}

/** @param {unknown} value */
function isSafePackagePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    !value.includes("\\") &&
    !path.posix.isAbsolute(value) &&
    value.split("/").every(isPortableSegment)
  );
}

/** @param {unknown} value */
function isPortableSegment(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9._-]+$/u.test(value) &&
    !/[. ]$/u.test(value) &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu.test(value)
  );
}

/** @param {string} value */
function isSafeSourceUrl(value) {
  try {
    const source = new URL(value);
    return (
      source.protocol === "https:" &&
      source.hostname.length > 0 &&
      source.username === "" &&
      source.password === "" &&
      source.search === "" &&
      source.hash === ""
    );
  } catch {
    return false;
  }
}

/** @param {string} target @param {string} projectPath */
async function pathContainsLink(target, projectPath) {
  let current = target;
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

/** @param {string} target */
async function acquireQualificationLock(target) {
  const capabilitiesRoot = path.join(target, ".engineering", "capabilities");
  const lockPath = path.join(capabilitiesRoot, ".qualification-lock");
  const ownerPath = path.join(lockPath, "owner.json");
  const token = randomUUID();
  await mkdir(capabilitiesRoot, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await mkdir(lockPath);
      await writeFile(
        ownerPath,
        `${JSON.stringify({
          schemaVersion: 1,
          pid: process.pid,
          token,
          startedAt: new Date().toISOString(),
        }, null, 2)}\n`,
        "utf8",
      );
      return async () => {
        const owner = await readFile(ownerPath, "utf8")
          .then((source) => JSON.parse(source))
          .catch(() => null);
        if (owner?.token === token) {
          await rm(lockPath, { recursive: true, force: true });
        }
      };
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") {
        throw error;
      }
      const owner = await readFile(ownerPath, "utf8")
        .then((source) => JSON.parse(source))
        .catch(() => null);
      const lockStat = await lstat(lockPath).catch(() => null);
      if (lockStat?.isSymbolicLink()) {
        return null;
      }
      const startedAt = Date.parse(owner?.startedAt ?? "");
      const ownerContract =
        owner?.schemaVersion === 1 &&
        typeof owner?.token === "string" &&
        /^[a-f0-9-]{36}$/u.test(owner.token) &&
        Number.isFinite(startedAt) &&
        startedAt <= Date.now() + 5_000 &&
        Number.isInteger(owner?.pid) &&
        owner.pid > 0;
      const ownerAlive = ownerContract
        ? isProcessAlive(owner.pid)
        : Boolean(lockStat && Date.now() - lockStat.mtimeMs < 60_000);
      if (ownerAlive) {
        return null;
      }
      const stalePath = path.join(
        capabilitiesRoot,
        `.qualification-lock-stale-${token}`,
      );
      try {
        await rename(lockPath, stalePath);
      } catch (renameError) {
        if (
          ["ENOENT", "EEXIST"].includes(
            /** @type {NodeJS.ErrnoException} */ (renameError).code ?? "",
          )
        ) {
          continue;
        }
        throw renameError;
      }
      await rm(stalePath, { recursive: true, force: true });
    }
  }
  return null;
}

/** @param {number} pid */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === "EPERM";
  }
}

/** @param {string} target */
async function recoverCapabilityTransactions(target) {
  const capabilitiesRoot = path.join(target, ".engineering", "capabilities");
  const transactionsRoot = path.join(capabilitiesRoot, ".transactions");
  if (
    await pathContainsLink(target, ".engineering/capabilities") ||
    await pathContainsLink(target, ".engineering/capabilities/.transactions")
  ) {
    return "capability transaction journal is not confined to regular project paths";
  }
  const rootRemnantFinding = await removeAtomicWriteRemnants(
    capabilitiesRoot,
    /^registry\.json\.[a-f0-9-]{36}\.tmp$/u,
  );
  if (rootRemnantFinding) {
    return rootRemnantFinding;
  }
  let names;
  try {
    names = await readdir(transactionsRoot);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  for (const name of names.sort()) {
    if (/^[a-f0-9-]{36}\.json\.[a-f0-9-]{36}\.tmp$/u.test(name)) {
      const remnantPath = path.join(transactionsRoot, name);
      const stats = await lstat(remnantPath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        return "capability transaction atomic-write remnant is not a regular file";
      }
      await rm(remnantPath, { force: true });
      continue;
    }
    if (!/^[a-f0-9-]{36}\.json$/u.test(name)) {
      return "capability transaction journal contains an unknown entry";
    }
    const journalPath = path.join(transactionsRoot, name);
    if ((await lstat(journalPath)).isSymbolicLink()) {
      return "capability transaction journal contains a linked entry";
    }
    let journal;
    try {
      journal = JSON.parse(await readFile(journalPath, "utf8"));
    } catch {
      return "capability transaction journal is malformed";
    }
    const expectedTemp =
      `.engineering/capabilities/.candidate-${journal?.candidateId}-${journal?.transactionId}`;
    const expectedInstall = `.engineering/capabilities/${journal?.candidateId}`;
    if (
      journal?.schemaVersion !== 1 ||
      journal?.transactionId !== name.slice(0, -5) ||
      !isPortableSegment(journal?.candidateId) ||
      journal?.tempPath !== expectedTemp ||
      journal?.installPath !== expectedInstall ||
      typeof journal?.registrySource !== "string" ||
      journal.registrySource.length > 1024 * 1024 ||
      !isCapabilityRegistryEntry(journal?.registryEntry) ||
      journal.registryEntry.id !== journal.candidateId
    ) {
      return "capability transaction journal contract is invalid";
    }
    let previousRegistry;
    try {
      previousRegistry = JSON.parse(journal.registrySource);
    } catch {
      return "capability transaction journal registry snapshot is invalid";
    }
    if (
      previousRegistry?.schemaVersion !== 1 ||
      !Array.isArray(previousRegistry.entries) ||
      !previousRegistry.entries.every(isCapabilityRegistryEntry) ||
      new Set(
        previousRegistry.entries.map(
          (/** @type {any} */ entry) => entry.id.toLowerCase(),
        ),
      ).size !== previousRegistry.entries.length ||
      previousRegistry.entries.some(
        (/** @type {any} */ entry) =>
          entry?.id?.toLowerCase() === journal.candidateId.toLowerCase(),
      )
    ) {
      return "capability transaction journal registry snapshot conflicts";
    }
    const registryPath = path.join(capabilitiesRoot, "registry.json");
    const currentRegistry = await readFile(registryPath, "utf8")
      .then((source) => JSON.parse(source))
      .catch(() => null);
    const expectedPublishedRegistry = {
      schemaVersion: 1,
      entries: [...previousRegistry.entries, journal.registryEntry],
    };
    if (
      !expectedPublishedRegistry.entries.every(isCapabilityRegistryEntry) ||
      new Set(
        expectedPublishedRegistry.entries.map(
          (/** @type {any} */ entry) => entry.id.toLowerCase(),
        ),
      ).size !== expectedPublishedRegistry.entries.length
    ) {
      return "capability transaction published registry contract is invalid";
    }
    const currentCanonical = canonicalJson(currentRegistry);
    const previousCanonical = canonicalJson(previousRegistry);
    const publishedCanonical = canonicalJson(expectedPublishedRegistry);
    if (
      currentCanonical !== previousCanonical &&
      currentCanonical !== publishedCanonical
    ) {
      return "capability transaction journal does not match the current registry";
    }
    const installPath = path.join(target, ...journal.installPath.split("/"));
    const installExists = await isRegularDirectory(installPath);
    const installMatches =
      installExists &&
      await installedTreeMatches(installPath, journal.registryEntry.files);
    const committed =
      currentCanonical === publishedCanonical && installMatches;
    const tempPath = path.join(target, ...journal.tempPath.split("/"));
    if (committed) {
      await rm(tempPath, { recursive: true, force: true });
      await rm(journalPath, { force: true });
      continue;
    }
    if (
      await pathContainsLink(target, journal.installPath) ||
      await pathContainsLink(target, journal.tempPath)
    ) {
      return "capability transaction recovery encountered a linked path";
    }
    if (installExists && !installMatches) {
      return "capability transaction journal install identity does not match";
    }
    if (currentCanonical === publishedCanonical) {
      await writeFileAtomic(capabilitiesRoot, registryPath, journal.registrySource);
    }
    if (installMatches) {
      await rm(installPath, { recursive: true, force: true });
    }
    await rm(tempPath, { recursive: true, force: true });
    await rm(journalPath, { force: true });
  }
  return null;
}

/** @param {unknown} value */
function isCapabilityRegistryEntry(value) {
  const entry = /** @type {Record<string, any>} */ (value);
  const filePaths = Array.isArray(entry?.files)
    ? entry.files.map((/** @type {any} */ file) => file?.path)
    : [];
  return Boolean(
    entry &&
    isPortableSegment(entry.id) &&
    entry.id === entry.id.toLowerCase() &&
    ["SKILL", "MCP", "CLI"].includes(entry.kind) &&
    isSafeSourceUrl(entry.source) &&
    /^[a-f0-9]{40}$/u.test(entry.revision ?? "") &&
    /^[a-f0-9]{64}$/u.test(entry.checksum ?? "") &&
    entry.installPath === `.engineering/capabilities/${entry.id}` &&
    entry.smokeStatus === "PASS" &&
    Array.isArray(entry.files) &&
    entry.files.length > 0 &&
    entry.files.length <= 128 &&
    entry.checksum === sha256(JSON.stringify(entry.files)) &&
    entry.files.every(
      (/** @type {any} */ file) =>
        isSafePackagePath(file?.path) &&
        /^[a-f0-9]{64}$/u.test(file?.sha256 ?? ""),
    ) &&
    new Set(filePaths).size === filePaths.length &&
    new Set(filePaths.map((file) => file.toLowerCase())).size === filePaths.length &&
    entry.qualification?.provenance === "VERIFIED" &&
    isEvidenceText(entry.qualification?.license) &&
    !/^(?:unknown|unlicensed|none)$/iu.test(entry.qualification.license) &&
    Array.isArray(entry.qualification?.permissions) &&
    entry.qualification.permissions.length === 1 &&
    entry.qualification.permissions[0] === "project-read" &&
    Array.isArray(entry.qualification?.scripts) &&
    entry.qualification.scripts.length === 0 &&
    entry.qualification?.instructions?.status === "COMPATIBLE" &&
    isEvidenceText(entry.qualification.instructions.evidenceId) &&
    entry.qualification?.maintenance?.status === "MAINTAINED" &&
    isEvidenceText(entry.qualification.maintenance.evidenceId) &&
    Array.isArray(entry.qualification?.conflicts) &&
    entry.qualification.conflicts.length === 0 &&
    isConcreteEvidenceText(entry.qualification?.taskFit?.missingBehavior) &&
    isSafeEvidenceId(entry.qualification?.taskFit?.requiredBehaviorId) &&
    isEvidenceIdList(entry.qualification?.taskFit?.evidenceIds),
  );
}

/** @param {string} root @param {Array<Record<string, any>>} files */
async function installedTreeMatches(root, files) {
  if (!Array.isArray(files) || !(await isRegularDirectory(root))) {
    return false;
  }
  const expected = new Map(files.map((file) => [file.path, file.sha256]));
  const found = new Set();
  /** @param {string} directory @param {string} relative */
  const visit = async (directory, relative) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(directory, entry.name);
      const stat = await lstat(child);
      if (stat.isSymbolicLink()) {
        return false;
      }
      if (stat.isDirectory()) {
        if (!(await visit(child, childRelative))) {
          return false;
        }
      } else if (
        !stat.isFile() ||
        !expected.has(childRelative) ||
        sha256(await readFile(child)) !== expected.get(childRelative)
      ) {
        return false;
      } else {
        found.add(childRelative);
      }
    }
    return true;
  };
  return (await visit(root, "")) && found.size === expected.size;
}

/** @param {string} directory @param {string} destination @param {string} source */
async function writeFileAtomic(directory, destination, source) {
  const temporary = path.join(
    directory,
    `${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, source, "utf8");
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * @param {string} directory
 * @param {RegExp} pattern
 */
async function removeAtomicWriteRemnants(directory, pattern) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  for (const entry of entries) {
    if (!pattern.test(entry.name)) {
      continue;
    }
    const remnantPath = path.join(directory, entry.name);
    const stats = await lstat(remnantPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return "capability atomic-write remnant is not a regular file";
    }
    await rm(remnantPath, { force: true });
  }
  return null;
}

/** @param {string} journalPath */
async function cleanupJournal(journalPath) {
  await rm(journalPath, { force: true });
  await rmdir(path.dirname(journalPath)).catch(() => {});
}

/** @param {string} candidate */
async function isRegularDirectory(candidate) {
  try {
    const stats = await lstat(candidate);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
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

/** @param {unknown} value */
function isEvidenceText(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 240 &&
    !/[\r\n\u0000-\u001f]/u.test(value)
  );
}

/** @param {unknown} value */
function isConcreteEvidenceText(value) {
  return (
    typeof value === "string" &&
    isEvidenceText(value) &&
    value.trim().length >= 16
  );
}

/** @param {unknown} value */
function isEvidenceIdList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        isSafeEvidenceId(entry),
    ) &&
    new Set(value).size === value.length
  );
}

/** @param {unknown} value */
function isSafeEvidenceId(value) {
  return (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9._:-]{0,79}$/u.test(value)
  );
}

/** @param {unknown} value */
function isEvidenceTextList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isEvidenceText) &&
    new Set(value).size === value.length
  );
}
