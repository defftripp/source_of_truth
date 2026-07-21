const variant = process.argv[2] ?? "one";
const observedBehavior = variant === "stale-mutation" ? "stale-mutation" : "observed-behavior";
const tickets = variant === "graph"
  ? [
      {
        id: "TICKET-3",
        objective: "Expose independently observable punctuation behavior.",
        acceptanceCriteria: ["AC-3"],
        verificationIds: ["ticket-message-test", "graph-observed-behavior"],
        dependencies: ["TICKET-1"],
        writeLease: ["src/punctuation.mjs"],
        contextPaths: ["src/punctuation.mjs", "test/punctuation.test.mjs"],
      },
      {
        id: "TICKET-1",
        objective: "Expose the public STANDARD message behavior.",
        acceptanceCriteria: ["AC-1"],
        verificationIds: ["ticket-message-test", "graph-observed-behavior"],
        dependencies: [],
        writeLease: ["src/message.mjs"],
        contextPaths: ["src/message.mjs", "test/message.test.mjs"],
      },
      {
        id: "TICKET-2",
        objective: "Expose independently observable audience behavior.",
        acceptanceCriteria: ["AC-2"],
        verificationIds: ["ticket-message-test", "graph-observed-behavior"],
        dependencies: ["TICKET-1"],
        writeLease: ["src/audience.mjs"],
        contextPaths: ["src/audience.mjs", "test/audience.test.mjs"],
      },
    ]
  : [
      {
        id: "TICKET-1",
        objective: "Deliver the public STANDARD message behavior end to end.",
        acceptanceCriteria: ["AC-1"],
        verificationIds: ["ticket-message-test", observedBehavior],
        dependencies: [],
        writeLease: ["src/message.mjs"],
        contextPaths: ["src/message.mjs", "test/message.test.mjs"],
      },
    ];
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  tickets,
})}\n`);
