// Reports how product code uses the design system's tokens, to inform status changes.
// Usage: node scripts/usage.mjs <product-dir>...
//
// A token counts as used in a file when its name appears in dotted form
// (color.text.default) or joined with "-" or "_" (--color-text-default), in the
// original or kebab case. The report lists:
//   - experimental tokens used in two or more files (candidates for stable)
//   - deprecated tokens still used, with the files
//   - experimental tokens not used in product code, marked when a Component or
//     Pattern of the design system, or another token, still refers to them
// Files stand in for screens, so check the candidates before acting on them.
// Declarations of CSS custom properties are not counted as uses.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const productArgs = process.argv.slice(2);
if (!productArgs.length) {
  console.error("usage: node scripts/usage.mjs <product-dir>...");
  process.exit(2);
}
const ds = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROLE_PRIMITIVE = (name, file) => file === "primitive.json" && !/^(space|size|radius)\./.test(name);
const CODE_EXT = /\.(html?|css|scss|less|[cm]?[jt]sx?|vue|svelte|astro|swift|kt|dart)$/;
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage"]);

// Token name -> status, inheriting $extensions.ds.status from groups.
const tokens = new Map();
function walk(node, path, inherited, file) {
  const status = node?.$extensions?.ds?.status ?? inherited;
  if (node && typeof node === "object" && "$value" in node) {
    const name = path.join(".");
    if (!ROLE_PRIMITIVE(name, file)) tokens.set(name, status);
    return;
  }
  for (const [key, child] of Object.entries(node ?? {})) {
    if (!key.startsWith("$") && child && typeof child === "object") walk(child, [...path, key], status, file);
  }
}
const tokenDir = join(ds, "tokens");
const tokenText = [];
for (const file of readdirSync(tokenDir).filter((f) => f.endsWith(".json"))) {
  const text = readFileSync(join(tokenDir, file), "utf8");
  tokenText.push(text);
  walk(JSON.parse(text), [], undefined, file);
}
const referredByToken = (name) => tokenText.some((text) => text.includes(`{${name}}`));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIR.has(name) || resolve(path) === ds ? [] : files(path);
    return CODE_EXT.test(name) ? [path] : [];
  });
}
// CSS custom property definitions (--color-text-default: ...) declare a token, not use it,
// so a generated token stylesheet does not count as a screen.
const sources = productArgs
  .flatMap((p) => files(resolve(p)))
  .map((path) => [path, readFileSync(path, "utf8").replace(/--[\w-]+\s*:/g, ":")]);

// Text of the design system's own Component specs and Pattern docs.
const dsDocs = ["components", "patterns"].flatMap((dir) => {
  try {
    return readdirSync(join(ds, dir)).flatMap((name) =>
      ["spec.json", "README.md"].flatMap((file) => {
        try {
          return [readFileSync(join(ds, dir, name, file), "utf8")];
        } catch {
          return [];
        }
      }),
    );
  } catch {
    return [];
  }
}).join("\n");

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
function patternFor(name) {
  const parts = name.split(".");
  const forms = new Set([".", "-", "_"].flatMap((sep) => [parts.join(sep), parts.map(kebab).join(sep)]));
  // Not followed by a character that would make it a longer name (space-1 must not match space-10).
  return new RegExp(`(?<![\\w.-])(?:--)?(?:${[...forms].map(escape).join("|")})(?![\\w.-]*\\w)`);
}

const usage = new Map();
for (const [name] of tokens) {
  const re = patternFor(name);
  usage.set(name, sources.filter(([, text]) => re.test(text)).map(([path]) => relative(process.cwd(), path)));
}

const byStatus = (status) => [...tokens].filter(([, s]) => s === status).map(([n]) => n);
const promote = byStatus("experimental").filter((n) => usage.get(n).length >= 2);
const stillDeprecated = byStatus("deprecated").filter((n) => usage.get(n).length > 0);
const unused = byStatus("experimental").filter((n) => usage.get(n).length === 0);

console.log(`scanned ${sources.length} file(s), ${tokens.size} token(s)\n`);
console.log("experimental, used in 2+ files (candidates for stable):");
for (const n of promote) console.log(`  ${n}  (${usage.get(n).length})`);
console.log("\ndeprecated, still used:");
for (const n of stillDeprecated) console.log(`  ${n}: ${usage.get(n).join(", ")}`);
console.log("\nexperimental, not used in product code:");
for (const n of unused) {
  const by = [patternFor(n).test(dsDocs) && "a Component or Pattern", referredByToken(n) && "another token"].filter(Boolean);
  console.log(`  ${n}${by.length ? `  (referred to by ${by.join(" and ")})` : ""}`);
}
