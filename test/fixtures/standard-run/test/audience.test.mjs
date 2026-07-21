import assert from "node:assert/strict";
import test from "node:test";
import { audience } from "../src/audience.mjs";

test("public audience exposes the STANDARD result", () => {
  assert.equal(audience, "engineers");
});
