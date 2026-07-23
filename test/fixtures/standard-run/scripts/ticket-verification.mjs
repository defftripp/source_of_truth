import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectations = {
  "TICKET-1": ["src/message.mjs", "hello from STANDARD"],
  "TICKET-2": ["src/audience.mjs", "engineers"],
  "TICKET-3": ["src/punctuation.mjs", "!"],
};
const correctionExpectations = {
  "FINDING-1": ["src/message.mjs", "review correction: FINDING-1"],
  "FINDING-A": ["src/message.mjs", "review correction: FINDING-A"],
  "FINDING-B": ["src/audience.mjs", "review correction: FINDING-B"],
  "FITNESS-ABSURD-1": ["src/message.mjs", "documented built-in: builtin-pipeline"],
};
const packetPath = process.env.ENGINEERING_CONTEXT_PACKET;
assert.ok(packetPath);
const packet = /** @type {Record<string, any>} */ (
  JSON.parse(await readFile(packetPath, "utf8"))
);
const expectation = packet.sourceFinding
  ? correctionExpectations[/** @type {keyof typeof correctionExpectations} */ (packet.sourceFinding.id)]
  : expectations[/** @type {keyof typeof expectations} */ (packet.ticketId)];
assert.ok(expectation, `Unexpected ticket ${packet.ticketId}`);
assert.ok((await readFile(expectation[0], "utf8")).includes(expectation[1]));
