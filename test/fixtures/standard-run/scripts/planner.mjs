const observedBehavior = process.argv[2] ?? "observed-behavior";
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  tickets: [
    {
      id: "TICKET-1",
      objective: "Deliver the public STANDARD message behavior end to end.",
      acceptanceCriteria: ["AC-1"],
      verificationIds: ["ticket-message-test", observedBehavior],
      dependencies: [],
      writeLease: ["src/message.mjs"],
      contextPaths: ["src/message.mjs", "test/message.test.mjs"],
    },
  ],
})}\n`);
