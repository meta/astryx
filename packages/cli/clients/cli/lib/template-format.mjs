// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How CLI text prints where templates and blocks go: a page's slots and
 * a block's fits.
 * @input `slots` and `fits` as the JSON carries them
 * @output one line of text
 * @position clients/cli/lib, beside component-format.mjs. The build, search
 *   and template commands print with it.
 */

/**
 * A page's slots on one line: each slot's name and kind, and with `describe`
 * what goes there.
 * @param {unknown} slots
 * @param {{describe?: boolean}} [options]
 * @returns {string}
 */
export function slotsText(slots, {describe = false} = {}) {
  const list = /** @type {{name: string, kind: string, description?: string}[]} */ (
    slots
  );
  return list
    .map(slot =>
      describe && slot.description
        ? `${slot.name} (${slot.kind}): ${slot.description.replace(/\.$/, '')}`
        : `${slot.name} (${slot.kind})`,
    )
    .join(describe ? '; ' : ', ');
}

/**
 * A template's placement in one line: a page's slots (`slots: kpis
 * (metrics), …`) or a block's fit (`fits: toolbar, header`; `fits: none` for a
 * block that goes in no slot). Null when the template declares neither.
 * @param {{name: string, kind: string}[] | undefined} slots
 * @param {string[] | undefined} fits
 * @returns {string | null}
 */
export function placementLine(slots, fits) {
  if (slots?.length) return `slots: ${slotsText(slots)}`;
  if (fits) {
    return fits.length > 0
      ? `fits: ${fits.join(', ')}`
      : "fits: none (it goes in no slot: it lays out a component's options, or frames a whole page)";
  }
  return null;
}
