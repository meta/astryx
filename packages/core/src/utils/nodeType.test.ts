// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nodeType.test.ts
 * @input jsdom nodes from this window, from a same-origin iframe's window,
 *   moved from this window into the iframe's document, and from a document
 *   with no window
 * @output Checks that each guard holds for a node from any window, where
 *   `instanceof` against this window's classes fails for the iframe's nodes
 * @position Unit tests for utils/nodeType.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {
  isDocument,
  isElement,
  isHTMLElement,
  isNode,
  isShadowRoot,
} from './nodeType';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A same-origin iframe's document, whose window has classes of its own. */
function frameDocument(): Document {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return frame.contentDocument as Document;
}

describe('nodeType', () => {
  it("holds for a same-origin iframe's nodes, which this window's classes do not match", () => {
    const doc = frameDocument();
    doc.body.innerHTML = '<div id="host"></div><svg id="icon"></svg>';
    const host = doc.getElementById('host') as HTMLElement;
    const icon = doc.getElementById('icon') as Element;
    const shadow = host.attachShadow({mode: 'open'});
    const text = doc.createTextNode('x');
    expect(host instanceof Element).toBe(false);
    expect(isNode(text)).toBe(true);
    expect(isElement(host)).toBe(true);
    expect(isHTMLElement(host)).toBe(true);
    expect(isDocument(doc)).toBe(true);
    expect(isShadowRoot(shadow)).toBe(true);
    expect(isElement(icon)).toBe(true);
    expect(isHTMLElement(icon)).toBe(false);
    expect(isElement(text)).toBe(false);
    expect(isDocument(host)).toBe(false);
    expect(isShadowRoot(doc.createDocumentFragment())).toBe(false);
  });

  it("holds for this window's nodes", () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.getElementById('host') as HTMLElement;
    const shadow = host.attachShadow({mode: 'open'});
    expect(isNode(host)).toBe(true);
    expect(isElement(host)).toBe(true);
    expect(isHTMLElement(host)).toBe(true);
    expect(isDocument(document)).toBe(true);
    expect(isShadowRoot(shadow)).toBe(true);
  });

  it('refuses a value that is not a node', () => {
    for (const value of [null, undefined, 1, 'div', {}, {nodeType: '1'}]) {
      expect(isNode(value)).toBe(false);
      expect(isElement(value)).toBe(false);
      expect(isHTMLElement(value)).toBe(false);
      expect(isDocument(value)).toBe(false);
      expect(isShadowRoot(value)).toBe(false);
    }
  });

  it('holds for an element this window makes and then moves into a same-origin iframe', () => {
    const doc = frameDocument();
    const moved = document.createElement('div');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    doc.body.append(moved, icon);
    // The element keeps this window's class while the iframe owns it.
    expect(moved.ownerDocument === doc).toBe(true);
    expect(isHTMLElement(moved)).toBe(true);
    expect(isHTMLElement(icon)).toBe(false);
  });

  it('holds for an element of a document with no window', () => {
    const doc = document.implementation.createHTMLDocument('');
    const element = doc.createElement('div');
    expect(doc.defaultView).toBeNull();
    expect(isHTMLElement(element)).toBe(true);
  });
});
