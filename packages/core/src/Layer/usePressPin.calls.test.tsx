// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePressPin.calls.test.tsx
 * @input Tooltip and HoverCard, with usePressPin, the touch trigger hooks and
 *   useLayerDismissal wrapped in call counters
 * @output Unit tests: each layer's hook makes one usePressPin call per render,
 *   and that call is the only path to the touch trigger
 *   (`architecture:react-component-runtime` INV16)
 * @position Beside usePressPin.test.tsx, which covers what the pin does
 *
 * Each host calls useLayerDismissal once per render, so a host that makes one
 * usePressPin call per render shows as equal pin and render counts. Every
 * touch trigger call must come from inside usePressPin, and the public
 * useTouchTrigger is never called.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type * as PressPinModule from './usePressPin';
import type * as TouchTriggerModule from './useTouchTrigger';
import type * as LayerDismissalModule from './useLayerDismissal';

const calls = vi.hoisted(() => ({
  pin: 0,
  touch: 0,
  publicTouch: 0,
  touchOutsidePin: 0,
  render: 0,
  isInPin: false,
}));

vi.mock('./usePressPin', async importOriginal => {
  const actual = await importOriginal<typeof PressPinModule>();
  return {
    ...actual,
    usePressPin: (options: PressPinModule.UsePressPinOptions) => {
      calls.pin += 1;
      calls.isInPin = true;
      try {
        return actual.usePressPin(options);
      } finally {
        calls.isInPin = false;
      }
    },
  };
});

vi.mock('./useTouchTrigger', async importOriginal => {
  const actual = await importOriginal<typeof TouchTriggerModule>();
  return {
    ...actual,
    useTouchTrigger: (options: TouchTriggerModule.UseTouchTriggerOptions) => {
      calls.publicTouch += 1;
      return actual.useTouchTrigger(options);
    },
    useTouchTriggerInternal: (
      options: TouchTriggerModule.UseTouchTriggerOptions,
    ) => {
      calls.touch += 1;
      if (!calls.isInPin) {
        calls.touchOutsidePin += 1;
      }
      return actual.useTouchTriggerInternal(options);
    },
  };
});

vi.mock('./useLayerDismissal', async importOriginal => {
  const actual = await importOriginal<typeof LayerDismissalModule>();
  return {
    ...actual,
    useLayerDismissal: (
      options: LayerDismissalModule.UseLayerDismissalOptions,
    ) => {
      calls.render += 1;
      return actual.useLayerDismissal(options);
    },
  };
});

const {Tooltip} = await import('../Tooltip/Tooltip');
const {HoverCard} = await import('../HoverCard/HoverCard');

beforeEach(() => {
  calls.pin = 0;
  calls.touch = 0;
  calls.publicTouch = 0;
  calls.touchOutsidePin = 0;
  calls.render = 0;
});

function expectOneCallPerRender() {
  expect(calls.render).toBeGreaterThan(0);
  expect(calls.pin).toBe(calls.render);
  expect(calls.touch).toBe(calls.pin);
  expect(calls.touchOutsidePin).toBe(0);
  expect(calls.publicTouch).toBe(0);
}

describe('usePressPin is each layer’s one call (react-component-runtime INV16)', () => {
  it('Tooltip: one usePressPin call per render, the only path to the touch trigger', () => {
    render(
      <Tooltip
        content="Billed on the first of each month"
        pressTrigger="toggle">
        <button type="button">About billing</button>
      </Tooltip>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'About billing'}));
    expectOneCallPerRender();
  });

  it('HoverCard: one usePressPin call per render, the only path to the touch trigger', () => {
    render(
      <HoverCard content={<p>Ada Lovelace</p>} pressTrigger="toggle">
        <button type="button">Ada</button>
      </HoverCard>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Ada'}));
    expectOneCallPerRender();
  });
});
