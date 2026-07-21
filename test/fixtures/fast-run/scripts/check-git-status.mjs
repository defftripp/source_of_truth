import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
if (
  result.status !== 0 ||
  !/^ M src\/message\.mjs$/mu.test(result.stdout) ||
  /^ D /mu.test(result.stdout) ||
  /^\?\? package\.json$/mu.test(result.stdout)
) {
  process.stderr.write(result.stdout);
  process.exitCode = 1;
}
