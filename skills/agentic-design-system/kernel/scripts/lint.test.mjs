// Run: node --test scripts/
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lint } from "./lint.mjs";
import { fingerprint } from "./sample.mjs";

const stable = { $extensions: { ds: { status: "stable" } } };
const experimental = { $extensions: { ds: { status: "experimental" } } };
const srgb = (r, g, b) => ({ colorSpace: "srgb", components: [r, g, b] });
const px = (value) => ({ value, unit: "px" });

function base() {
  return {
    "tokens/primitive.json": {
      ...stable,
      color: { $type: "color", white: { $value: srgb(1, 1, 1) }, slate: { 100: { $value: srgb(0.9, 0.9, 0.9) } } },
      space: { $type: "dimension", 8: { $value: px(8) } },
      opacity: { $type: "number", 60: { $value: 0.6 } },
    },
    "tokens/semantic.json": {
      ...stable,
      opacity: { $type: "number", disabled: { $value: "{opacity.60}" } },
    },
    "tokens/semantic.light.json": { ...stable, color: { $type: "color", text: { default: { $value: "{color.slate.100}" } } } },
    "tokens/semantic.dark.json": { ...stable, color: { $type: "color", text: { default: { $value: "{color.white}" } } } },
    "foundation/color.md": "# Color",
    "foundation/opacity.md": "# Opacity",
    "foundation/space.md": "# Space",
  };
}

const minimalSpec = { parts: { body: { description: "本体" } }, spec: [] };

// Component docs get a minimal spec unless the test sets the spec path itself (null means none).
function write(files) {
  const root = mkdtempSync(join(tmpdir(), "ds-lint-"));
  for (const path of Object.keys(files)) {
    const spec = path.replace(/^(components\/[^/]+)\/README\.md$/, "$1/spec.json");
    if (spec !== path && !(spec in files)) files[spec] = minimalSpec;
  }
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

function run(files) {
  return lint(write(files));
}

function codes(files) {
  return run(files).errors.map((e) => `${e.code} ${e.name}`);
}

const SECTIONS = "## Usage\n## Interaction";
// README content that links every Component and Foundation the fixture defines.
const index = (files) =>
  Object.keys(files).filter((p) => /^(components\/[^/]+\/README|foundation\/[^/]+)\.md$/.test(p)).map((p) => `[x](${p})`).join(" ");
const doc = (frontmatter, body, sections = SECTIONS) => `---\n${frontmatter}\n---\n${body}\n${sections}\n`;

// Skipped where there are no tokens, such as the skill's kernel/, which is not a design system itself.
const realRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
test("the real design system passes", { skip: !existsSync(join(realRoot, "tokens")) }, () => {
  assert.deepEqual(lint(realRoot).errors, []);
});

test("the fixture base passes", () => {
  assert.deepEqual(codes(base()), []);
});

test("semantic with a raw value fails", () => {
  const files = base();
  files["tokens/semantic.json"].opacity.disabled.$value = 0.6;
  assert.deepEqual(codes(files), ["raw-value opacity.disabled"]);
});

test("semantic referencing semantic fails", () => {
  const files = base();
  files["tokens/semantic.json"].opacity.muted = { $value: "{opacity.disabled}" };
  assert.deepEqual(codes(files), ["ref-layer opacity.muted"]);
});

test("primitive referencing another token fails", () => {
  const files = base();
  files["tokens/primitive.json"].space[16] = { $value: "{space.8}" };
  assert.deepEqual(codes(files), ["ref-layer space.16"]);
});

test("primitive named after a use fails", () => {
  const files = base();
  files["tokens/primitive.json"].lineHeight = { $type: "number", control: { $value: 1.2 } };
  files["tokens/primitive.json"].color.primary = { 500: { $value: srgb(0.4, 0.4, 0.8) } };
  assert.deepEqual(codes(files), ["naming color.primary.500", "naming lineHeight.control"]);
});

test("semantic containing a component name fails", () => {
  const files = base();
  files["components/tabs/README.md"] = doc("status: experimental", "");
  for (const theme of ["light", "dark"]) {
    files[`tokens/semantic.${theme}.json`].color.background = { tabs: { selected: { $value: "{color.white}" } } };
  }
  assert.deepEqual(codes(files), ["naming color.background.tabs.selected", "naming color.background.tabs.selected"]);
});

test("dimensional semantic fails", () => {
  const files = base();
  files["tokens/semantic.json"].space = { $type: "dimension", inset: { $value: "{space.8}" } };
  assert.deepEqual(codes(files), ["naming space.inset"]);
});

test("theme files with different token sets fail", () => {
  const files = base();
  files["tokens/semantic.light.json"].color.text.subtle = { $value: "{color.slate.100}" };
  assert.deepEqual(codes(files), ["theme-parity color.text.subtle"]);
});

test("reference of the wrong type fails", () => {
  const files = base();
  files["tokens/semantic.json"].opacity.disabled.$value = "{space.8}";
  assert.deepEqual(codes(files), ["type-mismatch opacity.disabled"]);
});

test("undefined reference fails", () => {
  const files = base();
  files["tokens/semantic.json"].opacity.disabled.$value = "{opacity.40}";
  assert.deepEqual(codes(files), ["undefined-ref opacity.disabled"]);
});

test("component token may use semantic and dimensional primitives only", () => {
  const files = base();
  files["tokens/component/button.json"] = {
    ...stable,
    button: {
      label: { paddingX: { $type: "dimension", $value: "{space.8}" } },
      body: { background: { $type: "color", $value: "{color.text.default}" } },
      bad: { $type: "color", $value: "{color.slate.100}" },
    },
  };
  assert.deepEqual(codes(files), ["ref-layer button.bad"]);
});

test("component token referencing a component token fails", () => {
  const files = base();
  files["tokens/component/button.json"] = {
    ...stable,
    button: { $type: "dimension", gap: { $value: "{space.8}" }, padding: { $value: "{button.gap}" } },
  };
  assert.deepEqual(codes(files), ["ref-layer button.padding"]);
});

test("component token must start with its component name", () => {
  const files = base();
  files["tokens/component/icon-button.json"] = {
    ...stable,
    button: { gap: { $type: "dimension", $value: "{space.8}" } },
  };
  assert.deepEqual(codes(files), ["naming button.gap"]);
});

test("stable referencing experimental fails", () => {
  const files = base();
  files["tokens/primitive.json"].opacity[60].$extensions = experimental.$extensions;
  assert.deepEqual(codes(files), ["status opacity.disabled"]);
});

test("missing status fails", () => {
  const files = base();
  delete files["tokens/semantic.json"].$extensions;
  assert.deepEqual(codes(files), ["status opacity.disabled"]);
});

test("deprecated needs a replacement and warns its users", () => {
  const files = base();
  files["tokens/primitive.json"].opacity[60].$extensions = { ds: { status: "deprecated" } };
  assert.deepEqual(codes(files), ["deprecated opacity.60"]);
  files["tokens/primitive.json"].opacity[60].$deprecated = "Use {opacity.40}";
  const result = run(files);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings.map((w) => w.code), ["deprecated-ref"]);
});

test("component doc frontmatter accepts status only", () => {
  const files = base();
  files["components/button/README.md"] = doc("status: experimental\ntokens:\n  - opacity.disabled", "`opacity.disabled`");
  assert.deepEqual(codes(files), ["frontmatter tokens"]);
});

test("component doc referencing an undefined token fails", () => {
  const files = base();
  files["components/button/README.md"] = doc("status: experimental", "`color.text.missing`");
  assert.deepEqual(codes(files), ["undefined-ref color.text.missing"]);
});

test("component doc referencing a role primitive fails", () => {
  const files = base();
  files["components/button/README.md"] = doc("status: experimental", "`color.slate.100`");
  assert.deepEqual(codes(files), ["ref-layer color.slate.100"]);
});

test("stable component doc referencing experimental tokens fails", () => {
  const files = base();
  files["tokens/semantic.json"].$extensions = experimental.$extensions;
  files["components/button/README.md"] = doc("status: stable", "`opacity.disabled`");
  assert.deepEqual(codes(files), ["status opacity.disabled"]);
});

test("pattern doc must not reference component tokens", () => {
  const files = base();
  files["tokens/component/button.json"] = { ...stable, button: { gap: { $type: "dimension", $value: "{space.8}" } } };
  files["components/button/README.md"] = doc("status: stable", "`button.gap`");
  files["patterns/app-shell/README.md"] = doc(
    "status: stable\ncomponents:\n  - button\n  - sidebar",
    "`button.gap`",
  );
  assert.deepEqual(codes(files), ["ref-layer button.gap", "undefined-ref sidebar"]);
});

test("unknown token file fails", () => {
  const files = base();
  files["tokens/colors.json"] = {};
  assert.deepEqual(codes(files), ["unknown-file "]);
});

test("component doc needs the sections in order", () => {
  const files = base();
  files["components/button/README.md"] = doc("status: experimental", "", "## Interaction\n## Usage");
  assert.deepEqual(codes(files), ["doc-structure "]);
  files["components/button/README.md"] = doc("status: experimental", "", "## Usage");
  assert.deepEqual(codes(files), ["doc-structure "]);
});

test("color semantic outside the theme files fails", () => {
  const files = base();
  files["tokens/semantic.json"].color = { $type: "color", overlay: { $value: "{color.white}" } };
  assert.deepEqual(codes(files), ["theme-required color.overlay"]);
});

function withSurface() {
  const files = base();
  files["tokens/primitive.json"].color.black = { $value: srgb(0, 0, 0) };
  files["tokens/primitive.json"].color.blackAlpha = { 40: { $value: { ...srgb(0, 0, 0), alpha: 0.4 } } };
  files["tokens/semantic.light.json"].color.text.default.$value = "{color.black}";
  files["tokens/semantic.light.json"].color.text.faint = { $value: "{color.slate.100}" };
  files["tokens/semantic.dark.json"].color.text.faint = { $value: "{color.white}" };
  for (const theme of ["light", "dark"]) {
    files[`tokens/semantic.${theme}.json`].color.surface = { $value: theme === "light" ? "{color.white}" : "{color.black}" };
    files[`tokens/semantic.${theme}.json`].color.overlay = { $value: "{color.blackAlpha.40}" };
  }
  return files;
}
const pair = (foreground, minimum = 4.5) => ({ foreground, backgrounds: ["color.surface"], minimum });

test("pairs meeting the minimum pass", () => {
  const files = withSurface();
  files["contrast.json"] = { pairs: [pair("color.text.default")] };
  assert.deepEqual(codes(files), []);
});

test("pair below the minimum fails", () => {
  const files = withSurface();
  files["contrast.json"] = { pairs: [pair("color.text.faint")] };
  assert.deepEqual(codes(files), ["contrast color.text.faint on color.surface"]);
});

test("exception allows a pair below the minimum and must not go stale", () => {
  const files = withSurface();
  const exception = { foreground: "color.text.faint", background: "color.surface", themes: ["light"], reason: "再現を優先" };
  files["contrast.json"] = { pairs: [pair("color.text.faint")], exceptions: [exception] };
  assert.deepEqual(codes(files), []);
  files["contrast.json"].exceptions = [{ ...exception, themes: ["light", "dark"] }];
  assert.deepEqual(codes(files), ["contrast-exception color.text.faint on color.surface"]);
  files["contrast.json"].exceptions = [{ ...exception, reason: "" }];
  assert.deepEqual(codes(files), ["contrast-exception color.text.faint on color.surface"]);
});

test("translucent foreground fails", () => {
  const files = withSurface();
  files["contrast.json"] = { pairs: [{ foreground: "color.overlay", backgrounds: ["color.surface"], minimum: 3 }] };
  assert.deepEqual(codes(files), ["contrast color.overlay on color.surface"]);
});

test("translucent background is checked over every surface", () => {
  const files = withSurface();
  files["contrast.json"] = { pairs: [{ foreground: "color.text.default", backgrounds: ["color.overlay"], minimum: 3 }] };
  assert.deepEqual(codes(files), ["contrast color.text.default on color.overlay"], "no surface to composite over");
  for (const theme of ["light", "dark"]) {
    files[`tokens/semantic.${theme}.json`].color.background = {
      surface: theme === "light"
        ? { default: { $value: "{color.white}" }, sunken: { $value: "{color.slate.100}" } }
        : { default: { $value: "{color.black}" }, sunken: { $value: "{color.black}" } },
    };
  }
  assert.deepEqual(codes(files), []);
  files["contrast.json"].pairs[0].minimum = 7;
  assert.deepEqual(codes(files), ["contrast color.text.default on color.overlay"]);
});

test("broken relative link in Markdown fails", () => {
  const files = base();
  files["README.md"] = `[ok](tokens/primitive.json) [web](https://example.com) [anchor](#x) [bad](components/missing.md) ${index(files)}`;
  assert.deepEqual(codes(files), ["broken-link components/missing.md"]);
});

test("unused experimental role primitive fails, stable and dimensional ones pass", () => {
  const files = base();
  files["tokens/primitive.json"].opacity[40] = { $value: 0.4, ...experimental };
  files["tokens/primitive.json"].opacity[80] = { $value: 0.8 };
  files["tokens/primitive.json"].space[16] = { $value: px(16), ...experimental };
  assert.deepEqual(codes(files), ["unused opacity.40"]);
});

test("deprecated role primitive with no references fails", () => {
  const files = base();
  files["tokens/primitive.json"].opacity[40] = { $value: 0.4, $deprecated: "Use {opacity.60}", $extensions: { ds: { status: "deprecated" } } };
  assert.deepEqual(codes(files), ["unused opacity.40"]);
});

test("proposed is not a status", () => {
  const files = base();
  files["tokens/semantic.json"].$extensions = { ds: { status: "proposed" } };
  assert.deepEqual(codes(files), ["status opacity.disabled"]);
});

const PAGES = "| id | URL | 見るもの |\n| --- | --- | --- |\n| `home` | https://example.com/home | ボタン |\n| `list` | https://example.com/list | 一覧 |";
const CONDITIONS = "| 項目 | 内容 |\n| --- | --- |\n| 値の確かさ | 指定値 |";
const reference = ({ front = "source: https://example.com/\nfidelity: match", usage = "借りないもの：ロゴ", pages = PAGES, conditions = CONDITIONS, body = "" } = {}) =>
  `---\n${front}\n---\n# Ref\n## 用途\n${usage}\n## 見る画面\n${pages}\n## 計測条件\n${conditions}\n${body}\n`;

test("reference with source, fidelity, pages, and measured sections passes", () => {
  const files = base();
  files["references/app.md"] = reference({ body: "## Button\nページ：`home`、`list`\n| 高さ | `opacity.disabled` |" });
  assert.deepEqual(codes(files), []);
});

test("reference needs a source, a fidelity, and the required sections", () => {
  const files = base();
  files["references/app.md"] = reference({ front: "access: open" });
  assert.deepEqual(codes(files), ["frontmatter "]);
  files["references/app.md"] = reference({ front: "source: https://example.com/\nfidelity: copy" });
  assert.deepEqual(codes(files), ["frontmatter fidelity"]);
  files["references/app.md"] = "---\nsource: x\nfidelity: match\n---\n## 計測条件\n## 用途\n## 見る画面\n";
  assert.deepEqual(codes(files), ["doc-structure "]);
  files["references/app.md"] = reference({ usage: "借りるもの：色" });
  assert.deepEqual(codes(files), ["doc-structure 用途"]);
  files["references/app.md"] = reference({ conditions: "| 項目 | 内容 |\n| --- | --- |\n| 日付 | 2026-10-31 |" });
  assert.deepEqual(codes(files), ["doc-structure 計測条件"]);
});

test("reference pages need unique ids under the source", () => {
  const files = base();
  const pages = PAGES + "\n| `home` | https://example.com/again | x |\n| `other` | https://elsewhere.com/ | x |";
  files["references/app.md"] = reference({ pages });
  assert.deepEqual(codes(files), ["reference-page home", "reference-page other"]);
});

test("measured sections must name pages from the list", () => {
  const files = base();
  files["references/app.md"] = reference({ body: "## Button\n表\n## Tabs\nページ：`settings`" });
  assert.deepEqual(codes(files), ["reference-page Button", "reference-page Tabs"]);
});

test("reference naming a token that no longer exists fails", () => {
  const files = base();
  files["references/app.md"] = reference({ body: "## Text\nページ：`home`\n| 文字 | `color.text.subtlest` |" });
  assert.deepEqual(codes(files), ["undefined-ref color.text.subtlest"]);
});

test("README must index every component", () => {
  const files = base();
  files["components/button/README.md"] = doc("status: experimental", "");
  files["README.md"] = index(files).replace("[x](components/button/README.md)", "");
  assert.deepEqual(codes(files), ["index-missing components/button/README.md"]);
  files["README.md"] = index(files);
  assert.deepEqual(codes(files), []);
});

// Spec fixtures: a button whose label sits on a body background.
function withSpec(spec, pairs) {
  const files = base();
  files["tokens/primitive.json"].offset = { $type: "dimension", "-1": { $value: px(-1) }, 2: { $value: px(2) } };
  files["tokens/primitive.json"].color.transparent = { $value: { ...srgb(0, 0, 0), alpha: 0 } };
  for (const theme of ["light", "dark"]) {
    Object.assign(files[`tokens/semantic.${theme}.json`].color, {
      background: {
        surface: { default: { $value: theme === "light" ? "{color.white}" : "{color.slate.100}" } },
        fill: { $value: theme === "light" ? "{color.slate.100}" : "{color.white}" },
        clear: { $value: "{color.transparent}" },
      },
    });
  }
  files["tokens/semantic.json"].focusOffset = { $type: "dimension", inside: { $value: "{offset.-1}" }, outside: { $value: "{offset.2}" } };
  files["components/button/README.md"] = doc("status: experimental", "");
  files["components/button/spec.json"] = spec;
  files["foundation/focus-offset.md"] = "# Focus Offset";
  files["README.md"] = index(files);
  if (pairs) files["contrast.json"] = { pairs };
  return files;
}
const parts = { body: { description: "本体" }, label: { parent: "body", description: "ラベル" } };
const row = (part, property, token, when) => ({ part, property, token, ...(when ? { when } : {}) });

test("component doc without a spec fails", () => {
  const files = base();
  files["components/button/README.md"] = doc("status: experimental", "");
  files["components/button/spec.json"] = null;
  files["README.md"] = index(files);
  assert.deepEqual(codes(files), ["spec-missing "]);
});

test("spec with valid rows passes", () => {
  const spec = { parts, axes: { state: ["default", "hovered"] }, spec: [
    row("body", "minHeight", "space.8"),
    row("body", "background", "color.background.fill"),
    row("label", "color", "color.text.default"),
  ] };
  assert.deepEqual(codes(withSpec(spec)), []);
});

test("spec rejects unknown parts, properties, axes, and raw values", () => {
  const spec = { parts, axes: { state: ["default"] }, spec: [
    row("icon", "color", "color.text.default"),
    row("body", "shadow", "color.text.default"),
    row("body", "background", "color.background.fill", { size: "large" }),
    row("body", "minHeight", "8px"),
  ] };
  assert.deepEqual(codes(withSpec(spec)), ["spec spec[0]", "spec spec[1]", "spec spec[2]", "undefined-ref spec[3]"]);
});

test("spec property must take a token of its type and obey layer rules", () => {
  const spec = { parts, spec: [row("body", "minHeight", "opacity.disabled"), row("label", "color", "color.slate.100")] };
  assert.deepEqual(codes(withSpec(spec)), ["spec spec[0]", "ref-layer spec[1]"]);
});

test("spec rows must not overlap for the same condition", () => {
  const spec = { parts, axes: { state: ["default", "hovered"] }, spec: [
    row("body", "background", "color.background.fill"),
    row("body", "background", "color.background.clear", { state: "hovered" }),
  ] };
  assert.deepEqual(codes(withSpec(spec)), ["spec body.background"]);
});

test("spec reports foreground and background pairs missing from contrast.json", () => {
  const spec = { parts, axes: { state: ["default", "hovered"] }, spec: [
    row("body", "background", "color.background.fill", { state: "default" }),
    row("body", "background", "color.background.clear", { state: "hovered" }),
    row("label", "color", "color.text.default"),
    row("body", "outlineColor", "color.text.default"),
    row("body", "outlineOffset", "focusOffset.inside"),
  ] };
  const fill = { foreground: "color.text.default", backgrounds: ["color.background.fill"], minimum: 1 };
  // label on fill (default), label on surface through the transparent fill (hovered), inside outline on both.
  assert.deepEqual(codes(withSpec(spec, [fill])), ["spec color.text.default on color.background.surface.default"]);
  const both = { ...fill, backgrounds: ["color.background.fill", "color.background.surface.default"] };
  assert.deepEqual(codes(withSpec(spec, [both])), []);
});

test("outline drawn outside is checked against the surfaces, and dimmed parts are exempt", () => {
  const spec = { parts, axes: { state: ["default", "disabled"] }, spec: [
    row("body", "background", "color.background.fill"),
    row("body", "opacity", "opacity.disabled", { state: "disabled" }),
    row("body", "outlineColor", "color.text.default"),
    row("body", "outlineOffset", "focusOffset.outside"),
  ] };
  assert.deepEqual(codes(withSpec(spec, [{ foreground: "color.text.default", backgrounds: ["color.background.fill"], minimum: 1 }])),
    ["spec color.text.default on color.background.surface.default"]);
});

test("border is checked only when its color is a contrast foreground", () => {
  const spec = { parts, spec: [
    row("body", "background", "color.background.fill"),
    row("label", "borderColor", "color.text.default"),
    row("label", "borderBottomWidth", "space.8"),
  ] };
  assert.deepEqual(codes(withSpec(spec, [])), [], "a divider color that is not listed is not checked");
  const listed = [{ foreground: "color.text.default", backgrounds: ["color.background.surface.default"], minimum: 1 }];
  assert.deepEqual(codes(withSpec(spec, listed)), ["spec color.text.default on color.background.fill"]);
});

test("components folder accepts only README.md and spec.json", () => {
  const files = base();
  files["components/button/README.md"] = doc("status: experimental", "");
  files["components/button/notes.md"] = "x";
  files["components/stray.md"] = "x";
  files["README.md"] = index(files);
  assert.deepEqual(codes(files), ["unknown-file ", "unknown-file "]);
});

test("category without a foundation guide fails", () => {
  const files = base();
  delete files["foundation/opacity.md"];
  assert.deepEqual(codes(files), ["foundation-missing opacity"]);
});

test("foundation guide for an unknown category fails", () => {
  const files = base();
  files["foundation/elevation.md"] = "# Elevation";
  assert.deepEqual(codes(files), ["unknown-file "]);
});

test("foundation guide may name semantic and dimensional tokens only", () => {
  const files = base();
  files["foundation/color.md"] = "`color.text.default` `space.8` `color.slate.100` `color.text.missing`";
  assert.deepEqual(codes(files), ["ref-layer color.slate.100", "undefined-ref color.text.missing"]);
});

test("README must index every foundation guide", () => {
  const files = base();
  files["README.md"] = "[Color](foundation/color.md) [Space](foundation/space.md)";
  assert.deepEqual(codes(files), ["index-missing foundation/opacity.md"]);
});

test("space and size steps are named by their px value", () => {
  const files = base();
  files["tokens/primitive.json"].space[100] = { $value: px(8) };
  assert.deepEqual(codes(files), ["naming space.100"]);
});

test("stable color steps are limited to the reserved scale", () => {
  const files = base();
  files["tokens/primitive.json"].color.slate[125] = { $value: srgb(0.8, 0.8, 0.8) };
  files["tokens/primitive.json"].color.slate[150] = { $value: srgb(0.7, 0.7, 0.7), ...experimental };
  files["tokens/semantic.light.json"].color.text.muted = { $value: "{color.slate.150}", ...experimental };
  files["tokens/semantic.dark.json"].color.text.muted = { $value: "{color.white}", ...experimental };
  assert.deepEqual(codes(files), ["color-scale color.slate.125"]);
});

test("a sample must record the definitions it was made from", () => {
  const files = base();
  const row = (tail) => `${index(files)}\n| 見本 | HTML：sample/index.html。作り直し方：node build.mjs${tail} |`;
  assert.deepEqual(run(files).warnings, []);

  files["README.md"] = row("");
  assert.deepEqual(codes(files), ["doc-structure 見本"]);

  const root = write({ ...files, "README.md": row("。同期：000000000000") });
  const stale = lint(root);
  assert.deepEqual(stale.errors, []);
  assert.deepEqual(stale.warnings.map((w) => w.code), ["sample-stale"]);

  const synced = write({ ...files, "README.md": row(`。同期：${fingerprint(root)}`) });
  assert.deepEqual(lint(synced).warnings, []);
});

test("the sample fingerprint ignores formatting and follows content", () => {
  const files = base();
  const before = fingerprint(write(files));
  assert.equal(fingerprint(write(files)), before);
  files["tokens/primitive.json"].space[8].$value = px(9);
  assert.notEqual(fingerprint(write(files)), before);
});
