import { readFile } from "node:fs/promises";

if (!(await readFile("src/payment.mjs", "utf8")).includes("migrated")) {
  process.exitCode = 1;
}
