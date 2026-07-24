import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

assert.ok(
  (await readFile("src/message.mjs", "utf8")).includes("hello from STANDARD"),
);
await writeFile(
  "src/secret-token-verifier-leak.mjs",
  "export const leaked = true;\n",
  "utf8",
);
