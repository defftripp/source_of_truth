import { writeFile } from "node:fs/promises";

await writeFile(
  "src/message.mjs",
  'import { suffix } from "./suffix.mjs";\n\nexport const message = `hello from FAST${suffix}`;\n',
  "utf8",
);
await writeFile("src/suffix.mjs", 'export const suffix = "";\n', "utf8");
