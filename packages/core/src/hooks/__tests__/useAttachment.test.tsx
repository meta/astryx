// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAttachment.test.tsx
 * @input useAttachment with a function that finds its node after each commit
 * @output Proof that an attachment follows a node no ref holds: a replaced
 *   node is released and the new one attached, a commit that changes nothing
 *   does nothing, and the attachment is released at unmount
 * @position Testing for /packages/core/src/hooks/useAttachment.ts
 */

import {render} from '@testing-library/react';
import {createElement, useRef} from 'react';
import {describe, expect, it} from 'vitest';
import {useAttachment} from '../useAttachment';

/** A wrapper whose child button the attachment finds after each commit. */
function Found({log, button}: {log: string[]; button: string | null}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useAttachment(
    () => wrapperRef.current?.querySelector('button') ?? null,
    node => {
      log.push(`attach ${node.id}`);
      return () => log.push(`release ${node.id}`);
    },
    0,
  );
  return createElement(
    'div',
    {ref: wrapperRef},
    button == null
      ? null
      : createElement('button', {key: button, id: button, type: 'button'}),
  );
}

describe('useAttachment with a function that finds the node', () => {
  it('attaches the node it finds, and follows a replaced one', () => {
    const log: string[] = [];
    const view = render(createElement(Found, {log, button: 'a'}));
    expect(log).toEqual(['attach a']);
    view.rerender(createElement(Found, {log, button: 'a'}));
    expect(log).toEqual(['attach a']);
    view.rerender(createElement(Found, {log, button: 'b'}));
    expect(log).toEqual(['attach a', 'release a', 'attach b']);
    view.rerender(createElement(Found, {log, button: null}));
    expect(log).toEqual(['attach a', 'release a', 'attach b', 'release b']);
    view.rerender(createElement(Found, {log, button: 'c'}));
    view.unmount();
    expect(log.slice(-2)).toEqual(['attach c', 'release c']);
  });
});
