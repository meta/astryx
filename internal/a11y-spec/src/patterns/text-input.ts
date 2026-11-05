// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file text-input.ts
 * @input Uses ../contract (definePattern and the expectation vocabulary)
 * @output TEXT_INPUT_PATTERN — the native text-input pattern contract — and
 *   TextInputStateFacts, what a binding declares each rendered state should expose
 * @position Shared accessibility contract for native single-line and multi-line
 *   text controls; component-specific callbacks, form behavior, composition,
 *   styling, and announcement behavior stay with each binding component.
 */

import {
  definePattern,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
  type WebStandardRequirement,
} from '../contract';
import type {Harness, Subject} from '../harness';
import {saysInOrder, spokenWords} from '../spoken';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html',
};

const WCAG_2_1_1: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.1',
  name: 'Keyboard',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html',
};

const WCAG_2_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.2',
  name: 'No Keyboard Trap',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html',
};

const WCAG_2_5_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.3',
  name: 'Label in Name',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html',
};

const WCAG_3_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '3.3.1',
  name: 'Error Identification',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html',
};

const WCAG_3_3_2: WcagCriterion = {
  standard: 'wcag',
  id: '3.3.2',
  name: 'Labels or Instructions',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html',
};

const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
};

const AST_021_PRESERVE_BEHAVIOR: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-021',
  clause: 'FR7',
  requirement:
    'Existing behavior is preserved unless a separate change authorizes it.',
  url: 'https://github.com/meta/astryx/blob/029368bde880cb25a7912523510419285d803a90/docs/specs/AST-021/spec.md#L85-L89',
};

const INPUT_FIELDS_FR4: AstryxRecord = {
  standard: 'astryx',
  id: 'family:input-fields',
  clause: 'FR4',
  requirement:
    'When a member exposes `disabledMessage`, the inactive field remains focusable enough to expose the reason while editing, selection, and activation stay blocked.',
  url: 'https://github.com/meta/astryx/blob/029368bde880cb25a7912523510419285d803a90/docs/families/input-fields.md#L151-L154',
};

const WAI_ARIA_ERROR_MESSAGE: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2',
  requirement:
    'When the error message is pertinent, authors MUST ensure the content is not hidden, so users can navigate to and examine the error message.',
  url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-errormessage',
};

const HTML_AAM_INPUT_TEXTBOX: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'HTML Accessibility API Mappings 1.0',
  requirement: 'input type text, email, tel, and url map to the textbox role.',
  url: 'https://www.w3.org/TR/html-aam-1.0/#el-input-text',
};

const HTML_AAM_TEXTAREA: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'HTML Accessibility API Mappings 1.0',
  requirement: 'textarea maps to the textbox role.',
  url: 'https://www.w3.org/TR/html-aam-1.0/#el-textarea',
};

const ALWAYS = {
  condition: 'the binding renders a native text control',
  test: () => true,
};

function sameWords(actual: string, expected: string): boolean {
  const actualWords = spokenWords(actual);
  const expectedWords = spokenWords(expected);
  return (
    actualWords.length === expectedWords.length &&
    actualWords.every((word, index) => word === expectedWords[index])
  );
}

const TAB_BUDGET = 10;

async function assertKeyboardEditsBlocked(
  harness: Harness,
  subject: Subject,
): Promise<void> {
  await subject.focus();
  const initial = await subject.textValue();
  if (initial == null) {
    throw new Error(
      'the role-bearing subject exposes no text value to protect',
    );
  }
  await harness.typeText(subject, 'x');
  if ((await subject.textValue()) !== initial) {
    throw new Error(
      'typing changed a text control the binding declares non-editable',
    );
  }
  await harness.clearText(subject);
  if ((await subject.textValue()) !== initial) {
    throw new Error(
      'keyboard deletion changed a text control the binding declares non-editable',
    );
  }
}

export interface TextInputStateFacts {
  /** Native role expected from this state; null for protected inputs with no cross-platform ARIA role mapping. */
  readonly role: 'textbox' | null;
  readonly multiline: boolean;
  readonly value: string | null;
  readonly editable: boolean;
  readonly focusable: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly description: string | null;
  readonly errorMessage: string | null;
}

export const TEXT_INPUT_PATTERN: PatternContract<TextInputStateFacts> =
  definePattern<TextInputStateFacts>({
    pattern: 'text-input',
    url: 'https://www.w3.org/TR/wai-aria-1.2/#textbox',
    scope:
      'One native single-line or multi-line text control whose role, name, value, state, supporting text, focus, and editing behavior remain available to the user.',
    expectations: [
      {
        id: 'text-input.role.exposed',
        outcome:
          'The browser exposes the control as a textbox, so the user knows it accepts text.',
        sources: [WCAG_4_1_2, HTML_AAM_INPUT_TEXTBOX, HTML_AAM_TEXTAREA],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the native control has a cross-platform textbox role mapping',
          test: facts => facts.role != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role} = await subject.computed();
          if (role !== facts.role) {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this native text control, so the accessibility node does not identify what kind of input it is'
                : `the binding expects the ${facts.role} role, but the browser reports "${role}"`,
            );
          }
        },
      },
      {
        id: 'text-input.value.exposed',
        outcome:
          'The accessibility node exposes the current text value instead of the placeholder or a stale value.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding exposes an ordinary, non-protected text value',
          test: facts => facts.value != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expected = facts.value;
          if (expected == null) {
            throw new Error('value expectation ran without an expected value');
          }
          const {value} = await subject.computed();
          if (value !== expected) {
            throw new Error(
              `the binding renders the value ${JSON.stringify(expected)}, but the browser exposes ${JSON.stringify(value)}`,
            );
          }
        },
      },
      {
        id: 'text-input.multiline.exposed',
        outcome:
          'The accessibility node distinguishes a multi-line text area from a single-line text input.',
        sources: [WCAG_4_1_2, HTML_AAM_INPUT_TEXTBOX, HTML_AAM_TEXTAREA],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the native control has a cross-platform textbox role mapping',
          test: facts => facts.role === 'textbox',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {multiline} = await subject.computed();
          if (multiline !== facts.multiline) {
            throw new Error(
              `the binding renders a ${facts.multiline ? 'multi-line' : 'single-line'} text control, but the browser exposes it as ${multiline ? 'multi-line' : 'single-line'}`,
            );
          }
        },
      },
      {
        id: 'text-input.name.exposed',
        outcome:
          'The text control has an accessible name, so the user knows what to enter.',
        sources: [WCAG_4_1_2, WCAG_3_3_2],
        covers: ['4.1.2-name-role-value', '3.3.2-labels-or-instructions'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this text control, so nothing identifies what the user should enter',
            );
          }
        },
      },
      {
        id: 'text-input.label.persistently-associated',
        outcome:
          'The text control has a persistent programmatic label instead of using placeholder text as its only identification.',
        sources: [WCAG_3_3_2, WCAG_1_3_1],
        covers: [
          '3.3.2-labels-or-instructions',
          '1.3.1-info-and-relationships',
        ],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const label = await subject.labelText();
          if (label == null || label.trim() === '') {
            throw new Error(
              'the text control has no persistent label relationship; placeholder text alone disappears while the user enters a value',
            );
          }
        },
      },
      {
        id: 'text-input.name.matches-visible-label',
        outcome:
          'The accessible name contains the visible label, so someone using speech input can say what they can read.',
        sources: [WCAG_2_5_3],
        covers: ['2.5.3-label-in-name'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            return notApplicable(
              'this state renders no visible label text, so there are no visible words for a speech-input user to say',
            );
          }
          const {name} = await subject.computed();
          if (!saysInOrder(spokenWords(name), spokenWords(visible))) {
            throw new Error(
              `the visible label reads "${visible}" but the browser computes the accessible name as "${name}", so speaking the visible label does not reach this control`,
            );
          }
        },
      },
      {
        id: 'text-input.description.resolvable',
        outcome:
          'Every piece of supporting text the control points at exists and matches the intended description.',
        sources: [WCAG_1_3_1],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding renders supporting text for this state',
          test: facts => facts.description != null,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expected = facts.description;
          if (expected == null) {
            throw new Error(
              'description expectation ran without expected supporting text',
            );
          }
          const attribute = await subject.attribute('aria-describedby');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'the binding renders supporting text for this state, but the text control has no aria-describedby',
            );
          }
          const targets = await subject.idReferences('aria-describedby');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-describedby points at ${dangling.map(id => `"${id}"`).join(', ')}, which ${dangling.length === 1 ? 'resolves' : 'resolve'} to nothing`,
            );
          }
          const attached = targets
            .filter((text): text is string => text != null)
            .join(' ');
          if (!sameWords(attached, expected)) {
            throw new Error(
              `the binding expects the description "${expected}", but aria-describedby resolves to "${attached}"`,
            );
          }
        },
      },
      {
        id: 'text-input.description.exposed',
        outcome:
          'The browser computes the intended supporting text as the control’s accessible description.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding renders supporting text for this state',
          test: facts => facts.description != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expected = facts.description;
          if (expected == null) {
            throw new Error(
              'description expectation ran without expected supporting text',
            );
          }
          const {description} = await subject.computed();
          if (!sameWords(description, expected)) {
            throw new Error(
              description.trim() === ''
                ? `the binding expects the description "${expected}", but the browser computes no accessible description`
                : `the binding expects the description "${expected}", but the browser computes "${description}"`,
            );
          }
        },
      },
      {
        id: 'text-input.disabled.exposed',
        outcome:
          'A text control the binding marks unavailable is reported as unavailable.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding declares this state unavailable',
          test: facts => facts.disabled,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {disabled} = await subject.computed();
          if (!disabled) {
            throw new Error(
              'the binding declares this text control unavailable, but the browser reports it as available',
            );
          }
        },
      },
      {
        id: 'text-input.disabled.not-exposed',
        outcome:
          'An available text control does not expose a false disabled state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is available',
          test: facts => !facts.disabled,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {disabled} = await subject.computed();
          if (disabled) {
            throw new Error(
              'this text control is available, but the browser exposes it as disabled',
            );
          }
        },
      },
      {
        id: 'text-input.readonly.exposed',
        outcome:
          'A read-only text control is exposed as read-only, so the user knows its value cannot be edited.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is read-only and not disabled',
          test: facts => facts.readOnly && !facts.disabled,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {readOnly} = await subject.computed();
          if (readOnly !== true) {
            throw new Error(
              'the binding declares this text control read-only, but the browser does not expose a read-only state',
            );
          }
        },
      },
      {
        id: 'text-input.readonly.not-exposed',
        outcome:
          'An editable, available text control does not expose a false read-only state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is editable and available',
          test: facts => !facts.readOnly && !facts.disabled,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {readOnly} = await subject.computed();
          if (readOnly === true) {
            throw new Error(
              'this text control is editable, but the browser exposes it as read-only',
            );
          }
        },
      },
      {
        id: 'text-input.required.exposed',
        outcome:
          'A required text control exposes that obligation before form submission.',
        sources: [WCAG_3_3_2, WCAG_4_1_2],
        covers: ['3.3.2-labels-or-instructions', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is required',
          test: facts => facts.required,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {required} = await subject.computed();
          if (required !== true) {
            throw new Error(
              'the binding declares this text control required, but the browser does not expose a required state',
            );
          }
        },
      },
      {
        id: 'text-input.required.not-exposed',
        outcome:
          'An optional text control does not expose a false required state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is not required',
          test: facts => !facts.required,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {required} = await subject.computed();
          if (required === true) {
            throw new Error(
              'this text control is optional, but the browser exposes it as required',
            );
          }
        },
      },
      {
        id: 'text-input.invalid.exposed',
        outcome:
          'A text control in error is exposed as invalid, so the user can find what needs fixing.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is invalid',
          test: facts => facts.invalid,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {invalid} = await subject.computed();
          if (!invalid) {
            throw new Error(
              'the binding declares this text control invalid, but the browser reports it as valid',
            );
          }
        },
      },
      {
        id: 'text-input.invalid.not-exposed',
        outcome: 'A valid text control does not expose a false invalid state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is valid',
          test: facts => !facts.invalid,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {invalid} = await subject.computed();
          if (invalid) {
            throw new Error(
              'this text control is valid, but the browser exposes it as invalid',
            );
          }
        },
      },
      {
        id: 'text-input.error.identified-in-text',
        outcome:
          'An invalid text control renders textual error feedback and programmatically connects it to the field.',
        sources: [WCAG_3_3_1, WCAG_1_3_1],
        covers: ['3.3.1-error-identification'],
        appliesWhen: {
          condition: 'this state is invalid',
          test: facts => facts.invalid,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expected = facts.errorMessage;
          if (expected == null || expected.trim() === '') {
            throw new Error(
              'the binding declares this text control invalid but supplies no textual error description',
            );
          }
          const errorMessageAttribute =
            await subject.attribute('aria-errormessage');
          const errorMessageIds = (errorMessageAttribute ?? '')
            .split(/\s+/)
            .filter(Boolean);
          if (errorMessageIds.length > 1) {
            throw new Error(
              `aria-errormessage accepts exactly one id, but this control declares ${errorMessageIds.map(id => `"${id}"`).join(', ')}`,
            );
          }
          const relatedText = [
            ...(await subject.idReferences('aria-errormessage')),
            ...(await subject.idReferences('aria-describedby')),
          ];
          if (
            !relatedText.some(text => text != null && sameWords(text, expected))
          ) {
            throw new Error(
              `the binding identifies the error as "${expected}", but no aria-errormessage or aria-describedby target contains that text`,
            );
          }
        },
      },
      {
        id: 'text-input.error.related-text-visible',
        outcome:
          'The textual error connected to an invalid control is visibly rendered while the error applies.',
        sources: [WCAG_3_3_1, WAI_ARIA_ERROR_MESSAGE],
        covers: ['3.3.1-error-identification', '1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'this invalid state supplies textual error feedback',
          test: facts => facts.invalid && facts.errorMessage != null,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const expected = facts.errorMessage;
          if (expected == null) {
            throw new Error(
              'error visibility expectation ran without expected error text',
            );
          }
          const visibleRelatedText = [
            ...(await subject.visibleIdReferences('aria-errormessage')),
            ...(await subject.visibleIdReferences('aria-describedby')),
          ];
          if (
            !visibleRelatedText.some(
              text => text != null && sameWords(text, expected),
            )
          ) {
            throw new Error(
              `the binding identifies the error as "${expected}", but no visibly rendered aria-errormessage or aria-describedby target contains that text`,
            );
          }
        },
      },
      {
        id: 'text-input.editing.keyboard-round-trip',
        outcome:
          'A keyboard user can add text, clear it, and restore the starting value in an editable control.',
        sources: [WCAG_2_1_1],
        covers: ['2.1.1-keyboard'],
        appliesWhen: {
          condition: 'this state is editable and focusable',
          test: facts => facts.editable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the text control did not take focus, so keyboard editing cannot reach it',
            );
          }
          const initial = await subject.textValue();
          if (initial == null) {
            throw new Error(
              'the role-bearing subject exposes no editable text value',
            );
          }
          await harness.typeText(subject, 'x');
          const changed = await subject.textValue();
          if (
            changed == null ||
            changed === initial ||
            !changed.includes('x')
          ) {
            throw new Error(
              `typing "x" left the value ${JSON.stringify(changed)} instead of adding the typed text`,
            );
          }
          await harness.clearText(subject);
          const cleared = await subject.textValue();
          if (cleared !== '') {
            throw new Error(
              `clearing the text control left the value ${JSON.stringify(cleared)} instead of an empty value`,
            );
          }
          if (initial !== '') {
            await harness.typeText(subject, initial);
            const restored = await subject.textValue();
            if (restored !== initial) {
              throw new Error(
                `typing the starting value back left ${JSON.stringify(restored)} instead of ${JSON.stringify(initial)}`,
              );
            }
          }
        },
      },
      {
        id: 'text-input.focus.reachable-and-escapable',
        outcome:
          'Tab reaches a focusable text control and Tab again leaves it, so a keyboard user can edit and continue.',
        sources: [WCAG_2_1_1, WCAG_2_1_2],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: {
          condition: 'this state is meant to be in the tab sequence',
          test: facts => facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await harness.resetFocus();
          let reached = false;
          for (let step = 0; step < TAB_BUDGET && !reached; step += 1) {
            await harness.press('Tab');
            reached = await subject.isFocused();
          }
          if (!reached) {
            throw new Error(
              `${TAB_BUDGET} presses of Tab from the start of the document never reached the text control`,
            );
          }
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error(
              'Tab did not move focus off the text control, so a keyboard user is trapped in it',
            );
          }
        },
      },
      {
        id: 'text-input.editing.disabled-reason-inert',
        outcome:
          'A disabled text control kept focusable for its reason still blocks keyboard editing.',
        sources: [INPUT_FIELDS_FR4],
        covers: ['2.1.1-keyboard'],
        appliesWhen: {
          condition: 'this state is disabled and kept in the tab sequence',
          test: facts => facts.disabled && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await assertKeyboardEditsBlocked(harness, subject);
        },
      },
      {
        id: 'text-input.editing.inoperable',
        outcome:
          'A focusable read-only text control does not accept keyboard edits.',
        sources: [AST_021_PRESERVE_BEHAVIOR],
        covers: ['2.1.1-keyboard'],
        appliesWhen: {
          condition: 'this state is read-only, focusable, and not disabled',
          test: facts => facts.readOnly && facts.focusable && !facts.disabled,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'advisory',
        advisoryBecause:
          'AST-021 requires migrations to preserve existing behavior, but no current text-input component record makes one universal read-only inertness rule authoritative for every future binding.',
        run: async ({harness, subject}) => {
          await assertKeyboardEditsBlocked(harness, subject);
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy:
          "the component's own icon and spinner tests plus the repository axe audit, `pnpm a11y:audit`",
        reason:
          'Decorative and informative graphics are composed around the native text control, not exposed by the control node this pattern observes.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and composing page',
        verifiedBy:
          'the description relationship expectation here plus component DOM-order tests and page-level structural review',
        reason:
          'This contract proves the text-control relationships it can read. Broader field structure and surrounding page relationships remain with their composition owners.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component and composing page',
        verifiedBy: 'component DOM-order tests and page-level review',
        reason:
          'Reading order includes labels, instructions, status content, and surrounding page content outside one native control node.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'TextInput and TextArea autocomplete passthrough tests plus form-level review that fields collecting information about the user receive the correct standard token',
        reason:
          'The components forward the native autocomplete value, but only the caller knows whether a field collects a listed category of information about the user and which purpose applies.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'component status tests and the repository visual gate',
        reason:
          'Whether status is distinguishable without color is a rendered composition and pixel outcome, not a native control-node semantic.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit over component stories plus the visual gate',
        reason:
          'Text contrast depends on resolved colors and backdrop pixels outside this semantic contract.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit over component stories plus the visual gate',
        reason:
          'Control boundaries, status icons, and focus indicators are painted surfaces outside this semantic contract.',
      },
      '2.1.1-keyboard': {
        owner: 'the binding component',
        verifiedBy:
          'the native keyboard-editing expectation here plus component tests for composed buttons and shortcuts',
        reason:
          'This contract proves text entry and deletion on the role-bearing control. Clear buttons, Enter callbacks, and other composed functions remain with their own component or pattern tests.',
        coversRemainderOnly: true,
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review and the hosting application',
        reason: 'An isolated text control cannot supply the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy: 'page-level keyboard review',
        reason:
          'Sequential order is a property of all focus stops a page composes, not one text control.',
      },
      '2.4.4-link-purpose': {
        owner: 'caller content',
        verifiedBy: 'review of any link composed near the field',
        reason: 'The native text-input pattern has no link part.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content and component review',
        verifiedBy:
          'content review of whether each supplied label describes the field purpose',
        reason:
          'Whether label wording describes its purpose is a content judgement no runtime check can settle.',
      },
      '2.4.7-focus-visible': {
        owner:
          'the interaction-modality architecture record and binding component',
        verifiedBy:
          "the component's focus-ring styling tests and the repository visual gate",
        reason:
          'A visible focus indicator is a paint result owned by the rendered component and theme.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy: 'page-level and overlay review',
        reason:
          'Whether author-created content obscures a focused field depends on the page composition.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component and browser',
        verifiedBy:
          'component pointer tests for component-owned actions and native-browser behavior for caret placement',
        reason:
          'The text control itself has no component-owned single-pointer action; clear and tooltip buttons are separate bound patterns.',
      },
      '2.5.8-target-size': {
        owner: 'the binding component and composing page',
        verifiedBy:
          'real-browser geometry measurement plus review of applicable WCAG exceptions',
        reason:
          'Target size and spacing depend on rendered geometry and neighbouring targets outside the control node.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review and the hosting application',
        reason: 'An isolated text control cannot supply the document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller',
        verifiedBy:
          'integration review of context changes performed by consumer callbacks',
        reason:
          'TextInput and TextArea report value changes; the caller decides whether those changes navigate or replace surrounding content.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the composing application and caller content',
        verifiedBy:
          'cross-page review that equivalent fields use consistent names and identification',
        reason:
          'One isolated binding cannot compare equivalent functions across pages or workflows.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component and caller',
        verifiedBy:
          'the invalid-state error-text expectation here plus validation logic and content review in the binding application',
        reason:
          'This contract proves that a bound invalid state carries attached error text. The caller still owns detecting the right error and supplying useful wording.',
        coversRemainderOnly: true,
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'the accessibility-tree naming expectation here plus component and content review for visible persistence and needed instructions',
        reason:
          'This contract proves that a name exists. Whether the label stays visibly present and whether additional instructions are needed remain presentation and content outcomes.',
        coversRemainderOnly: true,
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component and browser for specialized states',
        verifiedBy:
          'the role, name, description, value, multiline, disabled, read-only, required, and invalid accessibility-tree expectations in this contract plus component-local tests for states outside the shared model',
        reason:
          'The shared native textbox states are encoded here. Protected password-value representation, busy semantics not adopted by current authority, and component-specific composed parts remain with their narrower owners.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the binding component and the assistive-technology verification record',
        verifiedBy:
          "the component's live-region regression tests plus real-AT evidence under `docs/specs/AST-009/spec.md` whenever a change claims what is announced",
        reason:
          'This pattern can verify static descriptions and state exposure, not speech, timing, repetition, or announcement order.',
      },
      'apg-interaction': {
        owner: 'a future current pattern owner, if Astryx adopts one',
        verifiedBy:
          'review against current Astryx records before adding any APG-derived mechanic',
        reason:
          'WAI-ARIA APG publishes no generic text-input widget pattern, and current Astryx authority adopts no substitute APG interaction model for native text controls.',
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's compiled-CSS tests plus manual Windows High Contrast review",
        reason:
          'Forced-colors behavior is a paint result outside this semantic contract.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          'review of transition declarations and repository reduced-motion checks',
        reason:
          'Motion is a rendered result over time, and the native editing contract introduces none.',
      },
      'at-facing-strings': {
        owner: 'the binding component',
        verifiedBy:
          'the repository i18n catalog check and source review of assistive-technology-facing text',
        reason:
          'Translation is a source-level concern that the rendered semantic result cannot identify.',
      },
    },
  });
