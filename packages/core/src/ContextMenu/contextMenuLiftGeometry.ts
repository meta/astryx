// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuLiftGeometry.ts
 * @input The context-menu constants and the lift module's geometry
 *   (lift/liftGeometry.ts)
 * @output Exports liftScale, liftedBox and menuPlacement: where UIKit's
 *   lifted preview lands when the menu shows, and where the menu sits
 *   against it, with UIKit's numbers
 * @position The geometry of ContextMenu's lift presentation (touch);
 *   ContextMenu.tsx renders it
 *
 * When a context menu shows on iOS 26.2, the long-pressed view's preview
 * lifts above a tinted backdrop: it grows about its center
 * (`contextMenu.lift`), stays inside the viewport's gutter, and the menu sits
 * a gap away: below it when it fits, else above, centered on it or flush with
 * the edge it is held against. The gutter is the layer runtime's one
 * definition (spec:AST-059), not UIKit's own margins (16 pt at the sides, 20
 * pt plus the safe area at the top and bottom, `contextMenu.lift`): at the
 * sides they agree; near a notch the runtime's leaves up to 20 px less. The
 * lift module owns the geometry; this file gives it UIKit's numbers.
 *
 * SYNC: When modified, update
 * /packages/core/src/ContextMenu/contextMenuLiftGeometry.test.ts
 */

import {
  liftedRect,
  liftScale as liftScaleBy,
  surfacePlacement,
  type LiftGutter,
  type LiftViewport,
  type SurfacePlacement,
} from '../lift/liftGeometry';
import type {MorphRect} from '../motion/rectMorph';
import {contextMenu} from '../motion/uikit/contextMenu';

/** A box in client CSS px. */
export type LiftBox = MorphRect;
export type {LiftGutter, LiftViewport};
/** Where the menu sits against the lifted preview. */
export type MenuPlacement = SurfacePlacement;

/** UIKit's scale rule for the lifted preview (`contextMenu.lift`). */
const RULE = {
  maxScale: contextMenu.lift.maxScale,
  scaleUpPoints: contextMenu.lift.scaleUpPoints,
};

/**
 * The factor a `width` × `height` preview grows by when the menu shows: up to
 * `maxScale`, by `scaleUpPoints` on its larger side, and never wider than the
 * screen less its insets (which can make it smaller than 1).
 */
export function liftScale(
  width: number,
  height: number,
  viewport: LiftViewport,
): number {
  return liftScaleBy(width, height, viewport, RULE);
}

/**
 * The lifted preview's box: `source` scaled by `liftScale` about its center,
 * then moved inside the viewport's gutter if it crosses it.
 */
export function liftedBox(source: LiftBox, viewport: LiftViewport): LiftBox {
  return liftedRect(source, viewport, RULE);
}

/**
 * The menu's place: below the preview when `menuHeight` fits between it and
 * the bottom limit, else above; centered on the preview, or flush with the
 * preview's edge when the preview is held against a side of the screen.
 */
export function menuPlacement(
  lifted: LiftBox,
  menuHeight: number,
  viewport: LiftViewport,
): MenuPlacement {
  return surfacePlacement(
    lifted,
    menuHeight,
    viewport,
    contextMenu.lift.menuGap,
  );
}
