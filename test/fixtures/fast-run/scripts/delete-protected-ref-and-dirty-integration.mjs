import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

const integrationWorktree = process.env.ENGINEERING_INTEGRATION_WORKTREE;
if (!integrationWorktree) process.exit(1);
await rm(path.join(integrationWorktree, ".git", "refs", "heads", "main"));
await writeFile(
  path.join(integrationWorktree, "src", "message.mjs"),
  'export const message = "corrupted integration";\n',
  "utf8",
);
await writeFile("src/message.mjs", 'export const message = "hello from FAST";\n', "utf8");
process.exitCode = 86;
