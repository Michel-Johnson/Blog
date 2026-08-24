#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { atomicWriteJson } from "../lib/atomic-file.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultSource = path.resolve(scriptRoot, "..");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

const sourceRoot = path.resolve(argument("--source", defaultSource));
const requestedTarget = argument("--data-root", process.env.BLOG_DATA_ROOT || "");
const apply = process.argv.includes("--apply");
if (!requestedTarget) {
  console.error("Usage: node scripts/migrate-blog-data.mjs --data-root /var/lib/michel-blog [--source /home/www/frontend] [--apply]");
  process.exit(2);
}
const targetRoot = path.resolve(requestedTarget);
if (sourceRoot === targetRoot || sourceRoot.startsWith(`${targetRoot}${path.sep}`) || targetRoot.startsWith(`${sourceRoot}${path.sep}`)) {
  console.error("Source and data root must be separate, non-nested directories.");
  process.exit(2);
}

const mappings = [
  ["content", "content"],
  ["data", "data"],
  ["uploads", "uploads"],
  ["authored-posts.js", path.join("data", "authored-posts.js")],
  ["pinned-posts.js", path.join("data", "pinned-posts.js")]
];

async function walk(root, relative = "") {
  const absolute = path.join(root, relative);
  const info = await stat(absolute);
  if (info.isFile()) return [relative];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const next = path.join(relative, entry.name);
    return entry.isDirectory() ? walk(root, next) : [next];
  }));
  return nested.flat();
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function planFiles() {
  const plan = [];
  for (const [sourceRelative, targetRelative] of mappings) {
    const source = path.join(sourceRoot, sourceRelative);
    if (!existsSync(source)) continue;
    const info = await stat(source);
    const files = info.isDirectory() ? await walk(source) : [""];
    for (const nested of files) {
      const from = nested ? path.join(source, nested) : source;
      const to = nested ? path.join(targetRoot, targetRelative, nested) : path.join(targetRoot, targetRelative);
      const hash = await sha256(from);
      let action = "copy";
      if (existsSync(to)) action = (await sha256(to)) === hash ? "skip" : "conflict";
      plan.push({ from, to, hash, bytes: (await stat(from)).size, action });
    }
  }
  return plan;
}

const plan = await planFiles();
const conflicts = plan.filter((item) => item.action === "conflict");
const copyItems = plan.filter((item) => item.action === "copy");
const totalBytes = copyItems.reduce((sum, item) => sum + item.bytes, 0);
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  sourceRoot,
  targetRoot,
  files: plan.length,
  copy: copyItems.length,
  skip: plan.length - copyItems.length - conflicts.length,
  conflicts: conflicts.length,
  bytes: totalBytes
}, null, 2));

if (conflicts.length) {
  for (const item of conflicts.slice(0, 20)) console.error(`conflict: ${item.to}`);
  console.error("Migration stopped without overwriting existing data.");
  process.exit(1);
}
if (!apply) {
  console.log("Dry run only. Add --apply after reviewing this plan.");
  process.exit(0);
}

await mkdir(targetRoot, { recursive: true });
const migrationMarker = path.join(targetRoot, ".migration-in-progress.json");
await atomicWriteJson(migrationMarker, {
  version: 1,
  sourceRoot,
  targetRoot,
  startedAt: new Date().toISOString(),
  files: copyItems.map(({ to, hash, bytes }) => ({ path: path.relative(targetRoot, to), hash, bytes }))
});

try {
  for (const item of copyItems) {
    await mkdir(path.dirname(item.to), { recursive: true });
    const temporary = `${item.to}.migration-${process.pid}.tmp`;
    await copyFile(item.from, temporary);
    if ((await sha256(temporary)) !== item.hash) throw new Error(`Verification failed: ${item.from}`);
    await rename(temporary, item.to);
  }
  await atomicWriteJson(path.join(targetRoot, ".blog-data-manifest.json"), {
    version: 1,
    sourceRoot,
    migratedAt: new Date().toISOString(),
    files: plan.map(({ to, hash, bytes }) => ({ path: path.relative(targetRoot, to), hash, bytes }))
  });
  await unlink(migrationMarker);
  console.log(`Migration complete: ${copyItems.length} files copied and verified.`);
} catch (error) {
  console.error(`Migration interrupted: ${error.message}`);
  console.error(`Marker retained at ${migrationMarker}`);
  process.exitCode = 1;
}
