import { createHash } from "node:crypto";
import { readdir, readFile, readlink } from "node:fs/promises";
import path from "node:path";

/** @param {string} root */
export async function snapshotTree(root) {
  /** @type {{ path: string, type: "directory" | "file" | "symlink" | "other", sha256?: string, target?: string }[]} */
  const snapshot = [];

  /** @param {string} directory */
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        snapshot.push({ path: relative, type: "directory" });
        await visit(absolute);
        continue;
      }
      if (entry.isSymbolicLink()) {
        snapshot.push({ path: relative, type: "symlink", target: await readlink(absolute) });
        continue;
      }
      if (!entry.isFile()) {
        snapshot.push({ path: relative, type: "other" });
        continue;
      }
      const content = await readFile(absolute);
      snapshot.push({
        path: relative,
        type: "file",
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
  }

  await visit(root);
  return snapshot;
}
