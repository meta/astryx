// Copyright (c) Meta Platforms, Inc. and affiliates.

import {fireEvent, render} from '@testing-library/react';
import {useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as reducedMotion from '../motion/reducedMotion';
import {useChevronDip} from './useChevronDip';

vi.mock('../motion/reducedMotion', async importOriginal => ({
  ...(await importOriginal<typeof reducedMotion>()),
  playReducedMotionDip: vi.fn(),
}));

const {playReducedMotionDip} = reducedMotion;

const CLOSED = 'matrix(0, -1, 1, 0, 0, 0)';

function Title() {
  const [isOpen, setIsOpen] = useState(false);
  const chevron = useChevronDip();
  return (
    <button
      ref={chevron.ref}
      type="button"
      data-open={isOpen}
      onClick={() => {
        chevron.dip();
        setIsOpen(!isOpen);
      }}>
      <span className="astryx-icon" />
    </button>
  );
}

describe('useChevronDip under Reduced Motion on a touch screen', () => {
  const dips: {cancel: ReturnType<typeof vi.fn>}[] = [];
  let glyphOpacity = '1';
  beforeEach(() => {
    dips.length = 0;
    glyphOpacity = '1';
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
    Element.prototype.animate = vi.fn() as typeof Element.prototype.animate;
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element =>
      element.classList.contains('astryx-icon')
        ? ({
            opacity: glyphOpacity,
            transform: (element as HTMLElement).style.transform || CLOSED,
          } as CSSStyleDeclaration)
        : computed(element),
    );
    vi.mocked(playReducedMotionDip).mockClear();
    vi.mocked(playReducedMotionDip).mockImplementation(() => {
      const dip = {cancel: vi.fn()};
      dips.push(dip);
      return dip;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('holds the shown turn until the dip lands, then lets the new state turn it', () => {
    const view = render(<Title />);
    const glyph = view.container.querySelector<HTMLElement>('.astryx-icon')!;
    fireEvent.click(view.getByRole('button'));
    expect(dips).toHaveLength(1);
    const [element, , land, from] =
      vi.mocked(playReducedMotionDip).mock.calls[0];
    expect(element).toBe(glyph);
    expect(from).toBe(1);
    expect(glyph.style.transform).toBe(CLOSED);
    land();
    expect(glyph.style.transform).toBe('');
  });

  it('restarts a second dip within the first from the glyph’s presented opacity, and cancels the first', () => {
    const view = render(<Title />);
    fireEvent.click(view.getByRole('button'));
    // Part way into the first dip.
    glyphOpacity = '0.4';
    fireEvent.click(view.getByRole('button'));
    expect(dips).toHaveLength(2);
    expect(dips[0].cancel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playReducedMotionDip).mock.calls[1][3]).toBe(0.4);
  });

  it('cancels its dip on unmount', () => {
    const view = render(<Title />);
    fireEvent.click(view.getByRole('button'));
    view.unmount();
    expect(dips[0].cancel).toHaveBeenCalledTimes(1);
  });
});
