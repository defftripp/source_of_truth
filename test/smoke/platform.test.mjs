import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runProcess } from "../support/process.mjs";

const launcherPath = fileURLToPath(
  new URL("../../skills/engineering-loop/scripts/readiness.mjs", import.meta.url),
);

test("platform smoke returns the expected exit code and status", async (context) => {
  context.diagnostic(`platform=${process.platform}`);
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-platform-"));
  const target = path.join(sandbox, "target with spaces");
  await mkdir(target);

  try {
    const result = await runProcess(process.execPath, [launcherPath, "--explicit", "--target", target]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "ONBOARDING_REQUIRED");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
