// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A setting on the plain part that a more specific rule would beat is
 * repeated on that rule's key: a rule under several attributes at once (a
 * table row's `parity:odd+striped`), and one Core scopes to a mode, are found
 * like a single-attribute one; a setting made for one mode is repeated in that
 * mode's block.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {findOverrides} from './_settings.mjs';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const LIGHT =
  ':where(:scope[data-theme="light"] *):where(:not(:scope [data-astryx-media] *))';

describe('findOverrides', () => {
  const hoverInLight = {
    'table-row': {
      base: {'@light': {':hover': {backgroundColor: '#f5f5f5'}}, ':hover': {}},
      'parity:odd+striped': {'@light': {backgroundColor: '#f9f9f9'}},
      'parity:even+striped': {backgroundColor: 'transparent'},
    },
  };

  it('finds a rule under several attributes, inside a mode scope, by the theme’s own key', () => {
    const css = [
      `:is(.astryx-table-row[data-parity="odd"][data-striped="striped"])${LIGHT} { background-color: #f9f9f9; }`,
      '.astryx-table-row[data-parity="even"][data-striped="striped"] { background-color: transparent; }',
    ].join('\n');
    expect(findOverrides(css, {components: hoverInLight})).toEqual([
      {
        target: 'table-row',
        key: 'parity:odd+striped',
        state: ':hover',
        prop: 'backgroundColor',
        value: '#f5f5f5',
        mode: 'light',
      },
      {
        target: 'table-row',
        key: 'parity:even+striped',
        state: ':hover',
        prop: 'backgroundColor',
        value: '#f5f5f5',
        mode: 'light',
      },
    ]);
  });

  it('finds a single-attribute rule Core scopes to a mode', () => {
    const css = `:is(.astryx-heading[data-level="1"])${LIGHT} { font-weight: 800; }`;
    expect(
      findOverrides(css, {components: {heading: {base: {fontWeight: '400'}}}}),
    ).toEqual([
      {target: 'heading', key: 'level:1', prop: 'fontWeight', value: '400'},
    ]);
  });

  it('leaves a rule of an element inside the part, and a rule in another state', () => {
    const css = [
      '.astryx-table-row[data-parity="odd"] .astryx-table-cell { background-color: red; }',
      '.astryx-table-row[data-parity="odd"]:focus-visible { background-color: red; }',
    ].join('\n');
    expect(
      findOverrides(css, {
        components: {
          'table-row': {base: {':hover': {backgroundColor: '#f5f5f5'}}},
        },
      }),
    ).toEqual([]);
  });
});

describe('findOverrides, once per variant', () => {
  it('lists a variant once though Core writes its rule once per mode scope', () => {
    const scopes = [
      ':where(:scope[data-theme="light"] *)',
      ':where(:scope:not([data-theme="light"], [data-theme="dark"]) *)',
      ':where(:scope [data-astryx-media="light"] *)',
      ':where(:scope[data-theme="dark"] *)',
      ':where(:scope [data-astryx-media="dark"] *)',
    ];
    const css = scopes
      .map(
        w =>
          `:is(.astryx-tab[data-selected="selected"])${w} { background-color: #111; }`,
      )
      .join('\n');
    expect(
      findOverrides(css, {
        components: {tab: {base: {backgroundColor: '#eeeeee'}}},
      }),
    ).toEqual([
      {
        target: 'tab',
        key: 'selected',
        prop: 'backgroundColor',
        value: '#eeeeee',
      },
    ]);
  });
});

describe('a whole-part state setting on a theme with its own variant rule', () => {
  /** @type {string} */
  let cwd;
  beforeAll(async () => {
    cwd = makeLinkedFixture('astryx-theme-state-variant-', FIXTURE_PACKAGES);
    writeFixtureBaseTheme(cwd, 'neutral');
    await themeEditNew('q', {cwd, like: 'neutral'});
  }, 120_000);
  afterAll(() => removeLinkedFixture(cwd));

  it('keeps the fill of a state the theme fills in both modes, and lists nothing twice', async () => {
    for (const mode of ['light', 'dark'])
      await themeEditSet('q', 'background-color', '#222222', {
        cwd,
        on: 'tab',
        state: 'selected',
        mode,
      });
    const r = await themeEditSet('q', 'background-color', '#eeeeee', {
      cwd,
      on: 'tab',
    });
    expect(r.data.lifted).toEqual([]);
    const settings = fs.readFileSync(
      path.join(cwd, 'themes/q/q.settings.ts'),
      'utf8',
    );
    const selected = settings.slice(settings.indexOf('"selected": {'));
    const block = selected.slice(0, selected.indexOf('\n      }'));
    expect(block).not.toMatch(/^\s{8}"backgroundColor": "#eeeeee"/m);
    for (const mode of ['light', 'dark']) await themeEditUndo('q', {cwd});
    await themeEditUndo('q', {cwd});
  }, 120_000);

  it('repeats a one-mode hover on the state the theme fills in that mode', async () => {
    await themeEditSet('q', 'background-color', '#eeeeee', {
      cwd,
      on: 'tab',
      state: 'hover',
      mode: 'light',
    });
    // A selected tab's own fill, in light mode only: Core scopes that rule
    // to the mode, and it comes after the whole-tab hover.
    const r = await themeEditSet('q', 'background-color', '#222222', {
      cwd,
      on: 'tab',
      state: 'selected',
      mode: 'light',
    });
    expect(r.data.lifted).toEqual([
      'tab selected @light:hover background-color',
    ]);
    const settings = fs.readFileSync(
      path.join(cwd, 'themes/q/q.settings.ts'),
      'utf8',
    );
    expect(settings).toMatch(
      /"selected": \{\s*"@light": \{\s*"backgroundColor": "#222222",\s*":hover": \{\s*"backgroundColor": "#eeeeee"/,
    );
  }, 120_000);
});
