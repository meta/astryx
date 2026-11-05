// Copyright (c) Meta Platforms, Inc. and affiliates.

import {render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useChevronDip} from './useChevronDip';

function Title({isOpen}: {isOpen: boolean}) {
  const dipRef = useChevronDip(isOpen);
  return (
    <button ref={dipRef} type="button">
      <span className="astryx-icon" />
    </button>
  );
}

describe('useChevronDip under Reduced Motion on a touch screen', () => {
  const dips: {
    cancel: ReturnType<typeof vi.fn>;
    playState: string;
    keyframes: Keyframe[];
  }[] = [];
  beforeEach(() => {
    dips.length = 0;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches:
        query.includes('prefers-reduced-motion: reduce') ||
        /pointer:\s*coarse/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    Element.prototype.animate = vi.fn((keyframes: Keyframe[]) => {
      const dip = {
        cancel: vi.fn(() => {
          dip.playState = 'idle';
        }),
        playState: 'running',
        keyframes,
      };
      dips.push(dip);
      return dip;
    }) as unknown as typeof Element.prototype.animate;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cancels the running dip when the toggle changes again within it', () => {
    const {rerender} = render(<Title isOpen={false} />);
    rerender(<Title isOpen />);
    expect(dips).toHaveLength(1);
    rerender(<Title isOpen={false} />);
    expect(dips).toHaveLength(2);
    expect(dips[0].cancel).toHaveBeenCalledTimes(1);
    expect(dips[1].cancel).not.toHaveBeenCalled();
  });

  it('starts a second dip within the first from the glyph’s current opacity', () => {
    const {container, rerender} = render(<Title isOpen={false} />);
    rerender(<Title isOpen />);
    expect(dips[0].keyframes[0]).toEqual({opacity: 1});
    // Part way into the first dip.
    const glyph = container.querySelector<HTMLElement>('.astryx-icon');
    if (glyph == null) {
      throw new Error('no glyph');
    }
    glyph.style.opacity = '0.4';
    rerender(<Title isOpen={false} />);
    expect(dips[1].keyframes[0]).toEqual({opacity: 0.4});
    expect(dips[1].keyframes.slice(1)).toEqual([{opacity: 0}, {opacity: 1}]);
  });

  it('cancels its dip on unmount', () => {
    const {rerender, unmount} = render(<Title isOpen={false} />);
    rerender(<Title isOpen />);
    unmount();
    expect(dips[0].cancel).toHaveBeenCalledTimes(1);
  });
});
