import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const versionPath = process.env.ENGINEERING_FITNESS_VERSION;
assert.ok(versionPath, "Documentation provider must run after version detection.");
const version = JSON.parse(await readFile(versionPath, "utf8"));
assert.equal(version.dependency, "example-sdk");
assert.equal(version.installedVersion, "2.4.1");

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  applicable: true,
  dependency: version.dependency,
  documentedVersion: version.installedVersion,
  provider: "CONTEXT7",
  context7Status: "AVAILABLE",
  sources: [
    {
      id: "official-doc-v2",
      kind: "PRIMARY",
      source: "https://docs.example.invalid/example-sdk/2.4.1",
    },
  ],
  builtIns: [
    { id: "builtin-pipeline", evidenceIds: ["official-doc-v2"] },
  ],
})}\n`);
