// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fourteenth pass over `astryx experimental theme editor`: corners
 * in a state write the derived variables Core writes for plain corners.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {expandStateBlocks} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt14-', FIXTURE_PACKAGES);
  await themeEditNew('s', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const css = () => fs.readFileSync(path.join(cwd, 'themes/s/s.css'), 'utf8');

describe('corners in a state', () => {
  it('a button on hover gets its radius variable too', async () => {
    await themeEditSet('s', 'corners', 'pill', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    expect(css()).toMatch(
      /\.astryx-button:hover[^{]*\{[^}]*border-radius: 9999px;[^}]*--_button-radius: 9999px;/,
    );
  }, 240_000);

  it('a card on hover gets its inner radius variable', async () => {
    await themeEditSet('s', 'border-radius', '19px', {
      cwd,
      on: 'card',
      state: 'hover',
    });
    expect(css()).toMatch(
      /\.astryx-card:hover[^{]*\{[^}]*border-radius: 19px;[^}]*--_card-radius: 19px;/,
    );
  }, 240_000);
});

describe('expandStateBlocks', () => {
  it('writes vars, drops a replaced property, leaves plain blocks to Core', () => {
    const components = {
      card: {base: {borderRadius: '4px', ':hover': {borderRadius: '8px'}}},
      'text-area': {base: {':focus-within': {paddingInline: '6px'}}},
    };
    expandStateBlocks(components, {
      card: [{property: 'borderRadius', vars: ['--_card-radius']}],
      'text-area': [
        {property: 'paddingInline', vars: ['--_ta-pad'], replaces: true},
      ],
    });
    expect(components.card.base).toEqual({
      borderRadius: '4px',
      ':hover': {borderRadius: '8px', '--_card-radius': '8px'},
    });
    expect(components['text-area'].base[':focus-within']).toEqual({
      '--_ta-pad': '6px',
    });
  });
});
