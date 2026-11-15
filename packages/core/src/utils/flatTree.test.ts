// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it} from 'vitest';
import {
  containsAlongFlatTree,
  deepActiveElement,
  shadowHostOf,
  shadowRootsOutward,
} from './flatTree';

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

describe('deepActiveElement', () => {
  it("is the document's focused element in light DOM, and null without a document", () => {
    document.body.innerHTML = '<input id="field" />';
    const field = document.getElementById('field') as HTMLInputElement;
    field.focus();
    expect(deepActiveElement(document)).toBe(field);
    expect(deepActiveElement(null)).toBeNull();
    expect(deepActiveElement(undefined)).toBeNull();
  });

  it('goes down through open shadow roots to the element that has focus', () => {
    const outer = document.createElement('div');
    document.body.append(outer);
    const outerRoot = outer.attachShadow({mode: 'open'});
    const inner = document.createElement('span');
    outerRoot.append(inner);
    const innerRoot = inner.attachShadow({mode: 'open'});
    const button = document.createElement('button');
    innerRoot.append(button);
    button.focus();
    // The document sees only the outermost host.
    expect(document.activeElement).toBe(outer);
    expect(deepActiveElement(document)).toBe(button);
  });
});

describe('shadowHostOf', () => {
  it('is the host of an open or closed shadow root, and null for any other node', () => {
    const open = document.createElement('div');
    const closed = document.createElement('div');
    document.body.append(open, closed);
    expect(shadowHostOf(open.attachShadow({mode: 'open'}))).toBe(open);
    expect(shadowHostOf(closed.attachShadow({mode: 'closed'}))).toBe(closed);
    expect(shadowHostOf(document)).toBeNull();
    expect(shadowHostOf(document.createDocumentFragment())).toBeNull();
    expect(shadowHostOf(open)).toBeNull();
  });

  it('is the host of a shadow root from another window too', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const host = frame.contentDocument!.createElement('div');
    frame.contentDocument!.body.append(host);
    expect(shadowHostOf(host.attachShadow({mode: 'closed'}))).toBe(host);
  });
});

describe('shadowRootsOutward', () => {
  it('lists the roots from a root inside others out to the document, each with its host', () => {
    const outerHost = document.createElement('div');
    document.body.append(outerHost);
    const outer = outerHost.attachShadow({mode: 'closed'});
    const innerHost = document.createElement('div');
    outer.append(innerHost);
    const inner = innerHost.attachShadow({mode: 'open'});
    expect(shadowRootsOutward(inner)).toEqual([
      {root: inner, host: innerHost},
      {root: outer, host: outerHost},
    ]);
    expect(shadowRootsOutward(outer)).toEqual([{root: outer, host: outerHost}]);
    expect(shadowRootsOutward(document)).toEqual([]);
  });
});
