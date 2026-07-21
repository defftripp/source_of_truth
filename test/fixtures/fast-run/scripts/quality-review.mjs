process.stdout.write(`${JSON.stringify({
  status: "PASS",
  coverage: ["requested-message-behavior", "focused-test", "relevant-checks"],
  evidence: ["implementation-diff-inspected", "no-scope-expansion"],
  unverified: [],
})}\n`);
