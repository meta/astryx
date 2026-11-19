// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {childrenReader, dropperOf} from './dropped-text.mjs';

const CORE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../core',
);

/** @param {string} name @param {string | null} [from] */
const at = (name, from = '@astryxdesign/core') => ({
  component: name,
  line: 1,
  from,
  name,
});

describe('dropperOf', () => {
  const takes = childrenReader(CORE_DIR);

  it('names the element when its docs list no children', async () => {
    expect(await dropperOf([at('ListItem'), at('List')], takes)).toMatchObject({
      name: 'ListItem',
    });
  });

  it('names the innermost component around the text whose docs list no children', async () => {
    expect(
      await dropperOf([at('Text'), at('Badge'), at('VStack')], takes),
    ).toMatchObject({name: 'Badge'});
  });

  it('is null when the element takes children: a later paint shows its text', async () => {
    expect(await dropperOf([at('Heading'), at('VStack')], takes)).toBeNull();
    expect(await dropperOf([at('Banner')], takes)).toBeNull();
  });

  it('reads a component documented in its family doc', async () => {
    expect(await takes(at('VStack'))).toBe(true);
  });

  it('reads a doc that keeps its own props in its components entry', async () => {
    expect(await takes(at('Link'))).toBe(true);
    expect(await takes(at('Item'))).toBe(false);
    expect(await dropperOf([at('Text'), at('Item')], takes)).toMatchObject({
      name: 'Item',
    });
  });

  it("cannot say when a component around the text is the page's own or another package's", async () => {
    expect(await dropperOf([at('Card', null)], takes)).toBeUndefined();
    expect(await dropperOf([at('Thing', 'some-ui')], takes)).toBeUndefined();
    expect(
      await dropperOf([at('Text'), at('StatCard', null)], takes),
    ).toBeUndefined();
    expect(
      await dropperOf([at('Badge')], childrenReader(null)),
    ).toBeUndefined();
  });

  it('reads each doc once', async () => {
    const first = takes(at('Badge', '@astryxdesign/core/Badge'));
    expect(takes(at('Badge'))).toBe(first);
  });
});
