import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function atomicWriteFile(target, data, options = {}) {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  let handle;
  try {
    handle = await open(temporary, "w", options.mode);
    await handle.writeFile(data, options.encoding ? { encoding: options.encoding } : undefined);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
    try {
      const directoryHandle = await open(directory, "r");
      await directoryHandle.sync();
      await directoryHandle.close();
    } catch (_) {
      // Some filesystems do not allow syncing a directory handle.
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function atomicWriteJson(target, value) {
  await atomicWriteFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
}
