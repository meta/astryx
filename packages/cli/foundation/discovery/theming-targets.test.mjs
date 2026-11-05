// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The enumerability guard for component theming targets.
 *
 * A theming target is only useful if a theme author can find it. These tests
 * run against the REAL core docs and fail if any component's targets stop
 * being enumerable — a doc that moves out of the scanned tree, a target shape
 * that stops being read, or a component whose Theming table says one thing
 * while `theme targets` says another. That divergence is the failure the
 * listing exists to prevent: a target list that can drift from the components
 * is worse than no list.
 *
 * The public vars a target carries get the same treatment, one step further:
 * being enumerable is not the same as being settable. A documented var no
 * component reads compiles to a declaration that never applies (#5012), and a
 * var the component writes inline outranks every cascade layer, so no theme can
 * reach it (#4530). Both shipped. Neither is visible in the generated theme CSS
 * — the artifact the jsdom suites assert on — so the wiring is checked here
 * against source. Whether the cascade then lands the value on the element is a
 * browser fact and no jsdom test can stand in for it.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {findCoreDir} from '../fs/paths.mjs';
const promotedThemeSurfaceTransform = new URL(
  '../../assets/codemods/transforms/v0.7.0/migrate-deprecated-theme-surface.mjs',
  import.meta.url,
);
const {DEPRECATED_THEME_TARGETS} = await import(
  fs.existsSync(promotedThemeSurfaceTransform)
    ? promotedThemeSurfaceTransform.href
    : '../../assets/codemods/transforms/next/migrate-deprecated-theme-surface.mjs'
);
import {
  discoverComponents,
  findComponentReadme,
} from './component-discovery.mjs';
import {loadComponentDoc} from './component-loader.mjs';
import {
  collectThemingTargets,
  collectThemingVars,
  targetsByKey,
} from './theming-targets.mjs';

const coreDir = /** @type {string} */ (findCoreDir(process.cwd()));
const coreSrc = path.join(coreDir, 'src');

/** @type {Promise<import('./theming-targets.mjs').ThemingTarget[]>} */
const enumerated = collectThemingTargets(coreSrc);

describe('collectThemingTargets', () => {
  it('enumerates the whole surface, not a handful', async () => {
    const targets = await enumerated;
    expect(targets.length).toBeGreaterThan(100);
    expect(new Set(targets.map(t => t.component)).size).toBeGreaterThan(50);
  });

  it('drops the namespace prefix so each key is what defineTheme takes', async () => {
    for (const t of await enumerated) {
      expect(t.className).toBe(`astryx-${t.key}`);
      expect(t.component).toBeTruthy();
    }
  });

  it('does not enumerate any removed target alias', async () => {
    const keys = new Set((await enumerated).map(target => target.key));
    for (const removed of Object.keys(DEPRECATED_THEME_TARGETS)) {
      expect(keys, `${removed} must not remain discoverable`).not.toContain(
        removed,
      );
    }
  });

  it('carries the props and states a target reflects', async () => {
    const targets = await enumerated;
    expect(targets.find(t => t.key === 'switch-thumb')).toEqual({
      key: 'switch-thumb',
      className: 'astryx-switch-thumb',
      component: 'Switch',
      props: ['size'],
      states: ['checked'],
    });
  });

  it.each([
    ['TableHeader', 'table-header'],
    ['TableBody', 'table-body'],
    ['TableFooter', 'table-footer'],
  ])(
    'keeps %s theming metadata available in its direct doc',
    async (name, key) => {
      const doc = await loadComponentDoc(
        path.join(coreSrc, 'Table', `${name}.doc.mjs`),
      );
      expect(doc.subComponentOf).toBe('Table');
      expect(doc.theming.targets).toContainEqual({className: `astryx-${key}`});
    },
  );

  it('keeps DialogHeader theming metadata available in its direct doc', async () => {
    const doc = await loadComponentDoc(
      path.join(coreSrc, 'Dialog', 'DialogHeader.doc.mjs'),
    );
    expect(doc.subComponentOf).toBe('Dialog');
    expect(doc.theming.targets).toEqual([
      {className: 'astryx-dialog-header'},
      {className: 'astryx-dialog-header-start-content'},
      {className: 'astryx-dialog-header-title-block'},
      {className: 'astryx-dialog-header-end-content'},
      {className: 'astryx-dialog-header-close-icon'},
    ]);
  });

  it.each([
    'dialog-header',
    'dialog-header-start-content',
    'dialog-header-title-block',
    'dialog-header-end-content',
    'dialog-header-close-icon',
  ])('enumerates %s once under its canonical Dialog owner', async key => {
    const matches = (await enumerated).filter(target => target.key === key);
    expect(matches).toEqual([
      {
        key,
        className: `astryx-${key}`,
        component: 'Dialog',
        props: [],
        states: [],
      },
    ]);
  });

  it.each(['table-header', 'table-body', 'table-footer'])(
    'enumerates %s once under its canonical Table owner',
    async key => {
      const matches = (await enumerated).filter(target => target.key === key);
      expect(matches).toEqual([
        {
          key,
          className: `astryx-${key}`,
          component: 'Table',
          props: [],
          states: [],
        },
      ]);
    },
  );

  it('is sorted by key, so a diff of two runs is readable', async () => {
    const keys = (await enumerated).map(t => t.key);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  // The listing and `theme build`'s override validation read this one
  // enumeration. `targetsByKey` is the shape validation wants: props and
  // states merged, because both are legal override keys.
  it('collapses to the override keys, merging the components that share one', async () => {
    const byKey = targetsByKey(await enumerated);
    expect(byKey['switch']).toEqual(['size', 'checked', 'disabled']);
    // `radio-indicator` is documented by two unrelated owners. Parent/child
    // canonicalization must not collapse a shared target across families.
    const radio = (await enumerated).filter(t => t.key === 'radio-indicator');
    expect(radio.map(t => t.component)).toEqual(['Indicator', 'RadioList']);
    for (const t of radio) {
      for (const name of [...t.props, ...t.states]) {
        expect(byKey['radio-indicator']).toContain(name);
      }
    }
  });

  it('every component doc that declares targets has them enumerated', async () => {
    const targets = await enumerated;
    /** @type {Map<string, Set<string>>} key -> props+states */
    const byKey = new Map(
      Object.entries(targetsByKey(targets)).map(([k, v]) => [k, new Set(v)]),
    );

    const names = Object.values(discoverComponents(coreDir)).flat();
    /** @type {string[]} */
    const missing = [];
    /** @type {Set<string>} */
    const seenDocs = new Set();
    let checked = 0;

    for (const name of names) {
      const docPath = findComponentReadme(coreDir, name);
      if (!docPath || seenDocs.has(docPath)) continue;
      seenDocs.add(docPath);

      /** @type {any} */
      let doc;
      try {
        doc = await loadComponentDoc(docPath);
      } catch {
        continue;
      }

      for (const target of doc?.theming?.targets || []) {
        if (typeof target?.className !== 'string') continue;
        checked++;
        const key = target.className.replace(/^astryx-/, '');
        const known = byKey.get(key);
        if (!known) {
          missing.push(`${name}: ${target.className} is not enumerable`);
          continue;
        }
        for (const prop of [
          ...(target.visualProps || []),
          ...(target.states || []),
        ]) {
          if (!known.has(prop)) {
            missing.push(`${name}: ${target.className} lost "${prop}"`);
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Public vars — enumerable is not the same as settable
// ---------------------------------------------------------------------------

/** @type {Promise<import('./theming-targets.mjs').ThemingVar[]>} */
const enumeratedVars = collectThemingVars(coreSrc);

/** Every non-test source file under a component directory. */
function sourcesIn(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...sourcesIn(path.join(dir, entry.name)));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|stories)\.tsx?$/.test(entry.name)) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

/**
 * The text of every inline style a file writes — `style={{…}}` objects and
 * `setProperty` calls. A custom property written from either outranks every
 * cascade layer, so a theme cannot reach it.
 */
function inlineStyleText(src) {
  const chunks = [];
  for (const m of src.matchAll(/style=\{\{/g)) {
    const end = src.indexOf('}}', m.index);
    chunks.push(src.slice(m.index, end === -1 ? src.length : end));
  }
  for (const m of src.matchAll(/setProperty\(\s*'[^']+'/g)) chunks.push(m[0]);
  return chunks.join('\n');
}

describe('collectThemingVars', () => {
  it('enumerates the public vars and drops the private plumbing', async () => {
    const names = (await enumeratedVars).map(v => v.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every(n => !n.startsWith('--_'))).toBe(true);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual([...new Set(names)]);
  });

  it('carries the component and the documented default', async () => {
    const indent = (await enumeratedVars).find(
      v => v.name === '--tree-list-indent',
    );
    expect(indent).toMatchObject({
      name: '--tree-list-indent',
      component: 'TreeList',
      default: 'var(--spacing-4)',
    });
  });

  // #5012: the theme docs advertised `--button-press-scale`, which no component
  // ever read. A theme setting it compiled to a declaration nothing consumed,
  // and nothing failed — the var was in the docs, so every existence check
  // passed. Reading it is the minimum that makes a documented var mean anything.
  it('every documented var is read by the component that documents it', async () => {
    /** @type {string[]} */
    const unread = [];
    for (const v of await enumeratedVars) {
      const read = sourcesIn(v.dir).some(f =>
        fs.readFileSync(f, 'utf-8').includes(`var(${v.name}`),
      );
      if (!read) unread.push(`${v.component}: nothing reads var(${v.name})`);
    }
    expect(
      unread,
      `A documented public var no component reads compiles to a declaration ` +
        `that never applies (#5012). Either wire it up or drop it from the doc.`,
    ).toEqual([]);
  });

  // #4530: TreeList's indent was an inline `margin-inline-start` on the element
  // carrying the theme target. An inline declaration outranks every cascade
  // layer, so `@layer astryx-theme` could not reach it — the var was real, read,
  // and documented, and still unsettable. The fix moved it into a StyleX rule.
  it('no documented var is written inline, where no theme can outrank it', async () => {
    /** @type {string[]} */
    const clobbered = [];
    for (const v of await enumeratedVars) {
      for (const f of sourcesIn(v.dir)) {
        if (inlineStyleText(fs.readFileSync(f, 'utf-8')).includes(v.name)) {
          clobbered.push(
            `${v.component}: ${path.basename(f)} sets ${v.name} inline`,
          );
        }
      }
    }
    expect(
      clobbered,
      `An inline custom property beats every cascade layer, so a theme setting ` +
        `it through @layer astryx-theme is silently ignored (#4530). Declare it ` +
        `in a StyleX rule instead.`,
    ).toEqual([]);
  });
});
