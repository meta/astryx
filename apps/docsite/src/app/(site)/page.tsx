// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef, type Ref, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';
import {VStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Button} from '@astryxdesign/core/Button';
import {Theme} from '@astryxdesign/core/theme';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
// Built theme (__built:true) so <Theme> uses the pre-built CSS and skips
// runtime style injection. Importing the source astryxTheme.ts re-triggers it.
import {astryxTheme} from '@/themes/astryx';
import {layout} from '../../layout.stylex';
import {
  HeroReelProvider,
  HeroReelSwipeArea,
  HeroReelBackdrop,
  HeroReelCards,
  HeroReelStack,
  HeroReelWordmark,
  HeroReelDots,
  useHeroReelIsDark,
} from './_landing/hero/HeroThemeReel';
import {FeaturesShowcase} from './_landing/FeaturesShowcase';
import {AboutShowcase} from './_landing/AboutShowcase';
import {BlogShowcase} from './_landing/BlogShowcase';
import {DiscoverShowcase} from './_landing/DiscoverShowcase';

const HERO_BAND_HEIGHT = 760;

const styles = stylex.create({
  // Wraps hero + showcase so the pin-and-cover stays bounded to this container
  // (not pinned through the footer).
  heroScope: {
    position: 'relative',
    backgroundColor: 'var(--color-background-body)',
    // Shared by the nav→wordmark gap and the text→cards gap so they match.
    '--hero-gap': 'calc(var(--spacing-12) * 2)',
  },
  // Desktop: the hero text's rail — absolute over the whole of heroScope (hero
  // band + showcase) so the sticky heroContent inside pins for the entire
  // pin-and-cover; inside the 760px band alone it would release after ~48px.
  // It doubles as the reel's swipe/hover surface (HeroReelSwipeArea), so it
  // keeps pointer events: over the band it is the top-most hit target, and the
  // showcase, later in tree order, covers it as it scrolls up. Narrow: in flow,
  // wrapping the hero text like the old provider wrapper did.
  heroContentRail: {
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'absolute',
    },
    inset: {
      default: 'auto',
      '@media (min-width: 1024px)': 0,
    },
  },
  // Desktop: sticky for pin-and-cover (heroSpacer reserves its height) —
  // sticky rather than fixed so the band lifts with the document and can't
  // bleed into an overscroll gap (#5470). Narrow: in flow — the mobile hero is
  // taller than the viewport, so pinning stranded the lower collage below the
  // fold.
  heroContent: {
    position: {
      default: 'relative',
      '@media (min-width: 1024px)': 'sticky',
    },
    // top offset only matters when sticky; in flow it would leave a gap.
    top: {
      default: 0,
      '@media (min-width: 1024px)': 'var(--appshell-header-height, 0px)',
    },
    // Desktop: pinned band, centered (cards are a separate overlap layer).
    // Narrow: auto height (sizes to text + collage); a ResizeObserver applies it
    // to heroSpacer so the showcase starts right after the cards.
    height: {
      default: 'auto',
      '@media (min-width: 1024px)': `calc(${HERO_BAND_HEIGHT}px - var(--appshell-header-height, 0px))`,
    },
    // Desktop centers the content; narrow anchors it to the top so the collage
    // below has room.
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 1024px)': 'center',
    },
    // Narrow: in flow below the header. Pad by the nav's height plus the gap;
    // --spacing-12 rather than --appshell-header-height, which also counts the
    // canary banner. Desktop is fixed + centered, so none.
    paddingBlockStart: {
      default: 'calc(var(--spacing-12) + var(--spacing-8))',
      '@media (min-width: 768px)': 'calc(var(--spacing-12) + var(--hero-gap))',
      '@media (min-width: 1024px)': 0,
    },
    paddingBlockEnd: spacingVars['--spacing-12'],
    maxWidth: layout.proseMaxWidth,
    marginInline: 'auto',
    paddingInline: spacingVars['--spacing-6'],
    textAlign: 'center',
    gap: spacingVars['--spacing-6'],
    // Decorative-position layer; never intercept clicks outside its actual
    // content (the buttons/links re-enable pointer events on themselves).
    zIndex: 0,
  },
  // Reserves the pinned hero's height (desktop); 0 on narrow (hero is in flow).
  heroSpacer: {
    height: {
      default: 0,
      '@media (min-width: 1024px)': HERO_BAND_HEIGHT,
    },
  },
  // CTA button row, capped at a thumb-reachable width.
  heroButtons: {
    width: '100%',
    maxWidth: 420,
    marginInline: 'auto',
  },
  // Top gap for the narrow-screen collage, set outside the reel's <Theme> so
  // --hero-gap/--spacing resolve in the docsite scale (constant across swaps).
  heroCollageGap: {
    marginBlockStart: {
      default: spacingVars['--spacing-10'],
      '@media (min-width: 768px)': 'var(--hero-gap)',
    },
  },
  // On dark slides the hero text switches to a light ink (headline/links inherit).
  heroTextDark: {
    color: 'var(--hero-on-dark)',
  },
  // Normal weight (the value-prop span is semibold); smaller on narrow screens.
  heroHeadline: {
    fontWeight: 'var(--font-weight-normal)',
    fontSize: {
      default: 'var(--font-size-3xl)',
      '@media (min-width: 768px)': 'var(--font-size-4xl)',
      '@media (min-width: 1024px)': 'var(--text-display-1-size)',
    },
  },
  // The surface that scrolls up over the pinned hero (pin-and-cover).
  showcaseOverlay: {
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: 'var(--radius-page)',
    borderTopRightRadius: 'var(--radius-page)',
    backgroundColor: 'var(--color-background-surface)',
    paddingBlockStart: 'var(--astryx-marketing-section-gap)',
    // Smaller than the section gap — the footer adds its own top spacing.
    paddingBlockEnd: spacingVars['--spacing-12'],
    paddingInline: spacingVars['--spacing-6'],
    gap: 'var(--astryx-marketing-section-gap)',
  },
  // Theme-switcher dots, low in the hero. Desktop: absolute so they don't
  // disturb the band's vertical centering (margin-top:auto would shift the
  // wordmark). Narrow: in flow after the collage.
  heroDots: {
    paddingBlockStart: {
      default: 0,
      '@media (min-width: 1024px)': spacingVars['--spacing-6'],
    },
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'absolute',
    },
    insetBlockEnd: {
      default: 'auto',
      // The pinned band's bottom sits a nav-height above the real seam, so
      // subtract it to land 32px above the features surface.
      '@media (min-width: 1024px)':
        'calc(var(--spacing-8) - var(--appshell-header-height, 0px))',
    },
    insetInlineStart: {
      default: 'auto',
      '@media (min-width: 1024px)': 0,
    },
    insetInlineEnd: {
      default: 'auto',
      '@media (min-width: 1024px)': 0,
    },
    display: 'flex',
    justifyContent: 'center',
  },
});

// Renders hero controls (CTAs, dots) in the active slide's mode. Always renders
// the same <Theme> element and only toggles `mode` — swapping the element type
// (Fragment ↔ Theme) would remount the subtree and drop keyboard focus from
// the dot the user just activated.
function DarkScope({isDark, children}: {isDark: boolean; children: ReactNode}) {
  return (
    <Theme theme={astryxTheme} mode={isDark ? 'dark' : 'light'}>
      {children}
    </Theme>
  );
}

// Hero text block (wordmark, headline, CTAs, dots, collage). Inside
// HeroReelProvider so it can read isDark and switch to light text on dark slides.
function HeroContent({contentRef}: {contentRef: Ref<HTMLElement>}) {
  const isDark = useHeroReelIsDark();
  // Flag the body on dark slides so the transparent nav can go light (globals.css).
  useEffect(() => {
    if (isDark) {
      document.body.setAttribute('data-hero-dark', '');
    } else {
      document.body.removeAttribute('data-hero-dark');
    }
    return () => document.body.removeAttribute('data-hero-dark');
  }, [isDark]);
  return (
    <VStack
      ref={contentRef}
      data-home-page="true"
      align="stretch"
      xstyle={[styles.heroContent, isDark && styles.heroTextDark]}>
      <HeroReelWordmark />
      <Heading
        level={1}
        type="display-1"
        color={isDark ? 'inherit' : 'primary'}
        xstyle={styles.heroHeadline}>
        An open source design system that's{' '}
        <Text as="span" type="inherit" color="inherit" weight="semibold">
          fully customizable and agent ready
        </Text>
      </Heading>
      <VStack gap={4} align="center">
        <DarkScope isDark={isDark}>
          <Grid columns={2} gap={3} xstyle={styles.heroButtons}>
            <Button
              variant="primary"
              size="lg"
              label="Get started"
              href="/docs/getting-started"
            />
            <Button
              variant="secondary"
              size="lg"
              label="Browse components"
              href="/components"
            />
          </Grid>
        </DarkScope>
        <Text display="block" color={isDark ? 'inherit' : 'secondary'}>
          Currently in Beta · Built on{' '}
          <Link
            type="body"
            color="inherit"
            href="https://react.dev"
            target="_blank"
            rel="noopener noreferrer"
            hasUnderline>
            React 19+
          </Link>{' '}
          and{' '}
          <Link
            type="body"
            color="inherit"
            href="https://stylexjs.com"
            target="_blank"
            rel="noopener noreferrer"
            hasUnderline>
            StyleX
          </Link>
        </Text>
      </VStack>
      {/* Narrow-screen collage. The wrapper's gap is non-themed so it stays
          constant across theme swaps. Overlap layer (HeroReelCards) takes over
          ≥1024px; this self-hides there. */}
      <div {...stylex.props(styles.heroCollageGap)}>
        <HeroReelStack />
      </div>
      {/* DarkScope flips the dot ink to the active slide's light/dark mode. */}
      <DarkScope isDark={isDark}>
        <div data-home-page="true" {...stylex.props(styles.heroDots)}>
          <HeroReelDots />
        </div>
      </DarkScope>
    </VStack>
  );
}

export default function HomePage() {
  const showcaseRef = useRef<HTMLDivElement | null>(null);
  const heroScopeRef = useRef<HTMLDivElement | null>(null);
  const heroContentRef = useRef<HTMLElement | null>(null);

  // Measure the (auto-height) narrow hero content and expose it as
  // --hero-content-height so heroSpacer matches it (showcase starts right after
  // the cards). Desktop uses the fixed band, so the var is ignored there.
  useEffect(() => {
    const scope = heroScopeRef.current;
    const content = heroContentRef.current;
    if (!scope || !content) {
      return;
    }
    const navHeight = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(
        '--appshell-header-height',
      );
      return parseFloat(raw) || 64;
    };
    const setVar = () => {
      const total = content.getBoundingClientRect().height + navHeight();
      scope.style.setProperty(
        '--hero-content-height',
        `${Math.round(total)}px`,
      );
    };
    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(content);
    window.addEventListener('resize', setVar, {passive: true});
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', setVar);
    };
  }, []);

  useEffect(() => {
    const el = showcaseRef.current;
    if (!el) {
      return;
    }

    function readNavHeight() {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(
        '--appshell-header-height',
      );
      return parseFloat(raw) || 64;
    }

    function update() {
      if (!el) {
        return;
      }
      const navHeight = readNavHeight();
      const top = el.getBoundingClientRect().top;
      const reached = top <= navHeight;
      if (reached) {
        document.body.setAttribute('data-nav-mode', 'surface');
      } else {
        document.body.removeAttribute('data-nav-mode');
      }
    }

    update();
    window.addEventListener('scroll', update, {passive: true});
    window.addEventListener('resize', update, {passive: true});

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.body.removeAttribute('data-nav-mode');
    };
  }, []);

  return (
    <div ref={heroScopeRef} {...stylex.props(styles.heroScope)}>
      {/* HeroReelProvider holds the shared cycling state for the cards, wordmark,
          and dots. The headline/CTAs stay in stable Astryx brand style. */}
      <HeroReelProvider>
        {/* Reserves the pinned hero's height so the showcase starts below it. */}
        <div {...stylex.props(styles.heroSpacer)} aria-hidden="true" />
        {/* The pinned layers, one full-height rail each, all direct children of
            heroScope (HeroReelProvider renders no DOM). Every hero layer ties
            at z-index 0/auto, so this tree order IS the paint order: backdrop,
            then the overlap cards, then the hero text — and all of them before
            the showcase, which covers them as it scrolls up. */}
        <HeroReelBackdrop />
        <HeroReelCards />
        <HeroReelSwipeArea xstyle={styles.heroContentRail}>
          <HeroContent contentRef={heroContentRef} />
        </HeroReelSwipeArea>
      </HeroReelProvider>
      <VStack ref={showcaseRef} xstyle={styles.showcaseOverlay}>
        <FeaturesShowcase />
        <AboutShowcase />
        <BlogShowcase />
        <DiscoverShowcase />
      </VStack>
    </div>
  );
}
