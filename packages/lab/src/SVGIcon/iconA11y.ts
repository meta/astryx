// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file iconA11y.ts
 * @input An icon's caller props
 * @output iconA11yProps: `role="img"` for a named icon, otherwise
 *   `aria-hidden`
 * @position Shared by SVGIcon and WeightedSVGIcon, so both expose a name the
 *   same way
 */

/**
 * Decorative by default, meaningful when named, as core Icon does with its
 * `label`. A named icon is `role="img"`: an `aria-hidden` element leaves the
 * accessibility tree, and its name with it. Spread the result before the
 * caller's props, so a caller `aria-hidden` or `role` wins.
 */
export function iconA11yProps(props: {
  'aria-label'?: string;
  'aria-labelledby'?: string;
}): {role: 'img'} | {'aria-hidden': true} {
  const hasAccessibleName =
    props['aria-label'] != null || props['aria-labelledby'] != null;
  return hasAccessibleName ? {role: 'img'} : {'aria-hidden': true};
}
