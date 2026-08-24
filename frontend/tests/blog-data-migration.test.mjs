import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("blog data migration is dry-run by default and refuses overwrite", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "michel-migration-"));
  const source = path.join(fixture, "frontend");
  const target = path.join(fixture, "persistent");
  t.after(() => rm(fixture, { recursive: true, force: true }));

  await mkdir(path.join(source, "content", "drafts"), { recursive: true });
  await mkdir(path.join(source, "data"), { recursive: true });
  await writeFile(path.join(source, "content", "drafts", "draft.md"), "safe draft\n");
  await writeFile(path.join(source, "data", "authored-posts.json"), "[]\n");
  await writeFile(path.join(source, "authored-posts.js"), "window.MICHEL_AUTHORED_POSTS = [];\n");

  const dryRun = await execFileAsync(process.execPath, [
    "scripts/migrate-blog-data.mjs",
    "--source", source,
    "--data-root", target
  ], { cwd: projectRoot });
  assert.match(dryRun.stdout, /"mode": "dry-run"/);
  await assert.rejects(readFile(path.join(target, "content", "drafts", "draft.md"), "utf8"));

  const applied = await execFileAsync(process.execPath, [
    "scripts/migrate-blog-data.mjs",
    "--source", source,
    "--data-root", target,
    "--apply"
  ], { cwd: projectRoot });
  assert.match(applied.stdout, /Migration complete/);
  assert.equal(await readFile(path.join(target, "content", "drafts", "draft.md"), "utf8"), "safe draft\n");
  assert.match(await readFile(path.join(target, "data", "authored-posts.js"), "utf8"), /MICHEL_AUTHORED_POSTS/);

  await writeFile(path.join(source, "content", "drafts", "draft.md"), "new incompatible source\n");
  await assert.rejects(execFileAsync(process.execPath, [
    "scripts/migrate-blog-data.mjs",
    "--source", source,
    "--data-root", target,
    "--apply"
  ], { cwd: projectRoot }), (error) => {
    assert.match(error.stderr, /conflict:/);
    return true;
  });
  assert.equal(await readFile(path.join(target, "content", "drafts", "draft.md"), "utf8"), "safe draft\n");
});
