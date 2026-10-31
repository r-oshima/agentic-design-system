#!/usr/bin/env node
// Fingerprints the definitions a sample (見本) is made from, and records it in README.md.
// Usage:
//   node scripts/sample.mjs [design-system-root]           print the fingerprint
//   node scripts/sample.mjs --stamp [design-system-root]   write it to the 見本 row in README.md
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The row in README.md that records the sample: | 見本 | 形式と場所。作り直し方：…。同期：<fingerprint> |
export const SAMPLE_ROW = /^\|\s*見本\s*\|.*$/m;
export const SYNCED = /同期：\s*([0-9a-f]{12})/;

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith(".json") ? [path] : [];
  });
}

// Hash of the parsed contents, so formatting changes do not count. Paths are included so renames do.
export function fingerprint(root) {
  const files = [
    ...jsonFiles(join(root, "tokens")),
    ...jsonFiles(join(root, "components")).filter((p) => p.endsWith("spec.json")),
    join(root, "contrast.json"),
  ].filter(existsSync).map((p) => relative(root, p)).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\n${JSON.stringify(JSON.parse(readFileSync(join(root, file), "utf8")))}\n`);
  }
  return hash.digest("hex").slice(0, 12);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const stamp = args[0] === "--stamp";
  const root = (stamp ? args[1] : args[0]) ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const print = fingerprint(root);
  if (!stamp) {
    console.log(print);
  } else {
    const readme = join(root, "README.md");
    const text = existsSync(readme) ? readFileSync(readme, "utf8") : "";
    const row = text.match(SAMPLE_ROW)?.[0];
    if (!row) {
      console.error("README.mdに「| 見本 | 形式と場所。作り直し方：…。同期：… |」の行がない。ARCHITECTUREの「見本」を見て行を足す");
      process.exit(1);
    }
    const next = SYNCED.test(row) ? row.replace(SYNCED, `同期：${print}`) : row.replace(/\s*\|\s*$/, `。同期：${print} |`);
    writeFileSync(readme, text.replace(row, next));
    console.log(`stamped ${print}`);
  }
}
