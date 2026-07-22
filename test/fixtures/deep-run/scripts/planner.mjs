const changedScope = process.argv[2] === "changed-scope";
const approvedHash = "d5ad4d66a0d8b5d2db2d28fc1c82a4ebdc697f7db51cd75fbfd3e2c2aeee8f8d";
const changedScopeHash = "54c1b4b9982581f603c5d935f8b90936b64905f65e4c9127fae3d27657d2fc22";
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  domainBoundaryIds: ["payment-ledger"],
  tickets: [{
    id: "TICKET-1",
    objective: "Migrate the public payment status through the approved scope.",
    acceptanceCriteria: ["AC-1"],
    verificationIds: ["payment-test", "observed-behavior"],
    dependencies: [],
    writeLease: ["src/payment.mjs"],
    contextPaths: ["src/payment.mjs", "test/payment.test.mjs"],
  }],
  migrationContract: {
    id: "migration-payment-ledger",
    preconditions: ["fact-payment-boundary"],
    postconditions: ["payment behavior is instrumentally verified"],
  },
  rollbackPlan: {
    id: "rollback-payment-ledger",
    triggerConditions: ["instrumental verification fails"],
    steps: ["Restore the previous payment module from the checkpoint."],
    verificationIds: ["payment-test"],
  },
  migrationManifest: {
    schemaVersion: 1,
    kind: "MIGRATION_MANIFEST",
    hashAlgorithm: "sha256",
    hash: changedScope ? changedScopeHash : approvedHash,
    actions: [{
      action: "REWRITE",
      path: changedScope ? "src/refunds.mjs" : "src/payment.mjs",
      sourceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contentSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }],
  },
})}\n`);
