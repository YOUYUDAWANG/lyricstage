import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export class FileCache {
  constructor(rootDirectory, limit = 100) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.limit = limit;
  }

  async get(key) {
    const file = this.file(key);
    try {
      const envelope = JSON.parse(await readFile(file, "utf8"));
      if (!envelope || envelope.expiresAt <= Date.now() || !envelope.value) {
        await rm(file, { force: true });
        return null;
      }
      return envelope.value;
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async put(key, value, ttlMilliseconds) {
    await mkdir(this.rootDirectory, { recursive: true });
    const file = this.file(key);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ expiresAt: Date.now() + ttlMilliseconds, value }), { mode: 0o600 });
    await rename(temporary, file);
    await this.prune();
  }

  async prune() {
    const names = (await readdir(this.rootDirectory)).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name));
    const entries = await Promise.all(names.map(async (name) => ({ name, modified: (await stat(path.join(this.rootDirectory, name))).mtimeMs })));
    const obsolete = entries.sort((left, right) => right.modified - left.modified).slice(this.limit);
    await Promise.all(obsolete.map((entry) => rm(path.join(this.rootDirectory, entry.name), { force: true })));
  }

  file(key) {
    if (!/^[a-f0-9]{64}$/u.test(key)) throw new Error("invalid_cache_key");
    return path.join(this.rootDirectory, `${key}.json`);
  }
}
