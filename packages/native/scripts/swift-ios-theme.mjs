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

// G5: the token groups Swift keeps. Everything else (shadows, motion, layout
// breakpoints) stays out until a component needs it.
const KEEP =
  /^--(color-|spacing-|radius-|size-element-|border-width$|font-size-|font-weight-|font-family-|text-(heading-\d|display-\d|body|large|label|supporting|code)-)/;
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
  if ((m = /^font-(size|weight|family)-(.+)$/.exec(name))) {
    return {group: 'font', member: camel([m[1], ...m[2].split('-')])};
  }
  if ((m = /^text-(.+)-(size|weight|leading)$/.exec(name))) {
    return {group: 'font', member: camel([...m[1].split('-'), m[2]])};
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
};
const GROUP_STRUCTS = {
  color: 'ColorTokens',
  space: 'SpaceTokens',
  radius: 'RadiusTokens',
  size: 'SizeTokens',
  font: 'FontTokens',
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
    value = valueForMode(value, mode);
    const {group, member} = swiftMember(token);
    const fail = kind => {
      throw new Error(
        `${theme.name} ${mode}: ${token} is not a ${kind} Swift can read: ${value}`,
      );
    };
    let typed;
    if (group === 'color') typed = toHexColor(value) ?? fail('color');
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
    if (!/^[a-z][A-Za-z0-9_]*$/.test(member) || SWIFT_KEYWORDS.has(member)) {
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

/** The generated Tokens.swift for a token surface. */
export function renderTokenTypes(surface) {
  const structs = GROUPS.map(group => {
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
      group === 'color' ? 'Color' : group === 'font' ? null : 'CGFloat';
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

${structs}
`;
}

function swiftValue(type, value) {
  if (type === 'Color') return `Color(astryxRGBA: 0x${value.slice(1)})`;
  if (type === '[String]')
    return `[${value.map(v => JSON.stringify(v)).join(', ')}]`;
  return swiftNumber(value);
}

function renderMode(surface, resolved, indent) {
  const pad = ' '.repeat(indent);
  const groups = GROUPS.map(group => {
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
