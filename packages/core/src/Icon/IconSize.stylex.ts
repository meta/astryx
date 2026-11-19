// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file IconSize.stylex.ts
 * @input Defines the Icon size scale and reads the `icon` target's private
 *   `--_icon-width` / `--_icon-height` vars
 * @output Exports shared Icon size types and StyleX styles
 * @position Internal Icon sizing source; consumed by Icon and icon-slot owners
 *
 * SYNC: When the private vars change, update Icon.tsx (registrySizeStyles),
 * derivedVarRegistry.ts, and the `theming.vars` / `theming.derived` entries in
 * Icon.doc.mjs.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Icon sizes are expressed in `rem` so they scale with the root font-size.
 * Values are the px-equivalents at a 16px root: 12, 16, 20, and 24px.
 */
const iconSizeValues = {
  xsm: '0.75rem',
  sm: '1rem',
  md: '1.25rem',
  lg: '1.5rem',
} as const;

export type IconSize = keyof typeof iconSizeValues;

/*
 * Icon's own glyph dimensions (these and the registry size styles in Icon.tsx)
 * read private vars rather than being plain declarations. A theme writes
 * `width`/`height` on the `icon` target's size selector
 * (`components.icon['size:sm']`), and the derived-var registry emits them as
 * `--_icon-width` / `--_icon-height` instead of as competing properties.
 * Nothing else declares the dimensions, so the theme value lands however the
 * consumer layers StyleX; with no theme value, each size falls back to its own
 * rem value.
 */

/** Size styles for direct SVG icon components. */
export const iconSizeStyles = stylex.create({
  xsm: {
    width: 'var(--_icon-width, 0.75rem)',
    height: 'var(--_icon-height, 0.75rem)',
  },
  sm: {
    width: 'var(--_icon-width, 1rem)',
    height: 'var(--_icon-height, 1rem)',
  },
  md: {
    width: 'var(--_icon-width, 1.25rem)',
    height: 'var(--_icon-height, 1.25rem)',
  },
  lg: {
    width: 'var(--_icon-width, 1.5rem)',
    height: 'var(--_icon-height, 1.5rem)',
  },
});

/**
 * Size styles for component-owned icon boxes. `fontSize` keeps 1em-based icons
 * in step with the box.
 */
export const iconBoxSizeStyles = stylex.create({
  xsm: {
    width: iconSizeValues.xsm,
    height: iconSizeValues.xsm,
    fontSize: iconSizeValues.xsm,
  },
  sm: {
    width: iconSizeValues.sm,
    height: iconSizeValues.sm,
    fontSize: iconSizeValues.sm,
  },
  md: {
    width: iconSizeValues.md,
    height: iconSizeValues.md,
    fontSize: iconSizeValues.md,
  },
  lg: {
    width: iconSizeValues.lg,
    height: iconSizeValues.lg,
    fontSize: iconSizeValues.lg,
  },
});
