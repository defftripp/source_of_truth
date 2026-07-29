import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanTrackedQualificationArtifacts } from "../../skills/engineering-loop/scripts/qualify.mjs";

/**
 * @param {string} executable
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", async (code, signal) => {
      await recordQualificationArtifactEvidence(
        executable,
        args,
        options,
      );
      resolve({ code, signal, stdout, stderr });
    });
  });
}

/**
 * @param {string} executable
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} options
 */
async function recordQualificationArtifactEvidence(executable, args, options) {
  const evidenceDirectory =
    process.env.QUALIFICATION_ARTIFACT_EVIDENCE_DIR;
  const evidenceKey = process.env.QUALIFICATION_ARTIFACT_EVIDENCE_KEY;
  if (
    !evidenceDirectory ||
    !/^[a-f0-9]{64}$/u.test(evidenceKey ?? "")
  ) {
    return;
  }
  const target = qualificationTarget(executable, args, options);
  if (!target) {
    return;
  }
  try {
    const scan = await scanTrackedQualificationArtifacts(target, {
      allowNoRepository: true,
    });
    await mkdir(evidenceDirectory, { recursive: true });
    const targetHash = createHash("sha256")
      .update(path.resolve(target))
      .digest("hex");
    await writeFile(
      path.join(evidenceDirectory, `${evidenceKey}-${targetHash}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        status: scan.status,
        scannedPaths: scan.scannedPaths,
        scannedRevisions: scan.scannedRevisions,
        repositoryStatus: scan.repositoryStatus,
        findings: scan.findings,
      }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    await mkdir(evidenceDirectory, { recursive: true });
    const targetHash = createHash("sha256")
      .update(path.resolve(target))
      .digest("hex");
    await writeFile(
      path.join(evidenceDirectory, `${evidenceKey}-${targetHash}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        status: "FAIL",
        scannedPaths: 0,
        scannedRevisions: 0,
        findings: ["fixture artifact scan could not complete"],
      }, null, 2)}\n`,
      "utf8",
    );
  }
}

/**
 * @param {string} executable
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} options
 */
function qualificationTarget(executable, args, options) {
  const executableName = path.basename(executable).toLowerCase();
  const targetIndex = args.indexOf("--target");
  if (targetIndex >= 0 && typeof args[targetIndex + 1] === "string") {
    return path.resolve(options.cwd ?? process.cwd(), args[targetIndex + 1]);
  }
  if (
    executableName === "git" ||
    executableName === "git.exe" ||
    executableName === "git.cmd"
  ) {
    return null;
  }
  const script = typeof args[0] === "string" ? path.resolve(args[0]) : "";
  const marker = `${path.sep}.engineering${path.sep}`;
  const markerIndex = script.indexOf(marker);
  if (markerIndex >= 0) {
    return script.slice(0, markerIndex);
  }
  return null;
}
