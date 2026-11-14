// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePopoverSurfaceMotion.test.tsx
 * @input vitest (jsdom), React Testing Library, a stand-in popover layer and
 *   trigger, a stubbed pointer query and a recording stand-in for the motion
 * @output Checks when the hook creates, drives and releases the touch
 *   presentation. A fine pointer creates and promotes nothing, and its close
 *   start plays nothing.
 * @position Testing; Popover's touch presentation, the hook that drives it
 */

import {renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TOUCH_QUERY} from '../utils/touchPresentation';
import {createPopoverSurfaceMotion} from './popoverSurfaceMotion';
import {usePopoverSurfaceMotion} from './usePopoverSurfaceMotion';

vi.mock('./popoverSurfaceMotion', () => ({
  createPopoverSurfaceMotion: vi.fn(() => ({
    enter: vi.fn(),
    exit: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
  })),
}));

const created = () =>
  vi
    .mocked(createPopoverSurfaceMotion)
    .mock.results.map(
      result => result.value as ReturnType<typeof createPopoverSurfaceMotion>,
    );

let isTouch = false;

beforeEach(() => {
  isTouch = false;
  vi.mocked(createPopoverSurfaceMotion).mockClear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === TOUCH_QUERY ? isTouch : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

// The trigger's layout box, which a press scales to 0.98 about its centre, as
// Button's press does. Its box read carries that scale unless an override
// takes the transform off.
const TRIGGER_BOX = {left: 141, top: 160, width: 120, height: 44};
function pressScale(trigger: HTMLElement) {
  trigger.style.transform = 'scale(0.98)';
  trigger.getBoundingClientRect = function (this: HTMLElement) {
    const scale =
      this.style.getPropertyValue('transform') === 'none' ? 1 : 0.98;
    const width = TRIGGER_BOX.width * scale;
    const height = TRIGGER_BOX.height * scale;
    const left = TRIGGER_BOX.left + (TRIGGER_BOX.width - width) / 2;
    const top = TRIGGER_BOX.top + (TRIGGER_BOX.height - height) / 2;
    return {
      left,
      top,
      width,
      height,
      x: left,
      y: top,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    };
  };
}

function layerAndTrigger() {
  const layer = document.createElement('div');
  layer.setAttribute('popover', 'auto');
  layer.innerHTML = '<div role="dialog" aria-label="Filters"></div>';
  const trigger = document.createElement('button');
  document.body.append(layer, trigger);
  return {layer, trigger};
}

describe('usePopoverSurfaceMotion', () => {
  it('leaves a fine-pointer open untouched: nothing created, nothing promoted, and its close start plays nothing', () => {
    const {layer, trigger} = layerAndTrigger();
    const {result} = renderHook(() => usePopoverSurfaceMotion());
    result.current.present(layer, trigger);
    result.current.closeStart();
    expect(createPopoverSurfaceMotion).not.toHaveBeenCalled();
    expect(layer.getAttribute('style')).toBeNull();
  });

  it('under a coarse pointer, grows the popover as it opens and shrinks it as its close starts', () => {
    isTouch = true;
    const {layer, trigger} = layerAndTrigger();
    const {result} = renderHook(() => usePopoverSurfaceMotion());
    result.current.present(layer, trigger);
    const [motion] = created();
    expect(motion.enter).toHaveBeenCalledTimes(1);
    expect(motion.exit).not.toHaveBeenCalled();
    result.current.closeStart();
    expect(motion.exit).toHaveBeenCalledTimes(1);
  });

  it('a fine-pointer open after a touch one releases the touch motion, and its close start plays nothing', () => {
    isTouch = true;
    const {layer, trigger} = layerAndTrigger();
    const {result} = renderHook(() => usePopoverSurfaceMotion());
    result.current.present(layer, trigger);
    const [motion] = created();
    // The pointer turns fine (a keyboard attached) for the next open.
    isTouch = false;
    result.current.present(layer, trigger);
    expect(motion.dispose).toHaveBeenCalledTimes(1);
    result.current.closeStart();
    expect(motion.exit).not.toHaveBeenCalled();
  });

  it('grows from the trigger\u2019s box without its press transform (architecture:layer-runtime INV22)', () => {
    isTouch = true;
    const {layer, trigger} = layerAndTrigger();
    pressScale(trigger);
    const {result} = renderHook(() => usePopoverSurfaceMotion());
    result.current.present(layer, trigger);
    const [motion] = created();
    const [[measure]] = vi.mocked(motion.enter).mock.calls;
    expect(measure().source).toEqual(TRIGGER_BOX);
    // The read leaves the press as it was.
    expect(trigger.style.getPropertyValue('transform')).toBe('scale(0.98)');
  });

  it('releases the motion at unmount', () => {
    isTouch = true;
    const {layer, trigger} = layerAndTrigger();
    const {result, unmount} = renderHook(() => usePopoverSurfaceMotion());
    result.current.present(layer, trigger);
    const [motion] = created();
    unmount();
    expect(motion.dispose).toHaveBeenCalledTimes(1);
  });
});
