import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath, "Worker must receive a Context Packet path.");
const packet = /** @type {Record<string, any>} */ (JSON.parse(await readFile(packetPath, "utf8")));
assert.equal(packet.workerMayCommit, false);
assert.equal(packet.workerMaySpawnSubagents, false);
assert.equal(packet.rootWriter, false);
assert.equal("chat" in packet, false);
assert.equal("chatTranscript" in packet, false);
const slices = {
  "TICKET-1": {
    lease: ["src/message.mjs"],
    context: ["src/message.mjs", "test/message.test.mjs"],
    path: "src/message.mjs",
    source: 'export const message = "hello from STANDARD";\n',
  },
  "TICKET-2": {
    lease: ["src/audience.mjs"],
    context: ["src/audience.mjs", "test/audience.test.mjs"],
    path: "src/audience.mjs",
    source: 'export const audience = "engineers";\n',
  },
  "TICKET-3": {
    lease: ["src/punctuation.mjs"],
    context: ["src/punctuation.mjs", "test/punctuation.test.mjs"],
    path: "src/punctuation.mjs",
    source: 'export const punctuation = "!";\n',
  },
};
const corrections = {
  "FINDING-1": {
    lease: ["src/message.mjs"],
    context: ["src/message.mjs", "test/message.test.mjs"],
    path: "src/message.mjs",
    source: 'export const message = "hello from STANDARD";\n// review correction: FINDING-1\n',
  },
  "FINDING-A": {
    lease: ["src/message.mjs"],
    context: ["src/message.mjs", "test/message.test.mjs"],
    path: "src/message.mjs",
    source: 'export const message = "hello from STANDARD";\n// review correction: FINDING-A\n',
  },
  "FINDING-B": {
    lease: ["src/audience.mjs"],
    context: ["src/audience.mjs", "test/audience.test.mjs"],
    path: "src/audience.mjs",
    source: 'export const audience = "engineers";\n// review correction: FINDING-B\n',
  },
};
const slice = packet.sourceFinding
  ? corrections[/** @type {keyof typeof corrections} */ (packet.sourceFinding.id)]
  : slices[/** @type {keyof typeof slices} */ (packet.ticketId)];
assert.ok(slice, `Unexpected ticket ${packet.ticketId}`);
assert.deepEqual(packet.writeLease, slice.lease);
assert.deepEqual(packet.contextPaths, slice.context);
if (
  process.argv[2] === "restart" &&
  packet.ticketId === "TICKET-2" &&
  packet.attempt === 1 &&
  packet.resumedFromRemote !== true
) {
  process.kill(process.ppid, "SIGTERM");
  process.exit(75);
}
await writeFile(slice.path, slice.source, "utf8");
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
