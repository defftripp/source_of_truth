import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath);
const packet = JSON.parse(await readFile(packetPath, "utf8"));
assert.equal(packet.ticketId, "TICKET-1");
assert.match(await readFile("src/payment.mjs", "utf8"), /migrated/u);
