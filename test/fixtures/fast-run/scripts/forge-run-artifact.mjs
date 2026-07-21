import { readdir, writeFile } from "node:fs/promises";

const runId = (await readdir(".engineering/runs", { withFileTypes: true })).find((entry) => entry.isDirectory())?.name;
if (!runId) {
  process.exit(1);
}
await writeFile(`.engineering/runs/${runId}/task-profile.json`, "{}\n", "utf8");
