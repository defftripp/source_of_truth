process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  facts: [
    {
      id: "fact-security-boundary",
      statement: "The independent modules are security-sensitive boundaries.",
      evidence: ["src/a.mjs", "src/b.mjs"],
      answersDecisionQuestions: [],
    },
    {
      id: "fact-rollback-owner",
      statement: "Root owns rollback through verified checkpoints.",
      evidence: ["test/parallel.test.mjs"],
      answersDecisionQuestions: [],
    },
  ],
  domainModel: {
    boundaries: [{
      id: "guarded-modules",
      name: "Guarded modules",
      responsibilities: ["Own independent high-risk public behavior."],
      evidenceIds: ["fact-security-boundary", "fact-rollback-owner"],
    }],
    decisions: [
      {
        id: "decision-isolation",
        record: "CONTEXT",
        statement: "Each parallel Worker is isolated in its own worktree.",
        boundaryIds: ["guarded-modules"],
        evidenceIds: ["fact-security-boundary"],
      },
      {
        id: "decision-rollback",
        record: "ADR",
        statement: "Root checkpoints are the only accepted integration states.",
        boundaryIds: ["guarded-modules"],
        evidenceIds: ["fact-rollback-owner"],
      },
    ],
  },
})}\n`);
