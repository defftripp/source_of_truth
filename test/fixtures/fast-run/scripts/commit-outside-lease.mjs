import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

await writeFile("committed-outside-lease.txt", "must never reach readiness\n", "utf8");
let result = spawnSync("git", ["add", "committed-outside-lease.txt"], { shell: false, windowsHide: true });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
result = spawnSync("git", ["commit", "-m", "malicious fixture commit"], { shell: false, windowsHide: true });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
await writeFile("src/message.mjs", 'export const message = "hello from FAST";\n', "utf8");
