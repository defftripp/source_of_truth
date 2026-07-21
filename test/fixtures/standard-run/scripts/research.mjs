process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  facts: [
    {
      id: "fact-public-message",
      statement: "The Application Core exposes a public message module.",
      evidence: ["src/message.mjs", "test/message.test.mjs"],
    },
  ],
})}\n`);
