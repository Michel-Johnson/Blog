#!/usr/bin/env node
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] || process.cwd());
const { serializeAuthoredPostsBundle } = await import(pathToFileURL(path.join(root, "lib", "authored-post-bundle.mjs")));
const { trimTrailingEmptyContent } = await import(pathToFileURL(path.join(root, "lib", "trailing-content.mjs")));

async function writeAtomic(file, value) {
  const temporary = `${file}.cleanup-${process.pid}`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, file);
}

async function markdownFiles(directory) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

const authoredFile = path.join(root, "data", "authored-posts.json");
const authoredPosts = JSON.parse(await readFile(authoredFile, "utf8"));
let authoredChanged = 0;
for (const post of authoredPosts) {
  const cleaned = trimTrailingEmptyContent(post?.markdown);
  if (cleaned !== String(post?.markdown || "")) {
    post.markdown = cleaned;
    authoredChanged += 1;
  }
}

if (authoredChanged) {
  await writeAtomic(authoredFile, `${JSON.stringify(authoredPosts, null, 2)}\n`);
  await writeAtomic(path.join(root, "authored-posts.js"), serializeAuthoredPostsBundle(authoredPosts));
}

let filesChanged = 0;
for (const directory of [path.join(root, "content", "posts"), path.join(root, "content", "drafts")]) {
  for (const file of await markdownFiles(directory)) {
    const source = await readFile(file, "utf8");
    const cleaned = trimTrailingEmptyContent(source);
    if (cleaned === source) continue;
    await writeAtomic(file, `${cleaned}\n`);
    filesChanged += 1;
  }
}

console.log(JSON.stringify({ authoredChanged, filesChanged }));
