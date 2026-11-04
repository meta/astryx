// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheetEdgeTint.tsx
 * @input StyleX and core color tokens
 * @output BottomSheetEdgeTint, an internal decorative element
 * @position Private helper rendered inside every BottomSheet dialog
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/BottomSheet.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.tsx
 * - /packages/core/src/BottomSheet/BottomSheetEdgeTint.test.tsx
 */

// iOS Safari colors its translucent toolbars by sampling the page. It hit
// tests a point inside each viewport edge, finds the nearest fixed or sticky
// ancestor, and extends its `background-color`. Without this element, WebKit
// can pick the dialog backdrop or the page, so equal sheets get different
// toolbar colors. This element is fixed, full width, at the bottom edge,
// taller than WebKit's 10px minimum, and in the sheet's surface color. It is
// masked out: Safari reads the computed style, not the pixels.

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';

/**
 * WebKit ignores the declared `background-color` of a sampled box thinner than
 * 10px and falls back to sampling painted pixels, which a masked element has
 * none of. 12px clears that floor with room to spare and is still far below
 * the ~40px of chrome it colours.
 */
const SAMPLE_HEIGHT_PX = 12;

const styles = stylex.create({
  tint: {
    position: 'fixed',
    insetInline: 0,
    insetBlockEnd: 0,
    height: `${SAMPLE_HEIGHT_PX}px`,
    backgroundColor: colorVars['--color-background-surface'],
    // Above the panel so the edge hit test lands here, and never in the way of
    // a touch that was meant for the sheet.
    zIndex: 2,
    pointerEvents: 'none',
    // Invisible to the user. WebKit's sampler checks `visibility` and
    // `opacity` — either would disqualify the element — but not `mask`, so
    // this hides the strip while leaving the colour readable. Without it the
    // strip would show as a hairline under the panel as the sheet slides out.
    maskImage: 'linear-gradient(transparent, transparent)',
    WebkitMaskImage: 'linear-gradient(transparent, transparent)',
  },
});

/**
 * Colours the iOS Safari toolbar strip below a sheet. Renders nothing visible;
 * see the file header for why it exists.
 */
export function BottomSheetEdgeTint() {
  return (
    <div
      {...stylex.props(styles.tint)}
      data-sheet-edge-tint=""
      aria-hidden="true"
    />
  );
}
