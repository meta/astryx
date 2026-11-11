// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shows a decorative grid of page-template previews on a feature card.
 * @input Uses the tile rows and pre-generated light and dark preview images.
 * @output Renders lazy-loaded preview images; `?template-previews=live` renders the live templates instead.
 * @position Landing and community feature cards; the live mode is the source for the capture script.
 */

'use client';

import {useSyncExternalStore} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  spacingVars,
  radiusVars,
  shadowVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {TemplateThumbnail} from '../../../components/TemplateThumbnail';
import {useThemeMode} from '../../providers';
import {
  LANDING_PREVIEW_SIZE,
  LANDING_TEMPLATE_ROWS,
  landingPreviewSrc,
} from './landingTemplatePreviews';

// A live render of seven templates costs seconds of main-thread work and
// megabytes of template images. The card is decorative, so it shows
// screenshots of those renders. Run `pnpm capture:landing-previews` in the
// docsite after a change to one of these templates.

// On small screens the rows flow into a single 3-column grid; 7 templates would
// leave a lone 7th tile, so this one is dropped there to keep a clean 3 + 3.
const HIDE_ON_SMALL = 'product-detail';

// Desktop width each template renders at before being shrunk to fit — a desktop
// width shows the WHOLE page composition (nav + hero + content), not a zoomed-in
// top-left corner.
const RENDER_WIDTH = 1100;
// Uniform tile aspect ratio so every block is the same height (and, in a 2-col
// grid, the same width). Slightly taller than 16/10 to show a bit more of each
// page.
const TILE_RATIO = '16/11.5';

// The bento column is narrow even on wide screens (3-column desktop grid), so
// the 50%-wider, staggered, bleeding 2-per-row layout only makes sense there.
// Once the card itself is wide — the single-column stack on small screens — the
// rows dissolve into a single 3-per-line grid so the tiles aren't huge and use
// the width better. Keyed to the CARD width via a container query, not viewport.
const WIDE_CARD = '@container templatesPreview (min-width: 400px)';

const LIVE_PREVIEWS_QUERY = 'template-previews=live';

function subscribeToNothing() {
  return () => {};
}

function useLivePreviews(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => window.location.search.includes(LIVE_PREVIEWS_QUERY),
    () => false,
  );
}

const styles = stylex.create({
  // Query container — a plain wrapper whose width the layout below responds to.
  // (A container can't respond to its OWN @container query, so the responsive
  // layout must live on a descendant, not on this element.)
  container: {
    containerType: 'inline-size',
    containerName: 'templatesPreview',
    width: '100%',
    // Decorative — never interactive (TemplateThumbnail is already inert).
    pointerEvents: 'none',
  },
  // Narrow card: a flex-column stack of 2-per-row groups (each row offset/bled).
  // Wide card: a single 3-column grid — the row wrappers dissolve via
  // display:contents below, so all 6 tiles flow into these 3 columns → 2 lines.
  // (The unused flex/grid properties for each mode are ignored.)
  root: {
    display: {
      default: 'flex',
      [WIDE_CARD]: 'grid',
    },
    flexDirection: 'column',
    gridTemplateColumns: {
      default: 'none',
      [WIDE_CARD]: 'repeat(3, 1fr)',
    },
    gap: spacingVars['--spacing-5'],
    width: '100%',
  },
  // Narrow card: each row is a uniform grid, centered so the extra width bleeds
  // evenly off both edges (clipped by the card's overflow). Wide card: the row
  // wrapper dissolves (display:contents) so its tiles flow into the root's
  // 3-column grid. Width/offset is set per column-count below so EVERY tile is
  // the same size regardless of how many are in the row.
  row: {
    display: {
      default: 'grid',
      [WIDE_CARD]: 'contents',
    },
    gap: spacingVars['--spacing-5'],
  },
  // 2-up row: 150% wide → each tile ≈ 75% of the card. Centered.
  cols2: {
    gridTemplateColumns: '1fr 1fr',
    width: '150%',
    marginInline: '-25%',
  },
  // 3-up row: 225% wide so each tile is the SAME ~75%-of-card size as the 2-up
  // rows (3 × 75% = 225%). Centered, so the middle tile is fully visible and the
  // outer two bleed off the edges (clipped) — matching the others' tile size.
  cols3: {
    gridTemplateColumns: 'repeat(3, 1fr)',
    width: '225%',
    marginInline: '-62.5%',
  },
  // Frame each thumbnail with a subtle border + clip and an elevation shadow so
  // each scaled page reads as a tidy, lifted card tile rather than a flat render.
  tile: {
    borderRadius: radiusVars['--radius-inner'],
    overflow: 'hidden',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: shadowVars['--shadow-med'],
  },
  // Hidden on a wide card (small screens): with 7 templates the dissolved
  // 3-column grid would leave a lone 7th tile (3 + 3 + 1), so one tile drops out
  // to keep a clean 3 + 3. It still shows in the narrow-card desktop layout.
  previewImage: {
    display: 'block',
    width: '100%',
    height: 'auto',
    aspectRatio: TILE_RATIO,
    objectFit: 'cover',
    objectPosition: 'top left',
  },
  hideOnWide: {
    display: {
      default: 'block',
      [WIDE_CARD]: 'none',
    },
  },
});

function TemplatePreviewImage({slug}: {slug: string}) {
  const {themeMode} = useThemeMode();
  const light = landingPreviewSrc(slug, 'light');
  const dark = landingPreviewSrc(slug, 'dark');
  if (!light || !dark) {
    return null;
  }
  const image = (
    <img
      src={themeMode === 'dark' ? dark : light}
      alt=""
      width={LANDING_PREVIEW_SIZE.width}
      height={LANDING_PREVIEW_SIZE.height}
      loading="lazy"
      decoding="async"
      {...stylex.props(styles.previewImage)}
    />
  );
  // Before the site resolves its color mode, the OS preference selects the
  // image, as it selects the site colors.
  if (themeMode !== 'system') {
    return image;
  }
  return (
    <picture>
      <source srcSet={dark} media="(prefers-color-scheme: dark)" />
      {image}
    </picture>
  );
}

export function TemplatesPreview({
  maxRows,
}: {
  /**
   * Cap the number of thumbnail rows rendered. Defaults to all rows;
   * pass e.g. 2 to show only the first two rows in a more compact card.
   */
  maxRows?: number;
}) {
  const isLive = useLivePreviews();
  const rows =
    maxRows != null
      ? LANDING_TEMPLATE_ROWS.slice(0, maxRows)
      : LANDING_TEMPLATE_ROWS;
  return (
    <div {...stylex.props(styles.container)} inert>
      <div {...stylex.props(styles.root)}>
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            {...stylex.props(
              styles.row,
              row.length === 3 ? styles.cols3 : styles.cols2,
            )}>
            {row.map(slug => (
              <div
                key={slug}
                data-template-slug={slug}
                {...stylex.props(
                  styles.tile,
                  slug === HIDE_ON_SMALL && styles.hideOnWide,
                )}>
                {isLive || !landingPreviewSrc(slug, 'light') ? (
                  // borderRadius="0" so the thumbnail fills the tile's rounded
                  // corners flush — the tile already rounds + clips, so the
                  // thumbnail's own --radius-container would otherwise nest a
                  // second, mismatched radius.
                  <TemplateThumbnail
                    slug={slug}
                    aspectRatio={TILE_RATIO}
                    renderWidth={RENDER_WIDTH}
                    borderRadius="0"
                  />
                ) : (
                  <TemplatePreviewImage slug={slug} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
