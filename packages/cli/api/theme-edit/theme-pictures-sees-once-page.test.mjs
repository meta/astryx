// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editor's pictures show what a person sees once the page runs: a
 * calendar's days; overlays in deeper states (a context menu, a submenu's
 * flyout, a form in a popover, a date and time field's time list, a command
 * palette's items, a narrow screen's navigation drawer); the sample page's
 * controls hovered, focused from the keyboard and pressed; a nav icon's icon
 * in its circle and an icon-only button's icon; and one border on each box of
 * a date and time field when the inputs take one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {catalogVariants, demoProps} from './_parts.mjs';
import {openProject} from './_project.mjs';
import {SAMPLE_SOURCE, elementNames, sampleControls} from './_catalog.mjs';
import {cutCss, withDrawnStates} from '../../foundation/render/css-cut.mjs';
import {desktopMatches} from '../../foundation/render/layers.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-pictures-sees-once-page-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The markup of one cell of a sheet, by the name it shows.
 * @param {string} html
 * @param {string} name
 */
function cellOf(html, name) {
  const start = html.indexOf(`<div class="cs-name">${name}</div>`);
  if (start < 0) return '';
  const next = html.indexOf('<div class="cs-cell"', start);
  return html.slice(start, next < 0 ? undefined : next);
}

describe('the open states page', () => {
  /** @type {string} */
  let html;
  beforeAll(async () => {
    await themeEditShow('t', {cwd, section: 'overlays'});
    html = fs.readFileSync(
      path.join(cwd, 'themes/t/sheet-overlays.html'),
      'utf8',
    );
  }, T);

  it('draws a context menu open: the drawing right-clicks its area', () => {
    const cell = cellOf(html, 'ContextMenu');
    expect(cell).toContain('Right-click this area');
    expect(cell).toContain('Duplicate');
  });

  it("draws a submenu's flyout beside the menu that holds it, as under a mouse", () => {
    const cell = cellOf(html, 'DropdownMenu submenu');
    expect(cell).toContain('Move to');
    expect(cell).toContain('Archive');
    // A flyout, not the phone's drill-in view that replaces the menu.
    expect(cell).toContain('Rename');
    expect(cell).not.toContain('Back to Move');
  });

  it('draws a popover that holds a form', () => {
    const cell = cellOf(html, 'Popover form');
    expect(cell).toContain('Only open items');
    expect(cell).toContain('data-astryx-layer-root');
  });

  it("draws a date and time field's time list alone: a press on the time closes the calendar", () => {
    const cell = cellOf(html, 'DateTimeInput time list');
    expect(cell).toContain('role="listbox"');
    expect(cell).toContain('10:00 AM');
    expect(cell).not.toContain('role="grid"');
  });

  it("lists a command palette's items from the sample search source", () => {
    const cell = cellOf(html, 'CommandPalette');
    expect(cell).toContain('Engineering');
    expect(cell).not.toContain('Type to search');
  });

  it("draws a narrow screen's navigation drawer open", () => {
    const cell = cellOf(html, 'MobileNav open');
    expect(cell).toContain('Navigation');
    expect(cell).toContain('Projects');
  });

  it("draws the sample page's controls in each state, and the stylesheet applies each state's rules to them", () => {
    const states = html.slice(html.indexOf('cs-group cs-states'));
    for (const label of ['rest', 'hover', 'focus-visible', 'pressed'])
      expect(states).toContain(`>${label}</div>`);
    expect(states).toContain('data-astryx-state="hover"');
    expect(states).toContain('data-astryx-state="hover active"');
    // Keyboard focus lands on the switch's own input, as a Tab does.
    expect(states).toMatch(
      /<input[^>]*data-astryx-state="focus"[^>]*role="switch"|<input[^>]*role="switch"[^>]*data-astryx-state="focus"/,
    );
    expect(html).toContain('[data-astryx-state~="focus"]');
    expect(html).toContain('[data-astryx-state~="hover"] *');
  });
});

describe('the sheet', () => {
  it(
    'draws a calendar with its days: content Core keeps inert until the browser runs is drawn as mounted',
    async () => {
      await themeEditShow('t', {cwd, section: 'inputs'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet-inputs.html'),
        'utf8',
      );
      const cell = cellOf(html, 'Calendar');
      expect(cell).toContain('role="gridcell"');
      expect(cell).not.toContain('inert=""');
    },
    T,
  );
});

describe('the sample markup', () => {
  it('gives a nav icon the icon its doc suggests, never its own name as text', async () => {
    const project = await openProject(cwd);
    const [first] = catalogVariants(project, 'NavIcon', 12, {shown: true});
    expect(first.props.icon).toMatchObject({__element: 'Icon'});
  });

  it('gives an icon-only button the icon its flag reads', async () => {
    const project = await openProject(cwd);
    const iconOnly = catalogVariants(project, 'Button', 12).find(
      v => v.label === 'isIconOnly',
    );
    expect(iconOnly?.props.icon).toMatchObject({__element: 'Icon'});
  });

  it('gives a command palette the sample search source its defaults leave out', async () => {
    const project = await openProject(cwd);
    expect(demoProps(project, 'CommandPalette')?.searchSource).toBe(
      SAMPLE_SOURCE,
    );
  });

  it('takes each control of the sample page once per look for the states section', () => {
    const looks = sampleControls().map(c =>
      `${[...elementNames(c.tree)].at(-1)} ${c.label}`.trim(),
    );
    expect(looks).toEqual(
      expect.arrayContaining([
        'Button primary',
        'Button ghost',
        'Switch',
        'Tab selected',
        'Tab',
      ]),
    );
  });

  it(
    "takes a border on the inputs on a date and time field's two boxes, never the row around them",
    async () => {
      await themeEditSet('t', 'border', '2px solid #dd0000', {
        cwd,
        on: 'inputs',
      });
      const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
      expect(css).toMatch(
        /\.astryx-date-time-input-date-segment[^{]*\{[^}]*border/,
      );
      expect(css).not.toMatch(
        /\.astryx-date-time-input(?![\w-])[^{,]*\{[^}]*border/,
      );
    },
    T,
  );
});

describe('drawn states and the window of a picture', () => {
  it('a state a page marks matches beside the browser pseudo-class it stands for', () => {
    expect(withDrawnStates('.a:hover')).toBe(
      '.a:is(:hover,[data-astryx-state~="hover"],[data-astryx-state~="hover"] *)',
    );
    expect(withDrawnStates('.m:focus-visible ~ .x')).toContain(
      ':is(:focus-visible,[data-astryx-state~="focus"])',
    );
    // An escaped colon in a class name is not a pseudo-class.
    expect(withDrawnStates('.a\\:hover')).toBe('.a\\:hover');
    const css = '.b:active{color:red}.c{color:blue}';
    expect(cutCss(css, new Set(['b', 'c']), {states: true})).toContain(
      '[data-astryx-state~="active"]',
    );
    expect(cutCss(css, new Set(['b', 'c']))).not.toContain('data-astryx-state');
  });

  it('answers a media query about the pointer as for a mouse', () => {
    expect(desktopMatches('(pointer: coarse)')).toBe(false);
    expect(desktopMatches('(pointer: fine)')).toBe(true);
    expect(desktopMatches('(hover: hover) and (pointer: fine)')).toBe(true);
    expect(desktopMatches('not all and (pointer: coarse)')).toBe(true);
    expect(desktopMatches('(prefers-reduced-motion: reduce)')).toBe(true);
  });
});
