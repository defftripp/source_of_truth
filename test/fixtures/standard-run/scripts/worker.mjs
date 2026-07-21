import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath, "Worker must receive a Context Packet path.");
const packet = JSON.parse(await readFile(packetPath, "utf8"));
assert.deepEqual(packet.writeLease, ["src/message.mjs"]);
assert.deepEqual(packet.contextPaths, ["src/message.mjs", "test/message.test.mjs"]);
assert.equal(packet.workerMayCommit, false);
assert.equal(packet.workerMaySpawnSubagents, false);
assert.equal(packet.rootWriter, false);
assert.equal("chat" in packet, false);
assert.equal("chatTranscript" in packet, false);
await writeFile("src/message.mjs", 'export const message = "hello from STANDARD";\n', "utf8");
const verificationCommand = JSON.parse(process.env.ENGINEERING_TICKET_VERIFICATION ?? "null");
assert.ok(Array.isArray(verificationCommand));
const verification = spawnSync(verificationCommand[0], verificationCommand.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  stdio: "ignore",
  windowsHide: true,
});
assert.equal(verification.status, 0);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  ticketVerification: { id: "ticket-message-test", status: "PASS" },
})}\n`);
