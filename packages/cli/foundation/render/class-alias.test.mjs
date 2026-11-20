// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the alias classes a rendered page's first paint names its
 * repeated StyleX class lists by.
 */

import {describe, expect, it} from 'vitest';
import {aliasClasses} from './class-alias.mjs';

const LIST = 'xaaaaa1 xbbbbb1 xccccc1 xddddd1 xeeeee1';

/** @param {number} n @param {string} [extra] */
const rows = (n, extra = '') =>
  Array.from({length: n}, (_, i) => `<td class="astryx-table-cell ${LIST}${extra}" data-density="balanced">${i}</td>`).join('');

const CSS = [
  '.xaaaaa1{color:red}',
  '.xbbbbb1:hover{color:blue}',
  '@media (min-width: 600px){.xccccc1{padding:4px}}',
  '@supports (display:grid){.xddddd1{display:grid}}',
  '@container card (min-width: 300px){.xeeeee1{margin:0}}',
  '.astryx-table-cell{border:0}',
].join('\n');

describe('aliasClasses', () => {
  it('names a repeated StyleX list by one alias, keeping every other name and attribute', () => {
    const {markup, css, aliases} = aliasClasses(rows(600), CSS);
    expect(aliases).toBe(1);
    expect(markup).toContain('<td class="astryx-table-cell _a0" data-density="balanced">');
    expect(markup).not.toContain('xaaaaa1');
    expect(css).toContain('.xaaaaa1,._a0{color:red}');
    expect(css).toContain('.xbbbbb1:hover,._a0:hover{color:blue}');
    expect(css).toContain('@media (min-width: 600px){.xccccc1,._a0{padding:4px}}');
    expect(css).toContain('@supports (display:grid){.xddddd1,._a0{display:grid}}');
    expect(css).toContain('@container card (min-width: 300px){.xeeeee1,._a0{margin:0}}');
    expect(css).toContain('.astryx-table-cell{border:0}');
    expect(markup.length).toBeLessThan(rows(600).length * 0.7);
  });

  it('follows a class into compound selectors and :is, :where and :has', () => {
    const css = [
      '.xaaaaa1.xbbbbb1{color:red}',
      ':where(.xccccc1) .xddddd1{color:blue}',
      '.astryx-row:has(.xeeeee1){outline:0}',
      ':is(.xaaaaa1, .astryx-x){gap:0}',
    ].join('\n');
    const out = aliasClasses(rows(600), css).css;
    expect(out).toContain('.xaaaaa1.xbbbbb1,._a0.xbbbbb1,.xaaaaa1._a0,._a0._a0{color:red}');
    expect(out).toContain(':where(._a0) .xddddd1');
    expect(out).toContain(':where(._a0) ._a0');
    expect(out).toContain('.astryx-row:has(._a0){outline:0}');
    expect(out).toContain(':is(._a0, .astryx-x){gap:0}');
  });

  it('keeps a class a rule names inside :not() or in an @scope prelude', () => {
    const css = `${CSS}\n.astryx-x:not(.xaaaaa1){color:green}\n@scope (.xbbbbb1){.astryx-y{color:red}}`;
    const {markup} = aliasClasses(rows(600), css);
    expect(markup).toContain('xaaaaa1');
    expect(markup).toContain('xbbbbb1');
    expect(markup).not.toContain('xccccc1');
    expect(markup).toMatch(/class="astryx-table-cell xaaaaa1 xbbbbb1 _a0"/);
  });

  it('leaves a list whose alias would add more stylesheet than it saves markup', () => {
    const many = Array.from({length: 40}, (_, i) => `.xaaaaa1:nth-child(${i}){order:${i}}`).join('\n');
    const once = aliasClasses(rows(2), `${CSS}\n${many}`);
    expect(once.aliases).toBe(0);
    expect(once.markup).toBe(rows(2));
  });

  it('keeps a class that two compounds of a selector name, or that :nth-child(… of S) names, as itself', () => {
    const twice = aliasClasses(rows(600), `${CSS}\n.xaaaaa1 + .xaaaaa1{margin:1px}`);
    expect(twice.css).toContain('.xaaaaa1 + .xaaaaa1{margin:1px}');
    expect(twice.css).not.toContain('._a0 + ._a0');
    expect(twice.markup).toContain('xaaaaa1');
    // One compound that names a class twice, as StyleX raises a rule's
    // weight, keeps its meaning with the alias in both places.
    const weight = aliasClasses(rows(600), `${CSS}\n.xccccc1.xccccc1{margin:2px}`);
    expect(weight.css).toContain('.xccccc1.xccccc1,._a0._a0{margin:2px}');
    const ofS = aliasClasses(rows(600), `${CSS}\n:nth-child(2 of .xbbbbb1){margin:1px}`);
    expect(ofS.markup).toContain('xbbbbb1');
    expect(ofS.css).not.toContain('of ._a');
  });

  it('gives no alias to a class of a list that does not repeat, though a rule names it beside a repeated class', () => {
    const shared = Array.from({length: 200}, (_, i) => `<span class="xmark01 xu${String(i).padStart(5, '0')}">${i}</span>`).join('');
    const {markup, css} = aliasClasses(`${rows(600)}${shared}`, `${CSS}\n.xaaaaa1:where(.xmark01:hover *){color:blue}\n.xmark01{color:red}`);
    expect(markup).toContain('<span class="xmark01 xu00000">0</span>');
    expect(css).toContain('.xmark01{color:red}');
  });

  it('keeps a class that [class~="…"] names, and every class when another selector reads the whole class attribute', () => {
    const exact = aliasClasses(rows(600), `${CSS}\n[class~="xaaaaa1"]{outline:1px solid}`);
    expect(exact.markup).toContain('xaaaaa1');
    expect(exact.markup).not.toContain('xbbbbb1 ');
    const other = aliasClasses(rows(600), `${CSS}\n[class~="astryx-table-cell"]{outline:1px solid}`);
    expect(other.aliases).toBe(1);
    expect(other.markup).not.toContain('xaaaaa1');
    const drawn = aliasClasses(rows(600), CSS, undefined, new Set(['_a0', 'other']));
    expect(drawn.markup).toContain('<td class="astryx-table-cell _a1" data-density="balanced">');
    const named = aliasClasses(rows(600), `${CSS}\n[class~="_a0"]{outline:1px solid}`);
    expect(named.markup).toContain('<td class="astryx-table-cell _a1" data-density="balanced">');
    for (const read of ['[class*="bbbbb"]', '[class$="balanced"]', '[class^="astryx"]', '[class|="astryx"]', '[class="x"]', '[*|class*="bbbbb"]', '[|class^="astryx"]']) {
      const whole = aliasClasses(rows(600), `${CSS}\n@media (min-width: 1px){${read}{outline:1px solid}}`);
      expect(whole.aliases, read).toBe(0);
      expect(whole.markup, read).toBe(rows(600));
    }
  });

  it('gives no alias to a page class shaped like StyleX\'s that only the page\'s own stylesheet names', () => {
    const own = Array.from({length: 600}, (_, i) => `<td class="${LIST} xlarge">${i}</td>`).join('');
    const packageClasses = new Set(LIST.split(' '));
    const {markup, css, aliases} = aliasClasses(own, `${CSS}\n.xlarge{font-size:2rem}`, packageClasses);
    expect(aliases).toBe(1);
    expect(markup).toContain('<td class="xlarge _a0">0</td>');
    expect(css).toContain('.xlarge{font-size:2rem}');
    expect(css).not.toContain('.xlarge,._a0');
    const hooked = Array.from({length: 600}, (_, i) => `<td class="${LIST} my-hook">${i}</td>`).join('');
    const kept = aliasClasses(hooked, `${CSS}\n[class$="my-hook"]{outline:1px solid}`, packageClasses);
    expect(kept.aliases).toBe(0);
    expect(kept.markup).toBe(hooked);
  });

  it('gives no alias a name the page already uses', () => {
    const own = `<p class="_a0">own</p>${rows(600)}`;
    const {markup, css} = aliasClasses(own, `${CSS}\n._a0{font-weight:700}`);
    expect(markup.startsWith('<p class="_a0">own</p>')).toBe(true);
    expect(markup).toContain('<td class="astryx-table-cell _a1" data-density="balanced">');
    expect(css).toContain('.xaaaaa1,._a1{color:red}');
    expect(css).toContain('._a0{font-weight:700}');
  });

  it('changes nothing when a selector cannot be read, or nothing repeats', () => {
    expect(aliasClasses(rows(600), `${CSS}\n.xaaaaa1[{color:red}`).aliases).toBe(0);
    expect(aliasClasses('<p class="astryx-text">hi</p>', CSS)).toEqual({markup: '<p class="astryx-text">hi</p>', css: CSS, aliases: 0});
  });
});
