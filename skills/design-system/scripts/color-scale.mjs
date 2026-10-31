// Builds 50, 100-900, 950 color scales and places extra colors on them.
// Usage: node color-scale.mjs <input.json> [--out <primitive-color.json>]
//
// Input:
// {
//   "families": {
//     "gray":   { "hue": 286, "chroma": 0.004, "anchors": { "50": "#F9F9FA", "900": "#1B1B1B" } },
//     "violet": { "anchors": { "600": "#5E6AD2" } }
//   },
//   "extra": ["#EFEFF0", "#5E6AC1"]
// }
// Anchors keep their exact hex. Other scale steps are generated in OKLCH from the
// family's hue and peak chroma (taken from the anchors when not given), with the
// lightness curve shifted to pass through the anchors. Each extra color (a value
// measured on a reference, or one added to meet contrast) snaps to a step within
// CIEDE2000 < 1, or becomes an experimental step in between, numbered by its
// lightness position.
import { readFileSync, writeFileSync } from "node:fs";
import { deltaE2000, hexToRgb, inGamut, rgbToHex, rgbToOklch } from "./color.mjs";

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const LIGHTNESS = { 50: 0.985, 100: 0.965, 200: 0.92, 300: 0.85, 400: 0.7, 500: 0.59, 600: 0.49, 700: 0.4, 800: 0.31, 900: 0.23, 950: 0.18 };
const CHROMA = { 50: 0.15, 100: 0.3, 200: 0.5, 300: 0.7, 400: 0.9, 500: 1, 600: 1, 700: 0.9, 800: 0.75, 900: 0.55, 950: 0.4 };
const NEUTRAL_CHROMA = 0.02;

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args[outIndex + 1] : null;
const inputPath = outIndex >= 0 ? args.filter((_, i) => i !== outIndex && i !== outIndex + 1)[0] : args[0];
if (!inputPath) {
  console.error("usage: node color-scale.mjs <input.json> [--out <primitive-color.json>]");
  process.exit(2);
}
const input = JSON.parse(readFileSync(inputPath, "utf8"));

const oklch = (hex) => rgbToOklch(hexToRgb(hex));

function buildFamily({ hue, chroma, anchors = {} }) {
  const anchored = Object.entries(anchors).map(([s, hex]) => [Number(s), hex.toUpperCase()]);
  for (const [s] of anchored) if (!STEPS.includes(s)) throw new Error(`anchor ${s} is not a scale step`);
  const lch = anchored.map(([s, hex]) => [s, oklch(hex)]);
  const peak = chroma ?? Math.max(0, ...lch.map(([s, [, c]]) => c / CHROMA[s]));
  const h = hue ?? circularMean(lch.map(([, [, c, hh]]) => [hh, c]));
  if (h === undefined) throw new Error("a family needs a hue or at least one chromatic anchor");
  // Offset of each anchor from the default lightness curve, interpolated between anchors
  // and faded to zero toward the ends so the scale still spans light to dark.
  const offsets = lch.map(([s, [l]]) => [s, l - LIGHTNESS[s]]).sort((a, b) => a[0] - b[0]);
  const offsetAt = (s) => {
    if (!offsets.length) return 0;
    const [first, last] = [offsets[0], offsets.at(-1)];
    if (s <= first[0]) return first[0] === STEPS[0] ? first[1] : (first[1] * (s - STEPS[0])) / (first[0] - STEPS[0]);
    if (s >= last[0]) return last[0] === STEPS.at(-1) ? last[1] : (last[1] * (STEPS.at(-1) - s)) / (STEPS.at(-1) - last[0]);
    const i = offsets.findIndex(([x]) => x >= s);
    const [s1, o1] = offsets[i - 1], [s2, o2] = offsets[i];
    return o1 + ((s - s1) / (s2 - s1)) * (o2 - o1);
  };
  const steps = {};
  for (const s of STEPS) {
    const anchor = anchors[s]?.toUpperCase();
    steps[s] = anchor
      ? { hex: anchor, from: "anchor" }
      : { hex: rgbToHex(inGamut([LIGHTNESS[s] + offsetAt(s), peak * CHROMA[s], h])), from: "generated" };
  }
  return { hue: h, peak, steps };
}

function circularMean(weighted) {
  const chromatic = weighted.filter(([, c]) => c >= NEUTRAL_CHROMA);
  if (!chromatic.length) return undefined;
  const x = chromatic.reduce((a, [h, c]) => a + c * Math.cos((h * Math.PI) / 180), 0);
  const y = chromatic.reduce((a, [h, c]) => a + c * Math.sin((h * Math.PI) / 180), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const families = Object.fromEntries(Object.entries(input.families).map(([name, def]) => [name, buildFamily(def)]));

function familyFor(hex) {
  const [, c, h] = oklch(hex);
  const entries = Object.entries(families);
  if (c < NEUTRAL_CHROMA) return entries.reduce((a, b) => (b[1].peak < a[1].peak ? b : a))[0];
  const dist = (x) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h));
  return entries.filter(([, f]) => f.peak >= NEUTRAL_CHROMA).reduce((a, b) => (dist(b[1].hue) < dist(a[1].hue) ? b : a))[0];
}

const placements = [];
for (const raw of input.extra ?? []) {
  const hex = raw.toUpperCase();
  const name = familyFor(hex);
  const fam = families[name].steps;
  const candidates = [...Object.entries(fam).map(([s, v]) => [`${name}.${s}`, v.hex]), ["white", "#FFFFFF"], ["black", "#000000"]];
  const [token, near] = candidates.reduce((a, b) => (deltaE2000(hex, b[1]) < deltaE2000(hex, a[1]) ? b : a));
  const dE = deltaE2000(hex, near);
  if (dE < 1) {
    placements.push({ extra: hex, token, dE, how: "snap" });
    continue;
  }
  const l = oklch(hex)[0];
  const sorted = Object.entries(fam).map(([s, v]) => [Number(s), oklch(v.hex)[0]]).sort((a, b) => a[0] - b[0]);
  let step;
  if (l > sorted[0][1]) step = 25;
  else if (l < sorted.at(-1)[1]) step = 975;
  else {
    const i = sorted.findIndex(([, x], k) => k > 0 && l >= x);
    const [s1, l1] = sorted[i - 1], [s2, l2] = sorted[i];
    step = Math.round((s1 + ((l1 - l) / (l1 - l2)) * (s2 - s1)) / 5) * 5;
  }
  while (fam[step]) step += 5;
  fam[step] = { hex, from: "extra", experimental: true };
  placements.push({ extra: hex, token: `${name}.${step}`, dE, how: "in-between" });
}

// A larger step number must never be lighter.
for (const [name, { steps }] of Object.entries(families)) {
  const sorted = Object.entries(steps).map(([s, v]) => [Number(s), oklch(v.hex)[0]]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][1] > sorted[i - 1][1]) console.warn(`warning: ${name}.${sorted[i][0]} is lighter than ${name}.${sorted[i - 1][0]}; adjust the anchors`);
  }
}

for (const [name, { hue, peak, steps }] of Object.entries(families)) {
  console.log(`${name}  hue ${hue.toFixed(1)}  peak chroma ${peak.toFixed(3)}`);
  for (const [s, v] of Object.entries(steps).sort((a, b) => a[0] - b[0])) {
    const [l, c] = oklch(v.hex);
    console.log(`  ${String(s).padStart(4)}  ${v.hex}  L ${l.toFixed(3)}  C ${c.toFixed(3)}  ${v.from}${v.experimental ? " (experimental)" : ""}`);
  }
}
for (const p of placements) console.log(`${p.extra} -> ${p.token}  ${p.how}  dE ${p.dE.toFixed(2)}`);

if (out) {
  const round = (x) => Math.round(x * 10000) / 10000;
  const color = {};
  for (const [name, { steps }] of Object.entries(families)) {
    color[name] = {};
    for (const [s, v] of Object.entries(steps).sort((a, b) => a[0] - b[0])) {
      color[name][s] = { $value: { colorSpace: "srgb", components: hexToRgb(v.hex).map(round), hex: v.hex } };
      if (v.experimental) color[name][s].$extensions = { ds: { status: "experimental" } };
    }
  }
  writeFileSync(out, JSON.stringify({ color }, null, 2) + "\n");
  console.log(`wrote ${out}`);
}
