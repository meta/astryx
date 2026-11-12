// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Homepage card of scaled-down page templates.
 * @input The tile rows and the template markup that the build renders
 *   (FrozenPreview).
 * @output A decorative tile grid with no client JavaScript.
 * @position Server component. The homepage and the community page pass it to
 *   their client cards as a prop.
 */

import * as stylex from '@stylexjs/stylex';
import {
  spacingVars,
  radiusVars,
  shadowVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {FrozenPreview} from './FrozenPreview';
import templateRows from './landingTemplateRows.json';

// A representative set of the real page templates (storefront, IDE, payment,
// login, settings, AI chat, product detail). Grouped into rows; the middle row
// holds three so the centered (login) template sits in the middle.
//
// A live render of seven templates costs seconds of main-thread work on a
// slow device. The card is decorative, so the build renders each template
// once to static markup (scripts/generate-landing-template-previews.mjs).
// CSS scales it, and CSS variables re-theme it for dark mode.
const TEMPLATE_ROWS: ReadonlyArray<ReadonlyArray<string>> = templateRows;

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
const TILE_RATIO_WIDTH = 16;
const TILE_RATIO_HEIGHT = 11.5;

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
    // Decorative: never interactive (the container is also inert).
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
  // Crop window of one tile. It is a size container, so the scale below can
  // use its width (100cqw).
  frame: {
    position: 'relative',
    width: '100%',
    aspectRatio: `${TILE_RATIO_WIDTH} / ${TILE_RATIO_HEIGHT}`,
    overflow: 'hidden',
    containerType: 'inline-size',
    // Templates render transparent (content only, no AppShell), so the tile
    // supplies the page background.
    backgroundColor: 'var(--color-background-surface)',
  },
  // The template at its desktop render width, scaled down to the tile width.
  // Its height fills the crop window at that scale. tan(atan2(a, b)) divides
  // two lengths, which calc() cannot do in every browser yet. The fixed scale
  // is for a browser without it.
  scaler: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RENDER_WIDTH,
    height: (RENDER_WIDTH * TILE_RATIO_HEIGHT) / TILE_RATIO_WIDTH,
    overflow: 'hidden',
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
  const rows =
    maxRows != null ? TEMPLATE_ROWS.slice(0, maxRows) : TEMPLATE_ROWS;
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
                <div {...stylex.props(styles.frame)} inert>
                  <FrozenPreview
                    id={slug}
                    fillHeight
                    {...stylex.props(styles.scaler)}
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
