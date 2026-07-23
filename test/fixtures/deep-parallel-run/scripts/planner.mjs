const variant = process.argv[2] ?? "disjoint";
const observedBehavior = variant === "overlapping-lease"
  ? "observed-overlap"
  : "observed-behavior";
const ticketVerificationId = variant === "mutating-targeted"
  ? "mutating-ticket-test"
  : "ticket-test";
const tickets = variant === "new-path"
  ? [{
      id: "TICKET-A",
      objective: "Create a new leased module without Worker Git authority.",
      acceptanceCriteria: ["AC-A"],
      verificationIds: [ticketVerificationId, observedBehavior],
      dependencies: [],
      writeLease: ["src/new.mjs"],
      contractIds: ["contract-new-module"],
      contextPaths: ["src/new.mjs", "test/parallel.test.mjs"],
    }]
  : [
  {
    id: "TICKET-A",
    objective: "Deliver module A through an independent contract.",
    acceptanceCriteria: ["AC-A"],
    verificationIds: [ticketVerificationId, observedBehavior],
    dependencies: [],
    writeLease: ["src/a.mjs"],
    contractIds: ["contract-module-a"],
    contextPaths: ["src/a.mjs", "test/parallel.test.mjs"],
  },
  {
    id: "TICKET-B",
    objective: "Deliver module B through an independent contract.",
    acceptanceCriteria: ["AC-B"],
    verificationIds: [ticketVerificationId, observedBehavior],
    dependencies: [],
    writeLease: variant === "overlapping-lease" ? ["src/a.mjs"] : ["src/b.mjs"],
    contractIds: variant === "overlapping-contract" ? ["contract-module-a"] : ["contract-module-b"],
    contextPaths: [
      variant === "overlapping-lease" ? "src/a.mjs" : "src/b.mjs",
      "test/parallel.test.mjs",
    ],
  },
];
const actions = variant === "new-path"
  ? [{
      action: "REWRITE",
      path: "src/new.mjs",
      sourceSha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      contentSha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    }]
  : [
      {
        action: "REWRITE",
        path: "src/a.mjs",
        sourceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        contentSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      ...(variant === "overlapping-lease" ? [] : [{
        action: "REWRITE",
        path: "src/b.mjs",
        sourceSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        contentSha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      }]),
    ];

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  domainBoundaryIds: ["guarded-modules"],
  tickets,
  migrationContract: {
    id: "migration-guarded-modules",
    preconditions: ["fact-security-boundary"],
    postconditions: ["Both module contracts are instrumentally verified."],
  },
  rollbackPlan: {
    id: "rollback-guarded-modules",
    triggerConditions: ["A targeted or full relevant check fails."],
    steps: ["Retain the last accepted Root checkpoint."],
    verificationIds: [ticketVerificationId],
  },
  migrationManifest: {
    schemaVersion: 1,
    kind: "MIGRATION_MANIFEST",
    hashAlgorithm: "sha256",
    hash: variant === "new-path"
      ? "3b5e5f421f9f820c8038ade67beef9e5fbc78671fc79e4df8f60de4d9180c8f6"
      : variant === "overlapping-lease"
        ? "38beceb10b28643b57b86450a12f56e0e43b4fb45fc1ebffeeefb864607635b4"
        : "22f0f9513841fa4426ac780070f6dd7c9a424c63bcbdfeee33b3091cd1600f55",
    actions,
  }
})}\n`);
