import assert from "node:assert/strict";
import test from "node:test";
import { valueA } from "../src/a.mjs";
import { valueB } from "../src/b.mjs";

test("both independent DEEP results are integrated", () => {
  assert.equal(valueA, "TICKET-A");
  assert.equal(valueB, "TICKET-B");
});
