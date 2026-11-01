// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file combobox.ts
 * @input Uses the shared accessibility-contract vocabulary
 * @output COMBOBOX_PATTERN and ComboboxStateFacts
 * @position Reusable semantic contract for the combobox control and its active popup relation.
 *   Popup contents and binding-specific selection policy retain their own owners.
 *
 * Required outcomes come from WCAG 2.2 A/AA, WAI-ARIA 1.2, and the current
 * Astryx read-only selection-input contract. `spec:AST-020/FR15` adopts the
 * APG Combobox required parts, including Tab plus Enter or Space activation,
 * wherever a part plays the combobox role; each adopter's record names them and
 * its own interaction suites verify the keyboard parts. This contract encodes
 * the semantic parts only.
 */

import {
  definePattern,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
  type WebStandardRequirement,
} from '../contract';

const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

function wcag(
  id: string,
  name: string,
  level: 'A' | 'AA',
  slug: string,
): WcagCriterion {
  return {
    standard: 'wcag',
    id,
    name,
    level,
    url: `${UNDERSTANDING}/${slug}.html`,
  };
}

const WCAG_1_3_1 = wcag(
  '1.3.1',
  'Info and Relationships',
  'A',
  'info-and-relationships',
);
const WCAG_4_1_2 = wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value');

const ARIA_CONTROLS: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2',
  requirement:
    "When a combobox's popup is displayed, authors MUST ensure the aria-controls attribute on the combobox element is set to a value that refers to the popup element.",
  url: 'https://www.w3.org/TR/wai-aria-1.2/#combobox',
};

const ARIA_ACTIVE_DESCENDANT: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2',
  requirement:
    'The value of aria-activedescendant is an ID reference to an owned element.',
  url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-activedescendant',
};

const AST_011_READ_ONLY: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-011',
  clause: 'FR4',
  requirement:
    'The focusable read-only value MUST retain `combobox` semantics, expose `aria-readonly="true"` and `aria-expanded="false"`, and preserve its accessible name and rendered value. It MUST NOT expose `aria-controls` or `aria-activedescendant` when no selection surface exists.',
  url: 'https://github.com/meta/astryx/blob/f0355e3a4c9ddacb71e4cc9ca045619b76ae3c35/docs/specs/AST-011/spec.md#L47-L51',
};

export type ComboboxPopupRole = 'listbox' | 'tree' | 'grid' | 'dialog';

export interface ComboboxStateFacts {
  /** Exact accessible name the binding supplies. */
  readonly name: string;
  /** Whether the binding's selection surface is currently open. */
  readonly expanded: boolean;
  /** Semantic role of the popup the binding owns. */
  readonly popupRole: ComboboxPopupRole;
  /** Whether that popup is currently rendered and available. */
  readonly popupVisible: boolean;
  /** Whether the binding declares one active descendant in the popup. */
  readonly activeDescendant: boolean;
  /** Whether the current value is intentionally non-editable. */
  readonly readOnly: boolean;
  /** Whether the component's option source or value transition is pending. */
  readonly busy: boolean;
  /**
   * Whether the binding's own open modal dialog popup makes the combobox inert,
   * so the browser correctly leaves it out of the accessibility tree until the
   * popup closes.
   */
  readonly inertUnderOwnModal: boolean;
}

const ALWAYS = {
  condition: 'the binding renders a combobox control',
  test: () => true,
};

export const COMBOBOX_PATTERN: PatternContract<ComboboxStateFacts> =
  definePattern<ComboboxStateFacts>({
    pattern: 'combobox',
    url: 'https://www.w3.org/TR/wai-aria-1.2/#combobox',
    scope:
      'The named combobox control, its expanded/busy/read-only state, and its relationship to a currently rendered popup and active descendant. Popup contents and interaction policy remain separate owners.',
    expectations: [
      {
        id: 'combobox.identity.named',
        outcome:
          'The browser exposes one named combobox so a person can find and distinguish the selection control.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the combobox is in the accessibility tree: no open modal dialog popup of its own makes it inert',
          test: facts =>
            !(
              facts.inertUnderOwnModal &&
              facts.popupVisible &&
              facts.popupRole === 'dialog'
            ),
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role, name} = await subject.computed();
          if (role !== 'combobox') {
            throw new Error(
              `the browser exposes ${role == null ? 'no role' : `"${role}"`} instead of combobox`,
            );
          }
          if (name !== facts.name) {
            throw new Error(
              `the combobox should be named "${facts.name}", but the browser computes ${name === '' ? 'no name' : `"${name}"`}`,
            );
          }
        },
      },
      {
        id: 'combobox.state.expanded',
        outcome:
          'The combobox exposes whether its current selection surface is open.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expanded = await subject.attribute('aria-expanded');
          if (expanded !== String(facts.expanded)) {
            throw new Error(
              `the combobox is ${facts.expanded ? 'open' : 'closed'} but aria-expanded is ${expanded ?? 'absent'}`,
            );
          }
        },
      },
      {
        id: 'combobox.popup.relationship',
        outcome:
          'An open combobox identifies the popup it controls and its popup kind.',
        sources: [WCAG_1_3_1, ARIA_CONTROLS],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the selection surface is rendered',
          test: facts => facts.popupVisible,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const popup = await harness.related('popup');
          if (!(await harness.references(subject, 'aria-controls', popup))) {
            throw new Error(
              'aria-controls does not reference the rendered combobox popup',
            );
          }
          const hasPopup = await subject.attribute('aria-haspopup');
          if (
            facts.popupRole === 'listbox'
              ? hasPopup !== null && hasPopup !== 'listbox'
              : hasPopup !== facts.popupRole
          ) {
            throw new Error(
              `the combobox popup is ${facts.popupRole} but aria-haspopup is ${hasPopup ?? 'absent'}`,
            );
          }
        },
      },
      {
        id: 'combobox.active-descendant.owned',
        outcome:
          'When DOM focus stays on the combobox, its active descendant resolves inside the current popup.',
        sources: [WCAG_1_3_1, ARIA_ACTIVE_DESCENDANT],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding declares an active descendant',
          test: facts => facts.activeDescendant,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const popup = await harness.related('popup');
          const active = await harness.related('active-descendant');
          if (
            !(await harness.references(
              subject,
              'aria-activedescendant',
              active,
            ))
          ) {
            throw new Error(
              'aria-activedescendant does not reference the declared active option',
            );
          }
          if (!(await harness.contains(popup, active))) {
            throw new Error(
              'the declared active descendant is not contained by the combobox popup',
            );
          }
        },
      },
      {
        id: 'combobox.state.readonly-closed',
        outcome:
          'A read-only value keeps its combobox identity while exposing no active selection surface.',
        sources: [AST_011_READ_ONLY, WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding is read-only',
          test: facts => facts.readOnly,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.attribute('aria-readonly')) !== 'true') {
            throw new Error(
              'the read-only combobox does not expose aria-readonly="true"',
            );
          }
          if ((await subject.attribute('aria-expanded')) !== 'false') {
            throw new Error(
              'the read-only combobox is not exposed as collapsed',
            );
          }
          if ((await subject.attribute('aria-controls')) != null) {
            throw new Error(
              'the read-only combobox still exposes aria-controls',
            );
          }
          if ((await subject.attribute('aria-activedescendant')) != null) {
            throw new Error(
              'the read-only combobox still exposes aria-activedescendant',
            );
          }
        },
      },
      {
        id: 'combobox.state.busy',
        outcome:
          'The combobox exposes whether its option source or value transition is pending.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const busy = await subject.attribute('aria-busy');
          if (
            facts.busy ? busy !== 'true' : busy !== null && busy !== 'false'
          ) {
            throw new Error(
              `the combobox is ${facts.busy ? 'busy' : 'idle'} but aria-busy is ${busy ?? 'absent'}`,
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'Binding option content and composed Icon/Indicator owners',
        verifiedBy:
          'Component icon tests, content review, and repository axe checks',
        reason:
          'The combobox control relationship does not determine the alternative text or decorative treatment of caller-rendered content.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'Popup pattern and binding-specific field composition',
        verifiedBy:
          'Popup/listbox contracts, component tests, and axe content-model checks',
        reason:
          'This contract checks the combobox-to-popup and active-descendant relationships; labels, descriptions, groups, and popup contents keep their own owners.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'Binding component and composing page',
        verifiedBy:
          'Component DOM-order tests and page-level reading-order review',
        reason:
          'The semantic relationship does not choose visual or reading order for the field, popup, or surrounding content.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'Form callsite and binding input props',
        verifiedBy: 'Form-purpose and autocomplete review',
        reason:
          'Only a caller knows whether a combobox collects a standardized personal-information purpose.',
      },
      '1.4.1-use-of-color': {
        owner: 'Binding component, option-state owner, and active theme',
        verifiedBy: 'Rendered state review and visual regression checks',
        reason: 'Programmatic state does not prove a non-color visual cue.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'Binding component and active theme',
        verifiedBy: 'Rendered contrast audit',
        reason: 'Text contrast requires resolved pixels and backdrop.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'Binding component, popup owner, and active theme',
        verifiedBy:
          'Rendered control, state, and focus-indicator contrast review',
        reason:
          'Semantic state does not measure painted boundaries or indicators.',
      },
      '2.1.1-keyboard': {
        owner: 'Current binding component authority',
        verifiedBy:
          'Binding-specific keyboard suites and real-browser interaction tests',
        reason:
          'spec:AST-020/FR15 adopts Tab plus Enter or Space activation wherever a part plays the combobox role; button triggers, editable inputs, anchored popups, and modal sheets reach it differently, so each adopter record names its keyboard parts and its interaction suites verify them.',
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'Binding popup, Layer, and dismissal owners',
        verifiedBy: 'Real-browser Tab, Escape, close, and focus-return tests',
        reason:
          'Entry and exit depend on the active presentation and popup lifecycle.',
      },
      '2.4.2-page-titled': {
        owner: 'Page shell',
        verifiedBy: 'Page-level title review',
        reason: 'A combobox does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'Binding component and composing page',
        verifiedBy: 'Real-browser sequential-focus review',
        reason:
          'Focus order depends on field composition and popup presentation.',
      },
      '2.4.4-link-purpose': {
        owner: 'Link and caller content',
        verifiedBy: 'Navigation-owner tests and content review',
        reason:
          'A combobox selects or filters values rather than defining link purpose.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'Caller label content and field owner',
        verifiedBy: 'Content review of visible labels and instructions',
        reason:
          'This contract proves the exact declared accessible name, not whether its wording describes the intended purpose.',
      },
      '2.4.7-focus-visible': {
        owner:
          'Binding component, interaction-modality architecture, and active theme',
        verifiedBy: 'Rendered keyboard-focus review',
        reason: 'Focus-indicator paint requires visual evidence.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'Popup host and application layout',
        verifiedBy: 'Constrained-viewport real-browser focus review',
        reason:
          'Occlusion depends on presentation geometry and surrounding layout.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'Binding interaction owner',
        verifiedBy: 'Real-browser press, abort, and release tests',
        reason:
          'This semantic contract does not activate the control or its options.',
      },
      '2.5.3-label-in-name': {
        owner: 'Binding rendering and caller-provided visible label',
        verifiedBy: 'Visible-label versus computed-name browser review',
        reason:
          'An exact computed name does not prove that it contains independently rendered visible text.',
      },
      '2.5.8-target-size': {
        owner: 'Binding component and composition',
        verifiedBy: 'Rendered target geometry and WCAG exception review',
        reason: 'Target size and spacing cannot be proved from semantic state.',
      },
      '3.1.1-language-of-page': {
        owner: 'Page shell and localization provider',
        verifiedBy: 'Document-language checks',
        reason: 'A combobox does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'Binding selection owner and application response',
        verifiedBy: 'Component callback tests and end-to-end task review',
        reason:
          'This contract exposes state without deciding what selection changes do in the application.',
      },
      '3.2.4-consistent-identification': {
        owner: 'Design system and caller content',
        verifiedBy: 'Cross-control design and content review',
        reason:
          'Consistency is a property of repeated controls, not one binding.',
      },
      '3.3.1-error-identification': {
        owner: 'Field-status and binding validation owners',
        verifiedBy: 'Component error-state tests and rendered content review',
        reason:
          'The generic combobox relationship does not define validation errors.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'Field and caller content',
        verifiedBy: 'Component label/instruction tests and form review',
        reason:
          'A computed accessible name does not prove persistent visible instructions.',
      },
      '4.1.2-name-role-value': {
        owner:
          'Popup contents, option pattern, and binding-specific value/validation owners',
        verifiedBy: 'Their reusable contracts and focused component tests',
        reason:
          'This contract encodes combobox identity, open/busy/read-only state, and active relationships; popup item state, rendered value, and validation retain their owners.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'Binding result-feedback and status-message owners',
        verifiedBy:
          'Live-region/status tests and AST-009 for spoken timing claims',
        reason:
          'Busy exposure is state on the control; result counts, empty messages, and announcement timing are separate outcomes.',
      },
      'apg-interaction': {
        owner: 'Current authority for each Astryx combobox adopter',
        verifiedBy:
          'Binding-specific interaction suites and exact current component records',
        reason:
          'spec:AST-020/FR15 decides which APG Combobox parts an adopter takes from the role its part plays; the adopter record names them and its interaction suites verify the interaction parts.',
      },
      'forced-colors': {
        owner: 'Binding component, popup contents, and active theme',
        verifiedBy: 'Rendered forced-colors review',
        reason: 'Semantic exposure does not prove forced-colors paint.',
      },
      'reduced-motion': {
        owner: 'Binding popup and layer owners',
        verifiedBy: 'Component motion tests and rendered reduced-motion review',
        reason:
          'The semantic contract adds no motion and cannot measure transitions.',
      },
      'at-facing-strings': {
        owner: 'Binding localization and caller-provided labels',
        verifiedBy:
          'Catalog checks and localized component tests; AST-009 for speech claims',
        reason:
          'The contract verifies declared text without claiming spoken wording, order, or timing.',
      },
    },
  });
