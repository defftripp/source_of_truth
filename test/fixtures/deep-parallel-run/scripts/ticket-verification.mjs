import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath);
const packet = JSON.parse(await readFile(packetPath, "utf8"));
assert.match(await readFile(packet.writeLease[0], "utf8"), new RegExp(packet.ticketId, "u"));
if (
  process.argv[2] === "mutate-pending" &&
  packet.ticketId === "TICKET-A" &&
  process.cwd() !== packet.workerWorktree
) {
  await writeFile("src/b.mjs", 'export const valueB = "targeted-conflict";\n', "utf8");
}
