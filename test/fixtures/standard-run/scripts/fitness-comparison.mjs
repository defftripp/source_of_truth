import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const packetPath = process.env.ENGINEERING_FITNESS_PACKET;
const versionPath = process.env.ENGINEERING_FITNESS_VERSION;
const documentationPath = process.env.ENGINEERING_FITNESS_DOCUMENTATION;
assert.ok(packetPath);
assert.ok(versionPath);
assert.ok(documentationPath);
const packetSource = await readFile(packetPath);
const packet = JSON.parse(packetSource.toString("utf8"));
const version = JSON.parse(await readFile(versionPath, "utf8"));
const documentation = JSON.parse(await readFile(documentationPath, "utf8"));
assert.equal(packet.role, "SOLUTION_FITNESS");
assert.equal(packet.readOnly, true);
assert.equal(version.installedVersion, "2.4.1");
assert.equal(documentation.documentedVersion, version.installedVersion);

const source = await readFile("src/message.mjs", "utf8");
const corrected = source.includes("documented built-in: builtin-pipeline");
const verdict = corrected
  ? {
      status: "PASS",
      evidenceIds: ["official-doc-v2", "complexity-measured"],
      finding: null,
    }
  : {
      status: "BLOCKED",
      evidenceIds: ["official-doc-v2", "complexity-measured"],
      finding: {
        id: "FITNESS-ABSURD-1",
        summary: "Replace the custom pipeline with the documented built-in.",
        evidence: ["official-doc-v2", "complexity-measured"],
        requirementIds: ["solution-fitness"],
        blockers: [],
        writeLease: ["src/message.mjs"],
        verificationIds: ["ticket-message-test"],
        contextPaths: ["src/message.mjs", "test/message.test.mjs"],
      },
    };

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  packetHash: createHash("sha256").update(packetSource).digest("hex"),
  codeFingerprint: packet.codeFingerprint,
  ordering: [
    "VERSION_DETECTION",
    "DOCUMENTATION",
    "COMPARISON",
    "VERDICT",
  ],
  evidence: [
    { id: "repository-pattern", kind: "REPOSITORY", source: "src/message.mjs" },
    { id: "complexity-measured", kind: "INSTRUMENTAL", source: "focused-test" },
  ],
  localPatterns: [
    { id: "local-message-pattern", relation: "MATCH", evidenceIds: ["repository-pattern"] },
  ],
  documentedBuiltIns: [
    {
      id: "builtin-pipeline",
      viable: true,
      simpler: true,
      evidenceIds: ["official-doc-v2"],
    },
  ],
  viableAlternatives: [
    { id: "builtin-pipeline", viable: true, evidenceIds: ["official-doc-v2"] },
  ],
  complexity: {
    level: corrected ? "LOW" : "HIGH",
    evidenceIds: ["complexity-measured"],
  },
  taskFit: {
    status: corrected ? "FIT" : "MISFIT",
    evidenceIds: ["complexity-measured"],
  },
  solution: {
    kind: corrected ? "BUILT_IN" : "CUSTOM",
    intentional: !corrected,
  },
  verdict,
})}\n`);
