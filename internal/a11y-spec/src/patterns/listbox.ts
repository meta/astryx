// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listbox.ts
 * @input Uses the shared accessibility contract vocabulary
 * @output LISTBOX_PATTERN and ListboxStateFacts
 * @position Standards-derived semantics for listbox, group, and option parts.
 */

import {definePattern, type WcagCriterion} from '../contract';
import {MissingBindingCapability} from '../check';
import type {Subject} from '../harness';

const NAME_ROLE_VALUE: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
};

export interface ListboxStateFacts {
  readonly part: 'listbox' | 'group' | 'option';
  readonly multiple: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly selectionAttribute?: 'aria-selected' | 'aria-checked';
  readonly ownerGroup?: string;
  readonly optionRelations?: readonly string[];
}

export const LISTBOX_PATTERN = definePattern<ListboxStateFacts>({
  pattern: 'listbox',
  url: 'https://www.w3.org/TR/wai-aria-1.2/#listbox',
  scope:
    'ARIA-authored listbox, group, and option semantics; native select/option mapping and interaction policy are separate owners.',
  expectations: [
    {
      id: 'listbox.state.multiselectable',
      outcome:
        'The listbox exposes whether more than one option may be selected.',
      sources: [NAME_ROLE_VALUE],
      covers: ['4.1.2-name-role-value'],
      appliesWhen: {
        condition: 'the subject is a listbox',
        test: facts => facts.part === 'listbox',
      },
      evidenceLayer: 'dom',
      enforcement: 'required',
      run: async ({subject, facts}) => {
        const multiple = await subject.attribute('aria-multiselectable');
        if (facts.multiple && multiple !== 'true') {
          throw new Error(
            'the listbox permits multiple selection but aria-multiselectable is not true',
          );
        }
        if (!facts.multiple && multiple !== null && multiple !== 'false') {
          throw new Error(
            'the listbox permits only one selection but aria-multiselectable is not false or absent',
          );
        }
      },
    },
    {
      id: 'listbox.option.selection-state',
      outcome: 'An option exposes the selection state its owner supplies.',
      sources: [NAME_ROLE_VALUE],
      covers: ['4.1.2-name-role-value'],
      appliesWhen: {
        condition: 'the subject is an option',
        test: facts => facts.part === 'option',
      },
      evidenceLayer: 'dom',
      enforcement: 'required',
      run: async ({subject, facts}) => {
        if (facts.selected == null) {
          throw new MissingBindingCapability(
            'an option binding must declare selected state',
          );
        }
        const attribute = facts.selectionAttribute ?? 'aria-selected';
        const selected = await subject.attribute(attribute);
        if (selected !== String(facts.selected)) {
          throw new Error(
            `the option is ${facts.selected ? 'selected' : 'unselected'} but ${attribute} is ${selected ?? 'absent'}`,
          );
        }
      },
    },
    {
      id: 'listbox.option.disabled-state',
      outcome:
        'An option exposes its availability without choosing a focus policy.',
      sources: [NAME_ROLE_VALUE],
      covers: ['4.1.2-name-role-value'],
      appliesWhen: {
        condition: 'the subject is an option',
        test: facts => facts.part === 'option',
      },
      evidenceLayer: 'dom',
      enforcement: 'required',
      run: async ({subject, facts}) => {
        if (facts.disabled == null) {
          throw new MissingBindingCapability(
            'an option binding must declare disabled state',
          );
        }
        const disabled = await subject.attribute('aria-disabled');
        if (
          facts.disabled
            ? disabled !== 'true'
            : disabled !== null && disabled !== 'false'
        ) {
          throw new Error(
            `the option is ${facts.disabled ? 'disabled' : 'available'} but aria-disabled is ${disabled ?? 'absent'}`,
          );
        }
      },
    },
    {
      id: 'listbox.relationship.owned',
      outcome: 'Options and groups keep their declared listbox relationship.',
      sources: [
        {
          standard: 'wcag',
          id: '1.3.1',
          name: 'Info and Relationships',
          level: 'A',
          url: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html',
        },
        {
          standard: 'web-standard',
          specification: 'WAI-ARIA 1.2',
          requirement:
            'Authors MUST ensure elements with role option are contained in, or owned by, an element with the role listbox or group within a listbox.',
          url: 'https://www.w3.org/TR/wai-aria-1.2/#option',
        },
      ],
      covers: ['1.3.1-info-and-relationships'],
      appliesWhen: {
        condition: 'the subject is an option or option group',
        test: facts => facts.part !== 'listbox',
      },
      evidenceLayer: 'dom',
      enforcement: 'required',
      run: async ({harness, subject, facts}) => {
        const listbox = await harness.related('listbox');
        const owner =
          facts.part === 'option' && facts.ownerGroup != null
            ? await harness.related(facts.ownerGroup)
            : listbox;
        const owns = async (parent: Subject, child: Subject) =>
          (await harness.contains(parent, child)) ||
          (await harness.references(parent, 'aria-owns', child));
        if (
          !(await owns(owner, subject)) ||
          (owner !== listbox && !(await owns(listbox, owner)))
        ) {
          throw new Error(
            `the ${facts.part} is neither contained nor owned by its listbox`,
          );
        }
      },
    },
    {
      id: 'listbox.exposure.identity',
      outcome:
        'The browser exposes each part with its role and any required identifying name.',
      sources: [NAME_ROLE_VALUE],
      covers: ['4.1.2-name-role-value'],
      appliesWhen: {
        condition: 'the declared semantic part is rendered',
        test: () => true,
      },
      evidenceLayer: 'accessibility-tree',
      enforcement: 'required',
      run: async ({subject, facts}) => {
        const {role, name} = await subject.computed();
        if (role !== facts.part) {
          throw new Error(
            `the browser exposes ${role ?? 'no role'} instead of ${facts.part}`,
          );
        }
        if (facts.part !== 'group' && name.trim() === '') {
          throw new Error(
            `the browser exposes the ${facts.part} without an accessible name`,
          );
        }
      },
    },
    {
      id: 'listbox.selection.single',
      outcome:
        'A single-selection listbox does not expose multiple selected options.',
      sources: [
        NAME_ROLE_VALUE,
        {
          standard: 'web-standard',
          specification: 'WAI-ARIA 1.2',
          requirement: 'Only one item can be selected.',
          url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-multiselectable',
        },
      ],
      covers: ['4.1.2-name-role-value'],
      appliesWhen: {
        condition: 'the listbox permits only one selected option',
        test: facts => facts.part === 'listbox' && !facts.multiple,
      },
      evidenceLayer: 'dom',
      enforcement: 'required',
      run: async ({harness, facts}) => {
        if (facts.optionRelations == null) {
          throw new MissingBindingCapability(
            'a single-selection listbox must declare its option relations',
          );
        }
        const attribute = facts.selectionAttribute ?? 'aria-selected';
        let selected = 0;
        for (const relation of facts.optionRelations) {
          if (
            (await (await harness.related(relation)).attribute(attribute)) ===
            'true'
          ) {
            selected += 1;
          }
        }
        if (selected > 1) {
          throw new Error(
            `the single-selection listbox exposes ${selected} selected options`,
          );
        }
      },
    },
  ],
  exemptions: {
    '1.1.1-non-text-content': {
      owner: 'Caller content and Icon/Indicator components',
      verifiedBy: 'Content review and the existing component-scoped axe audit',
      reason:
        'A semantic part name does not establish the meaning of every image or decorative asset in caller-rendered content.',
    },
    '1.3.1-info-and-relationships': {
      owner: 'Component markup and axe ARIA content-model checks',
      verifiedBy: 'Existing pr-a11y checks and component composition tests',
      reason:
        'This contract checks the declared listbox ownership; allowed child-role structure and other composed relationships retain their existing checks.',
      coversRemainderOnly: true,
    },
    '1.3.2-meaningful-sequence': {
      owner: 'Selector/MultiSelector ordering and caller content',
      verifiedBy:
        'Component sorting/filtering suites and browser reading-order review',
      reason:
        'This semantic slice does not choose a sorting or visual-order policy.',
    },
    '1.3.5-identify-input-purpose': {
      owner: 'Form callsite and combobox input',
      verifiedBy: 'Form-purpose and autocomplete review',
      reason:
        'A popup option container does not determine which personal-information purpose the surrounding field collects.',
    },
    '1.4.1-use-of-color': {
      owner: 'Component and theme selection indicators',
      verifiedBy:
        'Indicator tests and visual review of selected/unselected states',
      reason:
        'Programmatic selection exposure does not prove a non-color visual cue.',
    },
    '1.4.3-contrast-minimum': {
      owner: 'Component themes and caller content',
      verifiedBy: 'Existing contrast audit and rendered theme review',
      reason:
        'Contrast needs rendered pixels and is not established by DOM or accessibility-tree semantics.',
    },
    '1.4.11-non-text-contrast': {
      owner: 'Component themes and indicator/focus styling',
      verifiedBy: 'Existing contrast audit and rendered selected/focus states',
      reason:
        'The semantic contract does not measure painted controls or graphics.',
    },
    '2.1.1-keyboard': {
      owner: 'Selector/MultiSelector interaction and combobox contracts',
      verifiedBy:
        'Existing component keyboard suites; separate real-browser interaction review',
      reason:
        'This first slice does not adopt a shared focus/selection model. Its results are not keyboard-conformance evidence.',
    },
    '2.1.2-no-keyboard-trap': {
      owner: 'Combobox, Popover, and BottomSheet lifecycle',
      verifiedBy:
        'Popup keyboard/dismissal suites and native-browser Tab checks',
      reason:
        'Entry and exit belong to the active host presentation rather than the static option semantics bound here.',
    },
    '2.4.2-page-titled': {
      owner: 'Page shell',
      verifiedBy: 'Page-level accessibility review',
      reason: 'Neither a listbox nor an option owns the document title.',
    },
    '2.4.3-focus-order': {
      owner: 'Combobox and popup focus owners',
      verifiedBy: 'Existing focus suites and real-browser presentation review',
      reason:
        'Selection state and focus are distinct; this contract does not choose or attest a focus movement model.',
    },
    '2.4.4-link-purpose': {
      owner: 'Link and caller content',
      verifiedBy: 'Navigation-destination contract and content review',
      reason: 'An option selects a value; it is not a navigation link.',
    },
    '2.4.6-headings-and-labels': {
      owner: 'Caller labels and component content review',
      verifiedBy: 'Review of field, group, and option wording',
      reason:
        'A nonempty computed name does not prove that its wording describes the intended topic.',
    },
    '2.4.7-focus-visible': {
      owner: 'Component themes and interaction-modality system',
      verifiedBy: 'Rendered keyboard-focus review and the existing visual lane',
      reason: 'No pixel or focus-ring claim is made by these semantic checks.',
    },
    '2.4.11-focus-not-obscured': {
      owner: 'Popup host and application layout',
      verifiedBy: 'Constrained-viewport real-browser focus review',
      reason:
        'Geometry and occlusion depend on the presentation and surrounding layout.',
    },
    '2.5.2-pointer-cancellation': {
      owner: 'Selector/MultiSelector option interaction',
      verifiedBy: 'Separate real-browser press/abort/release regression checks',
      reason:
        'The binding observes state without adopting or claiming a pointer-selection transition contract.',
    },
    '2.5.3-label-in-name': {
      owner: 'Component rendering and caller option content',
      verifiedBy: 'Rendered-label versus computed-name review',
      reason:
        'Identity presence is narrower than matching painted label text; custom option content remains separately reviewed.',
    },
    '2.5.8-target-size': {
      owner: 'Component themes and composition',
      verifiedBy: 'Browser target geometry and WCAG exception review',
      reason:
        'Target dimensions and spacing cannot be proved from semantic state.',
    },
    '3.1.1-language-of-page': {
      owner: 'Page shell and localization provider',
      verifiedBy: 'Document-language and locale integration checks',
      reason: 'The popup does not own the document language.',
    },
    '3.2.2-on-input': {
      owner: 'Component interaction and application response to selection',
      verifiedBy: 'Component interaction suites and end-to-end task review',
      reason:
        'This contract does not activate options or decide what the application does with a selected value.',
    },
    '3.2.4-consistent-identification': {
      owner: 'Design system and application content',
      verifiedBy: 'Cross-control content/design review',
      reason:
        'One popup fixture cannot establish consistent identification across an application.',
    },
    '3.3.1-error-identification': {
      owner: 'Field validation and status-message owners',
      verifiedBy: 'Existing input/status suites and textual-error review',
      reason:
        'Validation feedback belongs to the surrounding field, not each option.',
    },
    '3.3.2-labels-or-instructions': {
      owner: 'Field and caller instructions',
      verifiedBy: 'Field-label and form-content review',
      reason:
        'A named popup does not establish every instruction needed by its enclosing task.',
    },
    '4.1.3-status-messages': {
      owner: 'Status-message contract and component live-region owners',
      verifiedBy: 'Status-message bindings; AST-009 for speech/timing claims',
      reason:
        'Loading, result-count, empty, and selection announcements are not static listbox identity.',
    },
    'apg-interaction': {
      owner:
        'Current component interaction authority and future bounded migration',
      verifiedBy: 'Current-record review plus component keyboard suites',
      reason:
        'WAI-ARIA semantics apply here, but this slice does not adopt APG selection-follows-focus, unavailable-option navigation, Home/End, or typeahead policy.',
    },
    'forced-colors': {
      owner: 'Component themes and indicators',
      verifiedBy: 'Real-browser forced-color paint review',
      reason:
        'State exposure does not prove that a selection mark or focus indicator remains visible.',
    },
    'reduced-motion': {
      owner: 'Popover/BottomSheet and component themes',
      verifiedBy: 'Existing reduced-motion tests and browser review',
      reason:
        'The semantic part contract owns no opening or closing animation.',
    },
    'at-facing-strings': {
      owner: 'Component localization and caller labels',
      verifiedBy:
        'Catalog checks and localized component tests; AST-009 for speech claims',
      reason:
        'The binding uses deterministic labels without claiming translation completeness or spoken output.',
    },
  },
});
