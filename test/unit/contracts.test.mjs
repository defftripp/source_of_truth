import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  sha256,
  validateAdoptionMatrix,
  validateRuntimeManifest,
  verifyFileChecksums,
} from "../../skills/engineering-loop/runtime/contracts.mjs";

const completeEntry = {
  name: "methodology",
  source: "https://example.test/upstream.git",
  revision: "0123456789abcdef0123456789abcdef01234567",
  checksum: "a".repeat(64),
  license: "MIT",
  adoption: "ADAPT",
  artifact: ".engineering/runtime/methodology.md",
  localDelta: "Expose only the project preparation contract.",
  compatibilityEvidence: "Validated by the onboarding contract suite.",
  upgradeProcedure: "Review the upstream diff, update the pin, then rerun verification.",
};

test("complete Upstream Adoption Matrix satisfies its public contract", () => {
  const result = validateAdoptionMatrix({ schemaVersion: 1, entries: [completeEntry] });
  assert.deepEqual(result, { valid: true, errors: [] });
});

/** @type {(keyof typeof completeEntry)[]} */
const requiredEntryFields = [
  "name",
  "source",
  "revision",
  "checksum",
  "license",
  "adoption",
  "localDelta",
  "compatibilityEvidence",
  "upgradeProcedure",
  "artifact",
];

for (const field of requiredEntryFields) {
  test(`Upstream Adoption Matrix rejects an entry missing ${field}`, () => {
    const incompleteEntry = { ...completeEntry };
    delete incompleteEntry[field];
    const result = validateAdoptionMatrix({ schemaVersion: 1, entries: [incompleteEntry] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes(field)), result.errors.join("\n"));
  });
}

test("Upstream Adoption Matrix rejects an unsupported adoption decision", () => {
  const result = validateAdoptionMatrix({
    schemaVersion: 1,
    entries: [{ ...completeEntry, adoption: "COPY" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("adoption")));
});

test("Upstream Adoption Matrix rejects a moving revision", () => {
  const result = validateAdoptionMatrix({
    schemaVersion: 1,
    entries: [{ ...completeEntry, revision: "main" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("revision")));
});

test("runtime manifest requires a pinned version and checksummed owned files", () => {
  const manifest = {
    schemaVersion: 2,
    runtimeVersion: "1.1.0",
    files: [
      {
        path: ".engineering/runtime/engine.mjs",
        sha256: "b".repeat(64),
        ownership: "PROJECT_RUNTIME",
        generated: true,
        protected: false,
        repair: { kind: "git-blob", revision: "HEAD" },
      },
    ],
  };
  assert.deepEqual(validateRuntimeManifest(manifest), { valid: true, errors: [] });
  assert.equal(validateRuntimeManifest({ ...manifest, runtimeVersion: "" }).valid, false);
  assert.equal(validateRuntimeManifest({ ...manifest, runtimeVersion: "latest" }).valid, false);
  assert.equal(validateRuntimeManifest({ ...manifest, files: [] }).valid, false);
  assert.equal(
    validateRuntimeManifest({
      ...manifest,
      files: [{ ...manifest.files[0], ownership: undefined }],
    }).valid,
    false,
  );
  assert.equal(
    validateRuntimeManifest({
      ...manifest,
      files: [{ ...manifest.files[0], ownership: "USER_OWNED" }],
    }).valid,
    false,
  );
  assert.equal(
    validateRuntimeManifest({
      ...manifest,
      files: [{ ...manifest.files[0], path: ".engineering\\runtime\\engine.mjs" }],
    }).valid,
    false,
  );
  assert.equal(
    validateRuntimeManifest({
      ...manifest,
      files: [{ ...manifest.files[0], path: "README.md" }],
    }).valid,
    false,
  );
  assert.equal(
    validateRuntimeManifest({
      ...manifest,
      files: [
        manifest.files[0],
        { ...manifest.files[0], path: ".engineering/runtime/ENGINE.mjs" },
      ],
    }).valid,
    false,
  );
  const legacyManifest = {
    schemaVersion: 1,
    runtimeVersion: "1.0.0",
    files: [
      {
        path: ".engineering/runtime/engine.mjs",
        sha256: "c".repeat(64),
      },
    ],
  };
  assert.deepEqual(validateRuntimeManifest(legacyManifest), { valid: true, errors: [] });
  assert.equal(
    validateRuntimeManifest({
      ...legacyManifest,
      files: [{ ...legacyManifest.files[0], ownership: "PROJECT_RUNTIME" }],
    }).valid,
    false,
  );
});

test("file checksum recomputation detects runtime drift", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "engineering-loop-checksum-"));
  const file = path.join(target, "engine.mjs");
  try {
    await writeFile(file, "pinned runtime\n", "utf8");
    const expected = [{ path: "engine.mjs", sha256: sha256("pinned runtime\n") }];
    assert.deepEqual(await verifyFileChecksums(target, expected), { valid: true, errors: [] });
    await writeFile(file, "drifted runtime\n", "utf8");
    const drift = await verifyFileChecksums(target, expected);
    assert.equal(drift.valid, false);
    assert.match(drift.errors[0], /engine\.mjs/);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
