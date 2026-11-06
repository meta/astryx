// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file icons/defaults.ts
 * @input None
 * @output Shared icon names and each native platform's default system symbol
 * @position Native icon defaults (AST-082 FR17, DEC-10). An icon the app or
 *   theme defines replaces these
 */

import type {PlatformIcon} from '../theme/defineNativeTheme.js';

/**
 * Astryx's built-in icon names. Until core's portable entry carries them,
 * a test keeps this list equal to core's `IconName` union.
 */
export const BUILTIN_ICON_NAMES = [
  'close',
  'chevronDown',
  'chevronLeft',
  'chevronRight',
  'chevronsLeft',
  'chevronsRight',
  'check',
  'success',
  'error',
  'warning',
  'info',
  'calendar',
  'clock',
  'externalLink',
  'menu',
  'moreHorizontal',
  'search',
  'upload',
  'arrowUp',
  'arrowDown',
  'arrowsUpDown',
  'funnel',
  'eyeSlash',
  'viewColumns',
  'copy',
  'checkDouble',
  'wrench',
  'stop',
  'microphone',
] as const;

export type BuiltinIconName = (typeof BUILTIN_ICON_NAMES)[number];

/** SF Symbols, shared by iOS and macOS. */
const SF_SYMBOLS: Record<BuiltinIconName, string> = {
  close: 'xmark',
  chevronDown: 'chevron.down',
  chevronLeft: 'chevron.left',
  chevronRight: 'chevron.right',
  chevronsLeft: 'chevron.left.2',
  chevronsRight: 'chevron.right.2',
  check: 'checkmark',
  success: 'checkmark.circle.fill',
  error: 'exclamationmark.circle.fill',
  warning: 'exclamationmark.triangle.fill',
  info: 'info.circle.fill',
  calendar: 'calendar',
  clock: 'clock',
  externalLink: 'arrow.up.right.square',
  menu: 'line.3.horizontal',
  moreHorizontal: 'ellipsis',
  search: 'magnifyingglass',
  upload: 'square.and.arrow.up',
  arrowUp: 'arrow.up',
  arrowDown: 'arrow.down',
  arrowsUpDown: 'arrow.up.arrow.down',
  funnel: 'line.3.horizontal.decrease',
  eyeSlash: 'eye.slash',
  viewColumns: 'rectangle.split.3x1',
  copy: 'doc.on.doc',
  checkDouble: 'checkmark.message',
  wrench: 'wrench.adjustable',
  stop: 'stop.fill',
  microphone: 'mic',
};

/** Material Symbols names for Android. */
const MATERIAL_SYMBOLS: Record<BuiltinIconName, string> = {
  close: 'close',
  chevronDown: 'expand_more',
  chevronLeft: 'chevron_left',
  chevronRight: 'chevron_right',
  chevronsLeft: 'keyboard_double_arrow_left',
  chevronsRight: 'keyboard_double_arrow_right',
  check: 'check',
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
  calendar: 'calendar_today',
  clock: 'schedule',
  externalLink: 'open_in_new',
  menu: 'menu',
  moreHorizontal: 'more_horiz',
  search: 'search',
  upload: 'upload',
  arrowUp: 'arrow_upward',
  arrowDown: 'arrow_downward',
  arrowsUpDown: 'swap_vert',
  funnel: 'filter_alt',
  eyeSlash: 'visibility_off',
  viewColumns: 'view_column',
  copy: 'content_copy',
  checkDouble: 'done_all',
  wrench: 'build',
  stop: 'stop',
  microphone: 'mic',
};

const mapIcons = (
  names: Record<BuiltinIconName, string>,
  make: (name: string) => PlatformIcon,
): Record<BuiltinIconName, PlatformIcon> =>
  Object.fromEntries(
    BUILTIN_ICON_NAMES.map(name => [name, make(names[name])]),
  ) as Record<BuiltinIconName, PlatformIcon>;

/**
 * Default icons per native platform. Windows has no map yet, so it is not a
 * supported platform for icons (FR17).
 */
export const NATIVE_ICON_DEFAULTS = {
  ios: mapIcons(SF_SYMBOLS, systemName => ({systemName})),
  macos: mapIcons(SF_SYMBOLS, systemName => ({systemName})),
  android: mapIcons(MATERIAL_SYMBOLS, materialSymbol => ({materialSymbol})),
} as const;

export const SF_SYMBOL_NAMES: Readonly<Record<BuiltinIconName, string>> =
  SF_SYMBOLS;
