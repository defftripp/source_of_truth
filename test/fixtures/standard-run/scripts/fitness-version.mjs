process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  applicable: true,
  dependency: "example-sdk",
  installedVersion: "2.4.1",
  evidence: {
    id: "installed-version",
    kind: "INSTRUMENTAL",
    source: "package-lock.json",
  },
})}\n`);
