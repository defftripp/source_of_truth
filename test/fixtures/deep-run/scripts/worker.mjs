import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

assert.equal(process.env.ENGINEERING_WORKER_MAY_COMMIT, "0");
assert.equal(process.env.ENGINEERING_WORKER_MAY_SPAWN_SUBAGENTS, "0");
const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath);
const packet = JSON.parse(await readFile(packetPath, "utf8"));
assert.deepEqual(packet.writeLease, ["src/payment.mjs"]);
await writeFile("src/payment.mjs", 'export const paymentStatus = "migrated";\n', "utf8");
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
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  ticketVerification: { id: "payment-test", status: "PASS" },
}));
