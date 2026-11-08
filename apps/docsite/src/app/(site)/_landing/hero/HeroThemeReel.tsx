// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file HeroThemeReel.tsx
 * @input none (reads the generated theme registry via heroThemeContent)
 * @output Provider + placed pieces (wordmark, cards, dots) consumed by page.tsx
 * @position Home hero — orchestrates the per-theme reel behind the headline.
 *
 * The cycling state (active index + auto-advance clock) lives in HeroReelProvider
 * so the wordmark, cards, and dots — placed in different parts of the DOM by
 * page.tsx — re-skin together. Auto-advance pauses on hover/focus and when the
 * tab is hidden, and respects prefers-reduced-motion.
 *
 * Manual control: touch swipe (mobile) and the Pagination dots, which own
 * keyboard navigation (arrow keys, Home/End) via the useListFocus primitive.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Theme} from '@astryxdesign/core/theme';
import {Text} from '@astryxdesign/core/Text';
import {Pagination} from '@astryxdesign/core/Pagination';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {useThemeMode} from '../../../providers';
import {
  HERO_THEME_SLIDES,
  REEL_FONT_SPECIFIERS,
  REEL_IMAGE_SRCS,
  type HeroThemeSlide,
} from './heroThemeContent';
import {AstryxLogo} from '../../../../components/logos';
import {HeroFloatingCards} from './HeroFloatingCards';

// How long each theme stays on screen before auto-advancing (ms).
const ADVANCE_INTERVAL_MS = 4500;

// Auto-advance carousel master switch.
const AUTOPLAY_ENABLED = true;

interface HeroReelState {
  slides: ReadonlyArray<HeroThemeSlide>;
  index: number;
  goTo: (i: number) => void;
  /** Whether entrance/cycle animation should run (false under reduced-motion). */
  animate: boolean;
  setPaused: (paused: boolean) => void;
  /**
   * The docsite's color mode for theme rendering. 'system' on the first paint
   * (before the OS preference resolves) so slides keep `color-scheme: light
   * dark` and their light-dark() tokens follow the OS — no flash (#2713).
   */
  userMode: 'system' | 'light' | 'dark';
}

const HeroReelContext = createContext<HeroReelState | null>(null);

function useHeroReel(): HeroReelState | null {
  return useContext(HeroReelContext);
}

/**
 * The color mode a slide should render in: dark-first themes (e.g. Gothic) are
 * always dark; every other theme follows the docsite's color mode so the hero
 * respects the user's light/dark toggle (and the OS preference via 'system'
 * before that resolves).
 */
function effectiveMode(
  slide: HeroThemeSlide,
  userMode: 'system' | 'light' | 'dark',
): 'system' | 'light' | 'dark' {
  return slide.isDark ? 'dark' : userMode;
}

/**
 * Whether the active hero slide should render with light text/nav. True when
 * the slide is a dark-first theme (e.g. Gothic) OR the docsite is in dark mode —
 * in both cases the hero sits on a dark body and its text/nav must go light.
 * 'system' is treated as not-dark here: the light-text overrides only apply once
 * the resolved dark mode is known, which avoids forcing light ink on a slide
 * that may still paint its light scheme.
 */
export function useHeroReelIsDark(): boolean {
  const reel = useContext(HeroReelContext);
  if (!reel || reel.slides.length === 0) {
    return false;
  }
  const active = reel.slides[reel.index];
  if (!active) {
    return false;
  }
  return effectiveMode(active, reel.userMode) === 'dark';
}

const styles = stylex.create({
  // Centers the wordmark SVG; it paints with currentColor (set per-slide).
  wordmarkWrap: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'center',
    transitionProperty: 'color',
    transitionDuration: 'var(--duration-medium, 300ms)',
    transitionTimingFunction: 'var(--ease-standard, ease)',
  },
  // Hero-scale wordmark, smaller on narrow screens.
  wordmark: {
    width: {
      default: 'min(360px, 70%)',
      '@media (min-width: 768px)': 'min(440px, 70%)',
      '@media (min-width: 1024px)': 'min(520px, 70%)',
    },
    height: 'auto',
  },
  // Sticky, zero-height layer hosting the overlap cards so they pin with the
  // hero and don't intercept clicks.
  cardsLayer: {
    position: 'sticky',
    top: 'var(--appshell-header-height, 0px)',
    height: 0,
    width: '100%',
    pointerEvents: 'none',
    zIndex: 0,
  },
  // Per-slide body fill behind the hero (resolves to the active theme's body
  // color). Covers the band + an extra strip so the color sits behind the
  // showcase's rounded top corners (no notch showing the docsite body color).
  //
  // The extra MUST match the showcase overlay's corner radius, which is the
  // docsite (Astryx) --radius-page = 32px. We can't read --radius-page here
  // because this fill renders inside <Theme theme={active}>, where the
  // active theme overrides it — e.g. Y2K sets --radius-page: 0, which left the
  // fill 32px short and exposed the docsite body color in the rounded corners.
  // Hence a fixed 32px tied to the overlay radius rather than the theme token.
  themeFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: {
      default: 'calc(var(--hero-content-height, 760px) + 32px)',
      '@media (min-width: 1024px)': 'calc(760px + 32px)',
    },
    backgroundColor: 'var(--color-background-body)',
    pointerEvents: 'none',
    transition: 'background-color 600ms ease',
  },
  // Per-slide band behind the transparent top nav so it retints too.
  navBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: 'var(--appshell-header-height, 64px)',
    backgroundColor: 'var(--color-background-body)',
    pointerEvents: 'none',
    transition: 'background-color 600ms ease',
    zIndex: 0,
  },
  // Blurred aurora glow — in the same 1200px box as the cards so blobs and
  // cards stay aligned; pinned at >=1024px and scrolling away with the hero
  // below that (see `position`). Capped to 100vw to avoid horizontal scroll.
  // Blob centers sit under the card clusters; colors come from --aurora-* per
  // slide.
  backdropGlow: {
    // Desktop: fixed, part of the pin-and-cover effect alongside heroContent
    // and the cards stage. Narrow: absolute within heroScope (position:
    // relative), so it scrolls away with the hero instead of staying pinned
    // for the whole page — a fixed glow below 1024px reached past the footer
    // into the bottom-overscroll gap. That exposure is what the app-global
    // `overscroll-behavior-y: none` in globals.css was suppressing, at the
    // cost of pull-to-refresh on every route on mobile; bounding the glow
    // here is what lets that rule scope to desktop widths (#5392).
    position: {
      default: 'absolute',
      '@media (min-width: 1024px)': 'fixed',
    },
    // heroScope already starts below the header (it's the sibling after
    // navBackdrop in document flow), so the absolute case needs no offset;
    // only the fixed case has to clear the header itself.
    top: {
      default: 0,
      '@media (min-width: 1024px)': 'var(--appshell-header-height, 0px)',
    },
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(1200px, 100vw)',
    height: 1050,
    pointerEvents: 'none',
    opacity: 0.7,
    transition: 'background-image 800ms ease',
    filter: 'blur(60px)',
    backgroundImage:
      'radial-gradient(circle 220px at 5% 75%, var(--aurora-left), var(--aurora-left) 90%, transparent 100%), ' +
      'radial-gradient(circle 200px at 72% 85%, var(--aurora-center), var(--aurora-center) 90%, transparent 100%), ' +
      'radial-gradient(circle 260px at 92% 65%, var(--aurora-right), var(--aurora-right) 90%, transparent 100%)',
    // Visible at all widths (behind the collage on narrow + overlap on desktop).
    display: 'block',
  },
  // Centers the pagination dots with breathing room above.
  dots: {
    display: 'flex',
    justifyContent: 'center',
    marginBlockStart: 'var(--spacing-6)',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  // pan-y so a horizontal swipe goes to our handler, not page side-pan.
  swipeArea: {
    touchAction: 'pan-y',
  },
});

// Dynamic per-theme values via stylex.create functions (no inline styles).
const dynamic = stylex.create({
  wordmarkColor: (color: string) => ({color}),
  aurora: (left: string, center: string, right: string) => ({
    '--aurora-left': left,
    '--aurora-center': center,
    '--aurora-right': right,
  }),
});

/**
 * Owns the cycling state + auto-advance clock and exposes them via context.
 * Renders no DOM of its own beyond the provider + a hover/focus wrapper so the
 * hero can pause cycling while the user interacts with it.
 */
export function HeroReelProvider({children}: {children: ReactNode}) {
  const slides = HERO_THEME_SLIDES;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // Auto-advance is desktop-only; on mobile the reel stays manual (swipe + dots)
  // so the cards don't move on their own while the user reads/scrolls.
  const isNarrow = useMediaQuery('(max-width: 1023px)');
  const {themeMode: userMode} = useThemeMode();

  const goTo = useCallback(
    (next: number) => {
      const count = slides.length;
      if (count === 0) {
        return;
      }
      setIndex(((next % count) + count) % count);
    },
    [slides.length],
  );

  // Touch swipe (mobile): swipe left → next theme, right → previous.
  const touchStart = useRef<{x: number; y: number} | null>(null);
  const SWIPE_THRESHOLD_PX = 45;
  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    const t = e.touches[0];
    if (!t) {
      return;
    }
    touchStart.current = {x: t.clientX, y: t.clientY};
    // Touch devices have no hover, so pause auto-advance while the finger is down.
    setPaused(true);
  }, []);
  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      setPaused(false);
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || slides.length <= 1) {
        return;
      }
      const t = e.changedTouches[0];
      if (!t) {
        return;
      }
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      // Only a mostly-horizontal gesture counts, so vertical scroll isn't a swipe.
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }
      setIndex(i => {
        const count = slides.length;
        const next = dx < 0 ? i + 1 : i - 1;
        return ((next % count) + count) % count;
      });
    },
    [slides.length],
  );

  useEffect(() => {
    if (
      !AUTOPLAY_ENABLED ||
      reduceMotion ||
      isNarrow ||
      paused ||
      slides.length <= 1
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setIndex(i => (i + 1) % slides.length);
    }, ADVANCE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, isNarrow, paused, slides.length]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Warm the reel's per-theme assets once, after first paint, so first-time
  // visitors don't see fonts flash (FOUT) and product photos pop in as the reel
  // auto-advances. The @font-face rules ship in the docsite's Google Fonts
  // <link>, but a family's woff2 is only fetched when a glyph using it first
  // paints — and the remote card photos aren't fetched until their slide
  // renders; both happen mid-swap on a cold cache. Kicking the fetches off here
  // (off the critical path, scoped to just the reel's ~9 fonts and photos) gets
  // them into cache before the first 4.5s advance without touching initial LCP.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    // Defer to idle time so warming never competes with first paint / LCP.
    const schedule =
      window.requestIdleCallback?.bind(window) ??
      ((cb: () => void) => window.setTimeout(cb, 200));
    const cancel =
      window.cancelIdleCallback?.bind(window) ?? window.clearTimeout;

    const handle = schedule(() => {
      // Fonts: ask the CSS Font Loading API to load each reel family. This pulls
      // the woff2 the @font-face rule points at without us hardcoding gstatic's
      // hashed URLs (which rotate). Failures (e.g. a family not in the sheet)
      // are non-fatal — the slide just paints its fallback as it does today.
      if (typeof document !== 'undefined' && document.fonts?.load) {
        for (const spec of REEL_FONT_SPECIFIERS) {
          document.fonts.load(spec).catch(() => {});
        }
      }
      // Images: prime the browser cache with the reel's product photos so they
      // are decoded by the time their slide swaps in.
      for (const src of REEL_IMAGE_SRCS) {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
      }
    });

    return () => cancel(handle as never);
  }, []);

  const value = useMemo<HeroReelState>(
    () => ({slides, index, goTo, animate: !reduceMotion, setPaused, userMode}),
    [slides, index, goTo, reduceMotion, userMode],
  );

  return (
    <HeroReelContext value={value}>
      <div
        {...stylex.props(styles.swipeArea)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </HeroReelContext>
  );
}

/** Themed, recolorable Astryx wordmark for the centered content column. */
export function HeroReelWordmark() {
  const reel = useHeroReel();

  if (!reel || reel.slides.length === 0) {
    // Fallback: render the static brand wordmark in the default accent so the
    // hero still has a brand mark even if no themes are registered.
    return (
      <div
        {...stylex.props(
          styles.wordmarkWrap,
          dynamic.wordmarkColor('var(--color-text-accent)'),
        )}>
        <AstryxLogo
          role="img"
          aria-label="Astryx"
          className={stylex.props(styles.wordmark).className}
        />
      </div>
    );
  }

  const active = reel.slides[reel.index];
  return (
    <Theme theme={active.theme} mode={effectiveMode(active, reel.userMode)}>
      <div
        {...stylex.props(
          styles.wordmarkWrap,
          dynamic.wordmarkColor(active.wordmarkColor),
        )}>
        <AstryxLogo
          role="img"
          aria-label="Astryx"
          className={stylex.props(styles.wordmark).className}
        />
      </div>
    </Theme>
  );
}

/** Full-bleed floating cards layer for the hero gutters. */
export function HeroReelCards() {
  const reel = useHeroReel();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!reel || reel.slides.length === 0) {
    return null;
  }

  const active = reel.slides[reel.index];
  // Entrance animation only runs when motion is allowed; otherwise cards are
  // shown in their resting pose immediately.
  const shown = reel.animate ? mounted : true;

  return (
    <Theme theme={active.theme} mode={effectiveMode(active, reel.userMode)}>
      <div {...stylex.props(styles.themeFill)} aria-hidden="true" />
      <div {...stylex.props(styles.navBackdrop)} aria-hidden="true" />
      <div
        aria-hidden="true"
        {...stylex.props(
          styles.backdropGlow,
          dynamic.aurora(
            active.aurora.left,
            active.aurora.center,
            active.aurora.right,
          ),
        )}
      />
      {/* Floating cards layer */}
      <div {...stylex.props(styles.cardsLayer)}>
        <HeroFloatingCards content={active.content} mounted={shown} />
      </div>
    </Theme>
  );
}

/**
 * Narrow-screen (collage) variant of the hero cards, placed after the hero text
 * in page.tsx. Self-hides at ≥1024px, where HeroReelCards (overlap) takes over.
 */
export function HeroReelStack() {
  const reel = useHeroReel();
  if (!reel || reel.slides.length === 0) {
    return null;
  }
  const active = reel.slides[reel.index];
  return (
    <Theme theme={active.theme} mode={effectiveMode(active, reel.userMode)}>
      <HeroFloatingCards content={active.content} mounted layout="stack" />
    </Theme>
  );
}

/** Dot controls + a polite live region announcing the active theme. */
export function HeroReelDots() {
  const reel = useHeroReel();
  if (!reel || reel.slides.length <= 1) {
    return null;
  }
  const {slides, index, goTo} = reel;
  const active = slides[index];

  return (
    <>
      {/* Real Pagination (dots variant). It's 1-indexed, so page = index+1.
          The prev/next chevrons it ships with are hidden on the home page via
          a [data-home-page] CSS rule in globals.css, leaving just the dots. */}
      <div {...stylex.props(styles.dots)}>
        <Pagination
          variant="dots"
          label="Preview Astryx themes"
          page={index + 1}
          totalPages={slides.length}
          onChange={p => goTo(p - 1)}
        />
      </div>
      <Text
        as="span"
        type="supporting"
        aria-live="polite"
        xstyle={styles.srOnly}>
        {active.label} theme
      </Text>
    </>
  );
}
