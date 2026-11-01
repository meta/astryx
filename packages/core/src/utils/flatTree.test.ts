// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it} from 'vitest';
import {containsAlongFlatTree} from './flatTree';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('containsAlongFlatTree', () => {
  it('holds for the node itself and for its descendants', () => {
    document.body.innerHTML = '<div id="outer"><p id="inner">text</p></div>';
    const outer = document.getElementById('outer')!;
    const inner = document.getElementById('inner')!;
    expect(containsAlongFlatTree(outer, outer)).toBe(true);
    expect(containsAlongFlatTree(outer, inner)).toBe(true);
    expect(containsAlongFlatTree(outer, inner.firstChild!)).toBe(true);
  });

  it('crosses an open shadow root to its host, which Node.contains does not', () => {
    document.body.innerHTML =
      '<section id="wrap"><div id="host"></div></section>';
    const wrap = document.getElementById('wrap')!;
    const host = document.getElementById('host')!;
    const button = document.createElement('button');
    host.attachShadow({mode: 'open'}).append(button);
    expect(wrap.contains(button)).toBe(false);
    expect(containsAlongFlatTree(wrap, button)).toBe(true);
    expect(containsAlongFlatTree(host, button)).toBe(true);
  });

  it('does not hold for a sibling, an ancestor, or a detached node', () => {
    document.body.innerHTML =
      '<div id="a"><span id="child"></span></div><div id="b"></div>';
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    const child = document.getElementById('child')!;
    expect(containsAlongFlatTree(b, child)).toBe(false);
    expect(containsAlongFlatTree(child, a)).toBe(false);
    expect(containsAlongFlatTree(a, document.createElement('i'))).toBe(false);
  });
});
