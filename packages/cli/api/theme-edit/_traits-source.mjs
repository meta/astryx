// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes the theme file `astryx experimental theme create <name>
 * --traits` makes: one complete, explicit defineTheme() source that the
 * person owns. Every token is written out (colors with a light and a dark
 * value), grouped so a person finds a line to edit. It reads nothing from
 * the disk.
 *
 * @input the theme's name, its traits, its explicit tokens and part styles
 * @output TypeScript source text
 * @position api/theme-edit — used by the create helper (_create.mjs)
 */

import {traitsJson} from './_traits.mjs';
import {themeDescriptorSource} from '../../foundation/integrations/theme-descriptor.mjs';

/**
 * The groups of the token list, in file order: the first group whose test
 * a token name passes holds it.
 * @type {ReadonlyArray<[string, RegExp]>}
 */
const GROUPS = [
  ['Page and surfaces', /^--color-background-|^--color-(?:overlay|scrim)/],
  ['Text and icons', /^--color-(?:text|icon|on)-/],
  ['Accent', /^--color-accent/],
  ['Status', /^--color-(?:info|success|warning|error)/],
  ['Edges and tracks', /^--color-(?:border|track|divider|skeleton|focus)/],
  ['Other colors', /^--color-/],
  ['Shadows', /^--shadow-/],
  ['Corners', /^--radius-/],
  ['Fonts and text', /^--(?:font|text|line-height|letter-spacing)-/],
  ['Spacing and sizes', /^--(?:spacing|size)-/],
  ['Everything else', /./],
];

/**
 * What each shared group style is for, in the file's comment above it.
 * @type {Record<string, string>}
 */
const SHARED_NOTE = {
  surfaces: 'How cards, panels and menus sit on the page',
  floatingSurfaces: 'How panels that float over the page sit there',
  surfaceFill:
    "The fill of cards and panels (a colored card's variants keep their own)",
  floatingSurfacesFill: 'The fill of panels that float over the page',
};

/** A string as TypeScript source: quoted, with every character that would end it escaped. @param {string} v */
const quoted = v =>
  `'${v
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}'`;

/**
 * A token value as the file writes it: one value, or `[light, dark]`.
 * @param {string | readonly [string, string]} v
 */
const tokenValue = v =>
  Array.isArray(v) ? `[${quoted(v[0])}, ${quoted(v[1])}]` : quoted(String(v));

/** @param {string} k */
const key = k => (/^[a-zA-Z_$][\w$]*$/.test(k) ? k : quoted(k));

/**
 * A style as TypeScript object text, its lines indented by `indent`.
 * @param {Record<string, string>} css
 * @param {string} indent
 */
const styleText = (css, indent) =>
  [
    '{',
    ...Object.entries(css).map(
      ([prop, v]) => `${indent}  ${key(prop)}: ${quoted(String(v))},`,
    ),
    `${indent}}`,
  ].join('\n');

/**
 * A part style map as TypeScript object text, indented under `components`.
 * A part whose base (or a variant block) is a shared group style spreads
 * it, in an object, so later lines (a check repair, an edit) go beside it.
 * @param {Record<string, Record<string, Record<string, string>>>} components
 * @param {Record<string, string[]>} sharedBy part -> the shared styles its base spreads
 * @param {Record<string, Record<string, string[]>>} sharedBlocks part -> block -> the shared styles it spreads
 */
function componentsText(components, sharedBy, sharedBlocks) {
  const parts = [
    ...new Set([
      ...Object.keys(components),
      ...Object.keys(sharedBy),
      ...Object.keys(sharedBlocks),
    ]),
  ].sort();
  if (!parts.length) return '{}';
  /** @param {string[]} names */
  const spread = names => `{${names.map(n => `...${n}`).join(', ')}}`;
  const lines = ['{'];
  for (const part of parts) {
    lines.push(`    ${key(part)}: {`);
    if (sharedBy[part]?.length)
      lines.push(`      base: ${spread(sharedBy[part])},`);
    for (const [block, names] of Object.entries(sharedBlocks[part] ?? {}))
      if (names.length && !components[part]?.[block])
        lines.push(`      ${key(block)}: ${spread(names)},`);
    for (const [block, css] of Object.entries(components[part] ?? {}))
      lines.push(`      ${key(block)}: ${styleText(css, '      ')},`);
    lines.push('    },');
  }
  lines.push('  }');
  return lines.join('\n');
}

/**
 * The theme file.
 * @param {object} input
 * @param {string} input.slug - The theme's name.
 * @param {string} input.exportName - The theme's export, `<camelName>Theme`.
 * @param {import('./_traits.mjs').Traits} input.traits
 * @param {Record<string, string | readonly [string, string]>} input.tokens - Every token, explicit.
 * @param {Record<string, Record<string, Record<string, string>>>} input.components
 * @param {Record<string, Record<string, string>>} input.shared - Group styles, by name, written once.
 * @param {Record<string, string[]>} input.sharedBy - Each part whose base spreads group styles, and their names.
 * @param {Record<string, Record<string, string[]>>} [input.sharedBlocks] - Each part's variant blocks that spread group styles.
 * @param {string} input.checkCommand - The check a person runs after an edit.
 * @returns {string}
 */
export function traitsThemeSource({
  slug,
  exportName,
  traits,
  tokens,
  components,
  shared,
  sharedBy,
  sharedBlocks = {},
  checkCommand,
}) {
  /** @type {string[]} */
  const lines = [];
  const used = new Set();
  for (const [title, test] of GROUPS) {
    const names = Object.keys(tokens)
      .filter(k => !used.has(k) && test.test(k))
      .sort();
    if (!names.length) continue;
    lines.push(`    // ${title}`);
    for (const name of names) {
      used.add(name);
      lines.push(`    ${quoted(name)}: ${tokenValue(tokens[name])},`);
    }
  }
  const oneLook = traits.look === 'both' ? null : traits.look;
  const groups = Object.entries(shared)
    .map(
      ([name, css]) =>
        `\n// ${SHARED_NOTE[name] ?? name}: one style, so a change is one line.\nconst ${name} = ${styleText(css, '')};\n`,
    )
    .join('');
  return `// This theme file is yours. \`astryx experimental theme create ${slug}\` wrote it from these traits:
// ${traitsJson(traits)}
// Every color has a light and a dark value. Edit any line, then run
// \`${checkCommand}\` after every edit: it says what reads badly and fills what is missing.
import {defineTheme} from '@astryxdesign/core/theme';
${
  oneLook
    ? `
// One ${oneLook} look: the app shows this theme in ${oneLook} mode.
export const colorModes = [${quoted(oneLook)}];
`
    : ''
}${groups}
export const ${exportName} = defineTheme({
  name: ${quoted(slug)},
  tokens: {
${lines.join('\n')}
  },
  components: ${componentsText(components, sharedBy, sharedBlocks)},
});
`;
}

/**
 * The theme's descriptor (the same-stem `.doc.mjs` every local theme has).
 * @param {string} slug
 * @param {import('./_traits.mjs').Traits} traits
 */
export function traitsThemeDoc(slug, traits) {
  const look =
    traits.look === 'both'
      ? 'a light and a dark look'
      : `one ${traits.look} look`;
  return themeDescriptorSource({
    type: 'theme',
    name: slug,
    displayName: slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    description: `A theme with ${look}, made from traits.`,
    maintained: false,
  });
}
