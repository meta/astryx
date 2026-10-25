// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scripts/swift-ios-theme.mjs
 * @input Any Astryx theme (a defineTheme result), resolved by core's
 *   resolveThemeTokens in light and dark; the published theme packages under
 *   packages/themes/
 * @output apple/Sources/Astryx/Theme/Generated/Tokens.swift (the typed token
 *   surface) and one <SwiftName>Theme.swift per theme declaring
 *   Theme.<swiftName>
 * @position Implements the Swift theme generator spec
 *   (specs/swift/library/theme-generator.md). Run by `generate:swift-ios`; the
 *   Swift output is committed and a test fails when any file drifts.
 *
 * SYNC: When modified, update this header and the theme generator spec.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
export const SWIFT_THEME_DIR = path.join(
  PACKAGE_ROOT,
  'apple',
  'Sources',
  'Astryx',
  'Theme',
  'Generated',
);
export const SWIFT_TOKENS_FILE = path.join(SWIFT_THEME_DIR, 'Tokens.swift');
const THEMES_DIR = path.join(REPO_ROOT, 'packages', 'themes');
const REGENERATE = 'pnpm -F @astryxdesign/native generate:swift-ios';

// G5: the token groups Swift keeps, the elevation shadows included. Everything
// else (inset rings, motion, layout breakpoints) stays out until a component
// needs it.
const KEEP =
  /^--(color-|spacing-|radius-|size-element-|border-width$|font-size-|font-weight-|font-family-|text-(heading-\d|display-\d|body|large|label|supporting|code)-|shadow-(low|med|high)$)/;
const REM = 16;

// Words Swift reserves as identifiers. A member or theme name that equals one
// fails the run (G3, G6).
const SWIFT_KEYWORDS = new Set(
  'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private precedencegroup protocol public rethrows static struct subscript typealias var break case catch continue default defer do else fallthrough for guard if in repeat return throw switch where while as false is nil self Self super throws true try Any Type'.split(
    ' ',
  ),
);

// ---------------------------------------------------------------------------
// Names (G6)
// ---------------------------------------------------------------------------

const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Lower camel case of dash-separated parts; a dash between two digits is `_`. */
function camel(parts) {
  let out = '';
  parts.forEach((part, i) => {
    if (i === 0) {
      out = part;
      return;
    }
    const prev = parts[i - 1];
    if (/\d$/.test(prev) && /^\d/.test(part)) out += `_${part}`;
    else out += capitalize(part);
  });
  return out;
}

/**
 * The group and Swift member for a kept token name (without `--`), per G6.
 * Returns null for a name outside the G5 groups.
 */
export function swiftMember(token) {
  const name = token.replace(/^--/, '');
  let m;
  if ((m = /^color-(.+)$/.exec(name))) {
    return {group: 'color', member: camel(m[1].split('-'))};
  }
  if ((m = /^spacing-(.+)$/.exec(name))) {
    return {group: 'space', member: `s${camel(m[1].split('-'))}`};
  }
  if ((m = /^radius-(.+)$/.exec(name))) {
    return {group: 'radius', member: camel(m[1].split('-'))};
  }
  if ((m = /^size-element-(.+)$/.exec(name))) {
    return {group: 'size', member: camel(['element', ...m[1].split('-')])};
  }
  if (name === 'border-width') return {group: 'size', member: 'borderWidth'};
  // Font tokens group by kind (G6): a type style's size, weight and leading
  // under the style, and the family, size and weight scales under their own.
  if ((m = /^font-(size|weight|family)-(.+)$/.exec(name))) {
    const leaf = camel(m[2].split('-'));
    return {
      group: 'font',
      member: `${m[1]}.${/^\d/.test(leaf) ? `s${leaf}` : leaf}`,
    };
  }
  if ((m = /^text-(.+)-(size|weight|leading)$/.exec(name))) {
    return {group: 'font', member: `${camel(m[1].split('-'))}.${m[2]}`};
  }
  if ((m = /^shadow-(.+)$/.exec(name))) {
    return {group: 'shadow', member: camel(m[1].split('-'))};
  }
  return null;
}

/** A theme's Swift static name, per G3. */
export function swiftThemeName(themeName) {
  if (themeName === 'astryx') return 'default';
  const name = camel(themeName.replace(/^astryx-/, '').split('-'));
  if (!/^[a-z][A-Za-z0-9_]*$/.test(name) || SWIFT_KEYWORDS.has(name)) {
    throw new Error(
      `theme "${themeName}" has no valid Swift name (got "${name}")`,
    );
  }
  return name;
}

const swiftIdent = name => (SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name);

// ---------------------------------------------------------------------------
// Values (G7)
// ---------------------------------------------------------------------------

function hex2(n) {
  return Math.round(n).toString(16).padStart(2, '0').toUpperCase();
}

// The CSS color keywords core's resolved tokens use.
const NAMED_COLORS = {
  black: '#000000FF',
  white: '#FFFFFFFF',
  transparent: '#00000000',
};

/** A CSS color as `#RRGGBBAA`, or null when it is not a plain color. */
export function toHexColor(value) {
  const v = value.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length === 6) h += 'FF';
    return h.length === 8 ? `#${h.toUpperCase()}` : null;
  }
  m =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(
      v,
    );
  if (m) {
    const alpha =
      m[4] === undefined
        ? 1
        : m[4].endsWith('%')
          ? parseFloat(m[4]) / 100
          : parseFloat(m[4]);
    return `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}${hex2(alpha * 255)}`;
  }
  m =
    /^hsla?\(\s*(-?[\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(
      v,
    );
  if (m) {
    // Exact sRGB, then each channel rounded to the nearest of 256 steps,
    // halves up (G7).
    const h = (((+m[1] % 360) + 360) % 360) / 360;
    const sat = +m[2] / 100;
    const l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const channel = t => {
      const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 1 / 2) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    const alpha =
      m[4] === undefined
        ? 1
        : m[4].endsWith('%')
          ? parseFloat(m[4]) / 100
          : parseFloat(m[4]);
    // Round away float noise first so an exact half rounds up.
    const byte = c => hex2(Math.round(c * 255 * 1e6) / 1e6);
    return `#${byte(channel(h + 1 / 3))}${byte(channel(h))}${byte(channel(h - 1 / 3))}${byte(alpha)}`;
  }
  m =
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+(-?[\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(
      v,
    );
  if (m) {
    // Exact OKLCH → OKLab → linear sRGB → sRGB, clipped to the sRGB gamut,
    // then each channel rounded to the nearest of 256 steps, halves up (G7).
    const part = (text, percentOf) =>
      text.endsWith('%')
        ? (parseFloat(text) / 100) * percentOf
        : parseFloat(text);
    const L = part(m[1], 1);
    const C = part(m[2], 0.4);
    const hue = (parseFloat(m[3]) * Math.PI) / 180;
    const a = C * Math.cos(hue);
    const b = C * Math.sin(hue);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [
      4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
    ];
    const encode = c => {
      const x = Math.min(1, Math.max(0, c));
      return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    };
    const alpha = m[4] === undefined ? 1 : part(m[4], 1);
    const byte = c => hex2(Math.round(c * 255 * 1e6) / 1e6);
    return `#${linear.map(c => byte(encode(c))).join('')}${byte(alpha)}`;
  }
  return NAMED_COLORS[v.toLowerCase()] ?? null;
}

/**
 * The value of a token in one mode: a whole-value `light-dark(a, b)` is `a` in
 * light and `b` in dark (G1); any other value is returned unchanged.
 */
export function valueForMode(value, mode) {
  const m = /^\s*light-dark\((.*)\)\s*$/s.exec(value);
  if (!m) return value;
  let depth = 0;
  for (let i = 0; i < m[1].length; i++) {
    const c = m[1][i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      const part = mode === 'light' ? m[1].slice(0, i) : m[1].slice(i + 1);
      return part.trim();
    }
  }
  return value;
}

/** Splits a CSS list at its top-level commas. */
function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map(part => part.trim());
}

/**
 * A CSS `box-shadow` list as shadow layers in one mode, or null (G7). A drop
 * layer is `x y blur color` with no spread; an inset layer is a ring,
 * `inset 0 0 0 <width> color`. A `light-dark()` color is taken per mode. Any
 * other layer has no exact SwiftUI form, so the list is null.
 */
export function toShadow(value, mode) {
  const layers = [];
  for (const layer of splitTopLevel(value.trim())) {
    const m =
      /^(inset\s+)?(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s+((?:light-dark|rgba?|hsla?|oklch)\(.*\)|#[0-9A-Fa-f]+|[a-z]+)$/s.exec(
        layer,
      );
    if (!m) return null;
    const [x, y, blur] = [m[2], m[3], m[4]].map(toPoints);
    const spread = m[5] == null ? 0 : toPoints(m[5]);
    const color = toHexColor(valueForMode(m[6], mode));
    if (x == null || y == null || blur == null || spread == null || !color) {
      return null;
    }
    const isInset = m[1] != null;
    if (isInset ? x !== 0 || y !== 0 || blur !== 0 : spread !== 0) return null;
    layers.push({x, y, blur, spread, isInset, color});
  }
  return layers.length ? layers : null;
}

/** A CSS length or unitless number as points, or null. */
export function toPoints(value) {
  const m = /^(-?[\d.]+)(rem|px)?$/.exec(value.trim());
  if (!m) return null;
  return m[2] === 'rem' ? parseFloat(m[1]) * REM : parseFloat(m[1]);
}

/** A CSS font-family stack as family names in order, or null. */
export function toFamilies(value) {
  const families = [];
  const re = /\s*("([^"]*)"|'([^']*)'|([^,]+?))\s*(,|$)/gy;
  let m;
  const v = value.trim();
  if (!v || /var\(|calc\(/.test(v)) return null;
  while (re.lastIndex < v.length && (m = re.exec(v))) {
    const name = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!name) return null;
    families.push(name);
    if (m[5] === '') break;
  }
  return families.length ? families : null;
}

const GROUP_TYPES = {
  color: 'Color',
  space: 'CGFloat',
  radius: 'CGFloat',
  size: 'CGFloat',
  font: null, // per member: [String] for families, CGFloat otherwise
  shadow: '[ShadowLayer]',
};
const GROUP_STRUCTS = {
  color: 'ColorTokens',
  space: 'SpaceTokens',
  radius: 'RadiusTokens',
  size: 'SizeTokens',
  font: 'FontTokens',
  shadow: 'ShadowTokens',
};
const GROUPS = Object.keys(GROUP_STRUCTS);

const isFamily = token => token.startsWith('--font-family-');
const memberType = (group, token) =>
  GROUP_TYPES[group] ?? (isFamily(token) ? '[String]' : 'CGFloat');

/** Shortest exact decimal for a number, as Swift reads it. */
function swiftNumber(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
}

// ---------------------------------------------------------------------------
// Resolution (G1)
// ---------------------------------------------------------------------------

let coreModules;
async function core() {
  coreModules ??= {
    ...(await import('@astryxdesign/core/theme')),
    ...(await import('@astryxdesign/core/theme/tokens')),
  };
  return coreModules;
}

/** Core's `defineTheme`, for callers that cannot import core themselves. */
export async function defineTheme(input) {
  return (await core()).defineTheme(input);
}

/**
 * Core's defaults, which core resolves with no theme. It generates as
 * `Theme.default` (G3).
 */
export const CORE_DEFAULTS = Object.freeze({name: 'astryx', tokens: {}});

/** Core's defaults, for callers that render every generated theme. */
export async function defaultTheme() {
  return CORE_DEFAULTS;
}

/**
 * A theme's local tokens, which no Swift file carries until core's resolver
 * returns them per mode (G8), sorted.
 */
export function localTokensLeftOut(theme) {
  return Object.keys(theme.localTokens ?? {}).sort();
}

/**
 * Every kept token of a theme in one mode, read only from core's resolver:
 * `{token: {group, member, value}}` with typed values (G1, G5, G7).
 */
async function resolveMode(theme, mode) {
  const {resolveThemeTokens} = await core();
  const out = {};
  for (let [token, value] of Object.entries(
    resolveThemeTokens(theme === CORE_DEFAULTS ? null : theme, {mode}),
  )) {
    if (!KEEP.test(token) || typeof value !== 'string') continue;
    const {group, member} = swiftMember(token);
    if (group !== 'shadow') value = valueForMode(value, mode);
    const fail = kind => {
      throw new Error(
        `${theme.name} ${mode}: ${token} is not a ${kind} Swift can read: ${value}`,
      );
    };
    let typed;
    if (group === 'color') typed = toHexColor(value) ?? fail('color');
    else if (group === 'shadow')
      typed = toShadow(value, mode) ?? fail('shadow');
    else if (isFamily(token)) typed = toFamilies(value) ?? fail('font family');
    else typed = toPoints(value) ?? fail('size');
    out[token] = {group, member, value: typed};
  }
  return out;
}

/** Light and dark tokens of a theme, checked for matching names (G7). */
export async function resolveTheme(theme) {
  const light = await resolveMode(theme, 'light');
  const dark = await resolveMode(theme, 'dark');
  for (const token of new Set([...Object.keys(light), ...Object.keys(dark)])) {
    if (!(token in light) || !(token in dark)) {
      const missing = token in light ? 'dark' : 'light';
      throw new Error(`${theme.name} ${missing}: ${token} is missing`);
    }
  }
  return {light, dark};
}

/** The typed token surface: `{group: [{token, member, type}]}`, sorted (G4). */
export function tokenSurface(resolved) {
  const surface = Object.fromEntries(GROUPS.map(g => [g, []]));
  const seen = new Map();
  for (const [token, {group, member}] of Object.entries(resolved)) {
    const key = `${group}.${member}`;
    if (seen.has(key)) {
      throw new Error(
        `${seen.get(key)} and ${token} both become ${key} in Swift`,
      );
    }
    if (
      !member
        .split('.')
        .every(p => /^[a-z][A-Za-z0-9_]*$/.test(p) && !SWIFT_KEYWORDS.has(p))
    ) {
      throw new Error(`${token} becomes ${key}, which Swift cannot name`);
    }
    seen.set(key, token);
    surface[group].push({token, member, type: memberType(group, token)});
  }
  for (const g of GROUPS)
    surface[g].sort((a, b) => a.member.localeCompare(b.member, 'en'));
  return surface;
}

// ---------------------------------------------------------------------------
// Swift output (G3, G4, G11)
// ---------------------------------------------------------------------------

const GENERATED_NOTE = `// Do not edit. Run \`${REGENERATE}\` after a theme or core token change.`;

// Font sub-groups (G6): the family, size and weight scales each have their own
// struct; every other sub-group is a type style with a size, weight and leading.
const FONT_SCALES = {
  family: 'FontFamilyTokens',
  size: 'FontSizeTokens',
  weight: 'FontWeightTokens',
};
const TYPE_STYLE_PARTS = ['size', 'weight', 'leading'];

/** Font members by sub-group: `[[name, [{token, leaf, type}]]]`, sorted. */
function fontGroups(members) {
  const groups = new Map();
  for (const m of members) {
    const [name, leaf] = m.member.split('.');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({...m, leaf});
  }
  for (const [name, parts] of groups) {
    if (name in FONT_SCALES) {
      parts.sort((a, b) => a.leaf.localeCompare(b.leaf, 'en'));
      continue;
    }
    const leaves = parts.map(p => p.leaf).sort();
    if (leaves.join() !== [...TYPE_STYLE_PARTS].sort().join()) {
      throw new Error(
        `type style ${name} needs a size, weight and leading token, got ${leaves.join(', ')}`,
      );
    }
    parts.sort(
      (a, b) =>
        TYPE_STYLE_PARTS.indexOf(a.leaf) - TYPE_STYLE_PARTS.indexOf(b.leaf),
    );
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'en'));
}

const fontStructName = name => FONT_SCALES[name] ?? 'TypeStyleTokens';

function renderStruct(name, doc, members) {
  return `${doc}
public struct ${name}: Equatable, Sendable {
${members.map(m => `${m.doc ? `  /// ${m.doc}\n` : ''}  public var ${m.name}: ${m.type}`).join('\n')}

  public init(
${members.map(m => `    ${m.name}: ${m.type}`).join(',\n')}
  ) {
${members.map(m => `    self.${m.name} = ${m.name}`).join('\n')}
  }
}`;
}

/** FontTokens and its sub-group structs, for the font members of a surface. */
function renderFontTypes(members) {
  const groups = fontGroups(members);
  const cssName = t => t.replace(/^--/, '');
  const lookup = type =>
    members
      .filter(m => m.type === type)
      .map(m => `    case "${cssName(m.token)}": ${m.member}`)
      .join('\n');
  const font = renderStruct(
    'FontTokens',
    "/// The theme's `font` tokens, grouped by kind: each type style's size,\n/// weight and leading, and the family, size and weight scales.",
    groups.map(([name, parts]) => ({
      name,
      type: fontStructName(name),
      doc:
        name in FONT_SCALES
          ? `\`--font-${name}-*\``
          : `\`--text-${cssName(parts[0].token)
              .replace(/^text-/, '')
              .replace(/-(size|weight|leading)$/, '')}-*\``,
    })),
  ).replace(
    /\n}$/,
    `

  /// A size, weight, or line-height token by its CSS name, for code that
  /// only has the name. Components read the typed members instead.
  func number(named token: String) -> CGFloat? {
    switch token {
${lookup('CGFloat')}
    default: nil
    }
  }

  /// A font family token by its CSS name, for code that only has the name.
  func families(named token: String) -> [String]? {
    switch token {
${lookup('[String]')}
    default: nil
    }
  }
}`,
  );
  const typeStyle = renderStruct(
    'TypeStyleTokens',
    '/// One type style: its font size, numeric weight, and line height.',
    TYPE_STYLE_PARTS.map(name => ({name, type: 'CGFloat'})),
  );
  const scales = Object.entries(FONT_SCALES)
    .map(([name, struct]) => {
      const parts = groups.find(([n]) => n === name)?.[1] ?? [];
      return renderStruct(
        struct,
        `/// The theme's \`font-${name}\` tokens.`,
        parts.map(p => ({name: p.leaf, type: p.type, doc: `\`${p.token}\``})),
      );
    })
    .join('\n\n');
  return `${font}\n\n${typeStyle}\n\n${scales}`;
}

/** The Swift initializer of FontTokens for one mode. */
function renderFontValue(members, resolved, pad) {
  const groups = fontGroups(members);
  const args = groups
    .map(([name, parts]) => {
      const inner = parts
        .map(p => `${p.leaf}: ${swiftValue(p.type, resolved[p.token].value)}`)
        .join(', ');
      return `${pad}    ${name}: ${fontStructName(name)}(${inner})`;
    })
    .join(',\n');
  return `${pad}  font: FontTokens(\n${args}\n${pad}  )`;
}

/** The generated Tokens.swift for a token surface. */
export function renderTokenTypes(surface) {
  const structs = GROUPS.map(group => {
    if (group === 'font') return renderFontTypes(surface.font);
    const members = surface[group];
    const props = members
      .map(
        m =>
          `  /// \`--${m.token.replace(/^--/, '')}\`\n  public var ${m.member}: ${m.type}`,
      )
      .join('\n');
    const params = members.map(m => `    ${m.member}: ${m.type}`).join(',\n');
    const assigns = members
      .map(m => `    self.${m.member} = ${m.member}`)
      .join('\n');
    const lookupType =
      group === 'font' ? null : (GROUP_TYPES[group] ?? 'CGFloat');
    const lookup =
      lookupType === null
        ? `  /// A size, weight, or line-height token by its CSS name, for code that
  /// only has the name. Components read the typed members instead.
  func number(named token: String) -> CGFloat? {
    switch token {
${members
  .filter(m => m.type === 'CGFloat')
  .map(m => `    case "${m.token.replace(/^--/, '')}": ${m.member}`)
  .join('\n')}
    default: nil
    }
  }

  /// A font family token by its CSS name, for code that only has the name.
  func families(named token: String) -> [String]? {
    switch token {
${members
  .filter(m => m.type === '[String]')
  .map(m => `    case "${m.token.replace(/^--/, '')}": ${m.member}`)
  .join('\n')}
    default: nil
    }
  }`
        : `  /// A token by its CSS name, for code that only has the name. Components
  /// read the typed members instead.
  func value(named token: String) -> ${lookupType}? {
    switch token {
${members.map(m => `    case "${m.token.replace(/^--/, '')}": ${m.member}`).join('\n')}
    default: nil
    }
  }`;
    return `/// The theme's \`${group}\` tokens, one typed member per token.
public struct ${GROUP_STRUCTS[group]}: Equatable, Sendable {
${props}

  public init(
${params}
  ) {
${assigns}
  }

${lookup}
}`;
  }).join('\n\n');
  return `// Copyright (c) Meta Platforms, Inc. and affiliates.
// Generated by @astryxdesign/native from core's token names.
${GENERATED_NOTE}

import SwiftUI

/// One mode of a theme: every token Swift keeps, as typed members.
public struct Tokens: Equatable, Sendable {
${GROUPS.map(g => `  public var ${g}: ${GROUP_STRUCTS[g]}`).join('\n')}

  public init(
${GROUPS.map(g => `    ${g}: ${GROUP_STRUCTS[g]}`).join(',\n')}
  ) {
${GROUPS.map(g => `    self.${g} = ${g}`).join('\n')}
  }
}

/// One layer of a theme's shadow, as CSS \`box-shadow\` draws it: a drop
/// shadow (an offset and a blur), or an inset ring \`spread\` points wide.
public struct ShadowLayer: Equatable, Sendable {
  public var x: CGFloat
  public var y: CGFloat
  public var blur: CGFloat
  public var spread: CGFloat
  public var isInset: Bool
  public var color: Color

  public init(
    x: CGFloat, y: CGFloat, blur: CGFloat, spread: CGFloat = 0, isInset: Bool = false, color: Color
  ) {
    self.x = x
    self.y = y
    self.blur = blur
    self.spread = spread
    self.isInset = isInset
    self.color = color
  }
}

${structs}
`;
}

function swiftValue(type, value) {
  if (type === 'Color') return `Color(astryxRGBA: 0x${value.slice(1)})`;
  if (type === '[String]')
    return `[${value.map(v => JSON.stringify(v)).join(', ')}]`;
  if (type === '[ShadowLayer]')
    return `[${value
      .map(
        l =>
          `ShadowLayer(x: ${swiftNumber(l.x)}, y: ${swiftNumber(l.y)}, blur: ${swiftNumber(l.blur)}${l.isInset ? `, spread: ${swiftNumber(l.spread)}, isInset: true` : ''}, color: ${swiftValue('Color', l.color)})`,
      )
      .join(', ')}]`;
  return swiftNumber(value);
}

function renderMode(surface, resolved, indent) {
  const pad = ' '.repeat(indent);
  const groups = GROUPS.map(group => {
    if (group === 'font') return renderFontValue(surface.font, resolved, pad);
    const args = surface[group]
      .map(
        m =>
          `${pad}    ${m.member}: ${swiftValue(m.type, resolved[m.token].value)}`,
      )
      .join(',\n');
    return `${pad}  ${group}: ${GROUP_STRUCTS[group]}(\n${args}\n${pad}  )`;
  }).join(',\n');
  return `Tokens(\n${groups}\n${pad})`;
}

/** Swift file name for a theme's static name. */
export const themeFileName = swiftName => `${capitalize(swiftName)}Theme.swift`;

/**
 * The generated Swift file for one theme (G3). `source` names where the theme
 * comes from, such as `@astryxdesign/theme-neutral`. A product theme
 * (`regenerate` set) lives in the app's own target, so it imports `Astryx` and
 * its header names the app's own regenerate command.
 */
export async function renderSwiftTheme(
  theme,
  {source = 'a product theme', regenerate} = {},
) {
  const swiftName = swiftThemeName(theme.name);
  const {light, dark} = await resolveTheme(theme);
  const surface = tokenSurface(light);
  const header =
    regenerate === undefined
      ? `// Copyright (c) Meta Platforms, Inc. and affiliates.
// Generated by @astryxdesign/native from ${source}, theme "${theme.name}".
${GENERATED_NOTE}

import SwiftUI
`
      : `// Generated by @astryxdesign/native from ${source}, theme "${theme.name}".
// Do not edit. Run \`${regenerate}\` after a theme change.

import Astryx
import SwiftUI
`;
  return `${header}
extension Theme {
  /// The \`${theme.name}\` theme from ${source}, in light and dark.
  public static let ${swiftIdent(swiftName)} = Theme(
    light: ${renderMode(surface, light, 4)},
    dark: ${renderMode(surface, dark, 4)}
  )
}
`;
}

// ---------------------------------------------------------------------------
// Published themes (G12)
// ---------------------------------------------------------------------------

/**
 * Every published theme package: `{packageName, dir, exportName}` for each
 * non-private package under packages/themes/, sorted by directory.
 */
export function publishedThemePackages() {
  return fs
    .readdirSync(THEMES_DIR)
    .sort()
    .map(dir => path.join(THEMES_DIR, dir))
    .filter(dir => fs.existsSync(path.join(dir, 'package.json')))
    .map(dir => ({
      dir,
      pkg: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')),
    }))
    .filter(({pkg}) => !pkg.private)
    .map(({dir, pkg}) => ({
      packageName: pkg.name,
      dir,
      exportName: `${path.basename(dir)}Theme`,
      sourceFile: path.join(dir, 'src', 'source.ts'),
    }));
}

/**
 * Every theme this package generates, with its file: core's default plus each
 * published theme. `load(file)` imports a theme package's TypeScript source.
 */
export async function generatedThemes(load) {
  const themes = [{theme: await defaultTheme(), source: '@astryxdesign/core'}];
  for (const p of publishedThemePackages()) {
    const module = await load(p.sourceFile);
    const theme = module[p.exportName];
    if (!theme) {
      throw new Error(`${p.packageName} does not export ${p.exportName}`);
    }
    themes.push({theme, source: p.packageName});
  }
  const names = new Map();
  for (const {theme} of themes) {
    const swiftName = swiftThemeName(theme.name);
    if (names.has(swiftName)) {
      throw new Error(
        `themes "${names.get(swiftName)}" and "${theme.name}" both become Theme.${swiftName}`,
      );
    }
    names.set(swiftName, theme.name);
  }
  return themes;
}

/** Every generated file as `{file: contents}`, keyed by absolute path. */
export async function renderAll(load) {
  const themes = await generatedThemes(load);
  const files = {};
  const {light} = await resolveTheme(themes[0].theme);
  files[SWIFT_TOKENS_FILE] = renderTokenTypes(tokenSurface(light));
  for (const {theme, source} of themes) {
    const file = path.join(
      SWIFT_THEME_DIR,
      themeFileName(swiftThemeName(theme.name)),
    );
    files[file] = await renderSwiftTheme(theme, {source});
  }
  return files;
}

/** Loads a TypeScript module from plain Node through Vite's module runner. */
async function viteLoad(file) {
  const {runnerImport} = await import('vite');
  const {module} = await runnerImport(file, {
    root: REPO_ROOT,
    configFile: false,
    logLevel: 'error',
  });
  return module;
}

async function main(argv) {
  const at = argv.indexOf('--theme');
  if (at !== -1) {
    // A product's own theme: `--theme <module>#<export> [--out <dir>]`.
    const [modulePath, exportName] = argv[at + 1].split('#');
    const module = await viteLoad(path.resolve(modulePath));
    const theme = module[exportName];
    if (!theme) throw new Error(`${modulePath} does not export ${exportName}`);
    const outAt = argv.indexOf('--out');
    const outDir = outAt === -1 ? process.cwd() : path.resolve(argv[outAt + 1]);
    const file = path.join(outDir, themeFileName(swiftThemeName(theme.name)));
    const regenerate = `node packages/native/scripts/swift-ios-theme.mjs --theme ${argv[at + 1]}${outAt === -1 ? '' : ` --out ${argv[outAt + 1]}`}`;
    fs.writeFileSync(
      file,
      await renderSwiftTheme(theme, {source: modulePath, regenerate}),
    );
    for (const token of localTokensLeftOut(theme)) {
      console.warn(`left out: ${theme.name} local token ${token}`);
    }
    console.log(`wrote ${file}`);
    return;
  }
  const files = await renderAll(viteLoad);
  for (const {theme} of await generatedThemes(viteLoad)) {
    for (const token of localTokensLeftOut(theme)) {
      console.warn(
        `left out: ${theme.name} local token ${token} (core's resolver does not return local tokens per mode yet)`,
      );
    }
  }
  fs.mkdirSync(SWIFT_THEME_DIR, {recursive: true});
  for (const existing of fs.readdirSync(SWIFT_THEME_DIR)) {
    const file = path.join(SWIFT_THEME_DIR, existing);
    if (existing.endsWith('.swift') && !(file in files)) fs.rmSync(file);
  }
  for (const [file, contents] of Object.entries(files)) {
    fs.writeFileSync(file, contents);
    console.log(`wrote ${path.relative(PACKAGE_ROOT, file)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
