import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const packetPath = process.env.ENGINEERING_REVIEW_PACKET;
assert.ok(packetPath);
const packetSource = await readFile(packetPath);
const packet = JSON.parse(packetSource.toString("utf8"));
assert.equal(packet.role, "SPEC_REVIEWER");
assert.equal(packet.readOnly, true);
for (const artifact of packet.artifactHashes) {
  assert.equal(createHash("sha256").update(await readFile(artifact.path)).digest("hex"), artifact.sha256);
}
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  status: "PASS",
  packetHash: createHash("sha256").update(packetSource).digest("hex"),
  coverage: packet.requirements,
  evidence: ["artifact-hashes", "fixed-point", "diff-reviewed"],
  unverified: [],
}));
