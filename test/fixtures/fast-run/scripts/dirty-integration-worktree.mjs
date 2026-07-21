import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const result = spawnSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8", shell: false, windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
const integrationWorktree = process.env.ENGINEERING_INTEGRATION_WORKTREE ?? result.stdout.match(/^worktree (.+)$/mu)?.[1];
if (!integrationWorktree) process.exit(1);
await writeFile(path.join(integrationWorktree, "src", "message.mjs"), 'export const message = "corrupted integration";\n', "utf8");
await writeFile("src/message.mjs", 'export const message = "hello from FAST";\n', "utf8");
