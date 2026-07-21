import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const result = spawnSync("git", ["update-ref", "refs/heads/main", "HEAD^"], { shell: false, windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
await writeFile("src/message.mjs", 'export const message = "hello from FAST";\n', "utf8");
