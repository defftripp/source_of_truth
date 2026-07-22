import assert from "node:assert/strict";
import test from "node:test";
import { paymentStatus } from "../src/payment.mjs";

test("payment migration exposes the verified status", () => {
  assert.equal(paymentStatus, "migrated");
});
