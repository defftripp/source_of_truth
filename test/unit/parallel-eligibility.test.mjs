import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateDeepParallelEligibility,
} from "../../skills/engineering-loop/runtime/parallel-eligibility.mjs";

test("DEEP parallel eligibility requires disjoint leases, contracts, and worktrees", () => {
  const result = evaluateDeepParallelEligibility([
    claim("TICKET-A", ["src/a.mjs"], ["contract-a"], "C:/workers/a"),
    claim("TICKET-B", ["src/b.mjs"], ["contract-b"], "C:/workers/b"),
  ]);

  assert.deepEqual(result, {
    eligible: true,
    execution: "PARALLEL",
    reasons: [],
  });
});

test("overlapping DEEP Write Leases select sequential execution", () => {
  const result = evaluateDeepParallelEligibility([
    claim("TICKET-A", ["src/shared.mjs"], ["contract-a"], "C:/workers/a"),
    claim("TICKET-B", ["src/shared.mjs"], ["contract-b"], "C:/workers/b"),
  ]);

  assert.equal(result.eligible, false);
  assert.equal(result.execution, "SEQUENTIAL");
  assert.deepEqual(result.reasons, [{
    kind: "WRITE_LEASE_OVERLAP",
    leftTicketId: "TICKET-A",
    rightTicketId: "TICKET-B",
    values: ["src/shared.mjs"],
  }]);
});

test("portable path aliases cannot be treated as disjoint Write Leases", () => {
  const result = evaluateDeepParallelEligibility([
    claim("TICKET-A", ["src/Module.mjs"], ["contract-a"], "C:/workers/a"),
    claim("TICKET-B", ["src/module.mjs"], ["contract-b"], "C:/workers/b"),
  ]);

  assert.equal(result.eligible, false);
  assert.equal(result.reasons[0].kind, "WRITE_LEASE_OVERLAP");
  assert.deepEqual(result.reasons[0].values, ["src/Module.mjs"]);
});

test("overlapping DEEP contracts select sequential execution", () => {
  const result = evaluateDeepParallelEligibility([
    claim("TICKET-A", ["src/a.mjs"], ["public-api"], "C:/workers/a"),
    claim("TICKET-B", ["src/b.mjs"], ["public-api"], "C:/workers/b"),
  ]);

  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, [{
    kind: "CONTRACT_OVERLAP",
    leftTicketId: "TICKET-A",
    rightTicketId: "TICKET-B",
    values: ["public-api"],
  }]);
});

test("duplicate or unproven Worker isolation cannot enter parallel execution", () => {
  const duplicateWorktree = evaluateDeepParallelEligibility([
    claim("TICKET-A", ["src/a.mjs"], ["contract-a"], "C:/workers/shared"),
    claim("TICKET-B", ["src/b.mjs"], ["contract-b"], "C:/workers/shared"),
  ]);
  assert.equal(duplicateWorktree.eligible, false);
  assert.deepEqual(duplicateWorktree.reasons, [{
    kind: "WORKTREE_OVERLAP",
    leftTicketId: "TICKET-A",
    rightTicketId: "TICKET-B",
    values: ["C:/workers/shared"],
  }]);

  const missingContract = evaluateDeepParallelEligibility([
    claim("TICKET-A", ["src/a.mjs"], [], "C:/workers/a"),
    claim("TICKET-B", ["src/b.mjs"], ["contract-b"], "C:/workers/b"),
  ]);
  assert.equal(missingContract.eligible, false);
  assert.deepEqual(missingContract.reasons, [{
    kind: "UNPROVEN_CONTRACT",
    ticketId: "TICKET-A",
    values: [],
  }]);
});

/** @param {string} ticketId @param {string[]} writeLease @param {string[]} contractIds @param {string} worktree */
function claim(ticketId, writeLease, contractIds, worktree) {
  return { ticketId, writeLease, contractIds, worktree };
}
