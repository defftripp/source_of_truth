import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const expectedRole = process.argv[2];
const variant = process.argv[3] ?? "one";
const packetPath = process.env.ENGINEERING_REVIEW_PACKET;
assert.ok(packetPath);
const packetSource = await readFile(packetPath);
const packet = JSON.parse(packetSource.toString("utf8"));
assert.equal(packet.role, expectedRole);
assert.equal(packet.readOnly, true);
for (const artifact of packet.artifactHashes) {
  assert.equal(
    createHash("sha256").update(await readFile(artifact.path)).digest("hex"),
    artifact.sha256,
  );
}

const findings = expectedRole === "SPEC_REVIEWER" && packet.reviewRound === 1
  ? variant === "dependencies"
    ? [
        finding({
          id: "FINDING-B",
          requirementIds: ["AC-2"],
          blockers: ["FINDING-A"],
          writeLease: ["src/audience.mjs"],
          contextPaths: ["src/audience.mjs", "test/audience.test.mjs"],
        }),
        finding({
          id: "FINDING-A",
          requirementIds: ["AC-1"],
          writeLease: ["src/message.mjs"],
          contextPaths: ["src/message.mjs", "test/message.test.mjs"],
        }),
      ]
    : [
        finding({
          id: "FINDING-1",
          requirementIds: ["AC-1"],
          writeLease: ["src/message.mjs"],
          contextPaths: ["src/message.mjs", "test/message.test.mjs"],
        }),
      ]
  : [];

if (packet.reviewRound > 1 && expectedRole === "SPEC_REVIEWER") {
  assert.match(await readFile("src/message.mjs", "utf8"), /review correction: FINDING-(?:1|A)/u);
  if (variant === "dependencies") {
    assert.match(await readFile("src/audience.mjs", "utf8"), /review correction: FINDING-B/u);
  }
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  status: findings.length > 0 ? "BLOCKED" : "PASS",
  packetHash: createHash("sha256").update(packetSource).digest("hex"),
  coverage: packet.requirements,
  evidence: ["artifact-hashes", "fixed-point", "diff-reviewed"],
  unverified: [],
  findings,
})}\n`);

/** @param {Record<string, any>} overrides */
function finding(overrides) {
  return {
    id: "FINDING-1",
    summary: "Add the bounded review correction marker.",
    evidence: ["diff-reviewed", "source-marker-missing"],
    requirementIds: ["AC-1"],
    blockers: [],
    writeLease: ["src/message.mjs"],
    verificationIds: ["ticket-message-test"],
    contextPaths: ["src/message.mjs", "test/message.test.mjs"],
    ...overrides,
  };
}
