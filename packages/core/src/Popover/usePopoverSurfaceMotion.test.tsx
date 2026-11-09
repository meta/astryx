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
