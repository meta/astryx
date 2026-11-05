// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import type {SyntheticEvent} from 'react';
import {chainEventHandlers} from './chainEventHandlers';

function fakeEvent(): SyntheticEvent {
  const event = {
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event as unknown as SyntheticEvent;
}

describe('chainEventHandlers', () => {
  it('calls every handler in order, skipping undefined ones', () => {
    const calls: string[] = [];
    chainEventHandlers(
      () => calls.push('a'),
      undefined,
      () => calls.push('b'),
    )(fakeEvent());
    expect(calls).toEqual(['a', 'b']);
  });

  it('keeps calling later handlers after one prevents default', () => {
    const calls: string[] = [];
    chainEventHandlers(
      (event: SyntheticEvent) => {
        event.preventDefault();
        calls.push('component');
      },
      (event: SyntheticEvent) => calls.push(`caller:${event.defaultPrevented}`),
    )(fakeEvent());
    expect(calls).toEqual(['component', 'caller:true']);
  });
});
