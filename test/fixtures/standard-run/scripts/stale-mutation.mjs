import { writeFile } from "node:fs/promises";

await writeFile("src/message.mjs", 'export const message = "stale after verification";\n', "utf8");
