import assert from "node:assert/strict";
import test from "node:test";
import { message } from "../src/message.mjs";

test("message exposes the requested FAST behavior", () => {
  assert.equal(message, "hello from FAST");
});
