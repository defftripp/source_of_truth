import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

assert.equal(process.env.ENGINEERING_WORKER_MAY_COMMIT, "0");
assert.equal(process.env.ENGINEERING_WORKER_MAY_SPAWN_SUBAGENTS, "0");
const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath);
const packet = JSON.parse(await readFile(packetPath, "utf8"));
assert.equal(process.cwd(), packet.workerWorktree);
const variant = process.argv[2] ?? "bounded";
await new Promise((resolve) => setTimeout(resolve, 450));
const leasedPath = packet.writeLease[0];
const symbol = packet.ticketId === "TICKET-A" ? "valueA" : "valueB";
await writeFile(leasedPath, `export const ${symbol} = "${packet.ticketId}";\n`, "utf8");
if (variant === "conflicting" && packet.ticketId === "TICKET-B") {
  await writeFile("src/a.mjs", 'export const valueA = "conflict";\n', "utf8");
}
if (variant === "forbidden") {
  spawnSync("git", ["add", leasedPath], {
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
  spawnSync("git", ["merge", "develop"], {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
}
const verificationCommand = JSON.parse(process.env.ENGINEERING_TICKET_VERIFICATION ?? "null");
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
  ticketVerification: { id: packet.verificationIds[0], status: "PASS" },
}));
