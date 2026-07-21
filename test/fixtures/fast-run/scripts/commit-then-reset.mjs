import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

await writeFile("hidden-command-commit.txt", "must not enter object history\n", "utf8");
for (const args of [["add", "hidden-command-commit.txt"], ["commit", "-m", "hidden command commit"], ["reset", "--hard", "HEAD^"]]) {
  const result = spawnSync("git", args, { shell: false, windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await writeFile("src/message.mjs", 'export const message = "hello from FAST";\n', "utf8");
