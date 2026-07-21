import assert from "node:assert/strict";
import test from "node:test";
import { message } from "../src/message.mjs";

test("public message exposes the STANDARD result", () => {
  assert.equal(message, "hello from STANDARD");
});
