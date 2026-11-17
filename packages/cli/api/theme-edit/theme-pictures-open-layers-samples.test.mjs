// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What the pictures draw: a doc sample's plain HTML text control as
 * the Astryx control for it; a submenu's flyout once, beside the menu it
 * opens from; a part drawn pressed at the moment of its press; a command
 * palette with an item highlighted; and a navigation drawer's panel held
 * in its cell.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {showcaseItems} from './_preview.mjs';
import {OPEN_SCENES, SHEET_CSS} from './_catalog.mjs';
import {SETTLE_ANIMATIONS} from '../../foundation/render/picture-window.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// Its assertions read the drawn open states page.
realRenders(true);

const T = 300_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-open-layers-samples-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The cell of a part on a sheet page, light mode only.
 * @param {string} html
 * @param {string} name
 */
function cell(html, name) {
  const at = html.indexOf(`<div class="cs-name">${name}</div>`);
  if (at < 0) return '';
  const end = html.indexOf('<div class="cs-cell"', at + 1);
  const all = html.slice(at, end < 0 ? undefined : end);
  const dark = all.indexOf('class="cs-dark"');
  return dark < 0 ? all : all.slice(0, dark);
}

describe('a doc sample', () => {
  it('draws a plain HTML text control as the Astryx control for it', async () => {
    const {project} = await context(cwd);
    const field = showcaseItems(project, 'inputs').items.find(
      it => it.name === 'Field',
    );
    const tree = JSON.stringify(field?.tree);
    expect(tree).toContain('"__element":"TextInput"');
    expect(tree).toContain('"isLabelHidden":true');
    expect(tree).not.toContain('"__element":"input"');
  });
});

describe('a part drawn pressed', () => {
  it('holds its press animation at the start, and finishes every other', () => {
    class CSSAnimation {
      /** @param {boolean} pressed */
      constructor(pressed) {
        this.pressed = pressed;
        this.currentTime = 0;
        this.state = 'running';
        this.effect = {
          getComputedTiming: () => ({iterations: 1, duration: 200}),
          getTiming: () => ({delay: 0}),
          target: {closest: () => (pressed ? {} : null)},
        };
      }
      pause() {
        this.state = 'paused';
      }
      finish() {
        this.state = 'finished';
      }
    }
    const press = new CSSAnimation(true);
    const fade = new CSSAnimation(false);
    const document = {getAnimations: () => [press, fade]};
    new Function('document', 'CSSAnimation', SETTLE_ANIMATIONS)(
      document,
      CSSAnimation,
    );
    expect(press.state).toBe('paused');
    expect(press.currentTime).toBe(0);
    expect(fade.state).toBe('finished');
  });
});

describe('the open states page', () => {
  it(
    'draws a flyout once beside its menu, a highlighted palette item, and a drawer held in its cell',
    async () => {
      expect(OPEN_SCENES.some(s => s.name === 'CommandPalette')).toBe(true);
      expect(SHEET_CSS).toContain(
        '.cs-cell dialog > *{max-width:100%!important;position:relative!important;inset:auto!important}',
      );
      await themeEditShow('t', {cwd, section: 'overlays'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet-overlays.html'),
        'utf8',
      );
      const sub = cell(html, 'DropdownMenu submenu');
      expect(sub.match(/data-astryx-layer-nest=""/g)).toHaveLength(1);
      // The parent menu and its flyout, each once.
      expect(sub.match(/role="menu"/g)).toHaveLength(2);
      expect(cell(html, 'CommandPalette highlighted')).toContain(
        'data-highlighted="highlighted"',
      );
    },
    T,
  );
});
