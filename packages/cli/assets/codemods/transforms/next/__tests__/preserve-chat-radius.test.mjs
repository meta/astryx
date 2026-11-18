// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  defineTheme,
  generateAdaptationCSS,
  generateThemeRules,
} from '@astryxdesign/core/theme';
import transform from '../preserve-chat-radius.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'theme.ts'}, api) ?? source;
}

/** Collapse whitespace so assertions ignore the printer's line breaks. */
const flat = text => text.replace(/\s+/g, ' ');

const IMPORT = `import {defineTheme} from '@astryxdesign/core/theme';\n`;
const TODO = /TODO\(astryx upgrade\): --radius-chat/g;

describe('preserve-chat-radius', () => {
  it('adds 28px to the tokens of a theme that sets neither the token nor extends', async () => {
    const output = flat(
      await applyTransform(
        `${IMPORT}export const theme = defineTheme({name: 'app', tokens: {'--radius-container': '16px'}});`,
      ),
    );
    expect(output).toMatch(
      /tokens: \{ ?'--radius-chat': '28px', '--radius-container': '16px' ?\}/,
    );
  });

  it('adds tokens when the theme has none', async () => {
    const output = flat(
      await applyTransform(`import {defineTheme} from '@astryxdesign/core';
export const theme = defineTheme({name: 'app'});`),
    );
    expect(output).toMatch(/tokens: \{ ?'--radius-chat': '28px' ?\}/);
  });

  it('keeps the page step of a literal radius scale, and leaves a scale whose steps match', async () => {
    const scaled = flat(
      await applyTransform(
        `${IMPORT}export const theme = defineTheme({name: 'app', radius: {base: 4, multiplier: 1.35}});`,
      ),
    );
    expect(scaled).toMatch(/'--radius-chat': '38px'/);

    const square = `${IMPORT}export const theme = defineTheme({name: 'app', radius: {base: 4, multiplier: 0}});`;
    expect(await applyTransform(square)).toBe(square);
  });

  it('compares with the container radius the theme ends up with', async () => {
    const container = `${IMPORT}export const theme = defineTheme({name: 'app', tokens: {'--radius-container': '28px'}});`;
    expect(await applyTransform(container)).toBe(container);

    const square = flat(
      await applyTransform(
        `${IMPORT}export const theme = defineTheme({name: 'app', radius: {base: 4, multiplier: 0}, tokens: {'--radius-container': '8px'}});`,
      ),
    );
    expect(square).toMatch(/'--radius-chat': '0px'/);

    // A spread after the container radius can replace it.
    const spread = flat(
      await applyTransform(
        `${IMPORT}export const theme = defineTheme({name: 'app', tokens: {'--radius-container': '28px', ...brand}});`,
      ),
    );
    expect(spread).toMatch(/'--radius-chat': '28px'/);
  });

  it("leaves a theme that sets the token, or extends another theme with no scale of its own, and keeps an extending theme's own scale", async () => {
    const own = `${IMPORT}export const theme = defineTheme({name: 'app', tokens: {'--radius-chat': '16px'}});`;
    expect(await applyTransform(own)).toBe(own);

    const child = `${IMPORT}import {neutralTheme} from '@astryxdesign/theme-neutral';
export const theme = defineTheme({name: 'app', extends: neutralTheme});`;
    expect(await applyTransform(child)).toBe(child);

    const scaled = flat(
      await applyTransform(`${IMPORT}import {neutralTheme} from '@astryxdesign/theme-neutral';
export const theme = defineTheme({name: 'app', extends: neutralTheme, radius: {base: 4, multiplier: 1.5}});`),
    );
    expect(scaled).toMatch(/tokens: \{ ?'--radius-chat': '42px' ?\}/);
  });

  it("gives each adaptation rule's radius scale its page step, completed from the theme's scale", async () => {
    const output = flat(
      await applyTransform(`${IMPORT}export const theme = defineTheme({
  name: 'app',
  radius: {base: 4, multiplier: 1},
  adaptations: {rules: [{when: {pointer: 'coarse'}, value: {radius: {multiplier: 2}}}]},
});`),
    );
    expect(output).toMatch(
      /value: \{ ?radius: \{ ?multiplier: 2 ?\}, tokens: \{ ?'--radius-chat': '56px' ?\} ?\}/,
    );
    expect(output).toMatch(/tokens: \{ ?'--radius-chat': '28px' ?\}/);
  });

  it('keeps the theme token when an adaptation rule changes its container radius', async () => {
    const output = flat(
      await applyTransform(`${IMPORT}export const theme = defineTheme({
  name: 'app',
  tokens: {'--radius-container': '28px'},
  adaptations: {rules: [{when: {width: {below: 'md'}}, value: {tokens: {'--radius-container': '16px'}}}]},
});`),
    );
    expect(output).toMatch(
      /tokens: \{ ?'--radius-chat': '28px', '--radius-container': '28px' ?\}/,
    );
  });

  it('puts the token before a spread in the tokens, so the spread still wins', async () => {
    const output = flat(
      await applyTransform(
        `${IMPORT}export const theme = defineTheme({name: 'app', tokens: {...brandTokens}});`,
      ),
    );
    expect(output).toMatch(
      /tokens: \{ ?'--radius-chat': '28px', \.\.\.brandTokens ?\}/,
    );
  });

  it('migrates a default-exported theme object', async () => {
    const output = flat(
      await applyTransform(
        `export default {name: 'app', tokens: {'--radius-container': '16px'}};`,
      ),
    );
    expect(output).toMatch(/'--radius-chat': '28px'/);

    const other = `export default {name: 'app', title: 'Not a theme'};`;
    expect(await applyTransform(other)).toBe(other);
  });

  it('leaves a TODO, once, where it cannot read the theme', async () => {
    const source = `${IMPORT}export const a = defineTheme({...base, name: 'a'});
export const b = defineTheme({name: 'b', tokens: brandTokens});
export const c = defineTheme({name: 'c', radius: scale});
const config = {name: 'd'};
export const d = defineTheme(config);
export const e = defineTheme({name: 'e', radius: {base: 4, multiplier: 1}, adaptations});`;
    const once = await applyTransform(source);
    expect(once.match(TODO)).toHaveLength(5);
    expect(once).toContain(
      'add "--radius-chat" at the page step of each radius scale',
    );
    expect(once).not.toContain("'--radius-chat': '28px',");
    expect(await applyTransform(once)).toBe(once);
  });

  it('leaves a top-level spread alone when the tokens after it set the token', async () => {
    const source = `${IMPORT}export const theme = defineTheme({...base, name: 'app', tokens: {'--radius-chat': '20px'}});`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('ignores a defineTheme that is not imported from Astryx, and is idempotent', async () => {
    const other = `import {defineTheme} from 'other-library';
export const theme = defineTheme({name: 'app'});`;
    expect(await applyTransform(other)).toBe(other);

    const once = await applyTransform(
      `${IMPORT}export const theme = defineTheme({name: 'app', radius: {base: 4, multiplier: 1}, adaptations: {rules: [{when: {pointer: 'coarse'}, value: {radius: {multiplier: 2}}}]}});`,
    );
    expect(await applyTransform(once)).toBe(once);
  });
});

/**
 * Builds a fixture with Core and reads its effective `--radius-chat` at the
 * theme root and under each adaptation rule, as the theme's CSS resolves it.
 */
function effectiveChatRadius(source) {
  const body = source
    .replace(/^import .*;$/gmu, '')
    .replace(/export const theme =/u, 'return');
  const theme = new Function('defineTheme', body)(defineTheme);
  const declarations = css => {
    const found = {};
    for (const [, name, value] of css.matchAll(
      /(--radius-(?:chat|container)):\s*([^;]+);/gu,
    )) {
      found[name] = value.trim();
    }
    return found;
  };
  const root = declarations(generateThemeRules(theme).join('\n'));
  const blocks = (generateAdaptationCSS(theme).component ?? '')
    .split('@media ')
    .slice(1)
    .map(chunk => ({
      query: chunk.slice(0, chunk.indexOf('{')).trim(),
      found: declarations(chunk),
    }));
  // Core's document default is `var(--radius-container)` computed at the
  // document root, so a scope that declares neither token inherits 12px.
  const resolve = scope => {
    const chat = scope['--radius-chat'] ?? root['--radius-chat'];
    if (chat === undefined) return '12px';
    if (chat !== 'var(--radius-container)') return chat;
    return scope['--radius-container'] ?? root['--radius-container'] ?? '12px';
  };
  return {
    root: resolve({}),
    rules: (theme.__adaptationRules ?? []).map(rule =>
      resolve(blocks.find(block => block.query === rule.query)?.found ?? {}),
    ),
  };
}

const BASE = `defineTheme({name: 'base', tokens: {'--radius-chat': '28px'}})`;
const COARSE = `when: {pointer: 'coarse'}`;
const BELOW_MD = `when: {width: {below: 'md'}}`;

/**
 * Each fixture with its chat radius before the default change: 28px, the page
 * step of a radius scale, or the inherited value of a base that keeps 28px.
 * `changes` says whether it differs on the new default without the codemod.
 */
const DOWNSTREAM = [
  {config: `{name: 'a'}`, root: '28px', changes: true},
  {
    config: `{name: 'a', tokens: {'--radius-container': '16px'}}`,
    root: '28px',
    changes: true,
  },
  {
    config: `{name: 'a', tokens: {'--radius-container': '28px'}}`,
    root: '28px',
    changes: false,
  },
  {
    config: `{name: 'a', radius: {base: 4, multiplier: 1.5}}`,
    root: '42px',
    changes: true,
  },
  {
    config: `{name: 'a', radius: {base: 4, multiplier: 0}}`,
    root: '0px',
    changes: false,
  },
  {
    config: `{name: 'a', radius: {base: 4, multiplier: 0}, tokens: {'--radius-container': '8px'}}`,
    root: '0px',
    changes: true,
  },
  {
    config: `{name: 'a', tokens: {'--radius-container': '28px', ...{'--radius-container': '12px'}}}`,
    root: '28px',
    changes: true,
  },
  {
    config: `{name: 'a', extends: ${BASE}, tokens: {'--radius-container': '8px'}}`,
    root: '28px',
    changes: false,
  },
  {
    config: `{name: 'a', extends: ${BASE}, radius: {base: 4, multiplier: 1.5}}`,
    root: '42px',
    changes: true,
  },
  {
    config: `{name: 'a', radius: {base: 4, multiplier: 1}, adaptations: {rules: [{${COARSE}, value: {radius: {multiplier: 2}}}]}}`,
    root: '28px',
    rules: ['56px'],
    changes: true,
  },
  {
    config: `{name: 'a', tokens: {'--radius-container': '28px'}, adaptations: {rules: [{${BELOW_MD}, value: {tokens: {'--radius-container': '16px'}}}]}}`,
    root: '28px',
    rules: ['28px'],
    changes: true,
  },
  {
    config: `{name: 'a', adaptations: {rules: [{${BELOW_MD}, value: {tokens: {'--radius-container': '16px'}}}]}}`,
    root: '28px',
    rules: ['28px'],
    changes: true,
  },
  {
    config: `{name: 'a', extends: ${BASE}, adaptations: {rules: [{${COARSE}, value: {radius: {base: 4, multiplier: 2}}}]}}`,
    root: '28px',
    rules: ['56px'],
    changes: true,
  },
];

describe('preserve-chat-radius, built with Core', () => {
  it.each(DOWNSTREAM)(
    'keeps the chat radius of $config',
    async ({config, root, rules = [], changes}) => {
      const source = `${IMPORT}export const theme = defineTheme(${config});`;
      const before = {root, rules};
      expect(effectiveChatRadius(await applyTransform(source))).toEqual(before);
      // Without the codemod, the new default changes the fixture, or not.
      const unmigrated = effectiveChatRadius(source);
      if (changes) expect(unmigrated).not.toEqual(before);
      else expect(unmigrated).toEqual(before);
    },
  );
});
