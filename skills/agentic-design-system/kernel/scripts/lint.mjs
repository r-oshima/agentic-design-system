#!/usr/bin/env node
// Checks the design system against the invariants in ARCHITECTURE.md.
// Usage: node scripts/lint.mjs [design-system-root]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, SAMPLE_ROW, SYNCED } from "./sample.mjs";
import { checkSpec } from "./spec.mjs";

const STATUSES = new Set(["experimental", "stable", "deprecated"]);
const DIMENSIONAL = new Set(["space", "size", "radius"]);

const NUMERIC = /^\d+$/;
// Space and Size steps are named by their px value, so the name alone tells the size.
const PX_NAMED = new Set(["space", "size"]);
const oneOf = (...names) => new RegExp(`^(${names.join("|")})$`);
const SIZE_NAMES = ["none", "xxs", "xs", "sm", "md", "lg", "xl", "xxl", "full"];

// Scale names allowed for each Primitive category. Color is checked separately.
const PRIMITIVE_SCALES = {
  space: NUMERIC,
  size: NUMERIC,
  opacity: NUMERIC,
  fontSize: NUMERIC,
  fontWeight: NUMERIC,
  offset: /^-?\d+$/,
  radius: oneOf(...SIZE_NAMES),
  borderWidth: oneOf(...SIZE_NAMES),
  shadow: oneOf(...SIZE_NAMES),
  lineHeight: oneOf("none", "tight", "normal", "relaxed", "loose"),
  letterSpacing: oneOf("tighter", "tight", "none", "wide", "wider"),
  fontFamily: oneOf("sans", "serif", "mono"),
  duration: oneOf("none", "fast", "normal", "slow"),
  easing: oneOf("linear", "standard", "decelerate", "accelerate"),
};
const COLOR_SPECIAL = new Set(["white", "black", "transparent"]);
const STABLE_COLOR_STEPS = new Set(["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]);
// Words that name a role, not a hue. They belong in Semantic names.
const ROLE_WORDS = new Set([
  "primary", "secondary", "tertiary", "accent", "brand", "neutral",
  "danger", "error", "success", "warning", "info",
  "text", "background", "border", "icon", "surface",
]);

const SEMANTIC_CATEGORIES = new Set([
  "color", "typography", "opacity", "borderWidth", "focusOffset", "iconSize", "elevation", "duration", "easing",
]);

const TYPOGRAPHY_PARTS = {
  fontFamily: "fontFamily",
  fontSize: "dimension",
  fontWeight: "fontWeight",
  letterSpacing: "dimension",
  lineHeight: "number",
};

const PRIMITIVE_SHAPES = {
  color: (v) =>
    isObject(v) && typeof v.colorSpace === "string" &&
    Array.isArray(v.components) && v.components.length === 3 && v.components.every(isNumber) &&
    (v.alpha === undefined || (isNumber(v.alpha) && v.alpha >= 0 && v.alpha <= 1)),
  dimension: (v) => isObject(v) && isNumber(v.value) && ["px", "rem"].includes(v.unit),
  number: isNumber,
  fontFamily: (v) => typeof v === "string" || (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string")),
  fontWeight: (v) => (isNumber(v) && v >= 1 && v <= 1000) || typeof v === "string",
  duration: (v) => isObject(v) && isNumber(v.value) && ["ms", "s"].includes(v.unit),
  cubicBezier: (v) => Array.isArray(v) && v.length === 4 && v.every(isNumber),
  shadow: (v) => isObject(v) || Array.isArray(v),
};

// Types whose Semantic values change with the theme.
const THEMED_TYPES = new Set(["color", "shadow"]);

const COMPONENT_SECTIONS = ["Usage", "Interaction"];

const REFERENCE_FIELDS = ["source", "access", "fidelity"];
const REFERENCE_SECTIONS = ["用途", "見る画面", "計測条件"];
const FIDELITIES = ["inspire", "match"];

const REF = /^\{([^{}]+)\}$/;
const KEY = /^([a-z][a-zA-Z0-9]*|-?\d+)$/;
const TOKEN_LIKE = /`([a-z][a-zA-Z0-9]*(?:\.-?[a-zA-Z0-9]+)+)`/g;

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function contrastRatio(a, b) {
  const luminance = ({ components }) => {
    const [r, g, b] = components.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function containsRef(v) {
  if (typeof v === "string") return /\{[^{}]+\}/.test(v);
  if (Array.isArray(v)) return v.some(containsRef);
  if (isObject(v)) return Object.values(v).some(containsRef);
  return false;
}
function kebab(name) {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
function camel(fileName) {
  return fileName.replace(/\.(json|md)$/, "").replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path, ext);
    return name.endsWith(ext) ? [path] : [];
  });
}

export function lint(root) {
  const errors = [];
  const warnings = [];
  const rel = (path) => relative(root, path);
  const report = (list) => (code, file, name, message) => list.push({ code, file, name, message });
  const error = report(errors);
  const warn = report(warnings);

  const componentFolders = definitionFolders("components", ["README.md", "spec.json"]);
  const patternFolders = definitionFolders("patterns", ["README.md"]);
  const componentDocs = componentFolders.map((f) => f.doc).filter((p) => existsSync(p));
  const patternDocs = patternFolders.map((f) => f.doc).filter((p) => existsSync(p));
  const componentTokenFiles = listFiles(join(root, "tokens", "component"), ".json");
  const componentNames = new Set([...componentFolders.map((f) => f.name), ...componentTokenFiles.map((p) => camel(basename(p)))]);

  // Each Component and Pattern is a folder: <kind>/<name>/ with only the allowed files.
  function definitionFolders(kind, allowed) {
    const dir = join(root, kind);
    if (!existsSync(dir)) return [];
    const folders = [];
    for (const name of readdirSync(dir).filter((n) => !n.startsWith("."))) {
      const path = join(dir, name);
      if (!statSync(path).isDirectory()) {
        error("unknown-file", rel(path), "", `${kind}/には部品ごとのフォルダだけを置く`);
        continue;
      }
      for (const file of readdirSync(path).filter((n) => !n.startsWith("."))) {
        if (!allowed.includes(file)) error("unknown-file", rel(join(path, file)), "", `フォルダに置くのは${allowed.join("、")}だけ`);
      }
      folders.push({ name: camel(name), dir: path, doc: join(path, "README.md"), spec: join(path, "spec.json") });
    }
    return folders;
  }

  // 1. Load every token file into one registry.
  const tokens = new Map();
  const themeNames = { light: new Set(), dark: new Set() };

  const tokenFiles = listFiles(join(root, "tokens"), ".json");
  for (const path of tokenFiles) {
    const file = rel(path);
    const source = sourceOf(file);
    if (!source) {
      error("unknown-file", file, "", "tokens/にはprimitive.json、semantic[.light|.dark].json、component/<部品>.jsonだけを置く");
      continue;
    }
    let json;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      error("invalid-json", file, "", `JSONとして読めない: ${e.message}`);
      continue;
    }
    walk(json, [], { type: json.$type, status: json.$extensions?.ds?.status }, (token) => {
      token.file = file;
      Object.assign(token, source);
      if (source.theme) themeNames[source.theme].add(token.name);
      const existing = tokens.get(token.name);
      const isThemePair = existing && existing.theme && token.theme && existing.theme !== token.theme;
      if (existing && !isThemePair) {
        error("duplicate", file, token.name, `${existing.file}と名前が重複している`);
        return;
      }
      if (!existing) tokens.set(token.name, { ...token, variants: [token] });
      else existing.variants.push(token);
    }, (name, message) => error("structure", file, name, message));
  }

  // 2. Check each token by layer.
  const referenced = new Set();
  for (const entry of tokens.values()) {
    for (const token of entry.variants) checkToken(token);
  }
  // Role primitives are used only through other tokens, so their references are complete.
  // Stable ones are kept as a reserved scale even when nothing uses them yet.
  for (const token of tokens.values()) {
    const [category] = token.name.split(".");
    if (token.layer !== "primitive" || DIMENSIONAL.has(category) || referenced.has(token.name)) continue;
    if (token.status === "experimental") {
      error("unused", token.file, token.name, "どのTokenからも参照されていない。削除するか、予約として残すなら人に確認してstableにする");
    } else if (token.status === "deprecated") {
      error("unused", token.file, token.name, "deprecatedで参照がなくなった。削除する");
    }
  }

  // 3. light and dark must define the same set.
  for (const [a, b] of [["light", "dark"], ["dark", "light"]]) {
    for (const name of themeNames[a]) {
      if (!themeNames[b].has(name)) {
        error("theme-parity", `tokens/semantic.${b}.json`, name, `semantic.${a}.jsonにだけ存在する。両テーマに定義する`);
      }
    }
  }

  // 4. Component and Pattern documents, and Component specs.
  const docStatus = new Map();
  for (const path of componentDocs) checkDoc(path, "component");
  for (const path of patternDocs) checkDoc(path, "pattern");
  const contrastPairs = loadContrastPairs();
  const surfaces = [...tokens.keys()].filter((n) => n.startsWith("color.background.surface."));
  for (const folder of [...componentFolders, ...patternFolders]) {
    if (!existsSync(folder.doc)) error("doc-missing", rel(folder.dir), "", "README.mdを置く");
  }
  for (const { name, doc, spec: path, dir } of componentFolders) {
    if (!existsSync(path)) {
      error("spec-missing", rel(dir), "", "spec.jsonを置く");
      continue;
    }
    const file = rel(path);
    let spec;
    try {
      spec = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      error("invalid-json", file, "", `JSONとして読めない: ${e.message}`);
      continue;
    }
    const useToken = tokenUser(file, "component", name, docStatus.get(doc));
    checkSpec(spec, {
      error: (name, message) => error("spec", file, name, message),
      useToken: (ref, where) => useToken(ref, where),
      resolve,
      surfaces,
      contrastPairs,
    });
  }

  // 5. Foreground and background pairs meet their contrast minimum in each theme.
  checkContrast();

  // 6. Relative links in Markdown point to existing files.
  for (const path of listFiles(root, ".md")) {
    const text = readFileSync(path, "utf8");
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^([a-z]+:|#)/.test(target)) continue;
      const resolved = join(dirname(path), decodeURI(target.split("#")[0]));
      if (!existsSync(resolved)) error("broken-link", rel(path), target, "リンク先のファイルが存在しない");
    }
  }

  // 7. References record a source and point to existing tokens.
  for (const path of listFiles(join(root, "references"), ".md")) checkReference(path);

  // 8. Foundation: one guide per category that UI chooses tokens from.
  const foundationDocs = listFiles(join(root, "foundation"), ".md");
  const chosenCategories = new Set(
    [...tokens.values()]
      .filter((t) => t.layer === "semantic" || (t.layer === "primitive" && DIMENSIONAL.has(t.name.split(".")[0])))
      .map((t) => t.name.split(".")[0]),
  );
  for (const category of chosenCategories) {
    const file = `foundation/${kebab(category)}.md`;
    if (!existsSync(join(root, file))) error("foundation-missing", file, category, "UIが選ぶカテゴリには、選び方を書いたFoundationを置く");
  }
  for (const path of foundationDocs) {
    const file = rel(path);
    if (dirname(file) !== "foundation" || !chosenCategories.has(camel(basename(path)))) {
      error("unknown-file", file, "", "foundation/には、Tokenがあるカテゴリごとに<カテゴリ>.mdだけを置く");
      continue;
    }
    const useToken = tokenUser(file, "foundation", null, undefined);
    for (const ref of tokenNamesIn(readFileSync(path, "utf8"))) useToken(ref);
  }

  // 9. README indexes every Component, Pattern, and Foundation.
  const readme = join(root, "README.md");
  if (existsSync(readme)) {
    const text = readFileSync(readme, "utf8");
    for (const path of [...componentDocs, ...patternDocs, ...foundationDocs]) {
      if (!text.includes(`](${rel(path)})`)) error("index-missing", "README.md", rel(path), "README.mdのIndexからリンクする");
    }
    // 10. A sample, if there is one, was made from the current tokens and specs.
    const row = text.match(SAMPLE_ROW)?.[0];
    if (row) {
      const synced = row.match(SYNCED)?.[1];
      if (!synced) {
        error("doc-structure", "README.md", "見本", "見本の行に「同期：<指紋>」を書く。`node scripts/sample.mjs --stamp`で書ける");
      } else if (synced !== fingerprint(root)) {
        warn("sample-stale", "README.md", "見本", "tokensかspecが見本の同期後に変わった。見本を作り直し、`node scripts/sample.mjs --stamp`で同期を記録する。作り直せないときは、その旨を報告する");
      }
    }
  }

  return { errors, warnings };

  // Returns a checker for tokens used by a Component or Pattern: existence, layer, and status.
  function tokenUser(file, kind, owner, status) {
    return (ref, where = ref) => {
      const target = tokens.get(ref);
      if (!target) {
        error("undefined-ref", file, where, `参照するTokenが存在しない: ${ref}`);
        return null;
      }
      const [category] = ref.split(".");
      const dimensional = target.layer === "primitive" && DIMENSIONAL.has(category);
      const ownToken = target.layer === "component" && target.owner === owner;
      const allowed = target.layer === "semantic" || dimensional || (kind === "component" && ownToken);
      if (!allowed) {
        error("ref-layer", file, where, kind === "component"
          ? `ComponentはSemantic、自部品のComponent Token、寸法系のPrimitiveだけを参照する: ${ref}`
          : `UIから選べるのはSemanticと寸法系のPrimitiveだけ: ${ref}`);
        return null;
      }
      checkStatus(status, target, file, where);
      return target;
    };
  }

  // Resolves a token to its Primitive value in a theme.
  function resolve(name, theme) {
    const entry = tokens.get(name);
    if (!entry) return undefined;
    const variant = entry.variants.find((v) => v.theme === theme) ?? entry.variants[0];
    if (entry.layer === "primitive") return variant.value;
    const ref = typeof variant.value === "string" ? variant.value.match(REF)?.[1] : null;
    return ref ? tokens.get(ref)?.value : undefined;
  }

  function loadContrastPairs() {
    const path = join(root, "contrast.json");
    if (!existsSync(path)) return null;
    try {
      const config = JSON.parse(readFileSync(path, "utf8"));
      return new Set((config.pairs ?? []).flatMap((p) => (p.backgrounds ?? []).map((bg) => `${p.foreground} on ${bg}`)));
    } catch {
      return null;
    }
  }

  function tokenNamesIn(text) {
    const roots = new Set([...SEMANTIC_CATEGORIES, ...Object.keys(PRIMITIVE_SCALES), "color", ...componentNames]);
    return new Set([...text.matchAll(TOKEN_LIKE)].map((m) => m[1]).filter((n) => roots.has(n.split(".")[0])));
  }

  function checkReference(path) {
    const file = rel(path);
    const parsed = parseFrontmatter(readFileSync(path, "utf8"));
    if (!parsed || !parsed.meta.source) {
      error("frontmatter", file, "", "frontmatterにリファレンスのsourceを書く");
      return;
    }
    const { meta, body } = parsed;
    for (const key of Object.keys(meta)) {
      if (!REFERENCE_FIELDS.includes(key)) error("frontmatter", file, key, `frontmatterに書くのは${REFERENCE_FIELDS.join("、")}だけ`);
    }
    if (!FIDELITIES.includes(meta.fidelity)) {
      error("frontmatter", file, "fidelity", `fidelityに再現の度合いを書く: ${FIDELITIES.join(" / ")}`);
    }

    const sections = new Map();
    for (const [, heading, content] of body.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
      sections.set(heading.trim(), content);
    }
    const headings = [...sections.keys()];
    if (headings.slice(0, REFERENCE_SECTIONS.length).join() !== REFERENCE_SECTIONS.join()) {
      error("doc-structure", file, "", `最初の見出しは${REFERENCE_SECTIONS.map((h) => `## ${h}`).join("、")}の順にする`);
      return;
    }
    if (!sections.get("用途").includes("借りないもの")) {
      error("doc-structure", file, "用途", "用途に借りないもの（ロゴ、固有の文言など）を書く");
    }
    if (!/^\|\s*値の確かさ\s*\|[^\n]*(指定値|推定値|計測なし)/m.test(sections.get("計測条件"))) {
      error("doc-structure", file, "計測条件", "計測条件の表に「| 値の確かさ | 指定値 / 推定値（誤差の目安） / 計測なし |」の行を書く");
    }

    // Pages: | `id` | URL | 見るもの |
    const pages = new Set();
    for (const [, id, url] of sections.get("見る画面").matchAll(/^\|\s*`([^`]+)`\s*\|\s*(\S+)\s*\|/gm)) {
      if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) error("reference-page", file, id, "ページのidはcamelCaseにする");
      if (pages.has(id)) error("reference-page", file, id, "ページのidが重複している");
      if (!url.startsWith(meta.source)) error("reference-page", file, id, `URLがsourceの配下にない: ${url}`);
      pages.add(id);
    }
    if (pages.size === 0) error("reference-page", file, "見る画面", "見る画面に`| id | URL | 見るもの |`の表を書く");

    // Each measured part names the pages it was measured on.
    for (const [heading, content] of sections) {
      if (REFERENCE_SECTIONS.includes(heading)) continue;
      const line = content.match(/^ページ：(.+)$/m);
      const ids = line ? [...line[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]) : [];
      if (ids.length === 0) error("reference-page", file, heading, "節の最初に「ページ：`id`」で計測したページを書く");
      for (const id of ids) {
        if (!pages.has(id)) error("reference-page", file, heading, `見る画面にないページ: ${id}`);
      }
    }

    for (const ref of tokenNamesIn(body)) {
      if (!tokens.has(ref)) error("undefined-ref", file, ref, "採用した定義として書いたTokenが存在しない。対応表を今の定義に合わせる");
    }
  }

  function checkContrast() {
    const path = join(root, "contrast.json");
    if (!existsSync(path)) return;
    const file = "contrast.json";
    let config;
    try {
      config = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      error("invalid-json", file, "", `JSONとして読めない: ${e.message}`);
      return;
    }
    const exceptions = new Map();
    for (const ex of config.exceptions ?? []) {
      const key = `${ex.foreground} on ${ex.background}`;
      if (typeof ex.reason !== "string" || !ex.reason) error("contrast-exception", file, key, "例外にはreasonを書く");
      if (ex.decision && !existsSync(join(root, ex.decision))) error("contrast-exception", file, key, `decisionのファイルがない: ${ex.decision}`);
      for (const theme of ex.themes ?? ["light", "dark"]) exceptions.set(`${key} ${theme}`, { ex, used: false });
    }

    for (const pair of config.pairs ?? []) {
      if (!isNumber(pair.minimum)) error("contrast", file, pair.foreground, "minimumに求めるコントラスト比を数値で書く");
      for (const background of pair.backgrounds ?? []) {
        const key = `${pair.foreground} on ${background}`;
        for (const theme of ["light", "dark"]) {
          const fg = themedColor(pair.foreground, theme);
          const bg = themedColor(background, theme);
          if (typeof fg === "string" || typeof bg === "string") {
            error("contrast", file, key, typeof fg === "string" ? fg : bg);
            break;
          }
          if ((fg.alpha ?? 1) < 1) {
            error("contrast", file, key, `前景に半透明の色は使わない: ${pair.foreground}`);
            break;
          }
          const grounds = backdrops(bg, theme);
          if (grounds.length === 0) {
            error("contrast", file, key, `半透明の背景を重ねる面（color.background.surface.*）がない: ${background}`);
            break;
          }
          const ratio = Math.min(...grounds.map((b) => contrastRatio(fg, b)));
          const exception = exceptions.get(`${key} ${theme}`);
          if (exception) exception.used = true;
          if (ratio < pair.minimum && !exception) {
            error("contrast", file, key, `${theme}で${ratio.toFixed(2)}:1。${pair.minimum}:1以上が必要。Primitiveの段階を足して参照先を変えるか、理由付きの例外にする`);
          }
          if (ratio >= pair.minimum && exception) {
            error("contrast-exception", file, key, `${theme}で${ratio.toFixed(2)}:1となり基準を満たす。不要になった例外を削除する`);
          }
        }
      }
    }
    for (const [key, { used }] of exceptions) {
      if (!used) error("contrast-exception", file, key, "pairsにない組み合わせの例外");
    }
  }

  // Resolves a themed Semantic color to its Primitive value, or returns an error message.
  function themedColor(name, theme) {
    const entry = tokens.get(name);
    if (!entry || entry.layer !== "semantic" || entry.type !== "color") return `Semanticの色ではない: ${name}`;
    const variant = entry.variants.find((v) => v.theme === theme);
    const ref = typeof variant?.value === "string" ? variant.value.match(REF)?.[1] : null;
    const value = tokens.get(ref)?.value;
    if (!PRIMITIVE_SHAPES.color(value) || value.colorSpace !== "srgb") return `${theme}の値をsRGBの色として解決できない: ${name}`;
    return value;
  }

  // A translucent background is checked as composited over every surface it can sit on.
  function backdrops(color, theme) {
    const alpha = color.alpha ?? 1;
    if (alpha >= 1) return [color];
    const surfaces = [...tokens.keys()]
      .filter((name) => name.startsWith("color.background.surface."))
      .map((name) => themedColor(name, theme))
      .filter((s) => typeof s !== "string" && (s.alpha ?? 1) >= 1);
    return surfaces.map((s) => ({
      components: s.components.map((c, i) => c * (1 - alpha) + color.components[i] * alpha),
    }));
  }

  function sourceOf(file) {
    const parts = file.split("/");
    if (file === "tokens/primitive.json") return { layer: "primitive", theme: null };
    if (file === "tokens/semantic.json") return { layer: "semantic", theme: null };
    if (file === "tokens/semantic.light.json") return { layer: "semantic", theme: "light" };
    if (file === "tokens/semantic.dark.json") return { layer: "semantic", theme: "dark" };
    if (parts.length === 3 && parts[1] === "component") return { layer: "component", owner: camel(parts[2]), theme: null };
    return null;
  }

  function checkToken(token) {
    const { file, name, status } = token;
    const [category, ...rest] = name.split(".");

    if (!STATUSES.has(status)) {
      error("status", file, name, "$extensions.ds.statusがない、または不正。experimental / stable / deprecatedのどれかをTokenかグループに書く");
    }
    if (status === "deprecated" && typeof token.deprecated !== "string") {
      error("deprecated", file, name, "deprecatedには代わりのTokenを記した$deprecatedを付ける");
    }
    if (!token.type) {
      error("type", file, name, "$typeがない。Tokenかグループに書く");
      return;
    }

    if (token.layer === "primitive") return checkPrimitive(token, category, rest);

    if (token.layer === "semantic") {
      if (THEMED_TYPES.has(token.type) && !token.theme) {
        error("theme-required", file, name, `${token.type}型のSemanticはテーマで値が変わるため、semantic.light.jsonとsemantic.dark.jsonに置く`);
      }
      if (!SEMANTIC_CATEGORIES.has(category)) {
        error("naming", file, name, `Semanticのカテゴリではない: ${category}。寸法系（space / size / radius）のSemanticは作らない`);
      }
      const componentWord = rest.find((seg) => componentNames.has(seg));
      if (componentWord) {
        error("naming", file, name, `Semanticに部品名「${componentWord}」を含めない。他の部品でも使える用途名にする`);
      }
    }
    if (token.layer === "component" && category !== token.owner) {
      error("naming", file, name, `Component Tokenは部品名「${token.owner}」から始める`);
    }

    for (const { ref, expectedType, where } of refsOf(token)) {
      if (ref === null) {
        error("raw-value", file, name, `${where}に生の値がある。Primitiveを追加し、それを参照する`);
        continue;
      }
      const target = tokens.get(ref);
      if (!target) {
        error("undefined-ref", file, name, `参照先が存在しない: {${ref}}`);
        continue;
      }
      referenced.add(ref);
      checkLayer(token, target, file, name);
      if (target.type !== expectedType) {
        error("type-mismatch", file, name, `${where}は${expectedType}を参照する。{${ref}}は${target.type}`);
      }
      checkStatus(status, target, file, name);
    }
  }

  function checkPrimitive(token, category, rest) {
    const { file, name, type, value } = token;
    if (containsRef(value)) {
      error("ref-layer", file, name, "Primitiveは他のTokenを参照しない。生の値を書く");
      return;
    }
    const shape = PRIMITIVE_SHAPES[type];
    if (!shape) error("type", file, name, `Primitiveで扱わない型: ${type}`);
    else if (!shape(value)) error("value-shape", file, name, `${type}型の値としてDTCGの形式に合わない`);

    if (category === "color") {
      const [hue, step, extra] = rest;
      const special = COLOR_SPECIAL.has(hue) && step === undefined;
      const scaled = hue && !COLOR_SPECIAL.has(hue) && !ROLE_WORDS.has(hue.replace(/Alpha$/, "")) &&
        NUMERIC.test(step ?? "") && extra === undefined;
      if (!special && !scaled) {
        error("naming", file, name, "Primitive Colorはcolor.<色名>.<数値>、またはcolor.white / black / transparent。用途名は使わない");
      }
      // The reserved scale is 50, 100-900 by 100, and 950. Steps in between exist only while used.
      if (scaled && !hue.endsWith("Alpha") && token.status === "stable" && !STABLE_COLOR_STEPS.has(step)) {
        error("color-scale", file, name, "stableにできる色の段階は50、100〜900（100刻み）、950だけ。間の段階はexperimentalにする");
      }
      return;
    }
    const scale = PRIMITIVE_SCALES[category];
    if (!scale) {
      error("naming", file, name, `Primitiveのカテゴリではない: ${category}。追加する場合はARCHITECTURE.mdとlintを先に更新する`);
    } else if (rest.length !== 1 || !scale.test(rest[0])) {
      error("naming", file, name, `${category}の段階名ではない。用途名（control、menuなど）はPrimitiveに使わない`);
    } else if (PX_NAMED.has(category) && isObject(value) && !(value.unit === "px" && String(value.value) === rest[0])) {
      error("naming", file, name, `${category}の段階名はpxの値と同じ数値にする`);
    }
  }

  function refsOf(token) {
    const parse = (v) => (typeof v === "string" && REF.test(v) ? v.match(REF)[1] : null);
    if (token.type === "typography" && isObject(token.value)) {
      const parts = Object.entries(TYPOGRAPHY_PARTS).map(([part, expectedType]) => ({
        ref: parse(token.value[part]),
        expectedType,
        where: `typographyの${part}`,
      }));
      const extra = Object.keys(token.value).filter((k) => !(k in TYPOGRAPHY_PARTS));
      for (const k of extra) error("structure", token.file, token.name, `typographyに不要なプロパティ: ${k}`);
      return parts;
    }
    return [{ ref: parse(token.value), expectedType: token.type, where: "$value" }];
  }

  // Encodes the reference table in ARCHITECTURE.md.
  function checkLayer(from, target, file, name) {
    const [targetCategory] = target.name.split(".");
    const dimensional = target.layer === "primitive" && DIMENSIONAL.has(targetCategory);
    if (from.layer === "semantic" && target.layer !== "primitive") {
      error("ref-layer", file, name, `SemanticはPrimitiveだけを参照する。{${target.name}}は${target.layer}`);
    }
    if (from.layer === "component") {
      if (target.layer === "component") {
        error("ref-layer", file, name, `Component Tokenは他のComponent Tokenを参照しない: {${target.name}}`);
      } else if (target.layer === "primitive" && !dimensional) {
        error("ref-layer", file, name, `役割系のPrimitive {${target.name}} を直接参照しない。Semanticを使うか、Semanticを追加する`);
      }
    }
  }

  function checkStatus(status, target, file, name) {
    if (status === "stable" && target.status === "experimental") {
      error("status", file, name, `stableな定義が${target.status}な{${target.name}}を参照している`);
    }
    if (status !== "deprecated" && target.status === "deprecated") {
      warn("deprecated-ref", file, name, `deprecatedな{${target.name}}を参照している。${target.deprecated ?? ""}`);
    }
  }

  function checkDoc(path, kind) {
    const file = rel(path);
    const owner = camel(basename(dirname(path)));
    const text = readFileSync(path, "utf8");
    const parsed = parseFrontmatter(text);
    if (!parsed) {
      error("frontmatter", file, "", "frontmatter（status）がない");
      return;
    }
    const { meta, body } = parsed;
    if (kind === "component") {
      const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
      const order = headings.filter((h) => COMPONENT_SECTIONS.includes(h));
      if (order.join() !== COMPONENT_SECTIONS.join()) {
        error("doc-structure", file, "", `見出しは${COMPONENT_SECTIONS.map((h) => `## ${h}`).join("、")}をこの順で1つずつ置く`);
      }
    }
    const status = meta.status;
    if (!STATUSES.has(status)) error("status", file, "", "frontmatterのstatusが不正");
    docStatus.set(path, status);
    const allowedFields = kind === "pattern" ? ["status", "components"] : ["status"];
    for (const key of Object.keys(meta)) {
      if (!allowedFields.includes(key)) {
        error("frontmatter", file, key, `frontmatterに書くのは${allowedFields.join("、")}だけ。使うTokenは本文から読み取る`);
      }
    }

    const used = tokenNamesIn(body);

    const useToken = tokenUser(file, kind, owner, status);
    for (const ref of used) useToken(ref);
    if (kind === "pattern") {
      for (const c of meta.components ?? []) {
        if (!componentFolders.some((f) => f.name === camel(c))) {
          error("undefined-ref", file, c, "componentsに書いた部品の文書が存在しない");
        }
      }
    }
  }
}

function walk(node, path, inherited, onToken, onError) {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const name = [...path, key].join(".");
    if (!KEY.test(key)) onError(name, `名前の各語はcamelCaseまたは数値にする: ${key}`);
    if (!isObject(child)) {
      onError(name, "TokenまたはグループはJSONオブジェクトにする");
      continue;
    }
    const context = {
      type: child.$type ?? inherited.type,
      status: child.$extensions?.ds?.status ?? inherited.status,
    };
    if ("$value" in child) {
      const children = Object.keys(child).filter((k) => !k.startsWith("$"));
      if (children.length) onError(name, "Tokenは子を持てない。グループとTokenを分ける");
      onToken({
        name,
        type: context.type,
        status: context.status,
        value: child.$value,
        deprecated: child.$deprecated,
      });
    } else {
      walk(child, [...path, key], context, onToken, onError);
    }
  }
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const meta = {};
  let listKey = null;
  for (const raw of match[1].split("\n")) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && listKey) {
      meta[listKey].push(item[1].trim());
      continue;
    }
    const pair = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value === "" || value === "[]") {
      meta[key] = [];
      listKey = key;
    } else {
      meta[key] = value.trim();
      listKey = null;
    }
  }
  return { meta, body: match[2] };
}

function format({ code, file, name, message }) {
  return `${file}${name ? ` ${name}` : ""}: [${code}] ${message}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const { errors, warnings } = lint(root);
  for (const w of warnings) console.warn(`warning ${format(w)}`);
  for (const e of errors) console.error(`error   ${format(e)}`);
  console.log(`${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
