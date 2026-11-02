// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollCarries.test.ts
 * @input Uses vitest, scrollCarries
 * @output Unit tests for which scroll targets carry a node
 * @position Testing; validates scrollCarries.ts implementation
 *
 * SYNC: When scrollCarries.ts changes, update tests to match new behavior
 */

import {afterEach, describe, expect, it} from 'vitest';
import {scrollCarries} from './scrollCarries';

afterEach(() => {
  document.body.replaceChildren();
});

describe('scrollCarries', () => {
  it('counts the node’s document and every element that holds it', () => {
    const scroller = document.createElement('div');
    const row = document.createElement('div');
    const anchor = document.createElement('button');
    row.append(anchor);
    scroller.append(row);
    document.body.append(scroller);
    expect(scrollCarries(document, anchor)).toBe(true);
    expect(scrollCarries(document.body, anchor)).toBe(true);
    expect(scrollCarries(scroller, anchor)).toBe(true);
    expect(scrollCarries(row, anchor)).toBe(true);
  });

  it('does not count the node itself, an unrelated element, or no target', () => {
    const anchor = document.createElement('button');
    const sibling = document.createElement('div');
    document.body.append(anchor, sibling);
    expect(scrollCarries(anchor, anchor)).toBe(false);
    expect(scrollCarries(sibling, anchor)).toBe(false);
    expect(scrollCarries(null, anchor)).toBe(false);
  });

  it('counts a scroller outside the shadow root that holds the node', () => {
    const scroller = document.createElement('div');
    const host = document.createElement('div');
    scroller.append(host);
    document.body.append(scroller);
    const anchor = document.createElement('button');
    host.attachShadow({mode: 'open'}).append(anchor);
    expect(scrollCarries(scroller, anchor)).toBe(true);
    expect(scrollCarries(host, anchor)).toBe(true);
    expect(scrollCarries(document, anchor)).toBe(true);
  });

  it('does not count a node in another document', () => {
    const other = document.implementation.createHTMLDocument('other');
    const anchor = other.createElement('button');
    other.body.append(anchor);
    expect(scrollCarries(document, anchor)).toBe(false);
    expect(scrollCarries(other, anchor)).toBe(true);
  });
});
