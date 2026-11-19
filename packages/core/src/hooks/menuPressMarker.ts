// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressMarker.ts
 * @input None (a plain attribute-name constant)
 * @output Exports MENU_PRESS_MARKER
 * @position Dependency-free home of the public menu-press marker, so the press
 *   feedback controller (utils/pressFeedback.ts) can read it without loading
 *   the menu-press hook into every pressable component's bundle.
 *   useMenuPress.ts re-exports it; the public path stays
 *   `@astryxdesign/core/hooks`.
 */

/** Marks a menu root that carries the menu press model (useMenuPress). */
export const MENU_PRESS_MARKER = 'data-astryx-menu-press';
