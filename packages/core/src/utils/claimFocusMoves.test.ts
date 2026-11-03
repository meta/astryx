// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file claimFocusMoves.test.ts
 * @input Uses vitest and jsdom
 * @output A move whose destination the pick returns is focused with
 *   preventScroll in its blur's capture phase, ahead of any page listener;
 *   a declined move, an already active destination and a move after the
 *   unsubscribe are left alone
 * @position Unit tests of packages/core/src/utils/claimFocusMoves.ts
 */

import {afterEach, expect, it, vi} from 'vitest';

import {claimFocusMoves} from './claimFocusMoves';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function fields(): [HTMLInputElement, HTMLInputElement] {
  document.body.innerHTML = '<input id="from" /><input id="to" />';
  return [
    document.getElementById('from') as HTMLInputElement,
    document.getElementById('to') as HTMLInputElement,
  ];
}

/** The blur of a focus move from `from` to `to`. */
function move(from: HTMLElement, to: HTMLElement | null): void {
  from.dispatchEvent(new FocusEvent('blur', {relatedTarget: to}));
}

it('focuses the destination the pick returns with preventScroll, in the capture phase ahead of page listeners', () => {
  const [from, to] = fields();
  from.focus();
  const order: string[] = [];
  const focus = vi
    .spyOn(to, 'focus')
    .mockImplementation(() => order.push('claim'));
  from.addEventListener('blur', () => order.push('page'));
  const stop = claimFocusMoves(document, event =>
    event.relatedTarget === to ? to : null,
  );
  move(from, to);
  expect(focus).toHaveBeenCalledWith({preventScroll: true});
  expect(order).toEqual(['claim', 'page']);
  stop();
});

it('leaves a move the pick declines, an already active destination and every move after the unsubscribe to the browser', () => {
  const [from, to] = fields();
  to.focus();
  const pick = vi.fn((event: FocusEvent) =>
    event.relatedTarget === to ? to : null,
  );
  const stop = claimFocusMoves(document, pick);
  const focus = vi.spyOn(to, 'focus');
  // Declined: the move goes to `from`.
  move(to, from);
  // Already active: nothing to claim.
  move(from, to);
  expect(pick).toHaveBeenCalledTimes(2);
  expect(focus).not.toHaveBeenCalled();
  stop();
  move(from, to);
  expect(pick).toHaveBeenCalledTimes(2);
  expect(focus).not.toHaveBeenCalled();
});
