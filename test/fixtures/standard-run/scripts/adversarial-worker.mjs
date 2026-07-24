import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const variant = process.argv[2];
const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath);
const packet = JSON.parse(await readFile(packetPath, "utf8"));
assert.equal(packet.ticketId, "TICKET-1");
assert.equal(packet.workerMayCommit, false);
assert.equal(packet.workerMaySpawnSubagents, false);

/** @param {string} code @param {string[]} evidenceIds */
const blocked = (code, evidenceIds) => {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    status: "BLOCKED",
    blockingFinding: { code, evidenceIds },
  })}\n`);
};

if (variant === "spawn") {
  blocked("SUBAGENT_SPAWN_ATTEMPT", ["worker-role-contract"]);
} else if (variant === "partial") {
  await writeFile("src/message.mjs", 'export const message = "partial";\n', "utf8");
  blocked("PARTIAL_RESULT", ["ticket-TICKET-1", "acceptance-AC-1"]);
} else if (variant === "conflict") {
  await writeFile("src/message.mjs", 'export const message = "wrong ticket behavior";\n', "utf8");
  blocked("TICKET_CODE_CONFLICT", ["ticket-TICKET-1", "acceptance-AC-1"]);
} else {
  await writeFile(
    "src/message.mjs",
    variant === "failing"
      ? 'export const message = "fails targeted verification";\n'
      : 'export const message = "adversarial";\n',
    "utf8",
  );
  if (variant === "scope") {
    await writeFile(
      "src/secret-token-outside-worker-lease.mjs",
      "export const leaked = true;\n",
      "utf8",
    );
  }
  if (variant === "commit") {
    spawnSync("git", ["add", "src/message.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    spawnSync("git", ["commit", "-m", "forbidden worker commit"], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    ticketVerification: { id: "ticket-message-test", status: "PASS" },
  })}\n`);
}
