import assert from "node:assert/strict";
import test from "node:test";

import {
  selectFitnessTrigger,
  validateSolutionFitnessArtifact,
} from "../../skills/engineering-loop/runtime/fitness-contracts.mjs";

test("ordinary local work without a trigger omits Solution Fitness Check", () => {
  assert.deepEqual(
    selectFitnessTrigger({
      repositoryPrecedent: false,
      dependencyApi: false,
      substantialComplexity: false,
    }),
    { required: false, reasons: [] },
  );
});

test("repository precedent triggers Solution Fitness Check", () => {
  assert.deepEqual(
    selectFitnessTrigger({
      repositoryPrecedent: true,
      dependencyApi: false,
      substantialComplexity: false,
    }),
    { required: true, reasons: ["REPOSITORY_PRECEDENT"] },
  );
});

test("dependency API trigger records version detection before documentation", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      triggers: {
        repositoryPrecedent: false,
        dependencyApi: true,
        substantialComplexity: false,
      },
    }),
  );

  assert.deepEqual(result.ordering, [
    "VERSION_DETECTION",
    "DOCUMENTATION",
    "COMPARISON",
    "VERDICT",
  ]);
  assert.equal(result.version.installedVersion, "2.4.1");
  assert.equal(result.documentation.documentedVersion, "2.4.1");
  assert.equal(result.status, "PASS");
});

test("substantial complexity triggers Solution Fitness Check", () => {
  assert.deepEqual(
    selectFitnessTrigger({
      repositoryPrecedent: false,
      dependencyApi: false,
      substantialComplexity: true,
    }),
    { required: true, reasons: ["SUBSTANTIAL_COMPLEXITY"] },
  );
});

test("documentation for a different installed dependency version is rejected", () => {
  assert.throws(
    () =>
      validateSolutionFitnessArtifact(
        fitnessInput({
          documentation: officialDocumentation({ documentedVersion: "3.0.0" }),
        }),
      ),
    /installed dependency version/iu,
  );
});

test("intentional custom solution is blocked by a simpler documented built-in", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      comparison: comparison({
        solution: { kind: "CUSTOM", intentional: true },
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
        verdict: {
          status: "BLOCKED",
          evidenceIds: ["official-doc-v2", "complexity-measured"],
          finding: fitnessFinding(),
        },
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.findings[0].id, "FITNESS-ABSURD-1");
});

test("custom solution is not blocked when no documented built-in is viable", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      documentation: officialDocumentation({ builtIns: [] }),
      comparison: comparison({
        documentedBuiltIns: [],
        viableAlternatives: [
          { id: "custom-current", viable: true, evidenceIds: ["complexity-measured"] },
        ],
      }),
    }),
  );

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.findings, []);
});

test("unavailable Context7 with sufficient official documentation is DEGRADED", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      documentation: officialDocumentation({
        provider: "OFFICIAL",
        context7Status: "UNAVAILABLE",
      }),
      comparison: comparison({
        verdict: {
          status: "DEGRADED",
          evidenceIds: ["official-doc-v2", "complexity-measured"],
          finding: null,
        },
      }),
    }),
  );

  assert.equal(result.status, "DEGRADED");
  assert.deepEqual(result.unverified, ["context7-version-sensitive-evidence"]);
});

test("high-risk solution without mandatory primary evidence is BLOCKED", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      risk: "HIGH",
      documentation: {
        schemaVersion: 1,
        applicable: true,
        dependency: "example-sdk",
        documentedVersion: null,
        provider: "NONE",
        context7Status: "UNAVAILABLE",
        sources: [],
        builtIns: [],
      },
      comparison: comparison({
        documentedBuiltIns: [],
        viableAlternatives: [
          { id: "custom-current", viable: true, evidenceIds: ["complexity-measured"] },
        ],
        verdict: {
          status: "BLOCKED",
          evidenceIds: ["installed-version", "complexity-measured"],
          finding: null,
        },
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.unverified, ["mandatory-primary-evidence"]);
  assert.deepEqual(result.findings, []);
});

test("low-risk dependency without primary evidence is explicitly DEGRADED", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      documentation: {
        schemaVersion: 1,
        applicable: true,
        dependency: "example-sdk",
        documentedVersion: null,
        provider: "NONE",
        context7Status: "UNAVAILABLE",
        sources: [],
        builtIns: [],
      },
      comparison: comparison({
        documentedBuiltIns: [],
        viableAlternatives: [
          { id: "custom-current", viable: true, evidenceIds: ["complexity-measured"] },
        ],
        verdict: {
          status: "DEGRADED",
          evidenceIds: ["installed-version", "complexity-measured"],
          finding: null,
        },
      }),
    }),
  );

  assert.equal(result.status, "DEGRADED");
  assert.deepEqual(result.unverified, ["primary-evidence"]);
});

test("high-risk repository-triggered solution without primary evidence is BLOCKED", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      risk: "HIGH",
      triggers: {
        repositoryPrecedent: true,
        dependencyApi: false,
        substantialComplexity: false,
      },
      version: {
        schemaVersion: 1,
        applicable: false,
        dependency: null,
        installedVersion: null,
        evidence: {
          id: "repository-scan",
          kind: "REPOSITORY",
          source: "src",
        },
      },
      documentation: {
        schemaVersion: 1,
        applicable: false,
        dependency: null,
        documentedVersion: null,
        provider: "NONE",
        context7Status: "NOT_APPLICABLE",
        sources: [],
        builtIns: [],
      },
      comparison: comparison({
        evidence: [
          { id: "complexity-measured", kind: "INSTRUMENTAL", source: "focused-test" },
        ],
        localPatterns: [
          { id: "local-message-pattern", relation: "MATCH", evidenceIds: ["repository-scan"] },
        ],
        documentedBuiltIns: [],
        viableAlternatives: [
          { id: "custom-current", viable: true, evidenceIds: ["complexity-measured"] },
        ],
        verdict: {
          status: "BLOCKED",
          evidenceIds: ["complexity-measured"],
          finding: null,
        },
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.unverified, ["mandatory-primary-evidence"]);
});

test("high-risk repository-triggered solution may use sufficient direct primary evidence", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      risk: "HIGH",
      triggers: {
        repositoryPrecedent: true,
        dependencyApi: false,
        substantialComplexity: false,
      },
      version: {
        schemaVersion: 1,
        applicable: false,
        dependency: null,
        installedVersion: null,
        evidence: {
          id: "repository-scan",
          kind: "REPOSITORY",
          source: "src",
        },
      },
      documentation: {
        schemaVersion: 1,
        applicable: false,
        dependency: null,
        documentedVersion: null,
        provider: "OFFICIAL",
        context7Status: "NOT_APPLICABLE",
        sources: [
          {
            id: "official-platform-doc",
            kind: "PRIMARY",
            source: "https://docs.example.invalid/platform",
          },
        ],
        builtIns: [],
      },
      comparison: comparison({
        evidence: [
          { id: "complexity-measured", kind: "INSTRUMENTAL", source: "focused-test" },
        ],
        localPatterns: [
          { id: "local-message-pattern", relation: "MATCH", evidenceIds: ["repository-scan"] },
        ],
        documentedBuiltIns: [],
        viableAlternatives: [
          { id: "custom-current", viable: true, evidenceIds: ["complexity-measured"] },
        ],
        verdict: {
          status: "PASS",
          evidenceIds: ["official-platform-doc", "complexity-measured"],
          finding: null,
        },
      }),
    }),
  );

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.unverified, []);
});

test("evidence-backed task misfit blocks custom work without a viable built-in", () => {
  const result = validateSolutionFitnessArtifact(
    fitnessInput({
      documentation: officialDocumentation({ builtIns: [] }),
      comparison: comparison({
        documentedBuiltIns: [],
        viableAlternatives: [
          { id: "custom-current", viable: true, evidenceIds: ["complexity-measured"] },
        ],
        complexity: { level: "HIGH", evidenceIds: ["complexity-measured"] },
        taskFit: { status: "MISFIT", evidenceIds: ["complexity-measured"] },
        verdict: {
          status: "BLOCKED",
          evidenceIds: ["official-doc-v2", "complexity-measured"],
          finding: fitnessFinding(),
        },
      }),
    }),
  );

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.findings[0].id, "FITNESS-ABSURD-1");
});

test("local pattern comparison without repository evidence is rejected", () => {
  assert.throws(
    () =>
      validateSolutionFitnessArtifact(
        fitnessInput({
          comparison: comparison({
            localPatterns: [
              {
                id: "local-message-pattern",
                relation: "MATCH",
                evidenceIds: ["complexity-measured"],
              },
            ],
          }),
        }),
      ),
    /repository evidence/iu,
  );
});

test("reviewer opinion without instrumental or primary evidence cannot decide release", () => {
  for (const status of ["PASS", "BLOCKED"]) {
    assert.throws(
      () =>
        validateSolutionFitnessArtifact(
          fitnessInput({
            triggers: {
              repositoryPrecedent: true,
              dependencyApi: false,
              substantialComplexity: false,
            },
            version: {
              schemaVersion: 1,
              applicable: false,
              dependency: null,
              installedVersion: null,
              evidence: {
                id: "repository-scan",
                kind: "REPOSITORY",
                source: "src",
              },
            },
            documentation: {
              schemaVersion: 1,
              applicable: false,
              dependency: null,
              documentedVersion: null,
              provider: "NONE",
              context7Status: "NOT_APPLICABLE",
              sources: [],
              builtIns: [],
            },
            comparison: comparison({
              evidence: [
                {
                  id: "reviewer-prefers-custom",
                  kind: "REVIEWER_OPINION",
                  source: "quality-review",
                },
              ],
              localPatterns: [
                {
                  id: "local-message-pattern",
                  relation: "MATCH",
                  evidenceIds: ["repository-scan"],
                },
              ],
              documentedBuiltIns: [],
              viableAlternatives: [
                {
                  id: "custom-current",
                  viable: true,
                  evidenceIds: ["reviewer-prefers-custom"],
                },
              ],
              complexity: { level: "LOW", evidenceIds: ["reviewer-prefers-custom"] },
              taskFit: { status: "FIT", evidenceIds: ["reviewer-prefers-custom"] },
              verdict: {
                status,
                evidenceIds: ["reviewer-prefers-custom"],
                finding: null,
              },
            }),
          }),
        ),
      /instrumental or primary-source evidence/iu,
    );
  }
});

/** @param {Record<string, any>} [overrides] */
function fitnessInput(overrides = {}) {
  const triggers = overrides.triggers ?? {
    repositoryPrecedent: false,
    dependencyApi: true,
    substantialComplexity: false,
  };
  return {
    contract: {
      packetHash: "a".repeat(64),
      codeFingerprint: "b".repeat(64),
      reviewRound: 1,
      risk: overrides.risk ?? "LOW",
      triggers,
      writeLease: ["src/message.mjs"],
      contextPaths: ["src/message.mjs", "test/message.test.mjs"],
      verificationIds: ["ticket-message-test", "full-test"],
      ticketVerificationId: "ticket-message-test",
    },
    version: overrides.version ?? installedVersion(),
    documentation: overrides.documentation ?? officialDocumentation(),
    comparison: overrides.comparison ?? comparison(),
  };
}

function installedVersion() {
  return {
    schemaVersion: 1,
    applicable: true,
    dependency: "example-sdk",
    installedVersion: "2.4.1",
    evidence: {
      id: "installed-version",
      kind: "INSTRUMENTAL",
      source: "package-lock.json",
    },
  };
}

/** @param {Record<string, any>} [overrides] */
function officialDocumentation(overrides = {}) {
  return {
    schemaVersion: 1,
    applicable: true,
    dependency: "example-sdk",
    documentedVersion: "2.4.1",
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
    ...overrides,
  };
}

/** @param {Record<string, any>} [overrides] */
function comparison(overrides = {}) {
  return {
    schemaVersion: 1,
    packetHash: "a".repeat(64),
    codeFingerprint: "b".repeat(64),
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
        viable: false,
        simpler: true,
        evidenceIds: ["official-doc-v2"],
      },
    ],
    viableAlternatives: [
      { id: "custom-current", viable: true, evidenceIds: ["complexity-measured"] },
    ],
    complexity: { level: "LOW", evidenceIds: ["complexity-measured"] },
    taskFit: { status: "FIT", evidenceIds: ["complexity-measured"] },
    solution: { kind: "CUSTOM", intentional: false },
    verdict: {
      status: "PASS",
      evidenceIds: ["official-doc-v2", "complexity-measured"],
      finding: null,
    },
    ...overrides,
  };
}

function fitnessFinding() {
  return {
    id: "FITNESS-ABSURD-1",
    summary: "Replace the custom pipeline with the documented built-in.",
    evidence: ["official-doc-v2", "complexity-measured"],
    requirementIds: ["solution-fitness"],
    blockers: [],
    writeLease: ["src/message.mjs"],
    verificationIds: ["ticket-message-test"],
    contextPaths: ["src/message.mjs", "test/message.test.mjs"],
  };
}
