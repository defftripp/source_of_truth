import { readFile } from "node:fs/promises";

if (!(await readFile("src/message.mjs", "utf8")).includes("hello from STANDARD")) {
  process.exitCode = 1;
}
