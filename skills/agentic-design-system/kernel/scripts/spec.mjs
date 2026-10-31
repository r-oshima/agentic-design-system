// Checks a Component spec (components/<name>.json): its shape, the tokens it uses,
// and that every foreground/background pair it produces is listed in contrast.json.

// Each property and the token type it takes. outline* properties apply only while focused.
// borderWidth draws all four sides; borderTopWidth and borderBottomWidth draw one side.
export const PROPERTIES = {
  background: "color",
  color: "color",
  borderColor: "color",
  outlineColor: "color",
  typography: "typography",
  minHeight: "dimension",
  minWidth: "dimension",
  maxWidth: "dimension",
  size: "dimension",
  paddingX: "dimension",
  paddingY: "dimension",
  paddingStart: "dimension",
  paddingEnd: "dimension",
  gap: "dimension",
  radius: "dimension",
  borderWidth: "dimension",
  borderTopWidth: "dimension",
  borderBottomWidth: "dimension",
  outlineWidth: "dimension",
  outlineOffset: "dimension",
  opacity: "number",
};

const SPEC_FIELDS = ["parts", "axes", "spec"];
const ROW_FIELDS = ["part", "when", "property", "token"];
const PART_FIELDS = ["description", "parent", "when"];
const ID = /^[a-z][a-zA-Z0-9]*$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ctx: { error(name, message), useToken(name) -> target | null, resolve(name, theme) -> primitive value,
//        surfaces: string[], contrastPairs: Set<"fg on bg"> | null }
export function checkSpec(spec, ctx) {
  const { error } = ctx;
  if (!isObject(spec)) return error("", "仕様はJSONオブジェクトにする");
  for (const key of Object.keys(spec)) {
    if (!SPEC_FIELDS.includes(key)) error(key, `仕様に書くのは${SPEC_FIELDS.join("、")}だけ`);
  }

  const axes = checkAxes(spec.axes ?? {}, error);
  const parts = checkParts(spec.parts, axes, error);
  if (!parts) return;
  const rows = checkRows(spec.spec, parts, axes, ctx);

  const combos = combinations(axes);
  checkOverlaps(rows, parts, combos, error);
  if (ctx.contrastPairs) checkContrastPairs(rows, parts, combos, ctx);
}

function checkAxes(axes, error) {
  if (!isObject(axes)) {
    error("axes", "axesは軸名から値の配列への対応にする");
    return {};
  }
  const valid = {};
  for (const [axis, values] of Object.entries(axes)) {
    const ok = ID.test(axis) && Array.isArray(values) && values.length > 0 &&
      values.every((v) => typeof v === "string" && ID.test(v)) && new Set(values).size === values.length;
    if (ok) valid[axis] = values;
    else error(`axes.${axis}`, "軸名と値はcamelCaseにし、値は重複のない1つ以上の配列にする");
  }
  return valid;
}

function checkCondition(when, axes, where, error) {
  if (when === undefined) return true;
  if (!isObject(when)) {
    error(where, "whenは軸名から値（または値の配列）への対応にする");
    return false;
  }
  let ok = true;
  for (const [axis, value] of Object.entries(when)) {
    const values = Array.isArray(value) ? value : [value];
    if (!axes[axis]) {
      error(where, `axesにない軸: ${axis}`);
      ok = false;
    } else if (values.length === 0 || values.some((v) => !axes[axis].includes(v))) {
      error(where, `軸${axis}にない値: ${values.join(", ")}`);
      ok = false;
    }
  }
  return ok;
}

function checkParts(parts, axes, error) {
  if (!isObject(parts) || Object.keys(parts).length === 0) {
    error("parts", "partsに1つ以上の部位を書く");
    return null;
  }
  for (const [id, part] of Object.entries(parts)) {
    const where = `parts.${id}`;
    if (!ID.test(id)) error(where, "部位のidはcamelCaseにする");
    if (!isObject(part) || typeof part.description !== "string" || !part.description) {
      error(where, "部位にはdescriptionを書く");
      continue;
    }
    for (const key of Object.keys(part)) {
      if (!PART_FIELDS.includes(key)) error(where, `部位に書くのは${PART_FIELDS.join("、")}だけ`);
    }
    if (part.parent !== undefined && !parts[part.parent]) error(where, `親の部位がない: ${part.parent}`);
    checkCondition(part.when, axes, where, error);
  }
  // Parent chains must end at a root.
  for (const id of Object.keys(parts)) {
    const seen = new Set();
    for (let p = id; p !== undefined; p = parts[p]?.parent) {
      if (seen.has(p)) {
        error(`parts.${id}`, "親の部位が循環している");
        return null;
      }
      seen.add(p);
    }
  }
  return parts;
}

function checkRows(rows, parts, axes, ctx) {
  const { error, useToken } = ctx;
  if (!Array.isArray(rows)) {
    error("spec", "specは指定の配列にする");
    return [];
  }
  const valid = [];
  rows.forEach((row, i) => {
    const where = `spec[${i}]`;
    if (!isObject(row)) return error(where, "指定はJSONオブジェクトにする");
    for (const key of Object.keys(row)) {
      if (!ROW_FIELDS.includes(key)) error(where, `指定に書くのは${ROW_FIELDS.join("、")}だけ`);
    }
    if (!parts[row.part]) return error(where, `partsにない部位: ${row.part}`);
    const expectedType = PROPERTIES[row.property];
    if (!expectedType) return error(where, `使えないproperty: ${row.property}。${Object.keys(PROPERTIES).join("、")}から選ぶ`);
    if (!checkCondition(row.when, axes, where, error)) return;
    if (typeof row.token !== "string") return error(where, "tokenにはToken名を1つ書く");
    const target = useToken(row.token, where);
    if (!target) return;
    if (target.type !== expectedType) {
      return error(where, `${row.property}には${expectedType}型のTokenを使う。${row.token}は${target.type}`);
    }
    valid.push(row);
  });
  return valid;
}

function combinations(axes) {
  return Object.entries(axes).reduce(
    (acc, [axis, values]) => acc.flatMap((combo) => values.map((v) => ({ ...combo, [axis]: v }))),
    [{}],
  );
}

function matches(when, combo) {
  return Object.entries(when ?? {}).every(([axis, value]) =>
    (Array.isArray(value) ? value : [value]).includes(combo[axis]));
}

function exists(parts, id, combo) {
  for (let p = id; p !== undefined; p = parts[p].parent) {
    if (!matches(parts[p].when, combo)) return false;
  }
  return true;
}

function rowFor(rows, part, property, combo) {
  return rows.find((r) => r.part === part && r.property === property && matches(r.when, combo));
}

function checkOverlaps(rows, parts, combos, error) {
  const reported = new Set();
  for (const combo of combos) {
    for (const part of Object.keys(parts)) {
      if (!exists(parts, part, combo)) continue;
      for (const property of Object.keys(PROPERTIES)) {
        const hits = rows.filter((r) => r.part === part && r.property === property && matches(r.when, combo));
        const key = `${part}.${property}`;
        if (hits.length > 1 && !reported.has(key)) {
          reported.add(key);
          error(key, `同じ条件に複数の指定がある（${describe(combo)}）。whenを重ならないようにする`);
        }
      }
    }
  }
}

function describe(combo) {
  const entries = Object.entries(combo);
  return entries.length ? entries.map(([a, v]) => `${a}=${v}`).join("; ") : "条件なし";
}

function checkContrastPairs(rows, parts, combos, ctx) {
  const { error, resolve, surfaces, contrastPairs } = ctx;
  const missing = new Set();
  const checkedForegrounds = new Set([...contrastPairs].map((key) => key.split(" on ")[0]));
  const transparent = (token) => ["light", "dark"].some((t) => (resolve(token, t)?.alpha ?? 1) === 0);

  // The backgrounds a part is drawn on: its own or an ancestor's opaque background, else the page surfaces.
  const backgroundsOf = (part, combo) => {
    for (let p = part; p !== undefined; p = parts[p].parent) {
      const row = rowFor(rows, p, "background", combo);
      if (row && !transparent(row.token)) return [row.token];
    }
    return surfaces;
  };
  // WCAG exempts disabled controls; a part dimmed by opacity is treated as disabled.
  const dimmed = (part, combo) => {
    for (let p = part; p !== undefined; p = parts[p].parent) {
      if (rowFor(rows, p, "opacity", combo)) return true;
    }
    return false;
  };

  for (const combo of combos) {
    for (const part of Object.keys(parts)) {
      if (!exists(parts, part, combo) || dimmed(part, combo)) continue;
      const color = rowFor(rows, part, "color", combo);
      if (color) for (const bg of backgroundsOf(part, combo)) need(color.token, bg);

      // A border is checked only when its color is listed as a foreground in contrast.json,
      // which marks it as a boundary that must stay visible (an input's edge, not a divider).
      const border = rowFor(rows, part, "borderColor", combo);
      if (border && checkedForegrounds.has(border.token)) {
        for (const bg of backgroundsOf(parts[part].parent, combo)) need(border.token, bg);
      }

      const outline = rowFor(rows, part, "outlineColor", combo);
      if (outline) {
        const offset = rowFor(rows, part, "outlineOffset", combo);
        const inside = offset && (resolve(offset.token, "light")?.value ?? 0) < 0;
        const bgs = inside ? backgroundsOf(part, combo) : backgroundsOf(parts[part].parent, combo);
        for (const bg of bgs) need(outline.token, bg);
      }
    }
  }
  for (const key of missing) error(key, "この組み合わせが使われるが、contrast.jsonにない。pairsに追加する");

  function need(fg, bg) {
    const key = `${fg} on ${bg}`;
    if (!contrastPairs.has(key)) missing.add(key);
  }
}
