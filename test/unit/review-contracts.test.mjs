import assert from "node:assert/strict";
import test from "node:test";

import {
  createCorrectiveTickets,
  validateImmutableReviewArtifacts,
  validateIndependentReview,
  validateReviewReleaseEvidence,
} from "../../skills/engineering-loop/runtime/review-contracts.mjs";
import { selectDeterministicFrontier } from "../../skills/engineering-loop/runtime/engine.mjs";

const reviewContract = {
  role: "SPEC_REVIEWER",
  packetHash: "a".repeat(64),
  requirements: ["AC-1", "AC-2"],
  writeLease: ["src/message.mjs", "src/audience.mjs"],
  contextPaths: [
    "src/message.mjs",
    "test/message.test.mjs",
    "src/audience.mjs",
    "test/audience.test.mjs",
  ],
  verificationIds: ["ticket-message-test", "full-test"],
  ticketVerificationId: "ticket-message-test",
  codeFingerprint: "b".repeat(64),
  reviewRound: 1,
};

test("generic PASS without evidence is rejected", () => {
  assert.throws(
    () =>
      validateIndependentReview(
        {
          schemaVersion: 1,
          status: "PASS",
          packetHash: reviewContract.packetHash,
          coverage: reviewContract.requirements,
          evidence: [],
          unverified: [],
          findings: [],
        },
        reviewContract,
      ),
    /coverage, evidence, and unverified areas/iu,
  );
});

test("one blocking finding creates exactly one bounded corrective ticket", () => {
  const review = blockingReview([
    finding({
      id: "FINDING-1",
      requirementIds: ["AC-1"],
      writeLease: ["src/message.mjs"],
      contextPaths: ["src/message.mjs", "test/message.test.mjs"],
    }),
  ]);

  const result = createCorrectiveTickets({
    round: 1,
    reviews: [{ artifact: "spec-review.json", review }],
    existingTicketIds: ["TICKET-1"],
  });

  assert.equal(result.tickets.length, 1);
  assert.equal(result.links.length, 1);
  assert.deepEqual(result.links[0], {
    findingId: "FINDING-1",
    reviewArtifact: "spec-review.json",
    correctiveTicketId: "CORRECTION-R1-1",
  });
  assert.deepEqual(result.tickets[0], {
    id: "CORRECTION-R1-1",
    objective: "Correct blocking review finding FINDING-1: Fix the bounded behavior.",
    acceptanceCriteria: ["AC-1"],
    verificationIds: ["ticket-message-test"],
    dependencies: [],
    writeLease: ["src/message.mjs"],
    contextPaths: ["src/message.mjs", "test/message.test.mjs"],
    sourceFinding: {
      artifact: "spec-review.json",
      role: "SPEC_REVIEWER",
      id: "FINDING-1",
    },
    status: "OPEN",
    attempts: 0,
    verification: null,
    checkpointCommit: null,
    checkpointedAt: null,
  });
});

test("dependent review findings produce a blockers-first corrective frontier", () => {
  const review = blockingReview([
    finding({
      id: "FINDING-B",
      blockers: ["FINDING-A"],
      requirementIds: ["AC-2"],
      writeLease: ["src/audience.mjs"],
      contextPaths: ["src/audience.mjs", "test/audience.test.mjs"],
    }),
    finding({
      id: "FINDING-A",
      requirementIds: ["AC-1"],
      writeLease: ["src/message.mjs"],
      contextPaths: ["src/message.mjs", "test/message.test.mjs"],
    }),
  ]);
  const { tickets } = createCorrectiveTickets({
    round: 2,
    reviews: [{ artifact: "quality-review-2.json", review }],
    existingTicketIds: ["TICKET-1", "TICKET-2"],
  });

  const completed = new Set();
  const first = selectDeterministicFrontier(tickets, completed);
  assert.deepEqual(first.map((ticket) => ticket.id), ["CORRECTION-R2-1"]);
  completed.add(first[0].id);
  assert.deepEqual(
    selectDeterministicFrontier(tickets, completed).map((ticket) => ticket.id),
    ["CORRECTION-R2-2"],
  );
});

test("original review artifacts must remain byte-identical after corrections", () => {
  const rounds = [
    {
      artifacts: [
        { name: "spec-review.json", sha256: "1".repeat(64) },
        { name: "quality-review.json", sha256: "2".repeat(64) },
      ],
    },
  ];
  assert.deepEqual(
    validateImmutableReviewArtifacts(rounds, {
      "spec-review.json": "1".repeat(64),
      "quality-review.json": "2".repeat(64),
    }),
    { valid: true, errors: [] },
  );
  assert.deepEqual(
    validateImmutableReviewArtifacts(rounds, {
      "spec-review.json": "3".repeat(64),
      "quality-review.json": "2".repeat(64),
    }),
    {
      valid: false,
      errors: ["review artifact changed after publication: spec-review.json"],
    },
  );
});

test("a correction without repeated reviews remains BLOCKED", () => {
  const result = validateReviewReleaseEvidence({
    reviewRounds: [
      reviewRound({
        round: 1,
        findings: [{ findingId: "FINDING-1", correctiveTicketId: "CORRECTION-R1-1" }],
      }),
    ],
    tickets: [{ id: "CORRECTION-R1-1", status: "COMPLETE" }],
    currentCodeFingerprint: "c".repeat(64),
    fullVerification: {
      status: "PASS",
      codeFingerprint: "c".repeat(64),
      afterExecutionCount: 2,
    },
    executionCount: 2,
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("blocking corrections require a fresh repeated review round"));
});

test("reviews predating the last code change remain stale and BLOCKED", () => {
  const result = validateReviewReleaseEvidence({
    reviewRounds: [reviewRound({ round: 2, codeFingerprint: "b".repeat(64) })],
    tickets: [{ id: "CORRECTION-R1-1", status: "COMPLETE" }],
    currentCodeFingerprint: "c".repeat(64),
    fullVerification: {
      status: "PASS",
      codeFingerprint: "c".repeat(64),
      afterExecutionCount: 2,
    },
    executionCount: 2,
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("latest Spec Review is stale"));
  assert.ok(result.errors.includes("latest Quality Review is stale"));
});

test("fresh repeated reviews and full verification after correction are releasable", () => {
  const fingerprint = "c".repeat(64);
  const result = validateReviewReleaseEvidence({
    reviewRounds: [
      reviewRound({
        round: 1,
        findings: [{ findingId: "FINDING-1", correctiveTicketId: "CORRECTION-R1-1" }],
        codeFingerprint: "b".repeat(64),
      }),
      reviewRound({ round: 2, codeFingerprint: fingerprint }),
    ],
    tickets: [{ id: "CORRECTION-R1-1", status: "COMPLETE" }],
    currentCodeFingerprint: fingerprint,
    fullVerification: {
      status: "PASS",
      codeFingerprint: fingerprint,
      afterExecutionCount: 2,
    },
    executionCount: 2,
  });

  assert.deepEqual(result, { valid: true, errors: [] });
});

/** @param {Record<string, any>[]} findings */
function blockingReview(findings) {
  return {
    schemaVersion: 1,
    status: "BLOCKED",
    context: {
      role: "SPEC_REVIEWER",
      fresh: true,
      readOnly: true,
      packetHash: reviewContract.packetHash,
      codeFingerprint: reviewContract.codeFingerprint,
      reviewRound: reviewContract.reviewRound,
    },
    coverage: reviewContract.requirements,
    evidence: ["artifact-hashes", "fixed-point"],
    unverified: [],
    findings,
  };
}

function finding(overrides = {}) {
  return {
    id: "FINDING-1",
    summary: "Fix the bounded behavior.",
    evidence: ["diff-reviewed"],
    requirementIds: ["AC-1"],
    blockers: [],
    writeLease: ["src/message.mjs"],
    verificationIds: ["ticket-message-test"],
    contextPaths: ["src/message.mjs", "test/message.test.mjs"],
    ...overrides,
  };
}

/**
 * @param {{
 *   round: number,
 *   findings?: Record<string, any>[],
 *   codeFingerprint?: string,
 * }} input
 */
function reviewRound({
  round,
  findings = [],
  codeFingerprint = "c".repeat(64),
}) {
  return {
    round,
    codeFingerprint,
    artifacts: [
      { name: round === 1 ? "spec-review.json" : `spec-review-${round}.json`, sha256: "1".repeat(64) },
      { name: round === 1 ? "quality-review.json" : `quality-review-${round}.json`, sha256: "2".repeat(64) },
    ],
    reviews: {
      spec: { status: "PASS", codeFingerprint },
      quality: { status: "PASS", codeFingerprint },
    },
    findings,
  };
}
