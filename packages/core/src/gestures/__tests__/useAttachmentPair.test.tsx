// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAttachmentPair.test.tsx
 * @input useAttachmentPair
 * @output Proof that an attachment of two nodes is made once both are there,
 *   follows either node's replacement and its key, does nothing on a commit
 *   that changes neither, and is released when a node goes and at unmount
 * @position Testing for /packages/core/src/gestures/useAttachment.ts
 */

import {render} from '@testing-library/react';
import {createElement, useRef} from 'react';
import {describe, expect, it} from 'vitest';
import {useAttachmentPair} from '../useAttachment';

interface PairProps {
  log: string[];
  first?: string | null;
  second?: string | null;
  attachKey?: unknown;
}

/** Two nodes, each shown under an id that names it (a new id is a new node). */
function Pair({log, first = 'a', second = 'b', attachKey = 0}: PairProps) {
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLSpanElement>(null);
  useAttachmentPair(
    firstRef,
    secondRef,
    (firstNode, secondNode) => {
      const pair = `${firstNode.id}+${secondNode.id}`;
      log.push(`attach ${pair}`);
      return () => log.push(`release ${pair}`);
    },
    attachKey,
  );
  return createElement(
    'div',
    null,
    first == null
      ? null
      : createElement('div', {key: first, id: first, ref: firstRef}),
    second == null
      ? null
      : createElement('span', {key: second, id: second, ref: secondRef}),
  );
}

describe('useAttachmentPair', () => {
  it('attaches once both nodes are there, and not before', () => {
    const log: string[] = [];
    const view = render(createElement(Pair, {log, second: null}));
    expect(log).toEqual([]);
    view.rerender(createElement(Pair, {log}));
    expect(log).toEqual(['attach a+b']);
    view.unmount();
  });

  it('does nothing on a commit that changes neither node nor the key', () => {
    const log: string[] = [];
    const view = render(createElement(Pair, {log}));
    view.rerender(createElement(Pair, {log}));
    view.rerender(createElement(Pair, {log}));
    expect(log).toEqual(['attach a+b']);
    view.unmount();
  });

  it('releases the pair and attaches the new one when either node is replaced', () => {
    const log: string[] = [];
    const view = render(createElement(Pair, {log}));
    view.rerender(createElement(Pair, {log, first: 'c'}));
    view.rerender(createElement(Pair, {log, first: 'c', second: 'd'}));
    expect(log).toEqual([
      'attach a+b',
      'release a+b',
      'attach c+b',
      'release c+b',
      'attach c+d',
    ]);
    view.unmount();
  });

  it('attaches again when the key changes', () => {
    const log: string[] = [];
    const view = render(createElement(Pair, {log, attachKey: 'mouse'}));
    view.rerender(createElement(Pair, {log, attachKey: 'touch'}));
    expect(log).toEqual(['attach a+b', 'release a+b', 'attach a+b']);
    view.unmount();
  });

  it('releases when a node goes, and the last attachment at unmount', () => {
    const log: string[] = [];
    const view = render(createElement(Pair, {log}));
    view.rerender(createElement(Pair, {log, first: null}));
    expect(log).toEqual(['attach a+b', 'release a+b']);
    view.rerender(createElement(Pair, {log, first: 'e'}));
    view.unmount();
    expect(log).toEqual([
      'attach a+b',
      'release a+b',
      'attach e+b',
      'release e+b',
    ]);
  });
});
