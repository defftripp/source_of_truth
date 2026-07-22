const missingEvidence = process.argv[2] === "missing-evidence";
const facts = [
  {
    id: "fact-payment-boundary",
    statement: "Payment writes are isolated behind the payment module.",
    evidence: ["src/payment.mjs"],
    answersDecisionQuestions: [],
  },
  ...(!missingEvidence
    ? [{
        id: "fact-rollback-owner",
        statement: "The payment test is the rollback verification boundary.",
        evidence: ["test/payment.test.mjs"],
        answersDecisionQuestions: [],
      }]
    : []),
];
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  facts,
  domainModel: {
    boundaries: [{
      id: "payment-ledger",
      name: "Payment ledger",
      responsibilities: ["Own durable payment state."],
      evidenceIds: facts.map((fact) => fact.id),
    }],
    decisions: [
      {
        id: "decision-ledger-owner",
        record: "CONTEXT",
        statement: "The payment ledger owns durable payment state.",
        boundaryIds: ["payment-ledger"],
        evidenceIds: ["fact-payment-boundary"],
      },
      ...(!missingEvidence
        ? [{
            id: "decision-rollback",
            record: "ADR",
            statement: "Rollback restores the prior payment module checkpoint.",
            boundaryIds: ["payment-ledger"],
            evidenceIds: ["fact-rollback-owner"],
          }]
        : []),
    ],
  },
})}\n`);
