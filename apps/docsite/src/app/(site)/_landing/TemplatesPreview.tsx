// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shows a decorative grid of page-template previews on a feature card.
 * @input Uses the tile rows and the static preview pages that scripts/generate-landing-template-previews.mjs renders at build time.
 * @output Renders each preview page in a lazy-loaded frame, scaled to its tile. A visitor's own color mode reaches the page in the frame's URL.
 * @position Landing and community feature cards.
 */

'use client';

import * as stylex from '@stylexjs/stylex';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  spacingVars,
  radiusVars,
  shadowVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {useThemeMode} from '../../providers';
import templateRows from './landingTemplateRows.json';
import {previewColorModeFragment} from './templatePreviewColorMode';

// A representative set of the real page templates (storefront, IDE, payment,
// login, settings, AI chat, product detail). Grouped into rows; the middle row
// holds three so the centered (login) template sits in the middle.
//
// A live render of seven templates costs seconds of main-thread work on a
// slow device. The card is decorative, so each tile shows a static page that
// the build renders from the same template: markup and styles, no script.
const TEMPLATE_ROWS: string[][] = templateRows;

const PREVIEW_DIRECTORY = '/landing/template-previews';

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
const RENDER_HEIGHT = (RENDER_WIDTH * 11.5) / 16;

// The bento column is narrow even on wide screens (3-column desktop grid), so
// the 50%-wider, staggered, bleeding 2-per-row layout only makes sense there.
// Once the card itself is wide — the single-column stack on small screens — the
// rows dissolve into a single 3-per-line grid so the tiles aren't huge and use
// the width better. Keyed to the CARD width via a container query, not viewport.
const WIDE_CARD = '@container templatesPreview (min-width: 400px)';

const styles = stylex.create({
  // Query container — a plain wrapper whose width the layout below responds to.
  // (A container can't respond to its OWN @container query, so the responsive
  // layout must live on a descendant, not on this element.)
  container: {
    containerType: 'inline-size',
    containerName: 'templatesPreview',
    width: '100%',
    // Decorative — never interactive.
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
  // The size container that the frame's scale reads.
  frameBox: {
    containerType: 'inline-size',
    aspectRatio: TILE_RATIO,
    overflow: 'hidden',
  },
  // The frame lays its page out at the render width, then shrinks to the
  // tile. tan(atan2(a, b)) divides two lengths, which calc() cannot do in
  // every browser yet. The fixed scale is for a browser without it.
  frame: {
    display: 'block',
    width: `${RENDER_WIDTH}px`,
    height: `${RENDER_HEIGHT}px`,
    borderWidth: 0,
    transformOrigin: 'top left',
    transform: stylex.firstThatWorks(
      `scale(tan(atan2(100cqw, ${RENDER_WIDTH}px)))`,
      'scale(0.25)',
    ),
  },
  // Hidden on a wide card (small screens): with 7 templates the dissolved
  // 3-column grid would leave a lone 7th tile (3 + 3 + 1), so one tile drops out
  // to keep a clean 3 + 3. It still shows in the narrow-card desktop layout.
  hideOnWide: {
    display: {
      default: 'block',
      [WIDE_CARD]: 'none',
    },
  },
});

export function TemplatesPreview({
  maxRows,
}: {
  /**
   * Cap the number of thumbnail rows rendered. Defaults to all rows;
   * pass e.g. 2 to show only the first two rows in a more compact card.
   */
  maxRows?: number;
}) {
  const {themeMode} = useThemeMode();
  const rows =
    maxRows != null ? TEMPLATE_ROWS.slice(0, maxRows) : TEMPLATE_ROWS;
  const osPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const colorMode = previewColorModeFragment(themeMode, osPrefersDark);

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
                {...stylex.props(
                  styles.tile,
                  slug === HIDE_ON_SMALL && styles.hideOnWide,
                )}>
                <div {...stylex.props(styles.frameBox)}>
                  <iframe
                    // A new URL in a loaded frame adds a browser history
                    // entry, so Back would step through the tiles. A new
                    // frame for the new color mode adds none.
                    key={colorMode}
                    src={`${PREVIEW_DIRECTORY}/${slug}.html${colorMode}`}
                    title={`${slug} template preview`}
                    loading="lazy"
                    // The page has no script, and the card does not read it.
                    sandbox=""
                    tabIndex={-1}
                    {...stylex.props(styles.frame)}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
