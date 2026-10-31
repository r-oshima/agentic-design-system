// Copies the kernel (rules and lint) and the README template into a new design system.
// Usage:
//   node init.mjs <target>          copy files that are missing; never overwrite
//   node init.mjs --check <target>  list kernel files that differ from the skill's copy
//                                   (to locate what a project changed; a difference is not a defect)
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skill = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kernel = join(skill, "kernel");
const args = process.argv.slice(2);
const check = args[0] === "--check";
const target = resolve(check ? args[1] ?? "" : args[0] ?? "");
if (!args.length || (check && !args[1])) {
  console.error("usage: node init.mjs [--check] <target>");
  process.exit(2);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const copies = [
  ...files(kernel).map((src) => [src, join(target, relative(kernel, src)), true]),
  [join(skill, "templates", "README.md"), join(target, "README.md"), false],
];

let differs = 0;
for (const [src, dest, isKernel] of copies) {
  const name = relative(target, dest);
  if (check) {
    if (!isKernel) continue;
    if (!existsSync(dest)) console.log(`missing  ${name}`);
    else if (readFileSync(src, "utf8") !== readFileSync(dest, "utf8")) console.log(`differs  ${name}`);
    else continue;
    differs++;
  } else if (existsSync(dest)) {
    console.log(`kept     ${name}`);
  } else {
    cpSync(src, dest);
    console.log(`created  ${name}`);
  }
}
if (check) {
  console.log(differs ? `${differs} kernel file(s) differ` : "kernel files match");
  process.exit(differs ? 1 : 0);
}
