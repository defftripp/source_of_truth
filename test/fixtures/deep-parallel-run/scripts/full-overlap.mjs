import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

assert.match(await readFile("src/a.mjs", "utf8"), /TICKET-B/u);
