// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/Layout';
import {Theme} from '@astryxdesign/core/theme';
import {
  radiusVars,
  shadowVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {themeObjects} from '../../../generated/themeRegistry';
import {useThemeMode} from '../../providers';

// Built Butter theme (__built:true) — same registry the hero reel + /themes
// page pull from, so the left preview renders pre-built CSS with no runtime
// injection.
const butterTheme = themeObjects['@astryxdesign/theme-butter'];

// Swatch + "Aa" colors as Butter theme tokens (resolved via the Butter <Theme>
// scope around the rail below) rather than hardcoded hex, so they stay in sync.
const BUTTER_BLUE = 'var(--color-accent)';
const BUTTER_YELLOW = 'var(--color-background-yellow)';
const BUTTER_CREAM = 'var(--color-background-body)';

// Butter's signature display cursive — the theme only applies it to display-role
// text, so the "Aa" sets the family explicitly.
const BUTTER_SCRIPT = 'Sarina, "Brush Script MT", "Snell Roundhand", cursive';

// The store template's natural (pre-scale) render width and the layout height
// at which the first section ends — just below the 3 product cards (the cards'
// bottom sits at ~748px; +20px leaves a clean gap before the crop). The window
// uses this ratio so it always crops right under the products (showing the full
// nav + hero + product cards) regardless of how big the store is scaled.
const STORE_RENDER_WIDTH = 1000;
const STORE_CROP_HEIGHT = 768;
// Max width of the store window on wide cards (the scaled-down desktop store).
// Larger than the card's content box so the store bleeds symmetrically into the
// card's inset (see container) — this gives the preview more height (taller)
// while staying centered.
const STORE_MAX = 360;
// Horizontal space reserved beside the store for the swatches/"Aa" rail (gap +
// rail width + breathing room). The fluid store width subtracts this from the
// available width so the rail always stays inside the card with comfortable
// clearance — the cursive "Aa" slants/overhangs past its box, so the reserve is
// generous enough that it never touches the card's right edge, even in the
// narrow 3-column grid.
const RAIL_RESERVE = 72;
// Extra left shift beyond the inset cancellation (applied only when the card is
// narrow — the 3-column desktop grid) — pushes the composition further left so
// the store bleeds PAST the card's left edge (the card's overflow:hidden clips
// it), giving the off-canvas, anchored-left look. On a wide single-column card
// (small screens) the composition is centered instead (no shift).
const SHIFT_LEFT = 40;
// Container-width threshold separating the narrow 3-column-grid card (left-
// anchored + shifted) from the wide single-column card (centered). The 3-column
// cards measure ~300-380px of container width; the single-column card is wider.
const WIDE_CARD = '@container themesPreview (min-width: 400px)';

const styles = stylex.create({
  // Container so the store + rail size FLUIDLY off the card's width, not the
  // viewport. The bento column is narrow even on wide screens (the 3-column
  // desktop grid), so a viewport media query can't tell when the card is tight.
  // Symmetric bleed: reclaims BOTH of the card's insets (--spacing-10 = 40px
  // each) so the store can be bigger. flexShrink 0 keeps the widened box from
  // being collapsed by the parent flex (previewWrap is an HStack).
  container: {
    containerType: 'inline-size',
    containerName: 'themesPreview',
    flexShrink: 0,
    width: `calc(100% + 2 * ${spacingVars['--spacing-10']})`,
    marginInline: `calc(-1 * ${spacingVars['--spacing-10']})`,
  },
  // Horizontal composition: themed store preview + static swatches/"Aa" rail.
  // Narrow card (3-column grid): left-anchored and shifted further left so the
  // store bleeds past the card's left edge (off-canvas look). Wide single-column
  // card (small screens): centered as a group (the original layout).
  root: {
    display: 'flex',
    flexDirection: 'row',
    // Top-align so the store starts right under "Explore" (matching the gap on
    // the other cards) rather than being vertically centered.
    alignItems: 'flex-start',
    justifyContent: {
      default: 'flex-start',
      [WIDE_CARD]: 'center',
    },
    // Push past the card's left edge only on narrow cards; none when centered.
    marginInlineStart: {
      default: `calc(-1 * ${SHIFT_LEFT}px)`,
      [WIDE_CARD]: 0,
    },
    gap: spacingVars['--spacing-4'],
    width: '100%',
  },
  // Window around the scaled store (no border — transparent Card), rounded on
  // all corners with an elevation shadow so the store preview lifts off the
  // card. Width is FLUID: it fills the available width minus the space reserved
  // for the rail (RAIL_RESERVE), capped at STORE_MAX. So the store shrinks on
  // narrow cards and the swatches/"Aa" rail always stays inside.
  showcaseCard: {
    flexShrink: 0,
    minWidth: 0,
    width: `min(${STORE_MAX}px, calc(100cqw - ${RAIL_RESERVE}px))`,
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-inner'],
    boxShadow: shadowVars['--shadow-med'],
  },
  // Clipping viewport — its aspect ratio crops the scaled store right under the
  // 3 product cards (showing the full nav + hero + products), cropping out the
  // cream gap and the Checkout / Studio AI sections below. The ratio is the
  // store's natural render width : crop height, so the crop point stays constant
  // as the store scales fluidly with the card width.
  scaleViewport: {
    width: '100%',
    aspectRatio: `${STORE_RENDER_WIDTH} / ${STORE_CROP_HEIGHT}`,
    overflow: 'hidden',
    // Decorative preview — never interactive (also inert on scaleInner).
    pointerEvents: 'none',
  },
  // Render the store at its natural desktop width then scale it down to fit the
  // fluid window. The scale is the window width / (render width + 4px slack),
  // computed from the same fluid expression, so the store always fills the
  // window with a hair to spare — no right-clip, no gutter — at any card width.
  // calc() dividing a length by a length yields the unitless number scale()
  // requires.
  scaleInner: {
    width: STORE_RENDER_WIDTH,
    transform: `scale(calc(min(${STORE_MAX}px, calc(100cqw - ${RAIL_RESERVE}px)) / ${STORE_RENDER_WIDTH + 4}px))`,
    transformOrigin: 'top left',
  },
  // Butter swatches + script wordmark, stacked vertically and left-aligned.
  rail: {
    flexShrink: 0,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: radiusVars['--radius-full'],
    borderWidth: '1px',
    borderStyle: 'solid',
    // Subtle outline so the cream swatch stays visible on the card's pastel bg.
    borderColor: 'rgba(29, 28, 17, 0.12)',
  },
  railWordmark: {
    fontFamily: BUTTER_SCRIPT,
    fontSize: 24,
    lineHeight: 1,
    color: BUTTER_BLUE,
  },
});

const swatchColors = stylex.create({
  fill: (color: string) => ({backgroundColor: color}),
});

// Theme-aware replacement for the old /feature-brand.png: the real /themes
// ThemeShowcaseStore (Butter content) on the left + Butter swatches & script "Aa"
// on the right, both in a Butter <Theme> scope so they're dark-mode correct.
// The page passes the store as a build-time snapshot (FrozenPreview), so the
// store's code does not ship to the browser.
export function ThemesPreview({store}: {store: ReactNode}) {
  // Follow the docsite light/dark toggle so the Butter preview switches modes
  // (keeps Butter's palette; 'system' defers to the OS before the toggle).
  const {themeMode} = useThemeMode();
  return (
    <div {...stylex.props(styles.container)}>
      <div {...stylex.props(styles.root)}>
        <Card variant="transparent" padding={0} xstyle={styles.showcaseCard}>
          <Theme theme={butterTheme} mode={themeMode}>
            <div
              {...stylex.props(styles.scaleViewport)}
              data-themes-card-preview>
              <div {...stylex.props(styles.scaleInner)} inert>
                {store}
              </div>
            </div>
          </Theme>
        </Card>

        {/* Butter <Theme> scope (display:contents, no layout box) so the
            swatches/"Aa" resolve the Butter --color-* tokens directly. */}
        <Theme theme={butterTheme} mode={themeMode}>
          <HStack gap={2} xstyle={styles.rail}>
            <div
              {...stylex.props(styles.swatch, swatchColors.fill(BUTTER_BLUE))}
            />
            <div
              {...stylex.props(styles.swatch, swatchColors.fill(BUTTER_YELLOW))}
            />
            <div
              {...stylex.props(styles.swatch, swatchColors.fill(BUTTER_CREAM))}
            />
            <span {...stylex.props(styles.railWordmark)} aria-hidden="true">
              Aa
            </span>
          </HStack>
        </Theme>
      </div>
    </div>
  );
}
