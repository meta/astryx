// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file checkbox.ts
 * @input Uses ../contract (definePattern and the expectation vocabulary)
 * @output CHECKBOX_PATTERN — the adopted WAI-ARIA APG "checkbox" pattern as a
 *   reusable contract — and CheckboxStateFacts, what a binding declares each of
 *   its states is supposed to be.
 * @position The third authored pattern, after switch and button.
 *
 * Adopted pattern: https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
 *
 * What this contract owns is the part of "is it a checkbox" that is the same for
 * every component that adopts the pattern: the checkbox-bearing role and name are
 * exposed, the unchecked, checked, or partially checked state matches what is
 * rendered, pointer activation changes it and can be taken back, direct checkboxes
 * respond to Space without trapping focus, and unavailable controls stay inert.
 * Menu arrow navigation and composite focus stay with the menu contract; callback,
 * form, composition, and styling behavior stays with each component
 * (`docs/specs/AST-021/spec.md` FR5).
 *
 * SYNC: When an expectation changes, update
 * - /internal/a11y-spec/README.md
 * - /packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.test.tsx (the jsdom binding)
 * - /packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.chromium.spec.ts (Chromium)
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import type {Harness, Subject} from '../harness';
import {saysInOrder, spokenWords} from '../spoken';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};
const WCAG_2_1_1: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.1',
  name: 'Keyboard',
  level: 'A',
  url: `${UNDERSTANDING}/keyboard.html`,
};
const WCAG_2_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.2',
  name: 'No Keyboard Trap',
  level: 'A',
  url: `${UNDERSTANDING}/no-keyboard-trap.html`,
};
const WCAG_2_5_2: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.2',
  name: 'Pointer Cancellation',
  level: 'A',
  url: `${UNDERSTANDING}/pointer-cancellation.html`,
};
const WCAG_3_2_2: WcagCriterion = {
  standard: 'wcag',
  id: '3.2.2',
  name: 'On Input',
  level: 'A',
  url: `${UNDERSTANDING}/on-input.html`,
};
const WCAG_2_5_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.3',
  name: 'Label in Name',
  level: 'A',
  url: `${UNDERSTANDING}/label-in-name.html`,
};
const WCAG_3_3_2: WcagCriterion = {
  standard: 'wcag',
  id: '3.3.2',
  name: 'Labels or Instructions',
  level: 'A',
  url: `${UNDERSTANDING}/labels-or-instructions.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'checkbox',
  requirement: 'The checkbox has role checkbox.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_MENUITEM_CHECKBOX_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu and menubar',
  requirement:
    'Focusable elements, which may have role menuitem, menuitemradio, or menuitemcheckbox, are referred to as items.',
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/menubar/#keyboardinteraction',
};
const APG_MENUITEM_CHECKBOX_STATE: ApgRequirement = {
  standard: 'apg',
  pattern: 'menu and menubar',
  requirement:
    'When a menuitemcheckbox or menuitemradio is checked, aria-checked is set to true.',
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/menubar/#wai-ariaroles,states,andproperties',
};
const APG_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'checkbox',
  requirement:
    'The checkbox has an accessible label provided by visible text content, aria-labelledby, or aria-label.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_STATE: ApgRequirement = {
  standard: 'apg',
  pattern: 'checkbox',
  requirement:
    'When checked, the checkbox element has state aria-checked set to true. When not checked, it has state aria-checked set to false. When partially checked, it has state aria-checked set to mixed.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_DESCRIBEDBY: ApgRequirement = {
  standard: 'apg',
  pattern: 'checkbox',
  requirement:
    'If the presentation includes additional descriptive static text relevant to a checkbox or to a group of checkboxes, the checkbox or checkbox group has aria-describedby set to the id of the element containing the description.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'checkbox',
  requirement:
    'When the checkbox has focus, pressing the Space key changes the state of the checkbox.',
  url: `${APG_URL}#keyboardinteraction`,
};
const AST_021_PRESERVE_BEHAVIOR: AstryxRecord = {
  standard: 'astryx',
  id: 'spec:AST-021',
  clause: 'FR7',
  requirement:
    'Existing behavior is preserved unless a separate change authorizes it.',
  url: 'https://github.com/meta/astryx/blob/9fdb3819f91b3642b46319f21f4d99f95bc14f16/docs/specs/AST-021/spec.md#L85-L89',
};

/**
 * How many Tab presses count as "reachable". Ten is generous for one control
 * on a fixture page and short enough that an unreachable checkbox fails fast
 * instead of hanging the run.
 */
const TAB_BUDGET = 10;

/**
 * An interaction expectation's claim is a real-browser one — pressing this
 * changes its state — but the answer is read out of the accessibility tree, so it
 * cannot run without both.
 */
const READS_THE_TREE = ['accessibility-tree'] as const;

/** Applies to every state; the outcome never stops mattering. */
const ALWAYS = {
  condition: 'the binding renders the pattern at all',
  test: () => true,
};

/**
 * What a binding declares one of its states is supposed to be. The contract
 * asks the browser what it actually exposes and compares it against this — so a
 * binding cannot pass by being consistently wrong, and an expectation knows
 * which states it applies to (AST-020 FR5, AST-021 FR4).
 */
export interface CheckboxStateFacts {
  /** Which checkbox-bearing role this state adopts. */
  readonly role: 'checkbox' | 'menuitemcheckbox';
  /** Whether this state renders unchecked, checked, or partially checked. */
  readonly checked: boolean | 'mixed';
  /** Whether the user is meant to be able to change it. */
  readonly operable: boolean;
  /** Whether it is meant to be reachable in the page tab sequence. */
  readonly focusable: boolean;
  /** Whether it is meant to be exposed as unavailable. */
  readonly disabled: boolean;
  /** Supporting text that must be exposed as this state's description. */
  readonly description: string | null;
  /** Whether it is meant to be exposed as read-only. */
  readonly readOnly: boolean;
  /** Whether it is meant to be exposed as required. */
  readonly required: boolean;
  /** Whether it is meant to be exposed as being in error. */
  readonly invalid: boolean;
}

function checkedState(checked: 'true' | 'false' | 'mixed' | null): string {
  switch (checked) {
    case 'true':
      return 'checked';
    case 'false':
      return 'unchecked';
    case 'mixed':
      return 'partially checked';
    default:
      return 'without a checked state';
  }
}

function sameWords(actual: string, expected: string): boolean {
  const actualWords = spokenWords(actual);
  const expectedWords = spokenWords(expected);
  return (
    actualWords.length === expectedWords.length &&
    actualWords.every((word, index) => word === expectedWords[index])
  );
}

/**
 * Half a round trip is not the outcome: a control that turns on and cannot turn
 * off has failed the person using it just as completely as one that never
 * turned on (AST-020 FR8).
 */
async function roundTrip(
  start: boolean | 'mixed',
  activate: () => Promise<void>,
  read: () => Promise<'true' | 'false' | 'mixed' | null>,
  how: string,
): Promise<void> {
  const from = start === 'mixed' ? 'mixed' : start ? 'true' : 'false';
  const initial = await read();
  if (initial !== from) {
    throw new Error(
      `the binding declares ${checkedState(from)}, but the browser starts ${checkedState(initial)}`,
    );
  }
  await activate();
  const after = await read();

  if (start === 'mixed') {
    if (after !== 'true' && after !== 'false') {
      throw new Error(
        `${how} left the checkbox ${checkedState(after)} instead of resolving the partially checked state`,
      );
    }
    await activate();
    const back = await read();
    if ((back !== 'true' && back !== 'false') || back === after) {
      throw new Error(
        `${how} resolved the partially checked state to ${checkedState(after)}, but doing it again left it ${checkedState(back)}: the change only goes one way`,
      );
    }
    return;
  }

  const to = start ? 'false' : 'true';
  if (after !== to) {
    throw new Error(
      `${how} left the checkbox ${checkedState(after)}: it cannot be changed to ${checkedState(to)}`,
    );
  }
  await activate();
  const back = await read();
  if (back !== from) {
    throw new Error(
      `${how} changed the checkbox to ${checkedState(after)}, but doing it again left it ${checkedState(back)} instead of returning it to ${checkedState(from)}: the change only goes one way`,
    );
  }
}

async function assertReachableAndEscapable(
  harness: Harness,
  subject: Subject,
): Promise<void> {
  await harness.resetFocus();
  let reached = false;
  for (let step = 0; step < TAB_BUDGET && !reached; step += 1) {
    await harness.press('Tab');
    reached = await subject.isFocused();
  }
  if (!reached) {
    throw new Error(
      `${TAB_BUDGET} presses of Tab from the start of the document never reached the checkbox, so a keyboard user cannot get to this setting`,
    );
  }
  await harness.press('Tab');
  if (await subject.isFocused()) {
    throw new Error(
      'Tab did not move focus off the checkbox, so a keyboard user is stuck on it',
    );
  }
}

export const CHECKBOX_PATTERN: PatternContract<CheckboxStateFacts> =
  definePattern<CheckboxStateFacts>({
    pattern: 'checkbox',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/',
    scope:
      'One checkbox-bearing control that exposes its role, name, checked state, and availability; pointer activation works in both directions, and direct checkboxes also support Space and ordinary tab navigation.',

    expectations: [
      {
        id: 'checkbox.role.exposed',
        outcome:
          'The control exposes the checkbox-bearing role its adopted pattern requires, so the user knows this is a selectable value.',
        sources: [WCAG_4_1_2, APG_ROLE, APG_MENUITEM_CHECKBOX_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {role} = await subject.computed();
          if (role !== facts.role) {
            throw new Error(
              role == null
                ? `the browser exposes no role for this ${facts.role} control, so the accessibility node does not identify which widget pattern it implements`
                : `this binding adopts the ${facts.role} role, but the browser reports "${role}"`,
            );
          }
        },
      },
      {
        id: 'checkbox.name.exposed',
        outcome:
          'The checkbox has an accessible name, so the user knows which setting they are turning on or off.',
        sources: [WCAG_4_1_2, WCAG_3_3_2, APG_LABEL],
        covers: ['4.1.2-name-role-value', '3.3.2-labels-or-instructions'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this checkbox, so the accessibility node does not identify the choice',
            );
          }
        },
      },
      {
        id: 'checkbox.name.matches-visible-label',
        outcome:
          'The accessible name contains the visible label, so someone using speech input can say what they can read.',
        sources: [WCAG_2_5_3, APG_LABEL],
        covers: ['2.5.3-label-in-name'],
        // Applies to every state, and reads BOTH sides off the rendered page.
        // Nothing here consults the binding: a criterion a binding could checkbox
        // off by declaring something about itself would not be a criterion.
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            // Nothing is presented visually, so there is nothing for a speech
            // user to say: 2.5.3 applies to "user interface components with
            // labels that include text or images of text". Reported as such
            // rather than returning — a silent return would read as a pass, and
            // this state never exercised the outcome.
            // `return` so the compiler follows the control flow; the call
            // itself never returns.
            return notApplicable(
              'this state renders no label where a person can read it, so there are no visible words for a speech-input user to say',
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
        id: 'checkbox.state.exposed',
        outcome:
          'The browser accessibility node exposes the unchecked, checked, or partially checked state that the binding renders.',
        sources: [WCAG_4_1_2, APG_STATE, APG_MENUITEM_CHECKBOX_STATE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {checked} = await subject.computed();
          if (checked == null) {
            throw new Error(
              'the browser accessibility node exposes no checked state for this checkbox',
            );
          }
          const expected =
            facts.checked === 'mixed'
              ? 'mixed'
              : facts.checked
                ? 'true'
                : 'false';
          if (checked !== expected) {
            throw new Error(
              `this state renders ${checkedState(expected)} but the browser reports it as ${checkedState(checked)}`,
            );
          }
        },
      },
      {
        id: 'checkbox.description.resolvable',
        outcome:
          'Every piece of supporting text the checkbox points at exists, so none of the explanation is silently dropped.',
        sources: [WCAG_1_3_1, APG_DESCRIBEDBY],
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
              'description expectation ran without expected text',
            );
          }
          const attribute = await subject.attribute('aria-describedby');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'the binding renders supporting text for this state, but the checkbox has no aria-describedby, so the text is never attached to the control',
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
        id: 'checkbox.description.exposed',
        outcome:
          'The browser computes the intended supporting text as the control’s distinct accessible description, not just as nearby markup.',
        sources: [WCAG_4_1_2, APG_DESCRIBEDBY],
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
              'description expectation ran without expected text',
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
        id: 'checkbox.disabled.exposed',
        outcome:
          'A checkbox the binding marks unavailable is reported as unavailable, instead of looking available and doing nothing.',
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
              'the binding declares this state unavailable, but the browser reports the checkbox as available, so the user is invited to change something that will not change',
            );
          }
        },
      },
      {
        id: 'checkbox.disabled.not-exposed',
        outcome:
          'An available checkbox does not expose a false disabled state.',
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
              'this state is available, but the browser exposes the checkbox as disabled',
            );
          }
        },
      },
      {
        id: 'checkbox.readonly.declared',
        outcome:
          'A read-only checkbox declares that its value cannot be changed.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is read-only',
          test: facts => facts.readOnly,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.attribute('aria-readonly')) !== 'true') {
            throw new Error(
              'this state is read-only, but the checkbox does not declare aria-readonly="true"',
            );
          }
        },
      },
      {
        id: 'checkbox.readonly.not-declared',
        outcome:
          'An editable checkbox does not expose a false read-only state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is not read-only',
          test: facts => !facts.readOnly,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.attribute('aria-readonly')) === 'true') {
            throw new Error(
              'this state is editable, but the checkbox declares aria-readonly="true"',
            );
          }
        },
      },
      {
        id: 'checkbox.required.declared',
        outcome:
          'A checkbox that has to be checked declares that requirement in markup for user agents and assistive technology to consume.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is required',
          test: facts => facts.required,
        },
        // The accessibility-tree layer would be the stronger place for this, but
        // Chromium's protocol does not emit a `required` property for a checkbox
        // (it reports the resulting constraint-validation `invalid` instead), so
        // the honest layer for the claim is the declaration itself.
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const native = await subject.attribute('required');
          const aria = await subject.attribute('aria-required');
          if (native == null && aria !== 'true') {
            throw new Error(
              'this state is required, but the checkbox declares neither the native required attribute nor aria-required="true", so user agents receive no required-state declaration',
            );
          }
        },
      },
      {
        id: 'checkbox.required.not-declared',
        outcome:
          'A checkbox that is not required does not expose a false required state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is not required',
          test: facts => !facts.required,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const native = await subject.attribute('required');
          const aria = await subject.attribute('aria-required');
          if (native != null || aria === 'true') {
            throw new Error(
              'this state is not required, but the checkbox exposes a required declaration',
            );
          }
        },
      },
      {
        id: 'checkbox.invalid.exposed',
        outcome:
          'A checkbox in error is reported as being in error, so the user can find what needs fixing.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is in error',
          test: facts => facts.invalid,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {invalid} = await subject.computed();
          if (!invalid) {
            throw new Error(
              'this state is in error, but the browser does not report the checkbox as invalid, so the error is only visible to people who can see the message',
            );
          }
        },
      },
      {
        id: 'checkbox.invalid.not-exposed',
        outcome:
          'A checkbox that is not invalid does not expose a false invalid state.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'this state is not invalid',
          test: facts => !facts.invalid,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {invalid} = await subject.computed();
          if (invalid) {
            throw new Error(
              'this state is not invalid, but the browser exposes the checkbox as invalid',
            );
          }
        },
      },
      {
        id: 'checkbox.state.pointer-round-trip',
        outcome:
          'A pointer changes the checkbox and can change it again, while the exposed state follows each transition.',
        sources: [APG_STATE, WCAG_4_1_2],
        wcagOutcome:
          'The checked state exposed under 4.1.2 stays synchronized with the state the user changes.',
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the user is meant to be able to change this state',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_THE_TREE,
        enforcement: 'advisory',
        advisoryBecause:
          'APG specifies keyboard state change but does not independently require pointer activation, and no current Astryx checkbox record adopts it as a gate.',
        run: async ({harness, subject, facts}) => {
          await roundTrip(
            facts.checked,
            () => harness.click(subject),
            async () => (await subject.computed()).checked,
            'clicking the checkbox',
          );
        },
      },
      {
        id: 'checkbox.state.space-round-trip',
        outcome:
          'With focus on the checkbox, Space changes its state and can change it again — the keyboard reaches the same function the pointer does.',
        sources: [WCAG_2_1_1, APG_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the user is meant to be able to change this direct checkbox',
          test: facts => facts.operable && facts.role === 'checkbox',
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_THE_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the checkbox did not take focus, so Space never reaches it',
            );
          }
          await roundTrip(
            facts.checked,
            () => harness.press('Space'),
            async () => (await subject.computed()).checked,
            'pressing Space on the focused checkbox',
          );
        },
      },
      {
        id: 'checkbox.state.survives-an-aborted-press',
        outcome:
          'A press the user slides off and releases elsewhere leaves the checkbox alone, so a misplaced touch can be taken back.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'the user is meant to be able to change this state',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_THE_TREE,
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).checked;
          await harness.abortedPress(subject);
          const after = (await subject.computed()).checked;
          if (after !== before) {
            throw new Error(
              `pressing the checkbox and releasing away from it still turned it ${checkedState(after)}: the change happens on the way down, so a press cannot be taken back`,
            );
          }
        },
      },
      {
        id: 'checkbox.state.keeps-focus-on-change',
        outcome:
          'Turning the checkbox on leaves focus on the checkbox, so a keyboard user is not thrown somewhere else mid-task.',
        sources: [WCAG_3_2_2],
        // Partly: see the 3.2.2 entry in `exemptions` for the half of the
        // criterion a component-level run cannot see.
        covers: ['3.2.2-on-input'],
        appliesWhen: {
          condition:
            'the user is meant to be able to change this direct checkbox',
          test: facts => facts.operable && facts.role === 'checkbox',
        },
        evidenceLayer: 'real-browser',
        // The claim is about a CHANGE, so the state has to be read before and
        // after: "focus stayed put" is worth nothing if nothing happened.
        alsoNeeds: READS_THE_TREE,
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the checkbox did not take focus, so this state cannot be changed from the keyboard at all',
            );
          }
          const before = (await subject.computed()).checked;
          await harness.press('Space');
          const after = (await subject.computed()).checked;
          if (after === before) {
            throw new Error(
              `pressing Space left the checkbox ${checkedState(after)}, so nothing changed and this expectation has no change to judge`,
            );
          }
          if (!(await subject.isFocused())) {
            throw new Error(
              `changing the checkbox to ${checkedState(after)} moved focus off it, so the user is somewhere else without having asked to be`,
            );
          }
        },
      },
      {
        id: 'checkbox.focus.reachable-and-escapable',
        outcome:
          'Tab reaches an operable checkbox, and Tab again leaves it, so a keyboard user can get to the setting and carry on past it.',
        sources: [WCAG_2_1_1, WCAG_2_1_2],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: {
          condition: 'this direct checkbox is operable',
          test: facts => facts.role === 'checkbox' && facts.operable,
        },
        evidenceLayer: 'real-browser',
        // No `alsoNeeds`: this one reads only where focus is, which is a real
        // browser's own answer.
        enforcement: 'required',
        run: async ({harness, subject}) => {
          await assertReachableAndEscapable(harness, subject);
        },
      },
      {
        id: 'checkbox.focus.declared-inoperable-reachable',
        outcome:
          'When a binding promises that an inoperable checkbox remains reachable, Tab reaches it and Tab again leaves it.',
        sources: [AST_021_PRESERVE_BEHAVIOR],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: {
          condition:
            'this direct checkbox is inoperable but its binding promises to keep it in the tab sequence',
          test: facts =>
            facts.role === 'checkbox' && !facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'advisory',
        advisoryBecause:
          'AST-021 requires a migration to preserve and record existing behavior, but no current component or system record makes focusability of every inoperable checkbox a universal conformance requirement.',
        run: async ({harness, subject}) => {
          await assertReachableAndEscapable(harness, subject);
        },
      },
      {
        id: 'checkbox.state.inoperable',
        outcome:
          'A checkbox the user is not meant to be able to change does not change when it is clicked or when Space is pressed on it.',
        sources: [APG_STATE, WCAG_4_1_2],
        wcagOutcome:
          'The checked state exposed under 4.1.2 does not claim a change the unavailable control did not accept.',
        covers: ['4.1.2-name-role-value'],
        // Not keyed on `disabled`: a checkbox can also be temporarily
        // unchangeable while it waits on the change it already started, and a
        // second press that slips through queues a change nobody asked for.
        appliesWhen: {
          condition: 'the user is not meant to be able to change this state',
          test: facts => !facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_THE_TREE,
        enforcement: 'advisory',
        advisoryBecause:
          'The standards require accurate exposed state, but no current Astryx checkbox record independently adopts inertness for every unavailable or pending state.',
        run: async ({harness, subject, facts}) => {
          const before = (await subject.computed()).checked;
          await harness.click(subject, {ignoreAvailability: true});
          const afterClick = (await subject.computed()).checked;
          if (afterClick !== before) {
            throw new Error(
              `the user is not meant to be able to change this state, but clicking the checkbox turned it ${checkedState(afterClick)}`,
            );
          }
          // A checkbox kept focusable while it cannot be changed — the usual way
          // to keep a reason or a pending state discoverable — still has to
          // refuse the keyboard.
          if (!facts.focusable || facts.role !== 'checkbox') {
            return;
          }
          await subject.focus();
          if (!(await subject.isFocused())) {
            // Reachability is a separate binding promise. The dedicated
            // declared-unavailable focus expectation records that mismatch;
            // inertness has still been proved for every input path the user can
            // actually reach in this rendered state.
            return;
          }
          await harness.press('Space');
          const afterSpace = (await subject.computed()).checked;
          if (afterSpace !== before) {
            throw new Error(
              `the user is not meant to be able to change this state, but pressing Space on the checkbox turned it ${checkedState(afterSpace)}`,
            );
          }
        },
      },
    ],

    // Every completeness dimension this pattern does not own, and who does.
    // A dimension answered neither here nor by an expectation's `covers` list is
    // reported by `unansweredDimensions` and asserted empty by this pattern's
    // suite (AST-020 FR5).
    exemptions: {
      'apg-interaction': {
        owner: 'the checkbox-group composition and its binding component',
        verifiedBy:
          'group-level DOM and accessibility-tree tests for the group role, group name, and any group-level aria-describedby relationship',
        reason:
          'This contract owns one checkbox-bearing control. APG also covers naming and describing a checkbox group, which can only be verified where the group is composed around its members.',
        coversRemainderOnly: true,
      },
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy:
          "the binding components' own suites for decorative indicators and busy content, plus the repository axe audit, `pnpm a11y:audit`",
        reason:
          'The pattern owns one control node. Which decorative graphics a binding paints around that node, and whether each is hidden, is a per-component composition fact this contract never sees.',
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the composing page',
        verifiedBy: "the component's DOM-order tests and page-level review",
        reason:
          'A checkbox is a single control; the order it is read in relative to other content is decided by whatever composes it.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form and caller content',
        verifiedBy:
          'form integration review for any user-information input composed with this choice',
        reason:
          'A checkbox records a choice and does not itself collect the user-information values covered by autocomplete purpose tokens.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and the theme',
        verifiedBy:
          "the component's forced-colors suite and the repository visual gate",
        reason:
          'Not part-encoded, and deliberately so. WCAG is explicit that exposure to assistive technology contributes nothing here: "even if information that is conveyed by color differences is appropriately conveyed to assistive technologies, it does not necessarily pass this criterion". 1.4.1 is entirely about what a sighted person who cannot distinguish two colours can see, which is a pixel fact no layer this contract observes can read.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and the theme',
        verifiedBy:
          'the repository axe audit, `pnpm a11y:audit`, over the component stories, plus the visual gate',
        reason:
          'Contrast is measured from resolved rendered colours over a real backdrop, which is the axe and visual layer rather than the accessibility tree.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and the theme',
        verifiedBy:
          'the repository axe audit, `pnpm a11y:audit`, plus the visual gate',
        reason:
          'Checkbox indicators, selectable-card rings, menu focus treatment, and focus indicators are painted surfaces; their contrast is a rendered-colour measurement this contract cannot make.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy:
          'page-level review and the application that hosts the control',
        reason:
          'A component rendered in isolation owns no document title and cannot supply one.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy:
          'page-level review; this contract proves only that the checkbox is one reachable stop that focus can also leave',
        reason:
          'Order is a property of the sequence a page builds, not of a single focus stop.',
      },
      '2.4.4-link-purpose': {
        owner: 'caller content',
        verifiedBy: 'review of any link a caller places near the control',
        reason: 'The adopted checkbox pattern has no link part.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content and component review',
        verifiedBy:
          'review of the label text against the setting it controls; this contract proves that a name exists and matches the visible label, not that the wording describes the purpose well',
        reason:
          'Whether a label is descriptive is a judgement about wording that no runtime layer can make.',
      },
      '2.4.7-focus-visible': {
        owner:
          'the interaction-modality architecture record and the binding component',
        verifiedBy:
          "the repository visual gate and the component's own focus-ring styling",
        reason:
          'A focus indicator is a painted result. Each adopter owns its visible focus treatment on its actual interactive surface, verified by component-level focus styling tests and the visual gate.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page',
        verifiedBy:
          'page-level and overlay review, plus the repository modal-close visibility guard',
        reason:
          'Whether something covers a focused control depends on what else the page renders over it.',
      },
      '2.5.8-target-size': {
        owner: 'the binding component and the composing page',
        verifiedBy:
          'real-browser geometry measurement of the target and its neighbouring-target spacing in representative compositions, plus manual review of applicable WCAG exceptions',
        reason:
          'The exception that decides most real checkboxes depends on the clearance between a target and its neighbours, which a binding rendered on its own cannot see. The repository axe audit does not enable the experimental target-size rule, so it is not evidence for this dimension.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy:
          'page-level review and the application that hosts the control',
        reason:
          'A component rendered in isolation owns no document language and cannot supply one.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the composing application and caller content',
        verifiedBy:
          'cross-page review that equivalent checkbox functions use consistent names and identification in their application context',
        reason:
          'This contract gives each adopter the same role and state rules, but one isolated binding cannot compare equivalent functions across pages or application workflows.',
      },
      '3.2.2-on-input': {
        owner: 'the caller, for its own onChange',
        verifiedBy:
          'integration and page-level review of what a caller does in response to the change',
        reason:
          "A change of context is a change of user agent, viewport, focus, or content that changes the page's meaning. The checkbox owns exactly one of those: whether activating it moves focus. If a caller's onChange navigates, reloads, or rewrites the page around the control, that is the caller's context change to warn about before the user reaches the checkbox, and no run of one component can observe it.",
        coversRemainderOnly: true,
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the binding component and caller content',
        verifiedBy:
          'component tests and content review for persistent visible labels and any instructions required to complete the choice',
        reason:
          'This contract proves that the checkbox has an accessible name and accurately declares requiredness. Whether the visible label stays present and whether the person needs additional instructions are presentation and content outcomes owned by the binding and caller.',
        coversRemainderOnly: true,
      },
      '3.3.1-error-identification': {
        owner: 'the binding component',
        verifiedBy: "the component's own status-message tests",
        reason:
          'Not part-encoded, and deliberately so. 3.3.1 is satisfied in TEXT — "the error must be indicated in text" — and WCAG says the programmatic half "is not required for this success criterion, but may be covered by other criteria such as 4.1.2". checkbox.invalid.exposed is that 4.1.2 outcome, so it contributes nothing here. The text itself is composed around the checkbox rather than being part of the control.',
      },
      '4.1.3-status-messages': {
        owner:
          'the binding component, and the assistive-technology verification record for the announcement itself',
        verifiedBy:
          "the component's own live-region regression test, plus real-AT evidence under `docs/specs/AST-009/spec.md` whenever a change claims what is announced",
        reason:
          'A status message is composed around the checkbox rather than being part of the control, and whether it is announced is a real-AT claim no automated layer here can settle.',
      },
      'forced-colors': {
        owner: 'the binding component and the theme',
        verifiedBy:
          "the component's forced-colors suite over the compiled CSS, plus manual review under Windows High Contrast",
        reason:
          'Forced-colors output is a paint result; this contract observes semantics and behaviour, not paint.',
      },
      'reduced-motion': {
        owner: 'the binding component and the theme',
        verifiedBy:
          "review of each binding's transition declarations and the repository's visual/manual reduced-motion checks",
        reason:
          'Motion is a rendered result over time, and no layer this contract observes can watch it.',
      },
      'at-facing-strings': {
        owner: 'the binding component',
        verifiedBy:
          'the repository i18n catalog check and review of the strings a component renders for assistive technology',
        reason:
          'Translation is a source-level concern: the rendered result this contract observes looks the same whichever language the string is in, so a lint-layer check is the only one that can see an untranslated string.',
      },
    },
  });
