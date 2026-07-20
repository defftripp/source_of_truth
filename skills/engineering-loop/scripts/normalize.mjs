import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import {
  computeMigrationManifestHash,
  MIGRATION_ACTIONS,
  MIGRATION_OWNERS,
  MIGRATION_RISKS,
  migrationDestructiveScope,
  sha256,
} from "../runtime/contracts.mjs";

const CANONICAL_PROJECT_SHELL_PATHS = Object.freeze([
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
  ".engineering/runtime/engine.mjs",
  ".engineering/runtime/manifest.json",
  ".engineering/runtime/methodology.md",
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

/** @type {readonly { id: string, matches: (candidate: string) => boolean }[]} */
const CONVENTION_DETECTORS = Object.freeze([
  { id: "node-package", matches: (candidate) => candidate === "package.json" },
  { id: "npm-lockfile", matches: (candidate) => candidate === "package-lock.json" },
  { id: "python-project", matches: (candidate) => candidate === "pyproject.toml" },
  { id: "ruff", matches: (candidate) => candidate === "ruff.toml" },
  { id: "hugo-project", matches: (candidate) => candidate === "hugo.toml" },
  {
    id: "build-tooling",
    matches: (candidate) =>
      /^(?:dockerfile(?:\..+)?|makefile|taskfile(?:\..+)?|docker-compose[^/]*)$/iu.test(
        candidate,
      ),
  },
  {
    id: "project-documentation",
    matches: (candidate) =>
      /^(?:readme|license|changelog)(?:\..+)?$/iu.test(candidate) ||
      candidate.startsWith("docs/"),
  },
  {
    id: "typescript-config",
    matches: (candidate) => /^(?:tsconfig|jsconfig)(?:\..+)?\.json$/iu.test(candidate),
  },
  {
    id: "legacy-agent-control-plane",
    matches: (candidate) =>
      ["agents", "develop", "hooks", "memory", "playbooks", "registries", "rules"].some(
        (directory) => candidate.startsWith(`${directory}/`),
      ),
  },
  {
    id: "github-actions",
    matches: (candidate) => candidate.startsWith(".github/workflows/"),
  },
  {
    id: "repository-hygiene",
    matches: (candidate) => [".editorconfig", ".gitattributes", ".gitignore"].includes(candidate),
  },
]);

const APPLICATION_CORE_ROOTS = new Set([
  "app",
  "apps",
  "assets",
  "backend",
  "client",
  "cmd",
  "components",
  "content",
  "crates",
  "frontend",
  "internal",
  "layouts",
  "lib",
  "packages",
  "pages",
  "pkg",
  "public",
  "routes",
  "server",
  "service",
  "services",
  "src",
  "static",
  "test",
  "tests",
]);
const APPLICATION_CORE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".fs",
  ".go",
  ".graphql",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".less",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scala",
  ".scss",
  ".sql",
  ".svelte",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
]);
const SENSITIVE_ROOTS = new Set([
  ".aws",
  ".azure",
  ".docker",
  ".gnupg",
  ".kube",
  ".ssh",
]);
const LOCAL_OR_GENERATED_ROOTS = new Set([
  "archive",
  "build",
  "cache",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "target",
  "temp",
  "tmp",
  "vendor",
  "work",
]);

/** @param {string} targetInput */
export async function proposeNormalization(targetInput) {
  const target = path.resolve(targetInput);
  const entries = await inventoryRepository(target);
  const conventions = detectConventions(entries);
  const conventionPaths = new Set(conventions.flatMap((convention) => convention.evidence));
  const classifiedEntries = entries
    .filter((entry) => entry.kind !== "directory")
    .map((entry) => ({ entry, classification: classifyEntry(entry, conventionPaths) }));
  const applicationCore = classifiedEntries
    .filter(({ classification }) => classification.ownership === "APPLICATION_CORE")
    .map(({ entry }) => entry.path);
  const existingPaths = new Set(entries.map((entry) => entry.path));
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  /** @type {{ path: string, blocker: string, rationale: string }[]} */
  const conflicts = [];
  /** @type {MigrationAction[]} */
  const actions = classifiedEntries.map(({ entry, classification }) => {
    const isProtected = classification.action === "PROTECT";
    return {
      action: classification.action,
      path: entry.path,
      ownership: classification.ownership,
      rationale: isProtected
        ? "Protect an ambiguous, sensitive, or deliberate local path pending Human Gate review."
        : classification.ownership === "PROJECT_CONVENTION"
          ? "Preserve a detected project convention."
          : "Preserve the existing Application Core without imposing a framework layout.",
      risk: isProtected ? "HIGH" : "NONE",
      rollback: `No rollback is required because ${classification.action} does not mutate the path.`,
      destructive: false,
      sourceSha256: entry.sha256,
    };
  });
  for (const candidate of CANONICAL_PROJECT_SHELL_PATHS) {
    if (existingPaths.has(candidate)) {
      continue;
    }
    const blocker = findBlockingAncestor(candidate, entryByPath);
    if (blocker) {
      conflicts.push({
        path: candidate,
        blocker: blocker.path,
        rationale: "A non-directory ancestor blocks a safe Canonical Project Shell CREATE.",
      });
      continue;
    }
    actions.push({
      action: "CREATE",
      path: candidate,
      ownership: "PROJECT_RUNTIME",
      rationale: "Create a missing Canonical Project Shell path after Human Gate approval.",
      risk: "LOW",
      rollback: "Remove the created path if the approved migration is rolled back.",
      destructive: false,
    });
  }
  actions.sort(compareByPathThenAction);
  conflicts.sort((left, right) => left.path.localeCompare(right.path, "en"));

  return {
    schemaVersion: 1,
    status: "NORMALIZATION_PROPOSED",
    terminal: true,
    mutated: false,
    target: { path: target, kind: "directory" },
    manifest: {
      schemaVersion: 1,
      kind: "MIGRATION_MANIFEST",
      inventory: {
        ignoredPaths: [".git"],
        entries,
        conventions,
        applicationCore,
      },
      actions,
      conflicts,
      destructiveScope: migrationDestructiveScope(actions),
      hashAlgorithm: "sha256",
      hash: computeMigrationManifestHash(actions),
      humanGate: { required: true, approved: false },
    },
    summary: "A proposal-only Migration Manifest is ready for Human Gate review.",
    nextAction: "Review the Migration Manifest; do not apply it without explicit approval.",
  };
}

/** @param {string} target */
async function inventoryRepository(target) {
  /** @type {{ path: string, kind: "directory" | "file" | "symlink" | "other", sha256?: string, target?: string }[]} */
  const entries = [];

  /** @param {string} directory */
  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      const relative = toProjectPath(path.relative(target, absolute));
      if (relative === ".git") {
        continue;
      }
      const stats = await lstat(absolute);
      if (stats.isDirectory()) {
        entries.push({ path: relative, kind: "directory" });
        await visit(absolute);
      } else if (stats.isSymbolicLink()) {
        entries.push({ path: relative, kind: "symlink", target: await readlink(absolute) });
      } else if (stats.isFile()) {
        entries.push({ path: relative, kind: "file", sha256: sha256(await readFile(absolute)) });
      } else {
        entries.push({ path: relative, kind: "other" });
      }
    }
  }

  await visit(target);
  return entries;
}

/** @param {{ path: string }[]} entries */
function detectConventions(entries) {
  return CONVENTION_DETECTORS.flatMap((detector) => {
    const evidence = entries
      .map((entry) => entry.path)
      .filter(detector.matches)
      .sort((left, right) => left.localeCompare(right, "en"));
    return evidence.length > 0 ? [{ id: detector.id, evidence }] : [];
  });
}

/**
 * @param {{ path: string, kind: string }} entry
 * @param {Set<string>} conventionPaths
 * @returns {{ action: "KEEP" | "PROTECT", ownership: "APPLICATION_CORE" | "PROJECT_CONVENTION" | "LOCAL_OVERRIDE" }}
 */
function classifyEntry(entry, conventionPaths) {
  if (mustProtectSensitiveOrDeliberate(entry)) {
    return { action: "PROTECT", ownership: "LOCAL_OVERRIDE" };
  }
  if (conventionPaths.has(entry.path)) {
    return { action: "KEEP", ownership: "PROJECT_CONVENTION" };
  }
  if (mustProtectAmbiguous(entry)) {
    return { action: "PROTECT", ownership: "LOCAL_OVERRIDE" };
  }
  if (isApplicationCorePath(entry.path)) {
    return { action: "KEEP", ownership: "APPLICATION_CORE" };
  }
  return { action: "PROTECT", ownership: "LOCAL_OVERRIDE" };
}

/** @param {{ path: string, kind: string }} entry */
function mustProtectSensitiveOrDeliberate(entry) {
  const lowerPath = entry.path.toLocaleLowerCase("en");
  const segments = lowerPath.split("/");
  const basename = segments.at(-1) ?? lowerPath;
  if (entry.kind === "symlink" || entry.kind === "other") {
    return true;
  }
  if (
    [".cursor", ".claude", ".vscode", ".idea", ".engineering"].includes(segments[0]) ||
    SENSITIVE_ROOTS.has(segments[0]) ||
    LOCAL_OR_GENERATED_ROOTS.has(segments[0])
  ) {
    return true;
  }
  if (["agents.md", "claude.md", "context.md"].includes(basename)) {
    return true;
  }
  if (
    basename === ".env" ||
    basename.startsWith(".env.") ||
    [".npmrc", ".netrc", ".pypirc"].includes(basename) ||
    /^(?:credentials?|tokens?)(?:\..+)?$/u.test(basename) ||
    /^id_(?:dsa|ecdsa|ed25519|rsa)$/u.test(basename) ||
    /^service-account(?:\..+)?$/u.test(basename) ||
    /(?:^|\.)(?:key|pem|p12|pfx|kdbx)$/u.test(basename) ||
    segments.some((segment) =>
      ["secret", "secrets", "credential", "credentials"].includes(segment),
    )
  ) {
    return true;
  }
  if (basename.includes(".local.") || basename.endsWith(".local")) {
    return true;
  }
  return false;
}

/** @param {{ path: string }} entry */
function mustProtectAmbiguous(entry) {
  const segments = entry.path.toLocaleLowerCase("en").split("/");
  return segments[0].startsWith(".") || (segments.at(-1) ?? "").startsWith(".");
}

/** @param {string} candidate */
function isApplicationCorePath(candidate) {
  const lowerPath = candidate.toLocaleLowerCase("en");
  const root = lowerPath.split("/")[0];
  return (
    APPLICATION_CORE_ROOTS.has(root) ||
    APPLICATION_CORE_EXTENSIONS.has(path.posix.extname(lowerPath))
  );
}

/**
 * @param {string} candidate
 * @param {Map<string, { path: string, kind: string }>} entryByPath
 */
function findBlockingAncestor(candidate, entryByPath) {
  const segments = candidate.split("/");
  for (let length = 1; length < segments.length; length += 1) {
    const ancestor = entryByPath.get(segments.slice(0, length).join("/"));
    if (ancestor && ancestor.kind !== "directory") {
      return ancestor;
    }
  }
  return null;
}

/** @param {{ path: string, action: string }} left @param {{ path: string, action: string }} right */
function compareByPathThenAction(left, right) {
  return (
    left.path.localeCompare(right.path, "en") || left.action.localeCompare(right.action, "en")
  );
}

/** @param {string} value */
function toProjectPath(value) {
  return value.split(path.sep).join("/");
}

/**
 * @typedef {{
 *   action: MigrationActionKind,
 *   path: string,
 *   ownership: MigrationOwner,
 *   rationale: string,
 *   risk: MigrationRisk,
 *   rollback: string,
 *   destructive: boolean,
 *   sourceSha256?: string
 * }} MigrationAction
 */

/** @typedef {(typeof MIGRATION_ACTIONS)[number]} MigrationActionKind */
/** @typedef {(typeof MIGRATION_OWNERS)[number]} MigrationOwner */
/** @typedef {(typeof MIGRATION_RISKS)[number]} MigrationRisk */
