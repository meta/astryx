// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Drift guard for the shipped theme template.
 *
 * `packages/cli/assets/theme.template.ts` is the annotated map of the theme
 * surface: every `defineTheme` field, the token families, the component
 * override syntax. `astryx theme template` copies it into a consumer's
 * project, so a claim that has rotted is not a stale comment in our repo — it
 * is wrong instruction sitting in someone else's.
 *
 * Documentation rots silently, and this kind especially: the theme docs shipped
 * `--button-press-scale` (#5012) for long enough that a generated theme carried
 * a declaration no component could ever read. SYNC comments in the theme
 * sources point here; this file is what makes them more than a wish.
 *
 * What is checked — all of it derived from live sources, never hardcoded:
 *   1. Every `DefineThemeInput` field is documented (and nothing invented).
 *   2. Every settable token family appears in the inventory.
 *   3. Every `--token` the template names is a real token.
 *   4. Every component key is a real theming target, and every public
 *      `--var` it sets is one that component declares.
 *   5. Every `astryx docs <topic>` it cites exists.
 *   6. Every theme source carrying a SYNC reference here still exists.
 *
 * That the template COMPILES is proved separately, end to end, by
 * `builds the shipped theme template with no warnings` in
 * packages/cli/api/theme/build/build.test.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {docs} from '../packages/cli/api/docs/docs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(REPO_ROOT, 'packages/cli/assets/theme.template.ts');
const THEME_SRC = path.join(REPO_ROOT, 'packages/core/src/theme');
const CORE_SRC = path.join(REPO_ROOT, 'packages/core/src');
const NEUTRAL_PALETTE = path.join(
  REPO_ROOT,
  'packages/themes/neutral/src/neutralPalettes.ts',
);
const NEUTRAL_PALETTE_TEMPLATE = path.join(
  REPO_ROOT,
  'packages/cli/assets/templates/themes/neutral/neutralPalettes.ts',
);
const NEUTRAL_GENERATED_PALETTE = path.join(
  REPO_ROOT,
  'packages/themes/neutral/src/neutralPalettes.generated.ts',
);
const NEUTRAL_PALETTE_REFS = path.join(
  REPO_ROOT,
  'packages/themes/neutral/src/neutralPaletteRefs.generated.ts',
);
const NEUTRAL_GENERATED_RECEIPT = path.join(
  REPO_ROOT,
  'packages/themes/neutral/src/neutralPalettes.generated.receipt.json',
);
const NEUTRAL_PALETTE_CONFIG = path.join(
  REPO_ROOT,
  'packages/themes/neutral/palette.config.json',
);
const NEUTRAL_TEMPLATE_DIR = path.join(
  REPO_ROOT,
  'packages/cli/assets/templates/themes/neutral',
);

const template = fs.readFileSync(TEMPLATE, 'utf-8');

/** Theme sources whose SYNC comments name the template. */
const SYNC_SOURCES = [
  'defineTheme.ts',
  'tokens.stylex.ts',
  'expandColorScale.ts',
  'expandTypeScale.ts',
  'expandRadiusScale.ts',
  'expandMotionScale.ts',
];

// ---------------------------------------------------------------------------
// Live facts
// ---------------------------------------------------------------------------

const defineThemeSrc = fs.readFileSync(
  path.join(THEME_SRC, 'defineTheme.ts'),
  'utf-8',
);
const tokensSrc = fs.readFileSync(
  path.join(THEME_SRC, 'tokens.stylex.ts'),
  'utf-8',
);

/** Field names declared on `DefineThemeInput`. */
function defineThemeFields() {
  const body = defineThemeSrc.match(
    /export interface DefineThemeInput(?:<[\s\S]*?>)? \{([\s\S]*?)\n\}/,
  );
  if (!body) throw new Error('DefineThemeInput not found in defineTheme.ts');
  return [...body[1].matchAll(/^ {2}(\w+)\??:/gm)].map(m => m[1]);
}

/** Every `*Defaults` group in tokens.stylex.ts, with its token names. */
function tokenGroups() {
  /** @type {Record<string, string[]>} */
  const groups = {};
  for (const chunk of tokensSrc.split('export const ').slice(1)) {
    const name = chunk.split(/[\s:=]/)[0];
    if (!name.endsWith('Defaults')) continue;
    const body = chunk.split('export const')[0];
    groups[name] = [...body.matchAll(/'(--[a-zA-Z0-9-]+)'\s*:/g)].map(
      m => m[1],
    );
  }
  return groups;
}

/**
 * The token groups a theme can actually set — the ones unioned into
 * `CoreTokenName`. `borderDefaults` is deliberately outside it today (#5017):
 * `--border-width` is documented and emitted but rejected by the type, so the
 * template must not teach it. When #5017 lands, that family joins the union and
 * this guard starts requiring the template to cover it.
 */
function settableTokenGroups() {
  const union = defineThemeSrc.match(/export type CoreTokenName =([\s\S]*?);/);
  if (!union) throw new Error('CoreTokenName not found in defineTheme.ts');
  return [...union[1].matchAll(/typeof (\w+Defaults)/g)].map(m => m[1]);
}

/** Every documented theming target, and the public vars it declares. */
function themingTargets() {
  /** @type {Record<string, Set<string>>} */
  const targets = {};
  /** @type {Set<string>} */
  const publicVars = new Set();
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!entry.name.endsWith('.doc.mjs')) continue;
      const src = fs.readFileSync(p, 'utf-8');
      for (const m of src.matchAll(/className:\s*'astryx-([a-z0-9-]+)'/g)) {
        targets[m[1]] ??= new Set();
      }
      // `vars: [{name: '--button-focus-offset', ...}]` — private `--_` vars are
      // not a theme's to set, so they are not collected.
      for (const m of src.matchAll(/name:\s*'(--[a-z0-9-]+)'/g)) {
        publicVars.add(m[1]);
      }
    }
  };
  walk(CORE_SRC);
  return {targets, publicVars};
}

/**
 * Whether `astryx docs <route>` prints something: a flat topic, or a node of
 * the docs tree (a namespace such as `tokens`, or a guide such as
 * `tokens/tokens-color`), resolved the way the command resolves it.
 * @param {string} route
 * @returns {Promise<boolean>}
 */
async function docsRouteExists(route) {
  try {
    await docs(route, undefined, {index: true});
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Template claims
// ---------------------------------------------------------------------------

/**
 * Top-level keys the template sets, plus optional fields shown commented out.
 * A commented field must carry either a same-line value (`// syntax: dracula,`)
 * or open a commented object block (`// adaptations: {`), so ordinary prose is
 * not mistaken for a field.
 */
function templateFields() {
  const set = [...template.matchAll(/^ {2}(\w+):/gm)].map(m => m[1]);
  const commented = [
    ...template.matchAll(/^ {2}\/\/ (\w+): (?:.+,|\{)$/gm),
  ].map(m => m[1]);
  return [...new Set([...set, ...commented])];
}

/**
 * Every CSS variable the template uses in a code position — set as a property
 * (`'--x': …`) or read (`var(--x)`). Prose mentions of a family (`--spacing-*`)
 * and CLI flags (`--list`) are not claims about a variable's existence.
 */
function templateVars() {
  const set = [...template.matchAll(/'(--[a-z][a-z0-9-]*)':/g)].map(m => m[1]);
  const read = [...template.matchAll(/var\((--[a-z][a-z0-9-]*)\)/g)].map(
    m => m[1],
  );
  return [...new Set([...set, ...read])];
}

/**
 * The inventory block — the comment listing what token families exist. Scoped
 * deliberately: a family named only in a passing example (`var(--spacing-6)`)
 * is not an inventory an author can read to learn what the system has.
 */
function templateInventory() {
  const marker = '// The families, so you know what exists:';
  const start = template.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `The token inventory marker ("${marker}") is gone from the template. ` +
        `If the inventory moved, point this guard at its new home.`,
    );
  }
  return template.slice(start, template.indexOf('\n  tokens: {', start));
}

/**
 * The prefix a family shares — `--spacing-`, `--font-weight-`, `--ease-standard`.
 * A family is only "covered" when the template names this, which keeps the
 * three `--font-*` families (family, size, weight) distinguishable instead of
 * collapsing them into one prefix that any of them satisfies.
 *
 * @param {string[]} names
 */
function commonPrefix(names) {
  return names.reduce((prefix, name) => {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++;
    return prefix.slice(0, i);
  });
}

/** Component keys in the template's `components` block. */
function templateComponentKeys() {
  const block = template.match(/\n {2}components: \{([\s\S]*?)\n {2}\},/);
  if (!block) throw new Error('components block not found in the template');
  return [...block[1].matchAll(/^ {4}'?([a-z][a-z0-9-]*)'?: \{/gm)].map(
    m => m[1],
  );
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('theme template stays in sync with the theme system', () => {
  it('keeps the shipped Neutral palette template aligned with its owner', () => {
    for (const [source, output] of [
      [NEUTRAL_PALETTE, NEUTRAL_PALETTE_TEMPLATE],
      [
        NEUTRAL_GENERATED_PALETTE,
        path.join(NEUTRAL_TEMPLATE_DIR, 'neutralPalettes.generated.ts'),
      ],
      [
        NEUTRAL_PALETTE_REFS,
        path.join(NEUTRAL_TEMPLATE_DIR, 'neutralPaletteRefs.generated.ts'),
      ],
      [
        NEUTRAL_GENERATED_RECEIPT,
        path.join(
          NEUTRAL_TEMPLATE_DIR,
          'neutralPalettes.generated.receipt.json',
        ),
      ],
      [
        NEUTRAL_PALETTE_CONFIG,
        path.join(NEUTRAL_TEMPLATE_DIR, 'palette.config.json'),
      ],
    ]) {
      expect(fs.readFileSync(output, 'utf-8')).toBe(
        fs.readFileSync(source, 'utf-8'),
      );
    }
  });

  it('keeps Neutral generation inputs and output aligned with its receipt', () => {
    const config = JSON.parse(fs.readFileSync(NEUTRAL_PALETTE_CONFIG, 'utf-8'));
    const receipt = JSON.parse(
      fs.readFileSync(NEUTRAL_GENERATED_RECEIPT, 'utf-8'),
    );
    const generated = fs
      .readFileSync(NEUTRAL_GENERATED_PALETTE, 'utf-8')
      // Repository lint adds this license to committed TypeScript. The receipt
      // hashes the generator-owned bytes that follow it.
      .replace('// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n', '');

    expect(receipt.recipe).toBe(config.recipe);
    expect(receipt.request).toMatchObject(config);
    expect(createHash('sha256').update(generated).digest('hex')).toBe(
      receipt.candidateSha256,
    );
  });

  it('documents every defineTheme field', () => {
    const documented = new Set(templateFields());
    const missing = defineThemeFields().filter(f => !documented.has(f));
    expect(
      missing,
      `packages/cli/assets/theme.template.ts documents no ${missing.join(', ')} — ` +
        `DefineThemeInput gained a field the template never mentions, so every ` +
        `author who reads the template will not know it exists.`,
    ).toEqual([]);
  });

  it('documents the color scale without enabling it for new themes', () => {
    expect(template).toMatch(/^ {2}\/\/ color: \{/m);
    expect(template).not.toMatch(/^ {2}color: \{/m);
    expect(template).toContain(
      'astryx theme palette generate palette.config.json --out palette.generated.ts',
    );
    expect(template).toContain(
      "// import {palette} from './palette.generated';",
    );
    expect(template).toContain('palette.neutral.light[100]');
  });

  it('invents no field that defineTheme does not accept', () => {
    const real = new Set([...defineThemeFields(), 'name']);
    const invented = templateFields().filter(f => !real.has(f));
    expect(
      invented,
      `The template shows ${invented.join(', ')}, which DefineThemeInput does ` +
        `not accept — a field was renamed or removed and the template kept teaching it.`,
    ).toEqual([]);
  });

  it('lists every settable token family in its inventory', () => {
    const groups = tokenGroups();
    const inventory = templateInventory();
    const missing = settableTokenGroups().filter(group => {
      const tokens = groups[group] ?? [];
      if (tokens.length === 0) return false;
      return !inventory.includes(commonPrefix(tokens));
    });
    expect(
      missing,
      `The template's token inventory covers no ${missing.join(', ')}. A whole ` +
        `token family exists that an author reading the template cannot discover.`,
    ).toEqual([]);
  });

  it('names only tokens and public vars that exist', () => {
    const known = new Set(Object.values(tokenGroups()).flat());
    const {publicVars} = themingTargets();
    // Domain tokens (syntax, data-viz) live outside tokens.stylex.ts and are
    // referenced by prefix in the inventory, not by full name.
    const domainPrefixes = [
      '--color-syntax-',
      '--color-data-',
      '--astryx-theme-my-theme-',
    ];
    const bogus = templateVars().filter(
      v =>
        !known.has(v) &&
        !publicVars.has(v) &&
        !domainPrefixes.some(p => v.startsWith(p) || p.startsWith(v)),
    );
    expect(
      bogus,
      `The template names ${bogus.join(', ')}, which no token group and no ` +
        `component declares. A CSS variable nothing defines compiles to a ` +
        `declaration that never applies (#5012).`,
    ).toEqual([]);
  });

  it('overrides only real theming targets', () => {
    const {targets} = themingTargets();
    const unknown = templateComponentKeys().filter(k => !(k in targets));
    expect(
      unknown,
      `The template themes ${unknown.join(', ')}, which is not a documented ` +
        `theming target — the component was renamed or its class changed.`,
    ).toEqual([]);
  });

  it('cites only doc topics that exist', async () => {
    const cited = [
      ...new Set(
        [...template.matchAll(/astryx docs ([a-z-]+(?:\/[a-z-]+)*)/g)].map(
          m => m[1],
        ),
      ),
    ];
    expect(cited.length).toBeGreaterThan(0);
    const dead = [];
    for (const route of cited) {
      if (!(await docsRouteExists(route))) dead.push(route);
    }
    expect(
      dead,
      `The template tells authors to run \`astryx docs ${dead.join('`, `astryx docs ')}\`, ` +
        `which prints nothing — the topic was renamed or removed.`,
    ).toEqual([]);
  });

  it('is still named by the SYNC comment in every theme source that points here', () => {
    const relTemplate = 'packages/cli/assets/theme.template.ts';
    const orphaned = SYNC_SOURCES.filter(
      f =>
        !fs
          .readFileSync(path.join(THEME_SRC, f), 'utf-8')
          .includes(relTemplate),
    );
    expect(
      orphaned,
      `${orphaned.join(', ')} lost the SYNC reference to the template. The ` +
        `reference is how the next person editing the theme system learns the ` +
        `template mirrors it.`,
    ).toEqual([]);
  });
});
