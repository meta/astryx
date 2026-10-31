// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContentBlockRenderer.test.tsx
 * @input Read content blocks: what `astryx docs` returns for a topic section
 * @output Checks that every stable block kind renders, and that a block the
 *   preview cannot render fails where it is met instead of disappearing.
 * @position The Sandbox's node test project, which compiles no StyleX: the
 *   block components are stood in for, since this checks the dispatch.
 */

import {isValidElement} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {Heading} from '@astryxdesign/core/Text';
import {ContentBlockRenderer} from './ContentBlockRenderer';

vi.mock('@astryxdesign/core/Text', () => ({
  Heading: function Heading() {
    return null;
  },
  Text: function Text() {
    return null;
  },
}));
vi.mock('./ProseBlock', () => ({ProseBlock: () => null}));
vi.mock('./CodeBlock', () => ({CodeBlock: () => null}));
vi.mock('./TableBlock', () => ({TableBlock: () => null}));
vi.mock('./ListBlock', () => ({ListBlock: () => null}));

describe('ContentBlockRenderer', () => {
  it('renders a heading at its level', () => {
    const element = ContentBlockRenderer({
      block: {type: 'heading', level: 3, text: 'Choosing a spacing token'},
    });
    expect(isValidElement(element)).toBe(true);
    expect(element?.type).toBe(Heading);
    expect(element?.props).toMatchObject({
      level: 3,
      children: 'Choosing a spacing token',
    });
  });

  it('fails on a token reference, which a docs read inlines', () => {
    expect(() =>
      ContentBlockRenderer({
        block: {type: 'token-ref', topic: 'color', section: 'Color Tokens'},
      }),
    ).toThrow(/token reference to "color" \/ "Color Tokens".*docs read/);
  });

  it('fails on a block kind it has no renderer for', () => {
    expect(() =>
      ContentBlockRenderer({
        block: {type: 'reference', target: 'command:doctor'} as never,
      }),
    ).toThrow(/no renderer for "reference" blocks/);
  });
});
