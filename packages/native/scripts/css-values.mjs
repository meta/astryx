// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scripts/css-values.mjs
 * @input One resolved CSS token value for one mode (core's resolver output)
 * @output A static value Swift can hold: a color as 8-bit sRGB or Display P3
 *   channels, a length in points, a font weight, a line-height multiplier, or
 *   shadow layers. A conversion that loses something records a note; a value
 *   with no static form throws CssValueError.
 * @position The value half of the Swift theme generator spec
 *   (specs/swift/theme-generator.spec.md, G7 and G15). It reads CSS only;
 *   swift-ios-theme.mjs decides what a note or an error does to the run.
 *
 * SYNC: When modified, update this header and G7 in the theme generator spec.
 */

/**
 * A value the generator cannot convert. `reason` says why, in plain words;
 * `hasNoStaticForm` is true when CSS itself gives the value no static form
 * (G7's list), and false when it is a form the generator does not read.
 */
export class CssValueError extends Error {
  constructor(reason, {hasNoStaticForm = false} = {}) {
    super(reason);
    this.hasNoStaticForm = hasNoStaticForm;
  }
}
const fail = reason => {
  throw new CssValueError(reason);
};
const noStaticForm = reason => {
  throw new CssValueError(reason, {hasNoStaticForm: true});
};

export const ROOT_FONT_SIZE = 16;

/** The warning for a color outside Display P3, clipped as browsers draw it. */
export const OUTSIDE_P3 = 'outside Display P3; clipped to match the web';

const REC2020_ALPHA = 1.09929682680944;
const REC2020_BETA = 0.018053968510807;

// ---------------------------------------------------------------------------
// Mode: light-dark() anywhere in a value
// ---------------------------------------------------------------------------

/** Index of the `)` that closes the `(` at `open`, or -1. */
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Splits at top-level commas. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/**
 * The value in one mode: every `light-dark(a, b)`, at any depth, becomes `a`
 * in light and `b` in dark.
 */
export function valueForMode(value, mode) {
  const re = /light-dark\(/gi;
  let out = '';
  let from = 0;
  let m;
  while ((m = re.exec(value))) {
    const open = m.index + m[0].length - 1;
    const close = closing(value, open);
    if (close === -1) fail('it has an unclosed light-dark()');
    const sides = splitTopLevel(value.slice(open + 1, close));
    if (sides.length !== 2) fail('light-dark() needs exactly two values');
    out +=
      value.slice(from, m.index) +
      valueForMode(sides[mode === 'dark' ? 1 : 0], mode);
    from = close + 1;
    re.lastIndex = from;
  }
  return out + value.slice(from);
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
const IDENT = /^-?-?[a-z_][\w-]*/i;

/**
 * A CSS value as tokens: `{t:'num', v, u}`, `{t:'id', v}`, `{t:'hash', v}`,
 * `{t:'fn', name, body}`, and `,` `/` `+` `-` `*` as `{t:'op', v}`.
 */
function tokenize(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const c = text[i];
    let m;
    if (/\s/.test(c)) {
      i++;
    } else if (
      (m = NUMBER.exec(rest)) &&
      // A sign right after a value is a calc() operator, not part of a number.
      !(
        /^[+-]/.test(c) &&
        out.at(-1)?.t !== 'op' &&
        /\S/.test(text[i - 1] ?? ' ')
      )
    ) {
      i += m[0].length;
      const unit = /^(%|[a-z]+)/i.exec(text.slice(i));
      const u = unit ? unit[1].toLowerCase() : '';
      i += u.length;
      out.push({t: 'num', v: parseFloat(m[0]), u});
    } else if ((m = IDENT.exec(rest))) {
      i += m[0].length;
      if (text[i] === '(') {
        const close = closing(text, i);
        if (close === -1) fail(`it has an unclosed ${m[0]}()`);
        const name = m[0].toLowerCase();
        const inner = text.slice(i + 1, close);
        // Strings inside var(), env() and url() are not values to tokenize.
        const opaque = /^(var|env|attr|url)$/.test(name);
        out.push({t: 'fn', name, body: opaque ? inner : tokenize(inner)});
        i = close + 1;
      } else {
        out.push({t: 'id', v: m[0].toLowerCase()});
      }
    } else if (c === '#') {
      m = /^#([0-9a-z]+)/i.exec(rest) ?? fail(`"${rest}" is not CSS`);
      i += m[0].length;
      out.push({t: 'hash', v: m[1]});
    } else if (c === '(') {
      const close = closing(text, i);
      if (close === -1) fail('it has an unclosed (');
      out.push({t: 'fn', name: '', body: tokenize(text.slice(i + 1, close))});
      i = close + 1;
    } else if (',/+-*'.includes(c)) {
      // calc() reads + and - as operators only with a space on each side.
      const spaced =
        /\s/.test(text[i - 1] ?? ' ') && /\s/.test(text[i + 1] ?? ' ');
      out.push({t: 'op', v: c, spaced});
      i++;
    } else {
      fail(`"${c}" is not part of a value Swift can read`);
    }
  }
  return out;
}

/** Splits tokens at `,`. */
function commas(tokens) {
  const parts = [[]];
  for (const tok of tokens) {
    if (tok.t === 'op' && tok.v === ',') parts.push([]);
    else parts[parts.length - 1].push(tok);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Numbers and math functions
// ---------------------------------------------------------------------------

const LENGTH_UNITS = {
  px: 1,
  rem: ROOT_FONT_SIZE,
  em: ROOT_FONT_SIZE,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};
const ANGLE_UNITS = {deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360};
const CONTEXT_UNITS = {
  '%': 'a percentage depends on the box it is used in',
  vh: 'viewport units depend on the screen',
  vw: 'viewport units depend on the screen',
  vmin: 'viewport units depend on the screen',
  vmax: 'viewport units depend on the screen',
  ex: 'font-relative units depend on the font in use',
  ch: 'font-relative units depend on the font in use',
  lh: 'font-relative units depend on the font in use',
};

/**
 * A number with its kind: `number`, `length` (px), `angle` (deg), or
 * `percent`. `vars` names channel keywords in relative colors.
 */
function quantity(tok, vars, notes, em = null) {
  if (tok.t === 'num') {
    if (tok.u === '') return {v: tok.v, k: 'number'};
    if (tok.u === '%') return {v: tok.v, k: 'percent'};
    if (tok.u in LENGTH_UNITS) {
      if (tok.u === 'em') {
        if (em != null) return {v: tok.v * em, k: 'length'};
        if (tok.v !== 0) {
          notes.push(`em read against the ${ROOT_FONT_SIZE}px root font size`);
        }
      }
      return {v: tok.v * LENGTH_UNITS[tok.u], k: 'length'};
    }
    if (tok.u in ANGLE_UNITS)
      return {v: tok.v * ANGLE_UNITS[tok.u], k: 'angle'};
    const context =
      CONTEXT_UNITS[tok.u] ??
      (/^(d|s|l)?v(h|w|i|b|min|max)$|^cq/.test(tok.u)
        ? 'viewport and container units depend on the screen'
        : /^r?(ex|ch|ic|cap|lh)$/.test(tok.u)
          ? 'font-relative units depend on the font in use'
          : null);
    if (context) noStaticForm(context);
    fail(`"${tok.u}" is not a unit Swift can read`);
  }
  if (tok.t === 'id') {
    if (vars && tok.v in vars) {
      const v = vars[tok.v];
      return {v: Number.isNaN(v) ? 0 : v, k: 'number'};
    }
    if (tok.v === 'pi') return {v: Math.PI, k: 'number'};
    if (tok.v === 'e') return {v: Math.E, k: 'number'};
  }
  if (tok.t === 'fn') return dynamic(tok) ?? math(tok, vars, notes, em);
  return dynamic(tok) ?? fail(`"${show(tok)}" is not a number`);
}

/** Evaluates calc(), min(), max(), clamp(), or a bare ( ) group. */
function math(tok, vars, notes, em) {
  const args = commas(tok.body).map(part => sum(part, vars, notes, em));
  const same = () => {
    const kinds = new Set(args.map(a => a.k));
    if (kinds.size > 1) fail(`${tok.name}() mixes ${[...kinds].join(' and ')}`);
    return args[0].k;
  };
  switch (tok.name) {
    case '':
    case 'calc':
      if (args.length !== 1) fail(`${tok.name || '( )'} takes one expression`);
      return args[0];
    case 'min':
    case 'max':
      return {v: Math[tok.name](...args.map(a => a.v)), k: same()};
    case 'clamp':
      if (args.length !== 3) fail('clamp() takes three values');
      return {
        v: Math.max(args[0].v, Math.min(args[1].v, args[2].v)),
        k: same(),
      };
    default:
      return fail(`${tok.name}() is not a function Swift can read`);
  }
}

/** `+ -` over `* /` over quantities, as calc() reads them. */
function sum(tokens, vars, notes, em) {
  if (!tokens.length) fail('an expression is empty');
  let i = 0;
  const product = () => {
    let left = quantity(tokens[i++], vars, notes, em);
    while (tokens[i]?.t === 'op' && '*/'.includes(tokens[i].v)) {
      const op = tokens[i++].v;
      const right = quantity(
        tokens[i++] ?? fail('an expression ends early'),
        vars,
        notes,
        em,
      );
      if (op === '*') {
        if (left.k !== 'number' && right.k !== 'number') {
          fail('calc() multiplies two dimensions');
        }
        left = {v: left.v * right.v, k: left.k === 'number' ? right.k : left.k};
      } else {
        if (right.k !== 'number' || right.v === 0) {
          fail('calc() divides by a dimension or by zero');
        }
        left = {v: left.v / right.v, k: left.k};
      }
    }
    return left;
  };
  let total = product();
  while (i < tokens.length) {
    const op = tokens[i++];
    if (op.t !== 'op' || !'+-'.includes(op.v))
      fail('calc() is missing an operator');
    if (!op.spaced) fail(`calc() needs a space on each side of ${op.v}`);
    const right = product();
    if (right.k !== total.k)
      noStaticForm(`calc() adds ${total.k} and ${right.k}`);
    total = {
      v: op.v === '+' ? total.v + right.v : total.v - right.v,
      k: total.k,
    };
  }
  return total;
}

/**
 * Fails when a font-family value has no static form (G7): a CSS-wide keyword,
 * or `var()`, `env()`, or `attr()` outside a quoted name. A CSS-wide keyword
 * as one name in a list is not valid CSS, so it fails too.
 */
export function checkFamilyIsStatic(value) {
  const bare = value
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .trim()
    .toLowerCase();
  if (/^(inherit|initial|unset|revert|revert-layer)$/.test(bare))
    noStaticForm(`${bare} depends on where the token is used`);
  const page = /\b(env|attr)\(/.exec(bare);
  if (page) noStaticForm(`${page[1]}() is known only on the page`);
  const unresolved = /\bvar\(([^)]*)\)/.exec(bare);
  if (unresolved)
    noStaticForm(`var(${unresolved[1]}) is not a token core's resolver knows`);
  const listed = bare
    .split(',')
    .map(name => name.trim())
    .find(name => /^(inherit|initial|unset|revert|revert-layer)$/.test(name));
  if (listed) fail(`${listed} cannot be one name in a font-family list`);
}

/** The reason a token can only be known where it is used, or null. */
function dynamic(tok) {
  if (tok.t === 'fn' && tok.name === 'var') {
    return noStaticForm(
      `var(${tok.body}) is not a token core's resolver knows`,
    );
  }
  if (tok.t === 'fn' && /^(env|attr)$/.test(tok.name)) {
    return noStaticForm(`${tok.name}() is known only on the page`);
  }
  if (
    tok.t === 'id' &&
    /^(inherit|initial|unset|revert|revert-layer)$/.test(tok.v)
  ) {
    return noStaticForm(`${tok.v} depends on where the token is used`);
  }
  return null;
}

const show = tok =>
  tok.t === 'num'
    ? `${tok.v}${tok.u}`
    : tok.t === 'hash'
      ? `#${tok.v}`
      : tok.t === 'fn'
        ? `${tok.name}()`
        : tok.v;

// ---------------------------------------------------------------------------
// Lengths, weights, line heights
// ---------------------------------------------------------------------------

/** One quantity from a whole value. */
function single(value, notes, em = null) {
  const tokens = tokenize(value);
  if (tokens.length !== 1) fail(`"${value}" is not one value`);
  return quantity(tokens[0], null, notes, em);
}

const BORDER_KEYWORDS = {thin: 1, medium: 3, thick: 5};

/**
 * A length in points: px × 1, rem and em × 16, pt × 4/3, math over them.
 * `thin`, `medium`, and `thick` are lengths only for a border width.
 */
export function toPoints(value, notes = [], {borderWidth = false} = {}) {
  const v = value.trim().toLowerCase();
  if (v in BORDER_KEYWORDS) {
    if (borderWidth) return BORDER_KEYWORDS[v];
    fail(`${v} names a border width; here it has no length`);
  }
  const q = single(value, notes);
  if (q.k === 'percent') noStaticForm(CONTEXT_UNITS['%']);
  if (q.k !== 'length' && q.k !== 'number') fail(`a ${q.k} is not a length`);
  return q.v;
}

/** A font weight from 1 to 1000; `normal` 400, `bold` 700. */
export function toWeight(value, notes = []) {
  const v = value.trim().toLowerCase();
  if (v === 'normal') return 400;
  if (v === 'bold') return 700;
  if (v === 'bolder' || v === 'lighter') {
    notes.push(`${v} read against normal (400), the root's inherited weight`);
    return v === 'bolder' ? 700 : 100;
  }
  const q = single(value, notes);
  if (q.k !== 'number' || q.v < 1 || q.v > 1000) {
    fail('a font weight is a number from 1 to 1000');
  }
  return q.v;
}

/**
 * A line height as a multiplier of the font size: a number as is, a
 * percentage ÷ 100, a length ÷ `fontSize` (points), so an `em` counts
 * against the style's own size. `normal` depends on the font, so it reads as
 * 1.2 with a note.
 */
export function toLeading(value, fontSize, notes = []) {
  if (value.trim().toLowerCase() === 'normal') {
    notes.push('normal depends on the font; read as 1.2');
    return 1.2;
  }
  const q = single(value, notes, fontSize || null);
  if (q.k === 'number') return q.v;
  if (q.k === 'percent') return q.v / 100;
  if (q.k === 'length') {
    if (!fontSize) fail("a length line height needs its style's font size");
    return Number((q.v / fontSize).toPrecision(12));
  }
  return fail(`a ${q.k} is not a line height`);
}

// ---------------------------------------------------------------------------
// Color spaces
// ---------------------------------------------------------------------------

const mul = (m, [a, b, c]) => m.map(r => r[0] * a + r[1] * b + r[2] * c);
const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const D65_TO_D50 = [
  [1.0479297925449969, 0.022946870601609652, -0.05019226628920524],
  [0.02962780877005599, 0.9904344267538799, -0.017073799063418826],
  [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371],
];
const D50_TO_D65 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const sign = (c, f) => (c < 0 ? -f(-c) : f(c));
const SRGB_TRC = {
  toLinear: c =>
    sign(c, x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)),
  fromLinear: c =>
    sign(c, x => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)),
};
const LINEAR = {toLinear: c => c, fromLinear: c => c};

// RGB spaces: transfer function, linear → XYZ matrix, its inverse, and the
// white point the matrix lands on (CSS Color 4, section 18).
const RGB_SPACES = {
  srgb: {
    trc: SRGB_TRC,
    white: 'd65',
    toXYZ: [
      [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
      [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
      [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
    ],
    fromXYZ: [
      [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
      [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
      [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
    ],
  },
  'display-p3': {
    trc: SRGB_TRC,
    white: 'd65',
    toXYZ: [
      [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
      [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
      [0, 0.04511338185890264, 1.043944368900976],
    ],
    fromXYZ: [
      [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
      [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
      [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
    ],
  },
  'a98-rgb': {
    trc: {
      toLinear: c => sign(c, x => x ** (563 / 256)),
      fromLinear: c => sign(c, x => x ** (256 / 563)),
    },
    white: 'd65',
    toXYZ: [
      [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
      [0.29734497525053605, 0.6273635662554661, 0.0752914584939978],
      [0.02703136138641234, 0.07068885253582723, 0.9913375368376388],
    ],
    fromXYZ: [
      [2.0415879038107465, -0.5650069742788596, -0.34473135077832956],
      [-0.9692436362808795, 1.8759675015077202, 0.04155505740717557],
      [0.013444280632031142, -0.11836239223101838, 1.0151749943912054],
    ],
  },
  'prophoto-rgb': {
    trc: {
      toLinear: c => sign(c, x => (x <= 16 / 512 ? x / 16 : x ** 1.8)),
      fromLinear: c => sign(c, x => (x >= 1 / 512 ? x ** (1 / 1.8) : 16 * x)),
    },
    white: 'd50',
    toXYZ: [
      [0.7977666449006423, 0.13518129740053308, 0.0313477341283922],
      [0.2880748288194013, 0.711835234241873, 0.00008993693872564],
      [0, 0, 0.8251046025104602],
    ],
    fromXYZ: [
      [1.3457868816471583, -0.25557208737979464, -0.05110186497554526],
      [-0.5446307051249019, 1.5082477428451468, 0.02052744743642139],
      [0, 0, 1.2119675456389452],
    ],
  },
  rec2020: {
    // The BT.2020 piecewise curve, as Chromium draws rec2020; CSS Color 4
    // specifies a 2.4 gamma.
    trc: {
      toLinear: c =>
        sign(c, x =>
          x < REC2020_BETA * 4.5
            ? x / 4.5
            : ((x + REC2020_ALPHA - 1) / REC2020_ALPHA) ** (1 / 0.45),
        ),
      fromLinear: c =>
        sign(c, x =>
          x > REC2020_BETA
            ? REC2020_ALPHA * x ** 0.45 - (REC2020_ALPHA - 1)
            : x * 4.5,
        ),
    },
    white: 'd65',
    toXYZ: [
      [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
      [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
      [0, 0.028072693049087428, 1.060985057710791],
    ],
    fromXYZ: [
      [1.716651187971268, -0.355670783776392, -0.25336628137366],
      [-0.666684351832489, 1.616481236634939, 0.0157685458139111],
      [0.017639857445311, -0.042770613257809, 0.942103121235474],
    ],
  },
};
RGB_SPACES['srgb-linear'] = {...RGB_SPACES.srgb, trc: LINEAR};
const XYZ_TO_LMS = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const LMS_TO_OKLAB = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204858, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const LMS_TO_XYZ = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const OKLAB_TO_LMS = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];
const KAPPA = 24389 / 27;
const EPSILON = 216 / 24389;

const toPolar = ([l, a, b], powerless) => {
  const c = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [l, c, c < powerless ? NaN : h];
};
const fromPolar = ([l, c, h]) => {
  const r = ((Number.isNaN(h) ? 0 : h) * Math.PI) / 180;
  return [l, c * Math.cos(r), c * Math.sin(r)];
};

function hslToSrgb([h, s, l]) {
  const hue = Number.isNaN(h) ? 0 : ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const f = n => {
    const k = (n + hue / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
function srgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = NaN;
  let s = 0;
  if (d > 1e-7) {
    s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
    h =
      (max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4) * 60;
  }
  return [h, s * 100, l * 100];
}
function hwbToSrgb([h, w, b]) {
  w /= 100;
  b /= 100;
  if (w + b >= 1) return [w / (w + b), w / (w + b), w / (w + b)];
  return hslToSrgb([h, 100, 50]).map(c => c * (1 - w - b) + w);
}
function srgbToHwb(rgb) {
  const [h] = srgbToHsl(rgb);
  const w = Math.min(...rgb);
  const b = 1 - Math.max(...rgb);
  return [w + b >= 1 - 1e-7 ? NaN : h, w * 100, b * 100];
}

/** XYZ (D65) from coordinates in `space`; a missing coordinate counts as 0. */
function toXYZ(space, coords) {
  const c = coords.map(v => (Number.isNaN(v) ? 0 : v));
  if (space in RGB_SPACES) {
    const s = RGB_SPACES[space];
    const xyz = mul(s.toXYZ, c.map(s.trc.toLinear));
    return s.white === 'd50' ? mul(D50_TO_D65, xyz) : xyz;
  }
  switch (space) {
    case 'xyz':
    case 'xyz-d65':
      return c;
    case 'xyz-d50':
      return mul(D50_TO_D65, c);
    case 'hsl':
      return toXYZ('srgb', hslToSrgb(c));
    case 'hwb':
      return toXYZ('srgb', hwbToSrgb(c));
    case 'lch':
      return toXYZ('lab', fromPolar(c));
    case 'oklch':
      return toXYZ('oklab', fromPolar(c));
    case 'lab': {
      const [l, a, b] = c;
      const f1 = (l + 16) / 116;
      const f0 = a / 500 + f1;
      const f2 = f1 - b / 200;
      const xyz = [
        f0 ** 3 > EPSILON ? f0 ** 3 : (116 * f0 - 16) / KAPPA,
        l > KAPPA * EPSILON ? f1 ** 3 : l / KAPPA,
        f2 ** 3 > EPSILON ? f2 ** 3 : (116 * f2 - 16) / KAPPA,
      ].map((v, i) => v * D50_WHITE[i]);
      return mul(D50_TO_D65, xyz);
    }
    case 'oklab':
      return mul(
        LMS_TO_XYZ,
        mul(OKLAB_TO_LMS, c).map(v => v ** 3),
      );
    default:
      return fail(`"${space}" is not a color space`);
  }
}

/** Coordinates in `space` from XYZ (D65). */
function fromXYZ(space, xyz) {
  if (space in RGB_SPACES) {
    const s = RGB_SPACES[space];
    const v = s.white === 'd50' ? mul(D65_TO_D50, xyz) : xyz;
    return mul(s.fromXYZ, v).map(s.trc.fromLinear);
  }
  switch (space) {
    case 'xyz':
    case 'xyz-d65':
      return xyz;
    case 'xyz-d50':
      return mul(D65_TO_D50, xyz);
    case 'hsl':
      return srgbToHsl(fromXYZ('srgb', xyz));
    case 'hwb':
      return srgbToHwb(fromXYZ('srgb', xyz));
    case 'lch':
      return toPolar(fromXYZ('lab', xyz), 0.0015);
    case 'oklch':
      return toPolar(fromXYZ('oklab', xyz), 0.000004);
    case 'lab': {
      const f = mul(D65_TO_D50, xyz)
        .map((v, i) => v / D50_WHITE[i])
        .map(v => (v > EPSILON ? Math.cbrt(v) : (KAPPA * v + 16) / 116));
      return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
    }
    case 'oklab':
      return mul(LMS_TO_OKLAB, mul(XYZ_TO_LMS, xyz).map(Math.cbrt));
    default:
      return fail(`"${space}" is not a color space`);
  }
}

// Analogous components carry a missing (`none`) value across spaces in
// color-mix(), as CSS Color 4 section 12.2 says.
// Reds, greens, and blues include X, Y, and Z; HSL lightness is a lightness;
// HWB's whiteness and blackness have no analog.
const ANALOGOUS = {
  hsl: ['hue', 'colorfulness', 'lightness'],
  hwb: ['hue', null, null],
  lab: ['lightness', 'opponentA', 'opponentB'],
  oklab: ['lightness', 'opponentA', 'opponentB'],
  lch: ['lightness', 'colorfulness', 'hue'],
  oklch: ['lightness', 'colorfulness', 'hue'],
};
const analog = space => ANALOGOUS[space] ?? ['reds', 'greens', 'blues'];

/** A color `{space, coords, alpha}` converted to `space`. */
function convert(color, space) {
  if (color.space === space) return color;
  const coords = fromXYZ(space, toXYZ(color.space, color.coords));
  const from = analog(color.space);
  const to = analog(space);
  color.coords.forEach((v, i) => {
    const at = from[i] ? to.indexOf(from[i]) : -1;
    if (Number.isNaN(v) && at !== -1) coords[at] = NaN;
  });
  return {space, coords, alpha: color.alpha};
}

// ---------------------------------------------------------------------------
// Color syntax
// ---------------------------------------------------------------------------

// Every CSS named color (CSS Color 4, section 6.1), as 6-digit hex.
const NAMED = Object.fromEntries(
  'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32'
    .split(' ')
    .reduce(
      (pairs, word, i, all) => (i % 2 ? pairs : [...pairs, [word, all[i + 1]]]),
      [],
    ),
);
const SYSTEM_COLORS = new Set(
  'accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext'.split(
    ' ',
  ),
);

/** sRGB from hex digits. */
function fromHex(digits) {
  let h = digits;
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  if (h.length === 6) h += 'ff';
  if (h.length !== 8 || /[^0-9a-f]/i.test(h))
    fail(`#${digits} is not a hex color`);
  const n = [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  return {space: 'srgb', coords: n.slice(0, 3), alpha: n[3]};
}

// Channels per color function: [keyword, value of 100%, kind]. `hue` reads
// angles; `clamp` holds a channel in range as CSS does at parse time.
const CHANNELS = {
  rgb: {
    space: 'srgb',
    scale: 1 / 255,
    ch: [
      ['r', 255],
      ['g', 255],
      ['b', 255],
    ],
    clamp: [0, 255],
  },
  hsl: {
    space: 'hsl',
    ch: [
      ['h', 0, 'hue'],
      ['s', 100],
      ['l', 100],
    ],
  },
  hwb: {
    space: 'hwb',
    ch: [
      ['h', 0, 'hue'],
      ['w', 100],
      ['b', 100],
    ],
  },
  lab: {
    space: 'lab',
    ch: [
      ['l', 100],
      ['a', 125],
      ['b', 125],
    ],
  },
  lch: {
    space: 'lch',
    ch: [
      ['l', 100],
      ['c', 150],
      ['h', 0, 'hue'],
    ],
  },
  oklab: {
    space: 'oklab',
    ch: [
      ['l', 1],
      ['a', 0.4],
      ['b', 0.4],
    ],
  },
  oklch: {
    space: 'oklch',
    ch: [
      ['l', 1],
      ['c', 0.4],
      ['h', 0, 'hue'],
    ],
  },
};
CHANNELS.rgba = CHANNELS.rgb;
CHANNELS.hsla = CHANNELS.hsl;
const COLOR_FN_SPACES = new Set([
  ...Object.keys(RGB_SPACES),
  'xyz',
  'xyz-d50',
  'xyz-d65',
]);

/** One channel: a number, percentage, angle, `none`, keyword, or math. */
function channel(tok, [, full, kind], vars, notes) {
  if (tok.t === 'id' && tok.v === 'none') return NaN;
  const q = quantity(tok, vars, notes);
  if (q.k === 'percent')
    return kind === 'hue'
      ? fail('a hue is not a percentage')
      : (q.v / 100) * full;
  if (q.k === 'angle')
    return kind === 'hue' ? q.v : fail('only a hue takes an angle');
  if (q.k !== 'number') fail(`a ${q.k} is not a color channel`);
  return q.v;
}

/** Alpha from a token: a number or percentage, held in 0…1. */
function alphaOf(tok, vars, notes) {
  if (tok.t === 'id' && tok.v === 'none') return NaN;
  const v = channel(tok, ['alpha', 1], vars, notes);
  return Math.min(1, Math.max(0, v));
}

/** Channel keyword values of a relative color's origin, in the function's terms. */
function originVars(fn, origin, names) {
  const coords = convert(origin, fn.space).coords.map(v => v / (fn.scale ?? 1));
  return Object.fromEntries([
    ...names.map((n, i) => [n, coords[i]]),
    ['alpha', origin.alpha],
  ]);
}

/** A color function: rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), color(). */
function colorFunction(tok, notes) {
  let body = tok.body;
  let origin = null;
  if (body[0]?.t === 'id' && body[0].v === 'from') {
    origin = parseColor(body[1] ?? fail('from needs a color'), notes);
    body = body.slice(2);
  }
  let fn = CHANNELS[tok.name];
  if (tok.name === 'color') {
    const space = body[0]?.t === 'id' ? body[0].v : null;
    if (!COLOR_FN_SPACES.has(space))
      fail(`color(${space ?? ''}) is not a color space Swift can read`);
    const names = space.startsWith('xyz') ? ['x', 'y', 'z'] : ['r', 'g', 'b'];
    fn = {space, ch: names.map(n => [n, 1])};
    body = body.slice(1);
  }
  const names = fn.ch.map(c => c[0]);
  const vars = origin ? originVars(fn, origin, names) : null;
  let parts = body;
  let alphaTok = null;
  const legacy = !origin && body.some(t => t.t === 'op' && t.v === ',');
  if (legacy) {
    parts = commas(body).map(p =>
      p.length === 1
        ? p[0]
        : fail(`${tok.name}() has an empty or doubled value`),
    );
    checkCommaSyntax(tok.name, parts);
    if (parts.length === 4) alphaTok = parts.pop();
  } else {
    const slash = body.findIndex(t => t.t === 'op' && t.v === '/');
    if (slash !== -1) {
      if (slash !== body.length - 2)
        fail(`${tok.name}() needs one alpha after /`);
      alphaTok = body[slash + 1];
      parts = body.slice(0, slash);
    }
  }
  if (parts.length !== 3) fail(`${tok.name}() needs three channels`);
  let coords = parts.map((p, i) => channel(p, fn.ch[i], vars, notes));
  // A relative color keeps its origin's gamut, so only literal channels clamp.
  if (fn.clamp && !origin)
    coords = coords.map(v =>
      Number.isNaN(v) ? v : Math.min(fn.clamp[1], Math.max(fn.clamp[0], v)),
    );
  if (fn.scale) coords = coords.map(v => v * fn.scale);
  if (!origin && (fn.space === 'hsl' || fn.space === 'hwb')) {
    // hsl() saturation and lightness clamp at 100%, as browsers read them.
    const capped = i => fn.space === 'hsl' && i > 0;
    coords = coords.map((v, i) =>
      i === 0 ? v : Math.max(0, capped(i) ? Math.min(100, v) : v),
    );
  }
  if (!origin && /^(ok)?l(ab|ch)$/.test(fn.space)) {
    coords[0] = Math.min(fn.ch[0][1], Math.max(0, coords[0]));
    if (fn.space.endsWith('ch')) coords[1] = Math.max(0, coords[1]);
  }
  const alpha = alphaTok ? alphaOf(alphaTok, vars, notes) : (vars?.alpha ?? 1);
  return {space: fn.space, coords, alpha};
}

/**
 * Fails comma-syntax channels CSS does not allow: commas only in `rgb()` and
 * `hsl()` (and their `a` forms), no `none`, `rgb()` channels all numbers or
 * all percentages, and `hsl()` saturation and lightness as percentages.
 */
function checkCommaSyntax(name, parts) {
  if (!/^(rgba?|hsla?)$/.test(name)) fail(`${name}() has no comma syntax`);
  if (parts.some(p => p.t === 'id' && p.v === 'none'))
    fail(`${name}() with commas cannot hold none`);
  const percent = p => p.t === 'num' && p.u === '%';
  const plain = p => p.t === 'num' && p.u === '';
  if (name.startsWith('rgb')) {
    const nums = parts.slice(0, 3).filter(p => p.t === 'num');
    if (!(nums.every(percent) || nums.every(plain)))
      fail(`${name}() with commas takes all numbers or all percentages`);
  } else if (parts.slice(1, 3).some(p => p.t === 'num' && !percent(p))) {
    fail(
      `${name}() with commas takes its saturation and lightness as percentages`,
    );
  }
}

/** The interpolation part of color-mix(): `in <space> [<hue> hue]`. */
const HUE_METHODS = new Set(['shorter', 'longer', 'increasing', 'decreasing']);

/** color-mix(), CSS Color 5 section 3: percentages normalized, alpha premultiplied. */
function colorMix(tok, notes) {
  const parts = commas(tok.body);
  let space = 'oklab';
  let hue = 'shorter';
  if (parts[0][0]?.t === 'id' && parts[0][0].v === 'in') {
    const spec = parts.shift();
    space =
      spec[1]?.t === 'id'
        ? spec[1].v
        : fail('color-mix() needs a space after in');
    if (space === 'xyz-d65') space = 'xyz';
    if (!(
      space in RGB_SPACES ||
      space in ANALOGOUS ||
      space.startsWith('xyz')
    )) {
      fail(`color-mix() cannot interpolate in "${space}"`);
    }
    if (spec.length === 4 && HUE_METHODS.has(spec[2].v) && spec[3].v === 'hue')
      hue = spec[2].v;
    else if (spec.length !== 2)
      fail('color-mix() has an unknown interpolation method');
  }
  if (parts.length !== 2) fail('color-mix() mixes two colors');
  const items = parts.map(p => {
    const pct = p.find(t => t.t === 'num' && t.u === '%');
    const rest = p.filter(t => t !== pct);
    if (rest.length !== 1)
      fail('a color-mix() color is one color and an optional percentage');
    if (pct && (pct.v < 0 || pct.v > 100))
      fail('a color-mix() percentage is from 0% to 100%');
    return {
      color: convert(parseColor(rest[0], notes), space),
      p: pct ? pct.v : null,
    };
  });
  let [p1, p2] = items.map(i => i.p);
  if (p1 == null && p2 == null) [p1, p2] = [50, 50];
  else if (p1 == null) p1 = 100 - p2;
  else if (p2 == null) p2 = 100 - p1;
  const total = p1 + p2;
  if (total === 0) noStaticForm('color-mix() percentages add up to 0%');
  const w = p2 / total;
  const [a, b] = items.map(i => i.color);
  const pick = (x, y) => (Number.isNaN(x) ? y : Number.isNaN(y) ? x : null);
  // A missing alpha takes the other color's before premultiplying.
  const alphaA = Number.isNaN(a.alpha) ? b.alpha : a.alpha;
  const alphaB = Number.isNaN(b.alpha) ? a.alpha : b.alpha;
  const alpha = alphaA * (1 - w) + alphaB * w;
  const [pa, pb] = [alphaA, alphaB].map(v => (Number.isNaN(v) ? 1 : v));
  const unpremultiply = Number.isNaN(alpha) ? 1 : alpha;
  const hueAt = analog(space).indexOf('hue');
  const coords = a.coords.map((x, i) => {
    const y = b.coords[i];
    const missing = pick(x, y);
    if (missing !== null) return missing;
    if (i === hueAt) {
      let [h1, h2] = [x, y].map(h => ((h % 360) + 360) % 360);
      const d = h2 - h1;
      if (hue === 'shorter') d > 180 ? (h1 += 360) : d < -180 && (h2 += 360);
      else if (hue === 'longer')
        d > 0 && d < 180 ? (h1 += 360) : d > -180 && d <= 0 && (h2 += 360);
      else if (hue === 'increasing') h2 < h1 && (h2 += 360);
      else h1 < h2 && (h1 += 360);
      return (h1 * (1 - w) + h2 * w) % 360;
    }
    const premixed = x * pa * (1 - w) + y * pb * w;
    return unpremultiply === 0 ? 0 : premixed / unpremultiply;
  });
  return {space, coords, alpha: alpha * (total < 100 ? total / 100 : 1)};
}

/** A color token as `{space, coords, alpha}`. */
function parseColor(tok, notes) {
  if (tok.t === 'hash') return fromHex(tok.v);
  if (tok.t === 'id') {
    if (tok.v === 'transparent')
      return {space: 'srgb', coords: [0, 0, 0], alpha: 0};
    if (tok.v in NAMED) return fromHex(NAMED[tok.v]);
    if (tok.v === 'currentcolor')
      noStaticForm('currentColor depends on where the token is used');
    if (SYSTEM_COLORS.has(tok.v))
      noStaticForm(`${tok.v} is a system color the browser picks`);
  }
  if (tok.t === 'fn') {
    if (tok.name in CHANNELS || tok.name === 'color')
      return colorFunction(tok, notes);
    if (tok.name === 'color-mix') return colorMix(tok, notes);
  }
  return dynamic(tok) ?? fail(`"${show(tok)}" is not a color`);
}

// ---------------------------------------------------------------------------
// Output gamut (G7)
// ---------------------------------------------------------------------------

const GAMUT_EPSILON = 0.000075;
const inGamut = rgb =>
  rgb.every(c => c >= -GAMUT_EPSILON && c <= 1 + GAMUT_EPSILON);
const clip = rgb => rgb.map(c => Math.min(1, Math.max(0, c)));

const byte = c =>
  Math.round(Math.round(c * 255 * 1e6) / 1e6)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/**
 * A CSS color as 8-bit channels: `#RRGGBBAA` in sRGB when the color is inside
 * sRGB, else `display-p3 #RRGGBBAA` (clipped per channel, with a note, when it
 * is outside Display P3 too). Each channel rounds to the nearest of
 * 256 steps, halves up.
 */
export function toColor(value, notes = []) {
  const tokens = tokenize(value);
  if (tokens.length !== 1) fail(`"${value}" is not one color`);
  return outputColor(parseColor(tokens[0], notes), notes);
}

function outputColor(color, notes) {
  const alpha = Number.isNaN(color.alpha) ? 0 : color.alpha;
  const xyz = toXYZ(color.space, color.coords);
  const srgb = fromXYZ('srgb', xyz);
  if (inGamut(srgb)) return `#${clip(srgb).map(byte).join('')}${byte(alpha)}`;
  const p3 = fromXYZ('display-p3', xyz);
  // Outside Display P3, each channel clips, as Chromium draws the color.
  if (!inGamut(p3)) notes.push(OUTSIDE_P3);
  return `display-p3 #${clip(p3).map(byte).join('')}${byte(alpha)}`;
}

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

/**
 * A `box-shadow` list as layers. A drop layer is `x y [blur [spread]] color`;
 * SwiftUI has no drop spread, so a spread is left out with a note. An inset
 * layer is a ring, `inset 0 0 0 <width> color`; an offset or blurred inset
 * has no SwiftUI form. `none` is no layers.
 */
export function toShadow(value, notes = []) {
  if (value.trim().toLowerCase() === 'none') return [];
  return splitTopLevel(value).map(layer => {
    const lengths = [];
    let colorTok = null;
    let isInset = false;
    for (const tok of tokenize(layer)) {
      // CSS-wide keywords, var(), env(), and attr() have no static form.
      dynamic(tok);
      if (tok.t === 'id' && tok.v === 'inset') isInset = true;
      else if (
        tok.t === 'num' ||
        (tok.t === 'fn' && /^(calc|min|max|clamp)?$/.test(tok.name))
      ) {
        const q = quantity(tok, null, notes);
        if (q.k !== 'length' && !(q.k === 'number' && q.v === 0))
          fail(`shadow layer "${layer}" has a ${q.k} where a length goes`);
        lengths.push(q.v);
      } else if (colorTok) fail(`shadow layer "${layer}" has two colors`);
      else colorTok = tok;
    }
    if (lengths.length < 2 || lengths.length > 4)
      fail(`shadow layer "${layer}" needs two to four lengths`);
    if (!colorTok)
      noStaticForm(
        `shadow layer "${layer}" has no color, so it draws in currentColor`,
      );
    const [x, y, blur = 0, spread = 0] = lengths;
    const color = outputColor(parseColor(colorTok, notes), notes);
    if (isInset) {
      if (x !== 0 || y !== 0 || blur !== 0)
        noStaticForm(
          `inset layer "${layer}" is not a ring; SwiftUI draws only inset rings`,
        );
      return {x, y, blur, spread, isInset, color};
    }
    if (spread !== 0)
      notes.push(`drop layer "${layer}" drawn without its spread`);
    return {x, y, blur, spread: 0, isInset, color};
  });
}
