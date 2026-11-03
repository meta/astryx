// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTooltipHold.calls.test.tsx
 * @input InfoTip, with useTooltipHold, the touch trigger hooks and
 *   useLayerDismissal wrapped in call counters
 * @output Unit tests: useTooltip makes one useTooltipHold call per render, and
 *   that call is the only path to the touch trigger
 *   (`architecture:react-component-runtime` INV16)
 * @position Beside InfoTip.pin.test.tsx, which covers what the hold does
 *
 * useLayerDismissal runs once per render, so one useTooltipHold call per
 * render shows as equal counts. Touch trigger calls come only from
 * useTooltipHold.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type * as TooltipHoldModule from './useTooltipHold';
import type * as TouchTriggerModule from '../Layer/useTouchTrigger';
import type * as LayerDismissalModule from '../Layer/useLayerDismissal';

const calls = vi.hoisted(() => ({
  hold: 0,
  touch: 0,
  publicTouch: 0,
  touchOutsideHold: 0,
  render: 0,
  isInHold: false,
}));

vi.mock('./useTooltipHold', async importOriginal => {
  const actual = await importOriginal<typeof TooltipHoldModule>();
  return {
    ...actual,
    useTooltipHold: (options: TooltipHoldModule.UseTooltipHoldOptions) => {
      calls.hold += 1;
      calls.isInHold = true;
      try {
        return actual.useTooltipHold(options);
      } finally {
        calls.isInHold = false;
      }
    },
  };
});

vi.mock('../Layer/useTouchTrigger', async importOriginal => {
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
      if (!calls.isInHold) {
        calls.touchOutsideHold += 1;
      }
      return actual.useTouchTriggerInternal(options);
    },
  };
});

vi.mock('../Layer/useLayerDismissal', async importOriginal => {
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

const {InfoTip} = await import('../InfoTip/InfoTip');

beforeEach(() => {
  calls.hold = 0;
  calls.touch = 0;
  calls.publicTouch = 0;
  calls.touchOutsideHold = 0;
  calls.render = 0;
});

function expectOneCallPerRender() {
  expect(calls.render).toBeGreaterThan(0);
  expect(calls.hold).toBe(calls.render);
  expect(calls.touch).toBe(calls.hold);
  expect(calls.touchOutsideHold).toBe(0);
  expect(calls.publicTouch).toBe(0);
}

describe('useTooltipHold is each tooltip’s one call (react-component-runtime INV16)', () => {
  it('InfoTip: one useTooltipHold call per render, the only path to the touch trigger', () => {
    render(
      <InfoTip
        content="Billed on the first of each month"
        label="About billing"
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'About billing'}));
    expectOneCallPerRender();
  });
});
