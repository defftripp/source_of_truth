import { readFile } from "node:fs/promises";

const observed = await Promise.all([
  readFile("src/message.mjs", "utf8"),
  readFile("src/audience.mjs", "utf8"),
  readFile("src/punctuation.mjs", "utf8"),
]);
if (!observed.every((source, index) => source.includes(["hello from STANDARD", "engineers", "!"][index]))) {
  process.exitCode = 1;
}
