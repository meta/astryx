// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollView.test.ts
 * @input isInsideScrollView on elements in a same-origin iframe's document,
 *   in jsdom, with the boxes' scroll sizes stubbed
 * @output A touch in another window's document finds the scroll box above it,
 *   and a fixed bar there ends the walk (`spec:AST-094` FR11)
 * @position Unit tests for utils/scrollView.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {isInsideScrollView} from './scrollView';

/** Gives `element` the scroll sizes of a box that overflows on y. */
function overflowsY(element: Element): void {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: 100,
  });
}

/** A same-origin iframe's document; the iframe goes with the body's reset. */
function frameDocument(): Document {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return frame.contentDocument as Document;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe("isInsideScrollView in another window's document (spec:AST-094 FR11)", () => {
  it('finds the scroll box above the touch', () => {
    const doc = frameDocument();
    doc.body.innerHTML =
      '<div id="box" style="overflow-y: auto"><button id="row">Row</button></div>';
    overflowsY(doc.getElementById('box') as Element);
    expect(isInsideScrollView(doc.getElementById('row') as Element)).toBe(true);
  });

  it('stops at a fixed bar, though the page under it scrolls', () => {
    const doc = frameDocument();
    doc.body.innerHTML =
      '<div id="bar" style="position: fixed"><button id="tab">Tab</button></div>';
    overflowsY(doc.scrollingElement ?? doc.documentElement);
    expect(isInsideScrollView(doc.getElementById('tab') as Element)).toBe(
      false,
    );
  });
});
