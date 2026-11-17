// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../preserve-chat-radius.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'theme.ts'}, api) ?? source;
}

/** Collapse whitespace so assertions ignore the printer's line breaks. */
const flat = text => text.replace(/\s+/g, ' ');

describe('preserve-chat-radius', () => {
  it('adds 28px to the tokens of a theme that sets neither the token nor extends', async () => {
    const output = flat(
      await applyTransform(`import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app', tokens: {'--radius-container': '16px'}});`),
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
      await applyTransform(`import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app', radius: {base: 4, multiplier: 1.35}});`),
    );
    expect(scaled).toMatch(/'--radius-chat': '38px'/);

    const square = `import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app', radius: {base: 4, multiplier: 0}});`;
    expect(await applyTransform(square)).toBe(square);
  });

  it('compares with the container radius the theme sets', async () => {
    const container = `import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app', tokens: {'--radius-container': '28px'}});`;
    expect(await applyTransform(container)).toBe(container);

    const square = flat(
      await applyTransform(`import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app', radius: {base: 4, multiplier: 0}, tokens: {'--radius-container': '8px'}});`),
    );
    expect(square).toMatch(/'--radius-chat': '0px'/);
  });

  it('leaves a theme that sets the token or extends another theme', async () => {
    const own = `import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app', tokens: {'--radius-chat': '16px'}});`;
    expect(await applyTransform(own)).toBe(own);

    const child = `import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';
export const theme = defineTheme({name: 'app', extends: neutralTheme});`;
    expect(await applyTransform(child)).toBe(child);
  });

  it('puts the token before a spread in the tokens, so the spread still wins', async () => {
    const output = flat(
      await applyTransform(`import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app', tokens: {...brandTokens}});`),
    );
    expect(output).toMatch(
      /tokens: \{ ?'--radius-chat': '28px', \.\.\.brandTokens ?\}/,
    );
  });

  it('leaves a TODO, once, where it cannot read the theme', async () => {
    const source = `import {defineTheme} from '@astryxdesign/core/theme';
export const a = defineTheme({...base, name: 'a'});
export const b = defineTheme({name: 'b', tokens: brandTokens});
export const c = defineTheme({name: 'c', radius: scale});`;
    const once = await applyTransform(source);
    expect(once.match(/TODO\(astryx upgrade\): --radius-chat/g)).toHaveLength(
      3,
    );
    expect(once).not.toContain("'--radius-chat': '28px',");
    expect(await applyTransform(once)).toBe(once);
  });

  it('ignores a defineTheme that is not imported from Astryx, and is idempotent', async () => {
    const other = `import {defineTheme} from 'other-library';
export const theme = defineTheme({name: 'app'});`;
    expect(await applyTransform(other)).toBe(other);

    const once =
      await applyTransform(`import {defineTheme} from '@astryxdesign/core/theme';
export const theme = defineTheme({name: 'app'});`);
    expect(await applyTransform(once)).toBe(once);
  });
});
