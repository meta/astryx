// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pickDataAttributes.ts
 * @input A component's remaining props
 * @output Exports pickDataAttributes and the DataAttributes type
 * @position Utility; used by components that pass host `data-*` attributes to
 *   their own element but take no other host attributes
 *
 * Only `data-*` keys pass. Other unknown props stay off the DOM, so a
 * component keeps ownership of its id, role, and ARIA attributes.
 */

/** `data-*` attributes a caller sets on a component. */
export type DataAttributes = Record<
  `data-${string}`,
  string | number | boolean | undefined
>;

/** Returns the `data-*` entries of `props`. */
export function pickDataAttributes(props: object): DataAttributes {
  const attributes: DataAttributes = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-')) {
      attributes[key as `data-${string}`] = value as
        string | number | boolean | undefined;
    }
  }
  return attributes;
}
