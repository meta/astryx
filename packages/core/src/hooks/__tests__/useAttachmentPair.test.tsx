// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAttachmentPair.test.tsx
 * @input useAttachment and useAttachmentPair
 * @output Proof that an attachment starts once its nodes are there and
 *   follows each node and its key, and its document only when asked. A commit
 *   that changes none does nothing, and the attachment is released when a
 *   node goes and at unmount
 * @position Testing for /packages/core/src/hooks/useAttachment.ts
 */

import {render} from '@testing-library/react';
import {createElement, useRef} from 'react';
import {describe, expect, it} from 'vitest';
import {useAttachment, useAttachmentPair} from '../useAttachment';

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

/** One node inside a wrapper, so it can move while React keeps the wrapper. */
function Single({log, follows}: {log: string[]; follows?: boolean}) {
  const ref = useRef<HTMLSpanElement>(null);
  useAttachment(
    ref,
    node => {
      const where = node.ownerDocument === document ? 'page' : 'other';
      log.push(`attach ${node.id} in ${where}`);
      return () => log.push(`release ${node.id}`);
    },
    null,
    {followsDocument: follows},
  );
  return createElement('div', null, createElement('span', {id: 'solo', ref}));
}

/** Moves the node with `id` into a new document of its own. */
function moveToAnotherDocument(container: HTMLElement, id: string) {
  const node = container.querySelector(`#${id}`)!;
  const other = document.implementation.createHTMLDocument('other');
  other.body.append(other.adoptNode(node));
}

describe('useAttachment', () => {
  it('keeps the attachment when its node moves to another document, unless asked to follow it', () => {
    const log: string[] = [];
    const view = render(createElement(Single, {log}));
    moveToAnotherDocument(view.container, 'solo');
    view.rerender(createElement(Single, {log}));
    expect(log).toEqual(['attach solo in page']);
    view.unmount();
    expect(log).toEqual(['attach solo in page', 'release solo']);
  });

  it('with followsDocument, attaches the node again in the document it moved to, and only then', () => {
    const log: string[] = [];
    const view = render(createElement(Single, {log, follows: true}));
    view.rerender(createElement(Single, {log, follows: true}));
    moveToAnotherDocument(view.container, 'solo');
    view.rerender(createElement(Single, {log, follows: true}));
    view.rerender(createElement(Single, {log, follows: true}));
    expect(log).toEqual([
      'attach solo in page',
      'release solo',
      'attach solo in other',
    ]);
    view.unmount();
    expect(log.at(-1)).toBe('release solo');
  });
});

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

  it('keeps the pair attached when a node moves to another document', () => {
    const log: string[] = [];
    const view = render(createElement(Pair, {log}));
    moveToAnotherDocument(view.container, 'a');
    view.rerender(createElement(Pair, {log}));
    expect(log).toEqual(['attach a+b']);
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
