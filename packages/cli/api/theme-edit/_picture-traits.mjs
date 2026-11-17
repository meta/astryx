// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Measure a look's traits from a picture's pixels, deterministically:
 * the boxes it draws (height, corners, edge width and contrast, fill or
 * gradient, shadow) and its text (size, leading, weight). No recognition of
 * what the picture shows: boxes are grouped by their measured shape only,
 * and every value says where it was read and how sure it is.
 * @position api/theme-edit — pure helpers for `experimental theme editor how <picture.png>`
 */

/** @typedef {{width: number, height: number, rgba: Uint8Array}} Picture */

/**
 * @typedef {object} Box
 * @property {number} id its fill surface
 * @property {number} x left edge, outer
 * @property {number} y top edge, outer
 * @property {number} w outer width
 * @property {number} h outer height
 * @property {number} edge edge (border) width in pixels
 * @property {string | null} edgeColor
 * @property {string} fill the fill color, or the top stop of a gradient
 * @property {{direction: 'vertical' | 'horizontal', stops: string[]} | null} gradient
 * @property {number} radius corner radius in pixels
 * @property {boolean} round whether the corners are half the height (a pill or circle)
 * @property {'none' | 'soft' | 'hard'} shadow
 * @property {boolean} bevel light top-left edge and dark bottom-right edge
 * @property {string} outside the color around the box
 * @property {'centered' | 'start' | 'none'} text where its text sits
 */

/** Neighbouring pixels this close (per channel, 0–255) are one surface. */
const SAME = 6;

/** A surface smaller than this many pixels on a side is never a box. */
const LEAST_SIDE = 8;

/** @param {number} v */
const hx = v => Math.round(v).toString(16).padStart(2, '0');

/**
 * The picture's colors over white, one byte per channel.
 * @param {Picture} pic
 */
function flatten(pic) {
  const n = pic.width * pic.height;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = pic.rgba[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++)
      rgb[i * 3 + c] = Math.round(pic.rgba[i * 4 + c] * a + 255 * (1 - a));
  }
  return rgb;
}

/**
 * The surfaces of a picture: neighbouring pixels within SAME of each other,
 * joined (a gradient is one surface; an edge, a glyph or its antialiasing is
 * not part of the surface around it).
 * @param {Uint8Array} rgb
 * @param {number} W
 * @param {number} H
 */
function surfaces(rgb, W, H) {
  const parent = new Int32Array(W * H);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  /** @param {number} i */
  const find = i => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  /** @param {number} a @param {number} b */
  const near = (a, b) =>
    Math.abs(rgb[a * 3] - rgb[b * 3]) <= SAME &&
    Math.abs(rgb[a * 3 + 1] - rgb[b * 3 + 1]) <= SAME &&
    Math.abs(rgb[a * 3 + 2] - rgb[b * 3 + 2]) <= SAME;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x && near(i, i - 1)) {
        const a = find(i), b = find(i - 1);
        if (a !== b) parent[a] = b;
      }
      if (y && near(i, i - W)) {
        const a = find(i), b = find(i - W);
        if (a !== b) parent[a] = b;
      }
    }
  const label = new Int32Array(W * H);
  /** @type {Map<number, number>} */
  const ids = new Map();
  /** @type {Array<{x0: number, y0: number, x1: number, y1: number, n: number, r: number, g: number, b: number, solid: boolean}>} */
  const stats = [];
  for (let i = 0; i < W * H; i++) {
    const root = find(i);
    let id = ids.get(root);
    if (id === undefined) {
      id = stats.length;
      ids.set(root, id);
      stats.push({x0: W, y0: H, x1: -1, y1: -1, n: 0, r: 0, g: 0, b: 0, solid: false});
    }
    label[i] = id;
    const s = stats[id];
    const x = i % W, y = (i - x) / W;
    if (x < s.x0) s.x0 = x;
    if (x > s.x1) s.x1 = x;
    if (y < s.y0) s.y0 = y;
    if (y > s.y1) s.y1 = y;
    s.n++;
    s.r += rgb[i * 3];
    s.g += rgb[i * 3 + 1];
    s.b += rgb[i * 3 + 2];
  }
  return {label, stats};
}

/**
 * Distance between two colors, the largest channel difference.
 * @param {ArrayLike<number>} a @param {number} ai @param {ArrayLike<number>} b @param {number} bi
 */
const dist = (a, ai, b, bi) =>
  Math.max(
    Math.abs(a[ai] - b[bi]),
    Math.abs(a[ai + 1] - b[bi + 1]),
    Math.abs(a[ai + 2] - b[bi + 2]),
  );

/** @param {ArrayLike<number>} rgb @param {number} i */
const hexAt = (rgb, i) => `#${hx(rgb[i * 3])}${hx(rgb[i * 3 + 1])}${hx(rgb[i * 3 + 2])}`;

/** @param {ArrayLike<number>} c */
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Relative luminance per WCAG, of a #rrggbb color.
 * @param {string} hex
 */
function luminance(hex) {
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = v.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}

/** WCAG contrast of two #rrggbb colors. @param {string} a @param {string} b */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Measure every box in a picture.
 * @param {Picture} pic
 * @returns {{boxes: Box[], pageId: number, page: string, rgb: Uint8Array, label: Int32Array, stats: ReturnType<typeof surfaces>['stats']}}
 */
export function measureBoxes(pic) {
  const W = pic.width, H = pic.height;
  const rgb = flatten(pic);
  const {label, stats} = surfaces(rgb, W, H);
  let pageId = 0;
  for (let i = 1; i < stats.length; i++) if (stats[i].n > stats[pageId].n) pageId = i;
  const ps = stats[pageId];
  const page = `#${hx(ps.r / ps.n)}${hx(ps.g / ps.n)}${hx(ps.b / ps.n)}`;
  // A surface something can sit on: the page, or a fill (most of its bounds).
  for (let i = 0; i < stats.length; i++) {
    const o = stats[i];
    o.solid = i === pageId || o.n >= 0.45 * (o.x1 - o.x0 + 1) * (o.y1 - o.y0 + 1);
  }
  /** @param {number} x @param {number} y */
  const at = (x, y) => y * W + x;
  /** @type {Box[]} */
  const boxes = [];
  for (let id = 0; id < stats.length; id++) {
    if (id === pageId) continue;
    const s = stats[id];
    const w = s.x1 - s.x0 + 1, h = s.y1 - s.y0 + 1;
    if (w < LEAST_SIDE || h < LEAST_SIDE) continue;
    // A fill: most of its bounds is the surface (text holes allowed);
    // an edge ring or a glyph is mostly empty.
    if (s.n < 0.45 * w * h) continue;
    // A fill as wide as the picture's own edge rows is the page's band, read
    // as a bar still.
    const box = readBox(id, s, rgb, label, stats, W, H, at);
    if (box) boxes.push(box);
  }
  return {boxes, pageId, page, rgb, label, stats};
}

/**
 * Walk out from a fill's edge to the surface around it: the edge width is
 * the pixels between, the outside is the first surface whose bounds hold
 * the fill grown by that step.
 * @param {number} id
 * @param {{x0: number, y0: number, x1: number, y1: number}} s
 * @param {Int32Array} label
 * @param {ReturnType<typeof surfaces>['stats']} stats
 * @param {number} W @param {number} H
 * @param {(x: number, y: number) => number} at
 * @param {number} sx start x (on the fill) @param {number} sy start y @param {number} dx @param {number} dy
 */
function walkOut(id, s, label, stats, W, H, at, sx, sy, dx, dy) {
  let x = sx, y = sy;
  // From the fill's last pixel on this line.
  while (true) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return {edge: 0, outside: -1, last: at(x, y), first: -1};
    if (label[at(nx, ny)] !== id) break;
    x = nx;
    y = ny;
  }
  for (let k = 1; k <= 8; k++) {
    const px = x + dx * k, py = y + dy * k;
    if (px < 0 || py < 0 || px >= W || py >= H) return {edge: k - 1, outside: -1, last: at(x, y), first: k > 1 ? at(x + dx, y + dy) : -1};
    const o = stats[label[at(px, py)]];
    // One past the step: an edge ring's bounds end exactly at its step.
    const grow = k + 1;
    // (An edge grid shared with neighbours is not a surface to sit on.)
    const holds =
      o.solid &&
      o.x0 <= s.x0 - grow && o.y0 <= s.y0 - grow && o.x1 >= s.x1 + grow && o.y1 >= s.y1 + grow;
    if (holds) return {edge: k - 1, outside: at(px, py), last: at(x, y), first: k > 1 ? at(x + dx, y + dy) : -1};
  }
  return null;
}

/**
 * @param {number} id
 * @param {ReturnType<typeof surfaces>['stats'][number]} s
 * @param {Uint8Array} rgb @param {Int32Array} label
 * @param {ReturnType<typeof surfaces>['stats']} stats
 * @param {number} W @param {number} H @param {(x: number, y: number) => number} at
 * @returns {Box | null}
 */
function readBox(id, s, rgb, label, stats, W, H, at) {
  const mx = (s.x0 + s.x1) >> 1, my = (s.y0 + s.y1) >> 1;
  // Each side from the middle of the fill outward along its own row or column.
  const sides = {
    top: walkOut(id, s, label, stats, W, H, at, mx, s.y0 + 1, 0, -1),
    bottom: walkOut(id, s, label, stats, W, H, at, mx, s.y1 - 1, 0, 1),
    left: walkOut(id, s, label, stats, W, H, at, s.x0 + 1, my, -1, 0),
    right: walkOut(id, s, label, stats, W, H, at, s.x1 - 1, my, 1, 0),
  };
  if (!sides.top || !sides.bottom || !sides.left || !sides.right) return null;
  const t = sides.top, b = sides.bottom, l = sides.left, r = sides.right;
  // An edge drawn on every side; a bottom or right side wider than the
  // rest is a shadow there, not edge (a top highlight is the box's own).
  const usual = Math.ceil(median([t.edge, b.edge, l.edge, r.edge]));
  for (const o of [b, r]) if (o.edge > usual) o.edge = usual;
  const x = s.x0 - l.edge, y = s.y0 - t.edge;
  const w = s.x1 + r.edge - x + 1, h = s.y1 + b.edge - y + 1;
  const outside_ = [t, b, l, r].map(o => o.outside).find(o => o >= 0) ?? -1;
  if (outside_ < 0) return null;
  const outI = outside_ * 3;
  const outside = hexAt(rgb, outside_);
  const edge = usual;
  const edgeColor = edge && l.first >= 0 ? hexAt(rgb, l.first) : null;
  // Light top-left edge and dark bottom-right: a bevel.
  /** @param {{first: number, last: number}} o how much lighter its edge is than the fill next to it */
  const lift = o => (o.first >= 0 ? lum(rgb.subarray(o.first * 3)) - lum(rgb.subarray(o.last * 3)) : 0);
  const bevel = [t, l].every(o => lift(o) > 12) && [b, r].every(o => lift(o) < -12);
  // The box's outermost color at the middle of its left side.
  const edgeI = (edge && l.first >= 0 ? l.first : l.last) * 3;
  const reach = dist(rgb, edgeI, rgb, outI);
  // How far each side's own outermost color is from the outside.
  const sideReach = [t, b, l, r].map(o => dist(rgb, (o.first >= 0 ? o.first : o.last) * 3, rgb, outI));
  const radius = reach < 10 ? 0 : cornerRadius(rgb, label, W, x, y, w, h, outside_, sideReach);
  return {
    id,
    x,
    y,
    w,
    h,
    edge,
    edgeColor,
    fill: `#${hx(s.r / s.n)}${hx(s.g / s.n)}${hx(s.b / s.n)}`,
    gradient: gradientOf(id, s, rgb, label, W),
    radius,
    round: radius >= h / 2 - 1,
    shadow: shadowBelow(rgb, W, H, x, y + h, w, outI),
    bevel,
    outside,
    text: textPlace(id, s, label, W),
  };
}

/**
 * The corner radius from the area each corner leaves out: a quarter circle of
 * radius r leaves r²(1 − π/4) of its square empty.
 * @param {Uint8Array} rgb @param {number} W
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Int32Array} label
 * @param {number} outAt the index of a pixel of the outside surface
 * @param {number[]} sideReach how far each side's own color (top, bottom, left, right) is from the outside
 */
function cornerRadius(rgb, label, W, x, y, w, h, outAt, sideReach) {
  const most = Math.floor(Math.min(w, h) / 2);
  const out = label[outAt];
  const [top, bottom, left, right] = sideReach;
  const corners = [
    [x, y, 1, 1, Math.max(top, left)],
    [x + w - 1, y, -1, 1, Math.max(top, right)],
    [x, y + h - 1, 1, -1, Math.max(bottom, left)],
    [x + w - 1, y + h - 1, -1, -1, Math.max(bottom, right)],
  ];
  const radii = corners.map(([cx, cy, sx, sy, full]) => {
    // Each row in from the outer side up to the first pixel the box covers:
    // the empty share of the pixels passed is that row's inset. Inner
    // pixels are never read, so a fill the color of the page does not count.
    let missing = 0;
    let still = 0;
    for (let k = 0; k < most; k++) {
      let inset = 0;
      for (let i = 0; i < most; i++) {
        const j = (cy + sy * k) * W + cx + sx * i;
        if (label[j] === out) {
          inset++;
          continue;
        }
        // The first pixel off the outside: as empty as it is nearer the
        // outside than the box's own edge color (or the pixel after it).
        const here = dist(rgb, j * 3, rgb, outAt * 3);
        const next = dist(rgb, (j + sx) * 3, rgb, outAt * 3);
        inset += 1 - here / Math.max(here, next, full, 1);
        break;
      }
      missing += inset;
      if (inset < 0.05) {
        if (++still >= 2) break;
      } else still = 0;
    }
    return Math.sqrt(missing / (1 - Math.PI / 4));
  });
  radii.sort((a, b) => a - b);
  // The two middle corners, so one corner touching a neighbour is outvoted.
  return Math.round(((radii[1] + radii[2]) / 2) * 2) / 2;
}

/**
 * A fill's gradient: its own pixels down three columns (or across three rows),
 * top fifth against bottom fifth. Text pixels are not the fill, so they never count.
 * @param {number} id
 * @param {ReturnType<typeof surfaces>['stats'][number]} s
 * @param {Uint8Array} rgb @param {Int32Array} label @param {number} W
 * @returns {Box['gradient']}
 */
function gradientOf(id, s, rgb, label, W) {
  const w = s.x1 - s.x0 + 1, h = s.y1 - s.y0 + 1;
  /** @param {boolean} down */
  const run = down => {
    const len = down ? h : w;
    const across = down ? w : h;
    const sums = Array.from({length: len}, () => [0, 0, 0, 0]);
    for (const f of [0.2, 0.5, 0.8]) {
      const c = Math.floor(across * f);
      for (let k = 0; k < len; k++) {
        const px = down ? s.x0 + c : s.x0 + k;
        const py = down ? s.y0 + k : s.y0 + c;
        const i = py * W + px;
        if (label[i] !== id) continue;
        sums[k][0] += rgb[i * 3];
        sums[k][1] += rgb[i * 3 + 1];
        sums[k][2] += rgb[i * 3 + 2];
        sums[k][3]++;
      }
    }
    const part = (/** @type {number} */ a, /** @type {number} */ b) => {
      const t = [0, 0, 0, 0];
      for (let k = a; k < b; k++) for (let c = 0; c < 4; c++) t[c] += sums[k][c];
      return t[3] ? [t[0] / t[3], t[1] / t[3], t[2] / t[3]] : null;
    };
    const fifth = Math.max(1, Math.floor(len / 5));
    const first = part(0, fifth), last = part(len - fifth, len), mid = part((len - fifth) >> 1, ((len - fifth) >> 1) + fifth);
    if (!first || !last || !mid) return null;
    const d = Math.max(...[0, 1, 2].map(c => Math.abs(first[c] - last[c])));
    // Monotone: the middle lies between the ends.
    const between = lum(mid) >= Math.min(lum(first), lum(last)) - 2 && lum(mid) <= Math.max(lum(first), lum(last)) + 2;
    return d >= 10 && between ? {d, stops: [first, last].map(c => `#${c.map(hx).join('')}`)} : null;
  };
  if (h < LEAST_SIDE) return null;
  const v = run(true), hz = run(false);
  if (v && (!hz || v.d >= hz.d)) return {direction: 'vertical', stops: v.stops};
  if (hz) return {direction: 'horizontal', stops: hz.stops};
  return null;
}

/**
 * The shadow under a box: how the color below its bottom edge, down the
 * middle column, differs from the outside color.
 * @param {Uint8Array} rgb @param {number} W @param {number} H
 * @param {number} x @param {number} below the row under the box @param {number} w @param {number} outI
 * @returns {Box['shadow']}
 */
function shadowBelow(rgb, W, H, x, below, w, outI) {
  const out = lum(rgb.subarray(outI, outI + 3));
  const steps = [];
  for (let k = 0; k < 10 && below + k < H; k++) {
    let sum = 0;
    for (const f of [0.3, 0.5, 0.7]) {
      const i = ((below + k) * W + x + Math.floor(w * f)) * 3;
      sum += out - lum(rgb.subarray(i, i + 3));
    }
    steps.push(sum / 3);
  }
  if (!steps.length || steps[0] < 3) return 'none';
  const deep = steps.findIndex(d => d < 1.5);
  const reach = deep < 0 ? steps.length : deep;
  // A hard shadow holds its darkness then stops; a soft one fades.
  const holds = reach >= 2 && steps[reach - 1] > steps[0] * 0.7;
  return holds ? 'hard' : 'soft';
}

/**
 * Where a box's text sits: the holes in its fill, left gap against right gap.
 * @param {number} id
 * @param {ReturnType<typeof surfaces>['stats'][number]} s
 * @param {Int32Array} label @param {number} W
 * @returns {Box['text']}
 */
function textPlace(id, s, label, W) {
  let lo = Infinity, hi = -Infinity;
  for (let y = s.y0 + 2; y <= s.y1 - 2; y++)
    for (let x = s.x0 + 2; x <= s.x1 - 2; x++)
      if (label[y * W + x] !== id) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
  if (hi < 0) return 'none';
  const left = lo - s.x0, right = s.x1 - hi;
  return Math.abs(left - right) <= Math.max(3, 0.15 * (s.x1 - s.x0)) ? 'centered' : 'start';
}

/**
 * @typedef {object} TextLine
 * @property {number} x left of its first glyph
 * @property {number} y top of its tallest glyphs
 * @property {number} w
 * @property {number} baseline the row its glyphs stand on
 * @property {number} tall pixels from its tallest glyphs' top to the baseline
 * @property {number} xHeight pixels from its short glyphs' top to the baseline
 * @property {number} stem the common stroke width in pixels
 * @property {number} glyphs how many glyph shapes it has
 * @property {string} ink its text color
 * @property {string} on the color behind it
 */

/** A surface this small is a glyph's core or its antialiasing, never a fill. */
const GLYPH_MOST = 600;

/**
 * Read the text lines of a picture: glyph shapes (small surfaces, joined),
 * set on a common baseline. Heights count a row only where the ink covers at
 * least half, so antialiasing does not add a pixel.
 * @param {Picture} pic
 * @param {{rgb: Uint8Array, label: Int32Array, stats: ReturnType<typeof surfaces>['stats']}} read from measureBoxes
 * @param {Set<number>} fills the surfaces text sits on (the page and the boxes read as parts)
 * @returns {TextLine[]}
 */
export function measureText(pic, {rgb, label, stats}, fills) {
  const W = pic.width, H = pic.height;
  const n = W * H;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = stats[label[i]];
    // Small surfaces that are no box's fill (a glyph's core or its
    // antialiasing; a large letter's core too).
    if (s.n <= 10 * GLYPH_MOST && !fills.has(label[i]) && s.y1 - s.y0 < 100 && s.x1 - s.x0 < 160) ink[i] = 1;
  }
  // Glyph shapes: ink pixels joined with their eight neighbours.
  const seen = new Int32Array(n).fill(-1);
  /** @type {Array<{x0: number, y0: number, x1: number, y1: number, px: number[]}>} */
  const blobs = [];
  const stack = [];
  for (let i = 0; i < n; i++) {
    if (!ink[i] || seen[i] >= 0) continue;
    const b = {x0: W, y0: H, x1: -1, y1: -1, px: /** @type {number[]} */ ([])};
    seen[i] = blobs.length;
    stack.push(i);
    while (stack.length) {
      const j = /** @type {number} */ (stack.pop());
      const x = j % W, y = (j - x) / W;
      b.px.push(j);
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (ink[k] && seen[k] < 0) {
            seen[k] = blobs.length;
            stack.push(k);
          }
        }
    }
    blobs.push(b);
  }
  /** @type {Array<{x0: number, x1: number, top: number, bottom: number, stem: number, inkI: number, bgI: number}>} */
  const glyphs = [];
  for (const b of blobs) {
    const h = b.y1 - b.y0 + 1, w = b.x1 - b.x0 + 1;
    if (h < 4 || h > 80 || w > 4 * h || b.px.length < 6) continue;
    // The color behind: the surface just left of the shape, mid-height.
    const my = (b.y0 + b.y1) >> 1;
    const bx = Math.max(0, b.x0 - 1);
    const bgI = my * W + bx;
    if (ink[bgI]) continue;
    let far = 0, inkI = b.px[0];
    for (const j of b.px) {
      const d = dist(rgb, j * 3, rgb, bgI * 3);
      if (d > far) {
        far = d;
        inkI = j;
      }
    }
    if (far < 40) continue;
    // Rows where the ink covers at least half; the stroke width from the
    // shape's inked area against its outline (a stroke of width w and
    // length L has area wL and outline about 2L), so it reads below a pixel.
    const id = seen[b.px[0]];
    /** @param {number} j */
    const cover = j => (seen[j] === id ? Math.min(1, dist(rgb, j * 3, rgb, bgI * 3) / far) : 0);
    let top = -1, bottom = -1, area = 0, outline = 0;
    for (let y = b.y0; y <= b.y1; y++) {
      let any = false;
      for (let x = b.x0; x <= b.x1; x++) {
        const j = y * W + x;
        const c = cover(j);
        area += c;
        if (c < 0.5) continue;
        any = true;
        if (x === b.x0 || cover(j - 1) < 0.5) outline++;
        if (x === b.x1 || cover(j + 1) < 0.5) outline++;
        if (y === b.y0 || cover(j - W) < 0.5) outline++;
        if (y === b.y1 || cover(j + W) < 0.5) outline++;
      }
      if (any) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top < 0 || !outline) continue;
    glyphs.push({x0: b.x0, x1: b.x1, top, bottom, stem: (2 * area) / outline, inkI, bgI});
  }
  // Lines: glyphs whose bottoms agree, near each other along the row.
  glyphs.sort((a, c) => a.bottom - c.bottom || a.x0 - c.x0);
  /** @type {Array<typeof glyphs>} */
  const groups = [];
  for (const g of glyphs) {
    const h = g.bottom - g.top + 1;
    const line = groups.find(l => {
      const last = l[l.length - 1];
      return Math.abs(last.bottom - g.bottom) <= 0 && l.some(o => g.x0 - o.x1 <= Math.max(h, o.bottom - o.top + 1) && o.x0 - g.x1 <= Math.max(h, o.bottom - o.top + 1));
    });
    if (line) line.push(g);
    else groups.push([g]);
  }
  /** @type {TextLine[]} */
  const lines = [];
  for (const l of groups) {
    if (l.length < 3) continue;
    const heights = l.map(g => g.bottom - g.top + 1).sort((a, c) => a - c);
    // Short glyphs (x-height) are the most common height; tall ones stand
    // well above them. The shortest tall glyph is the capital height (an
    // ascender may rise a little past it).
    const xHeight = mode(heights);
    const talls = heights.filter(v => v >= xHeight * 1.2);
    const tall = talls.length ? talls[0] : heights[heights.length - 1];
    const x0 = Math.min(...l.map(g => g.x0)), x1 = Math.max(...l.map(g => g.x1));
    lines.push({
      x: x0,
      y: l[0].bottom - tall + 1,
      w: x1 - x0 + 1,
      baseline: l[0].bottom,
      tall,
      xHeight,
      stem: median(l.map(g => g.stem)),
      glyphs: l.length,
      ink: hexAt(rgb, l[0].inkI),
      on: hexAt(rgb, l[0].bgI),
    });
  }
  return lines.sort((a, c) => a.baseline - c.baseline || a.x - c.x);
}

/** The most common value, the smaller on a tie. @param {number[]} values */
function mode(values) {
  /** @type {Map<number, number>} */
  const n = new Map();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * @typedef {object} Trait
 * @property {string} trait what it is ("corners", "height", "edges", ...)
 * @property {string} on the part-map group it was read on, or "theme"
 * @property {string} value the measured value as the CLI takes it
 * @property {string} read where it was read and from how many
 * @property {'sure' | 'about'} sure
 * @property {{verb: 'set', thing: string, value: string, on?: string}} step the setting that makes it
 */

/**
 * @typedef {object} Unsure
 * @property {string} trait
 * @property {string} on
 * @property {string} why what was seen and why it is not written
 * @property {string[]} [options] commands that would make it on one part, never run for you
 */

/**
 * The cap height of the common sans, serif and mono faces as a share of the
 * font size (Helvetica, Arial, Roboto, Times, Courier all sit at 0.66–0.73).
 * Text size is read from it, so it is "about": a face outside that range
 * reads a pixel or two off.
 */
const CAP_SHARE = 0.72;

/** @param {number[]} v */
const median = v => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Where in the picture boxes sit, in words.
 * @param {Array<{x: number, y: number, w: number, h: number}>} items
 * @param {number} W @param {number} H
 */
function whereIn(items, W, H) {
  const cx = items.reduce((a, b) => a + b.x + b.w / 2, 0) / items.length / W;
  const cy = items.reduce((a, b) => a + b.y + b.h / 2, 0) / items.length / H;
  return `${cy < 0.33 ? 'top' : cy > 0.67 ? 'bottom' : 'middle'}${cx < 0.33 ? '-left' : cx > 0.67 ? '-right' : ''}`;
}

/**
 * The value most of the items agree on (within `near`), with how many agree:
 * their most common value (whole-pixel readings), or with `median` their
 * middle one (half-pixel readings that scatter around the true value).
 * @param {number[]} values @param {number} near @param {(v: number[]) => number} [middle]
 */
function agreed(values, near, middle = mode) {
  let best = {value: 0, n: 0};
  for (const v of values) {
    const close = values.filter(o => Math.abs(o - v) <= near);
    if (close.length > best.n) best = {value: middle(close), n: close.length};
  }
  return best;
}

/** @param {string} hex */
function chroma(hex) {
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...v) - Math.min(...v);
}

/**
 * A step as the command words after the prefix, for the theme `my`.
 * @param {Trait['step']} st
 */
function stepText(st) {
  const v = /^[\w.%-]+$/.test(st.value) ? st.value : `"${st.value}"`;
  return `set my ${st.thing} ${v}${st.on ? ` --on ${st.on}` : ''}`;
}

/**
 * The pixel density a PNG says it was saved at: 2 for a 144-dpi (Retina)
 * screenshot, 1 for 72 or 96 dpi or when it names none.
 * @param {Buffer} bytes
 */
export function pixelScale(bytes) {
  let at = 8;
  while (at + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (type === 'pHYs' && len >= 9 && bytes[at + 16] === 1) {
      const perMeter = bytes.readUInt32BE(at + 8);
      // Screenshots mark 72 dpi per screen pixel (a Mac's 1x), so 144 dpi is
      // a 2x picture; 96 dpi, a Windows 1x, still rounds to 1.
      return Math.max(1, Math.round((perMeter * 0.0254) / 72));
    }
    if (type === 'IDAT' || type === 'IEND') break;
    at += 12 + len;
  }
  return 1;
}

/**
 * Measure a picture's look as traits on the part map's groups. Boxes are
 * sorted into groups by their measured shape only: small squares are checks,
 * control-sized boxes with centred text are button-like, with text at the
 * start (or none) inputs, big panels containers. A trait is written only
 * where enough boxes agree; the rest is named with what was seen.
 * @param {Picture} pic
 * @param {number} [scale] picture pixels per CSS pixel
 * @returns {{traits: Trait[], unsure: Unsure[], scale: number, boxes: number, lines: number}}
 */
export function readTraits(pic, scale = 1) {
  const read = measureBoxes(pic);
  const W = pic.width, H = pic.height;
  const px = (/** @type {number} */ v) => Math.round((v / scale) * 2) / 2;
  // Corners as whole pixels.
  const cornerPx = (/** @type {number} */ v) => Math.round(v / scale);
  /** @type {Record<string, Box[]>} */
  const groups = {checks: [], 'button-like': [], inputs: [], containers: []};
  for (const b of read.boxes) {
    if (b.w <= 22 * scale && b.h <= 22 * scale && Math.abs(b.w - b.h) <= 1) {
      // A check box is square with square-ish corners and a thin edge; a
      // round one is a radio or a letter's counter, not read.
      if (!b.round && b.edge <= 2 * scale && b.w >= 10 * scale) groups.checks.push(b);
    }
    else if (b.w >= 0.9 * W) continue;
    // (A control holds text, or is an empty field far wider than tall; a
    // solid shape with neither is a letter's core.)
    else if (b.h >= 16 * scale && b.h <= 64 * scale && b.w >= 1.2 * b.h && b.w <= 12 * b.h && (b.text !== 'none' || b.w >= 5 * b.h))
      groups[b.text === 'centered' ? 'button-like' : 'inputs'].push(b);
    else if (b.h > 64 * scale && b.w >= 120 * scale) groups.containers.push(b);
  }
  const lines = measureText(pic, read, new Set([read.pageId, ...Object.values(groups).flat().map(b => b.id)]));
  /** @type {Trait[]} */
  const traits = [];
  /** @type {Unsure[]} */
  const unsure = [];
  /**
   * A trait from the boxes that agree, or named when too few do.
   * @param {string} trait @param {string} on @param {Box[]} boxes
   * @param {(b: Box) => number} of @param {number} near
   * @param {(v: number) => Trait['step'] | null} step
   * @param {(v: number) => string} show
   * @param {(v: number[]) => number} [middle]
   */
  const fromBoxes = (trait, on, boxes, of, near, step, show, middle = mode) => {
    if (!boxes.length) return;
    const a = agreed(boxes.map(of), near * scale, middle);
    const where = whereIn(boxes, W, H);
    if (a.n >= 2 && a.n >= boxes.length * 0.6) {
      const st = step(a.value);
      if (st)
        traits.push({
          trait,
          on,
          value: show(a.value),
          read: `${a.n} of ${boxes.length} ${on} boxes (${where})`,
          sure: a.n >= 3 ? 'sure' : 'about',
          step: st,
        });
    } else
      unsure.push({
        trait,
        on,
        why: `${boxes.length} ${on} box${boxes.length > 1 ? 'es' : ''} (${where}) read ${[...new Set(boxes.map(b => show(of(b))))].join(', ')}: too few agree to write it`,
      });
  };
  const controls = [...groups['button-like'], ...groups.inputs];
  // Height of controls: the whole theme's control size when buttons and
  // inputs agree; else the buttons' is the theme's and the inputs' their own.
  const heightStep = (/** @type {number} */ v) => ({verb: /** @type {const} */ ('set'), thing: '--size-element-md', value: `${px(v)}px`});
  const tall = agreed(controls.map(b => b.h), 1 * scale);
  if (controls.length && tall.n >= controls.length * 0.6)
    fromBoxes('height', 'button-like', controls, b => b.h, 1, heightStep, v => `${px(v)}px`);
  else {
    fromBoxes('height', 'button-like', groups['button-like'], b => b.h, 1, heightStep, v => `${px(v)}px`);
    fromBoxes('height', 'inputs', groups.inputs, b => b.h, 1, v => ({verb: 'set', thing: 'height', value: `${px(v)}px`, on: 'inputs'}), v => `${px(v)}px`);
  }
  // Corners: controls and inputs together when they agree, else apart.
  const cornerOf = (/** @type {Box} */ b) => (b.round ? Infinity : b.radius);
  const cornerStep = (/** @type {string} */ on, /** @type {string | null} */ token) => (/** @type {number} */ v) =>
    v === Infinity
      ? {verb: /** @type {const} */ ('set'), thing: 'corners', value: 'pill', ...(on === 'theme' ? {} : {on})}
      : token
        ? {verb: /** @type {const} */ ('set'), thing: token, value: `${cornerPx(v)}px`}
        : {verb: /** @type {const} */ ('set'), thing: 'corners', value: `${cornerPx(v)}px`, on};
  const showCorner = (/** @type {number} */ v) => (v === Infinity ? 'pill' : `${cornerPx(v)}px`);
  const both = agreed(controls.map(cornerOf), 1 * scale);
  if (controls.length && both.n >= controls.length * 0.6 && both.value !== Infinity)
    fromBoxes('corners', 'button-like', controls, cornerOf, 1, cornerStep('theme', '--radius-element'), showCorner, median);
  else {
    fromBoxes('corners', 'button-like', groups['button-like'], cornerOf, 1, cornerStep('button-like', null), showCorner, median);
    fromBoxes('corners', 'inputs', groups.inputs, cornerOf, 1, cornerStep('inputs', null), showCorner, median);
  }
  fromBoxes('corners', 'containers', groups.containers, cornerOf, 1, cornerStep('containers', '--radius-container'), showCorner, median);
  fromBoxes('corners', 'checks', groups.checks, cornerOf, 1, cornerStep('checks', null), showCorner, median);
  // Edge width: inputs always draw one when the look has edges.
  const edged = groups.inputs.length >= 2 ? groups.inputs : controls;
  fromBoxes('edges', edged === controls ? 'button-like' : 'inputs', edged, b => b.edge, 0, v => ({verb: 'set', thing: '--border-width', value: `${px(v)}px`}), v => `${px(v)}px`);
  // Checks size.
  fromBoxes('height', 'checks', groups.checks, b => b.h, 1, v => ({verb: 'set', thing: 'height', value: `${px(v)}px`, on: 'checks'}), v => `${px(v)}px`);
  // Surfaces: how containers sit on the page.
  const surfaceOf = (/** @type {Box} */ b) => (b.shadow !== 'none' ? 2 : b.edge > 0 ? 1 : 0);
  const SURFACE = ['flat', 'outlined', 'raised'];
  fromBoxes('surfaces', 'containers', groups.containers, surfaceOf, 0, v => ({verb: 'set', thing: 'surfaces', value: SURFACE[v]}), v => SURFACE[v]);
  // Accent: the fill of the most colorful button-like boxes.
  const colorful = groups['button-like'].filter(b => chroma(b.gradient ? b.gradient.stops[1] : b.fill) >= 60);
  if (colorful.length) {
    const fills = colorful.map(b => (b.gradient ? b.gradient.stops[1] : b.fill));
    /** @type {Map<string, number>} */
    const n = new Map();
    for (const f of fills) n.set(f, (n.get(f) ?? 0) + 1);
    const [top, count] = [...n].sort((a, b) => b[1] - a[1])[0];
    if (count >= 2)
      traits.push({trait: 'color', on: 'button-like', value: top, read: `${count} of ${groups['button-like'].length} button-like boxes, the colorful ones (${whereIn(colorful, W, H)})`, sure: count >= 3 ? 'sure' : 'about', step: {verb: 'set', thing: 'accent', value: top}});
  }
  // Gradients and bevels: seen, named, never written (no group setting draws them).
  const graded = controls.filter(b => b.gradient);
  if (graded.length >= 2) {
    const g = /** @type {NonNullable<Box['gradient']>} */ (graded[0].gradient);
    unsure.push({
      trait: 'gradient',
      on: 'button-like',
      why: `${graded.length} of ${controls.length} control boxes draw a ${g.direction} gradient (one reads ${g.stops.join(' to ')}); no group setting draws gradients yet, so set it on the parts you want`,
      options: [`set my background "linear-gradient(${g.direction === 'vertical' ? 'to bottom' : 'to right'}, ${g.stops.join(', ')})" --on button`],
    });
  }
  const beveled = read.boxes.filter(b => b.bevel);
  if (beveled.length >= 2)
    unsure.push({trait: 'bevel', on: 'button-like', why: `${beveled.length} boxes draw a light top-left edge and a dark bottom-right edge (a bevel); no setting draws a bevel yet`});
  const shadowed = controls.filter(b => b.shadow !== 'none');
  if (shadowed.length >= 2)
    unsure.push({trait: 'shadow', on: 'button-like', why: `${shadowed.length} of ${controls.length} control boxes cast a ${shadowed[0].shadow} shadow`});
  // Text.
  const sized = lines.map(l => ({...l, size: Math.round(l.tall / CAP_SHARE / scale)}));
  if (sized.length) {
    /** @type {Map<number, number>} */
    const weight = new Map();
    for (const l of sized) weight.set(l.size, (weight.get(l.size) ?? 0) + l.glyphs);
    const [body, bodyGlyphs] = [...weight].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const total = sized.reduce((a, l) => a + l.glyphs, 0);
    const bodyLines = sized.filter(l => l.size === body);
    // The size is read from the capital height, which fonts and their
    // pixel snapping vary by a pixel or so: named with the command, not written.
    if (bodyGlyphs >= total * 0.3 && bodyLines.length >= 2 && body >= 10 && body <= 32)
      unsure.push({
        trait: 'type',
        on: 'theme',
        why: `body text reads about ${body}px (±1px, from the capital height of ${bodyLines.length} lines); faces differ by a pixel, so check it against the picture`,
        options: [`set my text-size ${body}`],
      });
    else unsure.push({trait: 'type', on: 'theme', why: `text reads at ${[...weight.keys()].sort((a, b) => a - b).map(v => `${v}px`).join(', ')} with no clear body size`});
    // Leading: baselines of stacked lines at the same left edge and size.
    /** @type {number[]} */
    const pitches = [];
    // Only wrapped prose: a line at least 30 body sizes long, the next one
    // at its left edge, no further down than twice the text size.
    for (const l of bodyLines) {
      if (l.w < 30 * body * scale) continue;
      const next = bodyLines.find(o => o !== l && Math.abs(o.x - l.x) <= 2 * scale && o.baseline > l.baseline && o.baseline - l.baseline <= 2 * body * scale);
      if (next) pitches.push((next.baseline - l.baseline) / scale);
    }
    const p = agreed(pitches, 1);
    if (p.n >= 1 && p.n >= pitches.length * 0.6 && p.value >= body)
      traits.push({
        trait: 'leading',
        on: 'theme',
        value: (p.value / body).toFixed(4).replace(/0+$/, ''),
        read: `${p.n + 1} stacked lines of body text, ${p.value}px apart`,
        sure: p.n >= 2 ? 'sure' : 'about',
        step: {verb: 'set', thing: '--text-body-leading', value: (p.value / body).toFixed(4).replace(/0+$/, '')},
      });
    else unsure.push({trait: 'leading', on: 'theme', why: 'no wrapped paragraph to measure line spacing from; a single line shows no leading'});
    // Headings: weight from stroke against height.
    const heads = sized.filter(l => l.size >= body * 1.25 && l.tall >= 12 * scale && l.size <= 72 && l.xHeight < l.tall);
    if (heads.length) {
      // Stroke width (area against outline, which reads thin on curves)
      // as a share of the text size: regular text reads under 0.085, bold
      // from 0.1. Semibold, bold and heavy read alike, so only a clearly
      // regular weight is written; a heavier one is named.
      const share = median(heads.map(l => l.stem / (l.tall / CAP_SHARE)));
      const sizes = [...new Set(heads.map(l => l.size))].sort((a, b) => b - a).map(v => `${v}px`).join(', ');
      if (heads.length >= 2 && share < 0.085)
        traits.push({trait: 'headings', on: 'theme', value: 'regular', read: `${heads.length} heading lines at ${sizes}, from stroke width against height`, sure: heads.length >= 3 ? 'sure' : 'about', step: {verb: 'set', thing: 'headings', value: 'regular'}});
      else
        unsure.push({
          trait: 'headings',
          on: 'theme',
          why: `${heads.length} heading line${heads.length > 1 ? 's' : ''} at ${sizes} read ${share >= 0.1 ? 'heavy (semibold to heavy, which a picture does not tell apart)' : 'between regular and semibold'}`,
          options: share >= 0.1 ? ['set my headings semibold', 'set my headings bold', 'set my headings heavy'] : ['set my headings medium'],
        });
    }
  }
  // Controls are told apart from badges and tags only by seeing more than
  // one kind of them (buttons with labels and inputs with text at the
  // start); a picture with one kind (a crop of badges) writes no control
  // trait and says why.
  const kinds = ['button-like', 'inputs'].filter(g => groups[g].length).length;
  if (kinds < 2)
    for (const t of traits.filter(x => x.on === 'button-like' || x.on === 'inputs')) {
      traits.splice(traits.indexOf(t), 1);
      unsure.push({
        trait: t.trait,
        on: t.on,
        why: `${t.read} read ${t.value}, but only one kind of control shows, so this crop cannot tell controls from badges; send a full page`,
        options: [stepText(t.step)],
      });
    }
  unsure.push({trait: 'font', on: 'theme', why: 'the typeface is not read from pictures; set the family you want with `set my font`'});
  return {traits, unsure, scale, boxes: read.boxes.length, lines: lines.length};
}
