// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it} from 'vitest';
import {scrollingAncestor} from './scrollingAncestor';

// A box whose content is `content` px tall in a `height` px box.
function box(overflowY: string, height: number, content: number) {
  const node = document.createElement('div');
  node.style.overflowY = overflowY;
  Object.defineProperty(node, 'clientHeight', {value: height});
  Object.defineProperty(node, 'scrollHeight', {value: content});
  return node;
}

describe('scrollingAncestor', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('finds the nearest ancestor that scrolls on the block axis, past one that clips and one with nothing to scroll', () => {
    const scroller = box('auto', 200, 600);
    const clipping = box('hidden', 200, 600);
    const short = box('scroll', 200, 200);
    const field = document.createElement('input');
    short.append(field);
    clipping.append(short);
    scroller.append(clipping);
    document.body.append(scroller);
    expect(scrollingAncestor(field)).toBe(scroller);
  });

  it('stops after the bound: a scroller beyond it does not count, and the bound itself does', () => {
    const outer = box('auto', 200, 600);
    const bound = box('visible', 200, 200);
    const field = document.createElement('input');
    bound.append(field);
    outer.append(bound);
    document.body.append(outer);
    expect(scrollingAncestor(field, bound)).toBeNull();
    const scrollingBound = box('auto', 200, 600);
    const inner = document.createElement('input');
    scrollingBound.append(inner);
    outer.append(scrollingBound);
    expect(scrollingAncestor(inner, scrollingBound)).toBe(scrollingBound);
  });
});
