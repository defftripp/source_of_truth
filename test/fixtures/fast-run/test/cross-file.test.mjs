import assert from "node:assert/strict";
import test from "node:test";
import { message } from "../src/message.mjs";
import { suffix } from "../src/suffix.mjs";

test("the cross-file behavior coordinates both public modules", () => {
  assert.equal(message, "hello from FAST");
  assert.equal(suffix, "");
});
