import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillsCliVersion = "1.5.19";

test("npx skills discovers and globally installs engineering-loop for Codex", async () => {
  const isolatedHome = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-install-"));
  assert.ok(process.env.npm_execpath, "smoke must run through npm so npx can be located");
  const npxCli = path.join(path.dirname(process.env.npm_execpath), "npx-cli.js");
  const env = {
    ...process.env,
    CODEX_HOME: path.join(isolatedHome, ".codex"),
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    DISABLE_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
  };

  try {
    const result = await runProcess(
      process.execPath,
      [
        npxCli,
        "--yes",
        `skills@${skillsCliVersion}`,
        "add",
        ".",
        "--skill",
        "engineering-loop",
        "--agent",
        "codex",
        "--global",
        "--copy",
        "--yes",
      ],
      { cwd: repositoryRoot, env },
    );
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);

    const candidates = [
      path.join(isolatedHome, ".codex", "skills", "engineering-loop", "SKILL.md"),
      path.join(isolatedHome, ".agents", "skills", "engineering-loop", "SKILL.md"),
    ];
    const installedSkill = await firstAccessible(candidates);
    assert.ok(
      installedSkill,
      `npx reported success but no installed skill was found.\n${result.stdout}\n${result.stderr}`,
    );
    const source = await readFile(installedSkill, "utf8");
    assert.match(source, /^---\r?\nname: engineering-loop/m);
    assert.match(result.stdout, /engineering-loop/i);

    const listing = await runProcess(
      process.execPath,
      [npxCli, "--yes", `skills@${skillsCliVersion}`, "list", "--global", "--agent", "codex"],
      { cwd: repositoryRoot, env },
    );
    assert.equal(listing.code, 0, `${listing.stdout}\n${listing.stderr}`);
    assert.match(listing.stdout, /engineering-loop/i);

    const installedLauncher = path.join(path.dirname(installedSkill), "scripts", "readiness.mjs");
    await access(installedLauncher);
    const target = path.join(isolatedHome, "empty target");
    await mkdir(target);
    const invocation = await runProcess(process.execPath, [
      installedLauncher,
      "--explicit",
      "--target",
      target,
    ]);
    assert.equal(invocation.code, 0, invocation.stderr);
    assert.equal(JSON.parse(invocation.stdout).status, "ONBOARDING_REQUIRED");

    const onboarding = await runProcess(process.execPath, [
      installedLauncher,
      "--explicit",
      "--onboard",
      "--target",
      target,
    ]);
    assert.equal(onboarding.code, 0, `${onboarding.stdout}\n${onboarding.stderr}`);
    assert.equal(JSON.parse(onboarding.stdout).status, "PREPARED_PROJECT");

    const engineeringRun = await runProcess(process.execPath, [
      installedLauncher,
      "--explicit",
      "--run",
      "--target",
      target,
    ]);
    assert.equal(engineeringRun.code, 0, `${engineeringRun.stdout}\n${engineeringRun.stderr}`);
    const runReport = JSON.parse(engineeringRun.stdout);
    assert.equal(runReport.status, "PREPARED_PROJECT");
    assert.equal(runReport.runtimeVersion, "1.2.0");
  } finally {
    await rm(isolatedHome, { recursive: true, force: true });
  }
});

/** @param {string[]} candidates */
async function firstAccessible(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next documented skills location.
    }
  }
  return null;
}
