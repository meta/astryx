// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file checklist.ts
 * @input None (pure declarations)
 * @output CHECKLIST_DIMENSIONS — the completeness review every pattern answers
 *   in full — and the disposition shape a pattern answers it with.
 * @position Consumed by ./contract.ts, which refuses a pattern that leaves a
 *   dimension unanswered.
 *
 * The rows are the source map in `docs/specs/AST-020/spec.md` FR10, plus the
 * component-owned outcomes that record tells an author to add on top of it:
 * forced colors, reduced motion, the adopted APG interaction set, and the
 * assistive-technology-facing strings the public Accessibility Checklist asks
 * for.
 *
 * A dimension is answered in exactly one of two ways (FR5):
 *
 * - encoded — one or more expectations name it in their `covers` list; or
 * - exempt  — this pattern does not own it, and the answer names who does and
 *             how it is actually verified.
 *
 * "Not applicable" on its own is not an answer, and neither is leaving a row
 * out. That is the failure mode the record is written against: a dimension that
 * disappears silently reads, later, exactly like one that was considered.
 *
 * SYNC: When a dimension is added here, every pattern contract must answer it —
 *   `definePattern` will fail until it does.
 */

/**
 * A dimension this pattern does not own. An exemption is an answer, so it has
 * to say who does own the outcome and how that owner actually verifies it.
 */
export interface ChecklistExemption {
  /** Who owns the outcome instead — a record id, a component, or a role. */
  readonly owner: string;
  /** How it is actually verified. A method, not a promise. */
  readonly verifiedBy: string;
  /** Why this pattern is not the owner. */
  readonly reason: string;
  /**
   * Set when an expectation encodes PART of this dimension and the owner named
   * here holds the rest. Without it a dimension has exactly one answer; with
   * it, the encoded part and the unowned part are both visible instead of the
   * encoding quietly implying the whole criterion is covered.
   */
  readonly coversRemainderOnly?: boolean;
}

export interface ChecklistDimension {
  readonly id: string;
  /** The normative source the row comes from. */
  readonly source: string;
  /** The outcome to consider. */
  readonly outcome: string;
  /** Where ownership usually sits. */
  readonly usualOwnership: string;
}

export const CHECKLIST_DIMENSIONS = [
  {
    id: '1.1.1-non-text-content',
    source: 'WCAG 2.2 1.1.1 Non-text Content (A)',
    outcome:
      'Informative non-text content has an equivalent alternative; decorative content is ignored.',
    usualOwnership: 'Component or content',
  },
  {
    id: '1.3.1-info-and-relationships',
    source: 'WCAG 2.2 1.3.1 Info and Relationships (A)',
    outcome:
      'Visual structure and relationships are programmatically available.',
    usualOwnership: 'Component or composition',
  },
  {
    id: '1.3.2-meaningful-sequence',
    source: 'WCAG 2.2 1.3.2 Meaningful Sequence (A)',
    outcome: 'Programmatic reading sequence preserves meaning.',
    usualOwnership: 'Component or composition',
  },
  {
    id: '1.3.5-identify-input-purpose',
    source: 'WCAG 2.2 1.3.5 Identify Input Purpose (AA)',
    outcome:
      'Inputs collecting information about the user expose a programmatic purpose when the field purpose is listed by the standard.',
    usualOwnership: 'Component and caller content',
  },
  {
    id: '1.4.1-use-of-color',
    source: 'WCAG 2.2 1.4.1 Use of Color (A)',
    outcome: 'Color is not the only way to convey information or state.',
    usualOwnership: 'Component, theme, and caller content',
  },
  {
    id: '1.4.3-contrast-minimum',
    source: 'WCAG 2.2 1.4.3 Contrast (Minimum) (AA)',
    outcome: 'Text and images of text meet the required contrast.',
    usualOwnership: 'Component and theme',
  },
  {
    id: '1.4.11-non-text-contrast',
    source: 'WCAG 2.2 1.4.11 Non-text Contrast (AA)',
    outcome:
      'Controls, states, and meaningful graphics meet non-text contrast.',
    usualOwnership: 'Component and theme',
  },
  {
    id: '2.1.1-keyboard',
    source: 'WCAG 2.2 2.1.1 Keyboard (A)',
    outcome: 'Every component-owned function is operable by keyboard.',
    usualOwnership: 'Component',
  },
  {
    id: '2.1.2-no-keyboard-trap',
    source: 'WCAG 2.2 2.1.2 No Keyboard Trap (A)',
    outcome:
      'Keyboard focus can leave any component unless the user has a documented exit.',
    usualOwnership: 'Component or composition',
  },
  {
    id: '2.4.2-page-titled',
    source: 'WCAG 2.2 2.4.2 Page Titled (A)',
    outcome: 'A page has a descriptive title.',
    usualOwnership: 'Page only',
  },
  {
    id: '2.4.3-focus-order',
    source: 'WCAG 2.2 2.4.3 Focus Order (A)',
    outcome: 'Sequential focus preserves meaning and operation.',
    usualOwnership: 'Component or composition',
  },
  {
    id: '2.4.4-link-purpose',
    source: 'WCAG 2.2 2.4.4 Link Purpose (In Context) (A)',
    outcome: "A link's purpose is determinable.",
    usualOwnership: 'Component and caller content',
  },
  {
    id: '2.4.6-headings-and-labels',
    source: 'WCAG 2.2 2.4.6 Headings and Labels (AA)',
    outcome: 'Headings and labels describe their topic or purpose.',
    usualOwnership: 'Component and caller content',
  },
  {
    id: '2.4.7-focus-visible',
    source: 'WCAG 2.2 2.4.7 Focus Visible (AA)',
    outcome: 'Keyboard focus has a visible indicator.',
    usualOwnership: 'Component and theme',
  },
  {
    id: '2.4.11-focus-not-obscured',
    source: 'WCAG 2.2 2.4.11 Focus Not Obscured (Minimum) (AA)',
    outcome:
      'Focused content is not entirely hidden by author-created content.',
    usualOwnership: 'Component or composition',
  },
  {
    id: '2.5.2-pointer-cancellation',
    source: 'WCAG 2.2 2.5.2 Pointer Cancellation (A)',
    outcome:
      'A single-pointer function does not complete on the down-event, or the press can be aborted or undone.',
    usualOwnership: 'Component',
  },
  {
    id: '2.5.3-label-in-name',
    source: 'WCAG 2.2 2.5.3 Label in Name (A)',
    outcome:
      'The accessible name contains the text of the visible label, so speech input and speech output agree.',
    usualOwnership: 'Component and caller content',
  },
  {
    id: '2.5.8-target-size',
    source: 'WCAG 2.2 2.5.8 Target Size (Minimum) (AA)',
    outcome: 'Pointer targets meet the minimum size or an allowed exception.',
    usualOwnership: 'Component or composition',
  },
  {
    id: '3.1.1-language-of-page',
    source: 'WCAG 2.2 3.1.1 Language of Page (A)',
    outcome: 'The page language is programmatically available.',
    usualOwnership: 'Page only',
  },
  {
    id: '3.2.2-on-input',
    source: 'WCAG 2.2 3.2.2 On Input (A)',
    outcome:
      'Changing a control’s setting does not automatically change the context unless the user was told it would.',
    usualOwnership: 'Component and caller content',
  },
  {
    id: '3.2.4-consistent-identification',
    source: 'WCAG 2.2 3.2.4 Consistent Identification (AA)',
    outcome: 'Repeated functions are identified consistently.',
    usualOwnership: 'System, component, and caller content',
  },
  {
    id: '3.3.1-error-identification',
    source: 'WCAG 2.2 3.3.1 Error Identification (A)',
    outcome:
      'An automatically detected input error is identified, and the error is described to the user in text.',
    usualOwnership: 'Component and composition',
  },
  {
    id: '3.3.2-labels-or-instructions',
    source: 'WCAG 2.2 3.3.2 Labels or Instructions (A)',
    outcome: 'Inputs have persistent labels or needed instructions.',
    usualOwnership: 'Component and caller content',
  },
  {
    id: '4.1.2-name-role-value',
    source: 'WCAG 2.2 4.1.2 Name, Role, Value (A)',
    outcome:
      'Name, role, state, value, and changes are programmatically available.',
    usualOwnership: 'Component',
  },
  {
    id: '4.1.3-status-messages',
    source: 'WCAG 2.2 4.1.3 Status Messages (AA)',
    outcome: 'Status changes are exposed without moving focus.',
    usualOwnership: 'Component or composition',
  },
  {
    id: 'apg-interaction',
    source: 'The adopted WAI-ARIA APG pattern',
    outcome:
      "The pattern's roles, states, properties, and keyboard interaction are implemented as adopted.",
    usualOwnership: 'Component',
  },
  {
    id: 'forced-colors',
    source: 'Astryx Accessibility Checklist — Forced colors',
    outcome:
      'Painted state survives `forced-colors: active` through system-colour fallbacks.',
    usualOwnership: 'Component and theme',
  },
  {
    id: 'reduced-motion',
    source: 'Astryx Accessibility Checklist — Reduced motion',
    outcome: 'Entry/exit motion is guarded by `prefers-reduced-motion`.',
    usualOwnership: 'Component and theme',
  },
  {
    id: 'at-facing-strings',
    source: 'Astryx Accessibility Checklist — i18n',
    outcome:
      'Every assistive-technology-facing string is translated like visible text.',
    usualOwnership: 'Component',
  },
] as const satisfies readonly ChecklistDimension[];

export type ChecklistDimensionId = (typeof CHECKLIST_DIMENSIONS)[number]['id'];
