import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectations = {
  "TICKET-1": ["src/message.mjs", "hello from STANDARD"],
  "TICKET-2": ["src/audience.mjs", "engineers"],
  "TICKET-3": ["src/punctuation.mjs", "!"],
};
const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath);
const packet = /** @type {{ ticketId: keyof typeof expectations }} */ (
  JSON.parse(await readFile(packetPath, "utf8"))
);
const expectation = expectations[packet.ticketId];
assert.ok(expectation, `Unexpected ticket ${packet.ticketId}`);
assert.ok((await readFile(expectation[0], "utf8")).includes(expectation[1]));
