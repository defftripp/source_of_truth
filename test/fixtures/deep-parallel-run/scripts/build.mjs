import { access } from "node:fs/promises";

await Promise.all([access("src/a.mjs"), access("src/b.mjs")]);
