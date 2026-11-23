// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file hero-reel-warm-up.test.tsx
 * @input The home hero reel's provider, its swipe area and its dots, on a
 *   wide and on a narrow screen
 * @output Proof of which fonts and photos the reel loads ahead of time: all
 *   of them after load on a wide screen, and on a narrow screen those of the
 *   slides next to the current one, only after the visitor starts to use the
 *   reel. Each photo loads from the `sizes` and the `srcset` of its card.
 * @position Docsite unit tests. hero-theme-content.test.ts proves what each
 *   real slide loads, and e2e/home-reel-warm-up.spec.ts counts the requests
 *   of the built page.
 * Run: pnpm -F @astryxdesign/docsite test hero-reel-warm-up
 */

import type {ReactNode} from 'react';
import type * as StyleX from '@stylexjs/stylex';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  HeroReelDots,
  HeroReelProvider,
  HeroReelSwipeArea,
} from '../app/(site)/_landing/hero/HeroThemeReel';

const NARROW_SCREEN = '(max-width: 1023px)';

// Five slides. Slide 3 has the photos 3-product, 3-feature and 3-mini, and
// the fonts 3-body and 3-display. A photo has the sources that its card gives
// its <img>.
const reel = vi.hoisted(() => {
  const slides = [1, 2, 3, 4, 5].map(position => ({
    name: `slide-${position}`,
    label: `Slide ${position}`,
    theme: {},
    content: {},
    aurora: {left: '', center: '', right: ''},
    wordmarkColor: '',
    isDark: false,
    mode: 'light',
  }));
  const slideAssets = (slide: {name: string}) => {
    const position = slide.name.replace('slide-', '');
    return {
      fonts: [`${position}-body`, `${position}-display`],
      images: ['product', 'feature', 'mini'].map(card => {
        const file = `/photos/${position}-${card}.webp`;
        return {
          src: `${file}?w=2`,
          srcSet: `${file}?w=1 1w, ${file}?w=2 2w`,
          sizes: `${card}-slot`,
        };
      }),
    };
  };
  return {
    HERO_THEME_SLIDES: slides,
    REEL_FONT_SPECIFIERS: slides.flatMap(slide => slideAssets(slide).fonts),
    REEL_IMAGES: slides.flatMap(slide => slideAssets(slide).images),
    slideAssets,
  };
});

const stubs = vi.hoisted(() => ({
  passthrough: async (names: string[]) => {
    const {createElement} = await import('react');
    return Object.fromEntries(
      names.map(name => [
        name,
        ({children}: {children?: ReactNode}) =>
          createElement('div', null, children),
      ]),
    );
  },
}));

// The dots are the real Pagination, which needs the real StyleX runtime. The
// reel's own styles are not under test.
vi.mock('@stylexjs/stylex', async original => ({
  ...(await original<typeof StyleX>()),
  create: (styles: Record<string, unknown>) => styles,
  props: () => ({}),
}));
vi.mock('@astryxdesign/core/theme', () => stubs.passthrough(['Theme']));
vi.mock('@astryxdesign/core/Text', () => stubs.passthrough(['Text']));
vi.mock('../app/providers', () => ({
  useThemeMode: () => ({themeMode: 'light'}),
}));
vi.mock('../components/logos', () => stubs.passthrough(['AstryxLogo']));
vi.mock('../app/(site)/_landing/hero/HeroFloatingCards', () =>
  stubs.passthrough(['HeroFloatingCards']),
);
vi.mock('../app/(site)/_landing/hero/heroThemeContent', () => reel);

let isNarrow = false;
const screenListeners = new Set<() => void>();
interface Photo {
  src: string;
  srcSet: string;
  sizes: string;
}
let photos: Photo[] = [];
const bySrc = (a: Photo, b: Photo) => a.src.localeCompare(b.src);
let fonts: string[] = [];

/** Changes the screen's width class, as a rotation or a resize does. */
function setNarrow(narrow: boolean) {
  isNarrow = narrow;
  act(() => {
    for (const listener of screenListeners) {
      listener();
    }
  });
}

/** Lets the time pass in which the browser reaches an idle moment. */
function idle() {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

function renderReel() {
  render(
    <HeroReelProvider>
      <HeroReelSwipeArea>
        <a href="/docs">Get started</a>
        <HeroReelDots />
      </HeroReelSwipeArea>
    </HeroReelProvider>,
  );
  return screen.getByRole('link', {name: 'Get started'});
}

/** The dot of the slide at `position`, from 1. */
function dot(position: number) {
  return screen.getByRole('radio', {name: `Page ${position}`});
}

/**
 * Moves the focus to a dot. The dots move the reel to the dot that has the
 * focus. A browser shows keyboard focus as `:focus-visible`, and does not for
 * the focus that a press gives a dot.
 */
function focusDot(position: number, from: 'keyboard' | 'press') {
  const target = dot(position);
  const matches = target.matches.bind(target);
  vi.spyOn(target, 'matches').mockImplementation(selector =>
    selector === ':focus-visible' ? from === 'keyboard' : matches(selector),
  );
  act(() => target.focus());
}

/** A touch that starts on `target` and moves by `dx` and `dy`. */
function touch(target: Element, dx: number, dy: number) {
  fireEvent.touchStart(target, {touches: [{clientX: 200, clientY: 300}]});
  fireEvent.touchMove(target, {
    touches: [{clientX: 200 + dx, clientY: 300 + dy}],
  });
  fireEvent.touchEnd(target, {
    changedTouches: [{clientX: 200 + dx, clientY: 300 + dy}],
  });
}

/** The fonts and photos of the slides at the given positions, from 1. */
function assetsOf(...positions: number[]) {
  const assets = positions.map(position =>
    reel.slideAssets(reel.HERO_THEME_SLIDES[position - 1]),
  );
  return {
    photos: assets.flatMap(asset => asset.images).sort(bySrc),
    fonts: assets.flatMap(asset => asset.fonts).sort(),
  };
}

function loaded() {
  return {photos: [...photos].sort(bySrc), fonts: [...fonts].sort()};
}

beforeEach(() => {
  vi.useFakeTimers();
  isNarrow = false;
  photos = [];
  fonts = [];
  screenListeners.clear();
  vi.stubGlobal('matchMedia', (query: string): Partial<MediaQueryList> => ({
    get matches() {
      return query === NARROW_SCREEN && isNarrow;
    },
    addEventListener: (_type: string, listener: unknown) => {
      if (query === NARROW_SCREEN) {
        screenListeners.add(listener as () => void);
      }
    },
    removeEventListener: (_type: string, listener: unknown) => {
      screenListeners.delete(listener as () => void);
    },
  }));
  vi.stubGlobal(
    'Image',
    class {
      decoding = '';
      sizes = '';
      srcset = '';
      // A browser starts the download when an image gets its `src`, and
      // selects the file from the `sizes` and the `srcset` that it has then.
      set src(value: string) {
        photos.push({src: value, srcSet: this.srcset, sizes: this.sizes});
      }
    },
  );
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      load: (specifier: string) => {
        fonts.push(specifier);
        return Promise.resolve([]);
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'fonts');
});

describe('a wide screen, where the reel advances by itself', () => {
  it('loads the fonts and photos of every slide once, at the first idle moment', () => {
    renderReel();
    expect(loaded()).toEqual({photos: [], fonts: []});

    idle();
    expect(loaded()).toEqual(assetsOf(1, 2, 3, 4, 5));
  });

  it('loads nothing when the reel unmounts before the first idle moment', () => {
    renderReel();
    cleanup();
    idle();
    expect(loaded()).toEqual({photos: [], fonts: []});
  });

  it('loads nothing more when the visitor uses the reel', () => {
    const link = renderReel();
    idle();

    touch(link, -80, 0);
    focusDot(2, 'keyboard');
    focusDot(4, 'press');
    idle();
    expect(loaded()).toEqual(assetsOf(1, 2, 3, 4, 5));
  });
});

describe('a narrow screen, where the reel is manual', () => {
  beforeEach(() => {
    isNarrow = true;
  });

  it('loads nothing ahead of time', () => {
    renderReel();
    idle();
    expect(loaded()).toEqual({photos: [], fonts: []});
  });

  it('loads nothing for a touch that scrolls the page, or for a tap', () => {
    const link = renderReel();
    touch(link, 6, -200);
    touch(link, 30, -200);
    touch(link, 20, 20);
    touch(link, 0, 0);
    idle();
    expect(loaded()).toEqual({photos: [], fonts: []});
  });

  it('loads nothing for sideways travel shorter than the start of a swipe', () => {
    const link = renderReel();
    touch(link, -9, 0);
    idle();
    expect(loaded()).toEqual({photos: [], fonts: []});
  });

  it('loads the slides before and after the current one when a touch moves sideways', () => {
    const link = renderReel();
    fireEvent.touchStart(link, {touches: [{clientX: 200, clientY: 300}]});
    expect(loaded()).toEqual({photos: [], fonts: []});

    fireEvent.touchMove(link, {touches: [{clientX: 190, clientY: 304}]});
    expect(loaded()).toEqual(assetsOf(2, 5));
  });

  it('loads them when keyboard focus moves to the dots', () => {
    renderReel();
    focusDot(1, 'keyboard');
    expect(loaded()).toEqual(assetsOf(2, 5));

    // An arrow key moves the focus, and the reel, to the next dot.
    fireEvent.keyDown(dot(1), {key: 'ArrowRight'});
    expect(dot(2).getAttribute('aria-checked')).toBe('true');
    expect(loaded()).toEqual(assetsOf(2, 3, 5));
  });

  it('loads nothing when the focus moves to a link in the hero text', () => {
    const link = renderReel();
    act(() => link.focus());
    expect(loaded()).toEqual({photos: [], fonts: []});
  });

  it('loads each slide once', () => {
    const link = renderReel();
    touch(link, -20, 0);
    touch(link, 30, 0);
    focusDot(1, 'keyboard');
    expect(loaded()).toEqual(assetsOf(2, 5));

    // To slide 2, back to slide 1, and to slide 5.
    touch(link, -80, 0);
    touch(link, 80, 0);
    touch(link, 80, 0);
    expect(loaded()).toEqual(assetsOf(2, 3, 4, 5));
  });

  it('loads the next slide over after a swipe', () => {
    const link = renderReel();
    touch(link, -80, 0);
    // The swipe moved the reel to slide 2, whose neighbors are 1 and 3. The
    // first slide loaded with the page.
    expect(loaded()).toEqual(assetsOf(2, 3, 5));
  });

  it('loads the slides next to the one that a press on a dot moves to', () => {
    const link = renderReel();
    focusDot(4, 'press');
    expect(loaded()).toEqual(assetsOf(3, 5));

    // Slide 4 loaded when it showed, so a move to slide 5 loads nothing.
    touch(link, -80, 0);
    expect(loaded()).toEqual(assetsOf(3, 5));
  });

  it('does nothing for a reel with no slides', () => {
    const slides = reel.HERO_THEME_SLIDES.splice(0);
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      const link = renderReel();
      touch(link, -80, 0);
      expect(errors).toEqual([]);
      expect(loaded()).toEqual({photos: [], fonts: []});
    } finally {
      window.removeEventListener('error', onError);
      reel.HERO_THEME_SLIDES.push(...slides);
    }
  });

  it('loads every slide when the screen becomes wide', () => {
    renderReel();
    idle();
    setNarrow(false);
    expect(loaded()).toEqual({photos: [], fonts: []});

    idle();
    expect(loaded()).toEqual(assetsOf(1, 2, 3, 4, 5));
  });
});

// A phone after hydration: the first render has the server's answer, a wide
// screen, and the browser's answer replaces it at once.
describe('a screen that becomes narrow before the first idle moment', () => {
  it('loads nothing ahead of time', () => {
    renderReel();
    setNarrow(true);
    idle();
    expect(loaded()).toEqual({photos: [], fonts: []});
  });

  it('loads the slides next to the current one when a touch moves sideways', () => {
    const link = renderReel();
    setNarrow(true);
    touch(link, -20, 0);
    expect(loaded()).toEqual(assetsOf(2, 5));
  });
});
