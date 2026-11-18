// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file anatomyHelpers.ts
 * @input A component's `usage.anatomy` elements (name, required, description).
 * @output Pure helpers that shape anatomy data for the component-detail Anatomy
 *   section — currently folding the `required` flag into the description as a
 *   bold lead-in.
 * @position Consumed by Anatomy.tsx; kept separate so the logic is unit-testable
 *   without rendering React.
 *
 * The lead-in is a bold label at the start of the description, so a required
 * part reads as marked without a separate column.
 */

import type {AnatomyElement} from '../../generated/componentRegistry';

const REQUIRED_LEAD_IN = '**Required:**';

/**
 * Split a part name where the browser is allowed to wrap it but will not on
 * its own.
 *
 * The Anatomy table lays out `fixed`, so its Element column never grows to fit
 * its content: a name with no break opportunity inside the column's ~108px of
 * content box is broken inside a word instead — `Optional/Requ` / `ired
 * indicator` on Field, `Collapse/expa` / `nd toggle` on SideNav. A solidus is
 * not a break opportunity in CSS the way a hyphen is, so the renderer has to
 * offer one.
 *
 * Returns the pieces to join with `<wbr />`; a name with no solidus comes back
 * as a single piece and renders exactly as before.
 */
export function anatomyNameSegments(name: string): string[] {
  return name.split(/(?<=\/)/);
}

/**
 * The description to render for one anatomy element. Required elements get a
 * bold `Required:` lead-in rather than a separate badge column, keeping the flag
 * inline with the prose it qualifies.
 */
export function anatomyDescription(element: AnatomyElement): string {
  const description = element.description.trim();

  if (!element.required) {
    return description;
  }

  return description ? `${REQUIRED_LEAD_IN} ${description}` : REQUIRED_LEAD_IN;
}
