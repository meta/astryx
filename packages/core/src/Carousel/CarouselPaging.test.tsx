// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CarouselPaging.test.tsx
 * @input vitest (jsdom), Testing Library, Carousel with `hasSnap`, a stubbed
 *   `(pointer: coarse)` media query for the touch presentation, stubbed
 *   slide geometry (jsdom lays nothing out)
 * @output Proves a snapping carousel's DOM and wiring: its slides in a track;
 *   native snapping with a pointer and without the buttons; under a finger
 *   the shared pager with each child a page (keyboard, buttons, handle,
 *   focus following, the end clamp, looping as a rewind, layers, the edge
 *   fade)
 * @position Testing; the real-touch proofs are
 *   __tests__/CarouselPaging.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRef} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {Carousel, type CarouselHandle} from './Carousel';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const WIDTH = 300;

/** The slides' stubbed geometry: each `slide` px wide, `gap` px apart. */
const geometry = {slide: WIDTH, gap: 0};

/** jsdom lays nothing out: slides sit in a row from the track's start. */
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const {slide, gap} = geometry;
      if (this.getAttribute('aria-roledescription') === 'slide') {
        const index = Array.prototype.indexOf.call(
          this.parentElement?.children ?? [],
          this,
        );
        return new DOMRect(index * (slide + gap), 0, slide, 100);
      }
      const slides = this.querySelectorAll(':scope > [aria-roledescription]');
      if (
        slides.length > 0 &&
        this.parentElement?.getAttribute('role') !== 'region'
      ) {
        const n = slides.length;
        return new DOMRect(0, 0, n * slide + (n - 1) * gap, 100);
      }
      return new DOMRect(0, 0, WIDTH, 100);
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute('aria-roledescription') === 'slide'
        ? geometry.slide
        : WIDTH;
    },
  );
}

/** The frame callbacks the pager left for the next frame. */
async function nextFrame() {
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
  });
}

/**
 * A coarse (finger) or fine primary pointer, on any engine (one touch model:
 * nothing asks for iOS); `reduced` turns Reduce Motion on.
 */
function stubPointer(coarse: boolean, {reduced = false} = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse')
        ? coarse
        : reduced && query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
  geometry.slide = WIDTH;
  geometry.gap = 0;
  stubLayout();
  if (typeof HTMLElement.prototype.scrollTo !== 'function') {
    HTMLElement.prototype.scrollTo = function () {};
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function getScroller() {
  return screen.getByRole('region').firstElementChild as HTMLElement;
}

function getTrack() {
  return getScroller().firstElementChild as HTMLElement;
}

function trackX() {
  const value = getTrack().style.translate;
  return value === '' ? 0 : Number.parseFloat(value);
}

function renderPages(
  props: Partial<React.ComponentProps<typeof Carousel>> = {},
) {
  const handleRef = createRef<CarouselHandle>();
  render(
    <Carousel aria-label="Pages" hasSnap handleRef={handleRef} {...props}>
      <div>Page one</div>
      <div>
        Page two <button type="button">Inside two</button>
      </div>
      <div>
        Page three <button type="button">Inside three</button>
      </div>
      <div>Page four</div>
    </Carousel>,
  );
  return handleRef;
}

/** Six 120 px cards 10 px apart: they end at 770 px, 470 px past the 300 px view. */
function renderCards(
  props: Partial<React.ComponentProps<typeof Carousel>> = {},
) {
  geometry.slide = 120;
  geometry.gap = 10;
  const handleRef = createRef<CarouselHandle>();
  render(
    <Carousel aria-label="Cards" hasSnap handleRef={handleRef} {...props}>
      {Array.from({length: 6}, (_, i) => (
        <div key={i}>Card {i + 1}</div>
      ))}
    </Carousel>,
  );
  return handleRef;
}

describe('Carousel hasSnap', () => {
  it('with its buttons, holds the slides in a track; with a pointer it snaps natively', () => {
    stubPointer(false);
    renderPages();
    const scroller = getScroller();
    const track = getTrack();
    expect(track.children).toHaveLength(4);
    for (const slide of Array.from(track.children)) {
      expect(slide).toHaveAttribute('aria-roledescription', 'slide');
      expect(getComputedStyle(slide).scrollSnapAlign).toBe('start');
    }
    expect(getComputedStyle(scroller).scrollSnapType).toBe('x mandatory');
    // The pager is not attached: keys scroll natively, the track stays.
    fireEvent.keyDown(scroller, {key: 'ArrowRight'});
    expect(track.style.translate).toBe('');
  });

  it("without the snap, the slides stay the scroller's own children", () => {
    stubPointer(true);
    render(
      <Carousel aria-label="Items">
        <div>One</div>
        <div>Two</div>
      </Carousel>,
    );
    expect(getScroller().children[0]).toHaveAttribute(
      'aria-roledescription',
      'slide',
    );
  });

  it('with a pointer, Next scrolls about a viewport, as it always has', () => {
    stubPointer(false);
    const handle = renderCards();
    const scroller = getScroller();
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;
    act(() => handle.current?.scrollNext());
    // A viewport less half a card.
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({left: WIDTH - 60}),
    );
  });

  it('with a pointer under Reduce Motion, Next jumps at once (design:reduced-motion DR3)', () => {
    stubPointer(false, {reduced: true});
    const handle = renderPages();
    const scroller = getScroller();
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;
    const animate = vi.fn();
    scroller.animate = animate;
    act(() => handle.current?.scrollNext());
    expect(scrollBy).toHaveBeenCalledWith({left: WIDTH, behavior: 'auto'});
    expect(animate).not.toHaveBeenCalled();
  });

  it('under a finger and Reduce Motion, a scrolling carousel cross-fades in 200 ms and jumps while transparent (design:reduced-motion DR2)', async () => {
    stubPointer(true, {reduced: true});
    const handleRef = createRef<CarouselHandle>();
    render(
      <Carousel aria-label="Items" handleRef={handleRef}>
        <div>One</div>
        <div>Two</div>
        <div>Three</div>
      </Carousel>,
    );
    const scroller = getScroller();
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;
    const cancel = vi.fn();
    const animate = vi.fn(() => ({finished: Promise.resolve(), cancel}));
    scroller.animate = animate as unknown as HTMLElement['animate'];
    act(() => handleRef.current?.scrollNext());
    const easing = 'cubic-bezier(0.42, 0, 0.58, 1)';
    expect(animate).toHaveBeenCalledWith([{opacity: 1}, {opacity: 0}], {
      duration: 100,
      easing,
      fill: 'forwards',
    });
    expect(scrollBy).not.toHaveBeenCalled();
    await act(async () => Promise.resolve());
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({behavior: 'auto'}),
    );
    expect(animate).toHaveBeenLastCalledWith([{opacity: 0}, {opacity: 1}], {
      duration: 100,
      easing,
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('an Android finger pages like any other: one touch model, no platform idiom', () => {
    stubPointer(true);
    vi.stubGlobal('CSS', {supports: () => false});
    renderPages();
    const scroller = getScroller();
    // The pager owns the pans; nothing scrolls natively.
    expect(getComputedStyle(scroller).overflowX).toBe('clip');
    expect(getComputedStyle(scroller).scrollSnapType).not.toBe('x mandatory');
  });

  describe('under a finger (any touch device)', () => {
    beforeEach(() => stubPointer(true));

    it('moves the track instead of scrolling: nothing scrolls natively', () => {
      renderPages();
      const scroller = getScroller();
      // jsdom drops touch-action; the browser proofs check 'pan-y pinch-zoom'.
      expect(getComputedStyle(scroller).overflowX).toBe('clip');
      expect(getComputedStyle(scroller).overflowY).toBe('clip');
      expect(getComputedStyle(scroller).scrollSnapType).not.toBe('x mandatory');
    });

    it('arrow keys move one child, Home and End to the ends', () => {
      renderPages();
      const scroller = getScroller();
      act(() => scroller.focus());
      fireEvent.keyDown(scroller, {key: 'ArrowRight'});
      expect(trackX()).toBe(-WIDTH);
      fireEvent.keyDown(scroller, {key: 'End'});
      expect(trackX()).toBe(-3 * WIDTH);
      fireEvent.keyDown(scroller, {key: 'ArrowRight'});
      expect(trackX()).toBe(-3 * WIDTH);
      fireEvent.keyDown(scroller, {key: 'Home'});
      expect(trackX()).toBe(0);
      fireEvent.keyDown(scroller, {key: 'ArrowLeft'});
      expect(trackX()).toBe(0);
    });

    it('the buttons and the handle move one full-width child, and know the ends', () => {
      const handle = renderPages();
      const previous = screen.getByRole('button', {name: 'Scroll left'});
      const next = screen.getByRole('button', {name: 'Scroll right'});
      expect(previous).toBeDisabled();
      expect(handle.current?.canScrollPrev()).toBe(false);
      fireEvent.click(next);
      expect(trackX()).toBe(-WIDTH);
      expect(previous).not.toBeDisabled();
      act(() => handle.current?.scrollTo(3));
      expect(trackX()).toBe(-3 * WIDTH);
      expect(next).toBeDisabled();
      expect(handle.current?.canScrollNext()).toBe(false);
      act(() => handle.current?.scrollPrev());
      expect(trackX()).toBe(-2 * WIDTH);
    });

    it('cards: an arrow moves one card, the buttons about a viewport onto a card, and the last cards share the end', () => {
      const handle = renderCards();
      const scroller = getScroller();
      const next = screen.getByRole('button', {name: 'Scroll right'});
      act(() => scroller.focus());
      fireEvent.keyDown(scroller, {key: 'ArrowRight'});
      expect(trackX()).toBe(-130);
      // From 130 px a viewport less half a card is 370 px: the card at 390.
      fireEvent.click(next);
      expect(trackX()).toBe(-390);
      // Past 470 px the track would leave the view: the end, for both last cards.
      fireEvent.click(next);
      expect(trackX()).toBe(-470);
      expect(next).toBeDisabled();
      act(() => handle.current?.scrollTo(0));
      act(() => handle.current?.scrollTo(5));
      expect(trackX()).toBe(-470);
    });

    it('focus moving into a slide off screen brings it to the start edge; one on screen stays', () => {
      renderPages();
      act(() => screen.getByRole('button', {name: 'Inside three'}).focus());
      expect(trackX()).toBe(-2 * WIDTH);
    });

    it('focus moving into a card already on screen leaves the track where it is', () => {
      geometry.slide = 120;
      geometry.gap = 10;
      render(
        <Carousel aria-label="Cards" hasSnap>
          <div>Card one</div>
          <div>
            Card two <button type="button">Inside two</button>
          </div>
          <div>Card three</div>
          <div>Card four</div>
        </Carousel>,
      );
      act(() => screen.getByRole('button', {name: 'Inside two'}).focus());
      expect(trackX()).toBe(0);
    });

    it('gives the children within a viewport of the content on screen their own layers', () => {
      renderPages();
      const slides = Array.from(getTrack().children) as HTMLElement[];
      expect(slides.map(slide => slide.style.willChange)).toEqual([
        'transform',
        'transform',
        '',
        '',
      ]);
    });

    it('fewer slides clamp the page shown, and more keep the pager and the controls in step', async () => {
      const handleRef = createRef<CarouselHandle>();
      const pages = (n: number) => (
        <Carousel aria-label="Pages" hasSnap handleRef={handleRef}>
          {Array.from({length: n}, (_, i) => (
            <div key={i}>Page {i + 1}</div>
          ))}
        </Carousel>
      );
      const view = render(pages(4));
      act(() => handleRef.current?.scrollTo(3));
      expect(trackX()).toBe(-3 * WIDTH);
      view.rerender(pages(2));
      await nextFrame();
      expect(trackX()).toBe(-WIDTH);
      expect(handleRef.current?.canScrollNext()).toBe(false);
      view.rerender(pages(4));
      await nextFrame();
      expect(trackX()).toBe(-WIDTH);
      expect(handleRef.current?.canScrollNext()).toBe(true);
      expect(handleRef.current?.canScrollPrev()).toBe(true);
    });

    it('a gap change reaches the pager: the child keeps its place', () => {
      const handleRef = createRef<CarouselHandle>();
      const pages = (g: 2 | 4) => (
        <Carousel aria-label="Pages" hasSnap gap={g} handleRef={handleRef}>
          <div>Page one</div>
          <div>Page two</div>
          <div>Page three</div>
          <div>Page four</div>
        </Carousel>
      );
      geometry.gap = 8;
      const view = render(pages(2));
      act(() => handleRef.current?.scrollTo(2));
      expect(trackX()).toBe(-2 * (WIDTH + 8));
      geometry.gap = 24;
      view.rerender(pages(4));
      expect(trackX()).toBe(-2 * (WIDTH + 24));
    });

    it('without the buttons it snaps natively, so a single pointer can still page (WCAG 2.5.1)', () => {
      renderPages({hasButtons: false});
      const scroller = getScroller();
      expect(getComputedStyle(scroller).overflowX).not.toBe('clip');
      expect(getComputedStyle(scroller).scrollSnapType).toBe('x mandatory');
      // No track either: the slides are the scroller's own children.
      expect(scroller.children[0]).toHaveAttribute(
        'aria-roledescription',
        'slide',
      );
    });

    it('with hasLoop, a step past either end goes to the other one, as it does natively', () => {
      const handle = renderPages({hasLoop: true});
      expect(handle.current?.canScrollPrev()).toBe(true);
      act(() => handle.current?.scrollPrev());
      expect(trackX()).toBe(-3 * WIDTH);
      act(() => handle.current?.scrollNext());
      expect(trackX()).toBe(0);
      expect(handle.current?.canScrollNext()).toBe(true);
    });

    it('the edge fade follows the page: the end at the first, the start at the last', () => {
      renderPages({hasEdgeFade: true});
      const scroller = getScroller();
      expect(getComputedStyle(scroller).maskImage).toContain('to left');
      fireEvent.keyDown(scroller, {key: 'End'});
      expect(getComputedStyle(scroller).maskImage).toContain('to right');
      expect(getComputedStyle(scroller).maskImage).not.toContain('calc(100%');
    });
  });
});
