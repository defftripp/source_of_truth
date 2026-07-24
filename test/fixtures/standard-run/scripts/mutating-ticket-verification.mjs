import { readFile, writeFile } from "node:fs/promises";

const source = await readFile("src/message.mjs", "utf8");
if (!source.includes("hello from STANDARD")) {
  process.exitCode = 1;
} else if (process.env.ENGINEERING_WORKER_MAY_COMMIT === undefined) {
  await writeFile(
    "src/message.mjs",
    'export const message = "mutated by targeted verification";\n',
    "utf8",
  );
}
