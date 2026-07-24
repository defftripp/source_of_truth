import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../runtime/contracts.mjs";

export const RUNTIME_VERSION = "1.1.0";

export const CANONICAL_PROJECT_SHELL_PATHS = Object.freeze([
  ".engineering",
  ".engineering/AGENTS.md",
  ".engineering/CONTEXT.md",
  ".engineering/README.md",
  ".engineering/adrs",
  ".engineering/adrs/.gitkeep",
  ".engineering/plans",
  ".engineering/plans/.gitkeep",
  ".engineering/runs",
  ".engineering/runs/.gitkeep",
  ".engineering/runtime",
  ".engineering/runtime/contracts.mjs",
  ".engineering/runtime/deep-contracts.mjs",
  ".engineering/runtime/doctor-contracts.mjs",
  ".engineering/runtime/engine.mjs",
  ".engineering/runtime/fitness-contracts.mjs",
  ".engineering/runtime/manifest.json",
  ".engineering/runtime/methodology.md",
  ".engineering/runtime/mode-policy.mjs",
  ".engineering/runtime/parallel-eligibility.mjs",
  ".engineering/runtime/review-contracts.mjs",
  ".engineering/runtime/upstream-adoption.json",
  ".engineering/specs",
  ".engineering/specs/.gitkeep",
  ".engineering/state",
  ".engineering/state/project.json",
  ".engineering/tickets",
  ".engineering/tickets/.gitkeep",
  ".engineering/verification",
  ".engineering/verification/registry.json",
]);

const DIRECTORY_PATHS = new Set(
  CANONICAL_PROJECT_SHELL_PATHS.filter(
    (candidate) => candidate === ".engineering" || !path.posix.basename(candidate).includes("."),
  ),
);
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} target @param {string} projectPath */
export async function materializeCanonicalShellEntry(target, projectPath) {
  if (!CANONICAL_PROJECT_SHELL_PATHS.includes(projectPath)) {
    throw new Error(`CREATE path is not part of the Canonical Project Shell: ${projectPath}`);
  }
  const destination = path.join(target, ...projectPath.split("/"));
  if (DIRECTORY_PATHS.has(projectPath)) {
    await mkdir(destination);
    return;
  }
  await writeFile(destination, await canonicalShellFileContent(projectPath));
}

/** @param {string} projectPath @returns {Promise<string | Buffer>} */
async function canonicalShellFileContent(projectPath) {
  if (projectPath.endsWith("/.gitkeep")) {
    return "";
  }
  if (projectPath === ".engineering/README.md") {
    return "# Engineering control plane\n\nProject-owned runtime, state, verification, and durable engineering artifacts.\n";
  }
  if (projectPath === ".engineering/AGENTS.md") {
    return "# Project Runtime\n\nUse the pinned runtime in `runtime/`; do not replace it from a global launcher.\n";
  }
  if (projectPath === ".engineering/CONTEXT.md") {
    return "# Project context\n\nAdd durable domain terminology and repository facts here.\n";
  }
  if (projectPath === ".engineering/state/project.json") {
    return json({ schemaVersion: 1, status: "PREPARED_PROJECT", runtimeVersion: RUNTIME_VERSION });
  }
  if (projectPath === ".engineering/verification/registry.json") {
    return json({
      schemaVersion: 1,
      checks: [{ id: "prepared-project-smoke", command: "node .engineering/runtime/engine.mjs --smoke" }],
    });
  }
  if (projectPath === ".engineering/runtime/upstream-adoption.json") {
    return json(await upstreamAdoptionMatrix());
  }
  if (projectPath === ".engineering/runtime/manifest.json") {
    const ownedFiles = [
      "runtime/contracts.mjs",
      "runtime/deep-contracts.mjs",
      "runtime/doctor-contracts.mjs",
      "runtime/engine.mjs",
      "runtime/fitness-contracts.mjs",
      "runtime/methodology.md",
      "runtime/mode-policy.mjs",
      "runtime/parallel-eligibility.mjs",
      "runtime/review-contracts.mjs",
      "runtime/upstream-adoption.json",
    ];
    const files = [];
    for (const relativePath of ownedFiles) {
      files.push({
        path: `.engineering/${relativePath}`,
        sha256: sha256(await canonicalShellFileContent(`.engineering/${relativePath}`)),
        ownership: "PROJECT_RUNTIME",
        generated: true,
        protected: false,
        repair: { kind: "git-blob", revision: "HEAD" },
      });
    }
    return json({ schemaVersion: 2, runtimeVersion: RUNTIME_VERSION, files });
  }
  if (projectPath.startsWith(".engineering/runtime/")) {
    return readFile(path.join(SOURCE_ROOT, ...projectPath.replace(".engineering/", "").split("/")));
  }
  throw new Error(`Canonical Project Shell file has no content contract: ${projectPath}`);
}

/** @returns {Promise<Record<string, unknown>>} */
async function upstreamAdoptionMatrix() {
  /** @type {string | Buffer} */
  const methodology = await canonicalShellFileContent(".engineering/runtime/methodology.md");
  return {
    schemaVersion: 1,
    entries: [
      {
        name: "matt-pocock-skills-methodology",
        source: "https://github.com/mattpocock/skills",
        revision: "9603c1cc8118d08bc1b3bf34cf714f62178dea3b",
        checksum: sha256(methodology),
        license: "MIT",
        adoption: "ADAPT",
        artifact: ".engineering/runtime/methodology.md",
        localDelta: "Reduced to the bounded preparation and verification contract for issue #18.",
        compatibilityEvidence: "Onboarding contract and Prepared Project smoke suites.",
        upgradeProcedure: "Review the pinned upstream diff, update the local adaptation and checksum, then run npm run verify.",
      },
    ],
  };
}

/** @param {unknown} value */
function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
