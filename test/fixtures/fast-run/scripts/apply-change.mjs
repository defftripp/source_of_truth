import { writeFile } from "node:fs/promises";

await writeFile("src/message.mjs", 'export const message = "hello from FAST";\n', "utf8");
