import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillPath = fileURLToPath(
  new URL("../../skills/engineering-loop/SKILL.md", import.meta.url),
);

/**
 * @param {string} frontmatter
 * @param {string} field
 */
function readScalar(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1].trim();
}

test("engineering-loop is the only required entrypoint and cannot auto-invoke", async () => {
  const skillDirectories = (await readdir(`${repositoryRoot}/skills`, {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(skillDirectories, ["engineering-loop"]);

  const source = await readFile(skillPath, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, "SKILL.md must start with YAML frontmatter");
  const frontmatter = match[1];
  assert.equal(readScalar(frontmatter, "name"), "engineering-loop");
  assert.equal(readScalar(frontmatter, "disable-model-invocation"), "true");
  assert.match(source, /\$engineering-loop/);
  assert.match(source, /Do not start onboarding or normalization/i);
});
