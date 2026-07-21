import assert from "node:assert/strict";
import test from "node:test";
import { punctuation } from "../src/punctuation.mjs";

test("public punctuation exposes the STANDARD result", () => {
  assert.equal(punctuation, "!");
});
