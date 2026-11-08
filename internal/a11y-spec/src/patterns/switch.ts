// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file switch.ts
 * @input Uses ../contract (definePattern and the expectation vocabulary)
 * @output SWITCH_PATTERN — the adopted WAI-ARIA APG "switch" pattern as a
 *   reusable contract — and SwitchStateFacts, what a binding declares each of
 *   its states is supposed to be.
 * @position The first authored pattern. Every later pattern is modelled on it.
 *
 * Adopted pattern: https://www.w3.org/WAI/ARIA/apg/patterns/switch/
 *
 * What this contract owns is the part of "is it a switch" that is the same for
 * every component that adopts the pattern: the control is reported as a switch,
 * it is named, its on/off state is exposed and matches what is rendered, the
 * user can turn it on and back off with pointer and keyboard, focus can reach
 * it and leave it, and a switch that cannot be operated says so. Everything
 * that varies per component — callbacks, form participation, tooltip
 * composition, styling — stays with the component (`docs/specs/AST-021/spec.md`
 * FR5).
 *
 * SYNC: When an expectation changes, update
 * - /internal/a11y-spec/README.md
 * - /packages/core/src/Switch/__tests__/Switch.a11y.test.tsx (the jsdom binding)
 * - /packages/core/src/Switch/__tests__/Switch.a11y.chromium.spec.ts (the Chromium binding)
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import {saysInOrder, spokenWords} from '../spoken';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/switch/';
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
  pattern: 'switch',
  requirement: 'The switch has role switch.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'switch',
  requirement:
    'The switch has an accessible label provided by visible text content, aria-labelledby, or aria-label.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_STATE: ApgRequirement = {
  standard: 'apg',
  pattern: 'switch',
  requirement:
    'When on, the switch has state aria-checked set to true; when off, false. An HTML input[type="checkbox"] uses the HTML checked attribute instead.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_DESCRIBEDBY: ApgRequirement = {
  standard: 'apg',
  pattern: 'switch',
  requirement:
    'If the presentation includes additional descriptive static text relevant to a switch, the switch has aria-describedby set to the id of the element containing the description.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_STABLE_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'switch',
  requirement:
    'It is critical the label on a switch does not change when its state changes.',
  url: `${APG_URL}#aboutthispattern`,
};
const APG_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'switch',
  requirement: 'Space: when focus is on the switch, changes its state.',
  url: `${APG_URL}#keyboardinteraction`,
};

/**
 * How many Tab presses count as "reachable". Ten is generous for one control
 * on a fixture page and short enough that an unreachable switch fails fast
 * instead of hanging the run.
 */
const TAB_BUDGET = 10;

/**
 * An interaction expectation's claim is a real-browser one — pressing this
 * turns it on — but the answer is read out of the accessibility tree, so it
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
export interface SwitchStateFacts {
  /** Whether this state renders as on. */
  readonly checked: boolean;
  /** Whether the user is meant to be able to change it. */
  readonly operable: boolean;
  /** Whether it is meant to be reachable in the tab sequence. */
  readonly focusable: boolean;
  /** Whether it is meant to be exposed as unavailable. */
  readonly disabled: boolean;
  /** Whether supporting text is meant to be attached as a description. */
  readonly described: boolean;
  /** Whether it is meant to be exposed as required. */
  readonly required: boolean;
  /** Whether it is meant to be exposed as being in error. */
  readonly invalid: boolean;
}

function onOff(checked: 'true' | 'false' | 'mixed' | null): string {
  switch (checked) {
    case 'true':
      return 'on';
    case 'false':
      return 'off';
    case 'mixed':
      return 'partly on';
    default:
      return 'neither on nor off';
  }
}

function collapse(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Turn the switch and turn it back, checking the exposed state after each move.
 * Half a round trip is not the outcome: a control that turns on and cannot turn
 * off has failed the person using it just as completely as one that never
 * turned on (AST-020 FR8).
 */
async function roundTrip(
  start: boolean,
  activate: () => Promise<void>,
  read: () => Promise<'true' | 'false' | 'mixed' | null>,
  how: string,
): Promise<void> {
  const from = start ? 'true' : 'false';
  const to = start ? 'false' : 'true';
  await activate();
  const after = await read();
  // The opposite value, not merely a different one: a switch that answers a
  // press by reporting `mixed`, or by dropping its state entirely, has not
  // been turned anywhere the user asked for.
  if (after !== to) {
    throw new Error(
      `${how} left the switch ${onOff(after)}: it cannot be turned ${start ? 'off' : 'on'}`,
    );
  }
  await activate();
  const back = await read();
  if (back !== from) {
    throw new Error(
      `${how} turned the switch ${onOff(after)}, but doing it again left it ${onOff(back)} instead of returning it to ${onOff(from)}: the change only goes one way`,
    );
  }
}

export const SWITCH_PATTERN: PatternContract<SwitchStateFacts> =
  definePattern<SwitchStateFacts>({
    pattern: 'switch',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/switch/',
    scope:
      'One binary control that is reported as a switch, named, state-exposed, and operable by pointer and keyboard in both directions.',

    expectations: [
      {
        id: 'switch.role.exposed',
        outcome:
          'Assistive technology reports the control as a switch, so the user hears "on" and "off" rather than "checked" or nothing at all.',
        sources: [WCAG_4_1_2, APG_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'switch') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this control — it is not in the accessibility tree at all, so assistive technology cannot announce it'
                : `the browser reports this control as "${role}", not as a switch`,
            );
          }
        },
      },
      {
        id: 'switch.name.exposed',
        outcome:
          'The switch has an accessible name, so the user knows which setting they are turning on or off.',
        sources: [WCAG_4_1_2, WCAG_3_3_2, APG_LABEL],
        covers: ['4.1.2-name-role-value', '3.3.2-labels-or-instructions'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this switch, so it is announced as an unlabelled control',
            );
          }
        },
      },
      {
        id: 'switch.name.matches-visible-label',
        outcome:
          'The accessible name contains the visible label, so someone using speech input can say what they can read.',
        sources: [WCAG_2_5_3, APG_LABEL],
        covers: ['2.5.3-label-in-name'],
        // Applies to every state, and reads BOTH sides off the rendered page.
        // Nothing here consults the binding: a criterion a binding could switch
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
        id: 'switch.state.exposed',
        outcome:
          'The on/off state is exposed and matches what is rendered, so what the user hears is what they see.',
        sources: [WCAG_4_1_2, APG_STATE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const {checked} = await subject.computed();
          if (checked == null) {
            throw new Error(
              'the browser exposes no on/off state for this switch, so assistive technology cannot say whether the setting is on',
            );
          }
          const expected = facts.checked ? 'true' : 'false';
          if (checked !== expected) {
            throw new Error(
              `this state renders ${onOff(expected)} but the browser reports it as ${onOff(checked)}`,
            );
          }
        },
      },
      {
        id: 'switch.description.resolvable',
        outcome:
          'Every piece of supporting text the switch points at exists, so none of the explanation is silently dropped.',
        sources: [WCAG_1_3_1, APG_DESCRIBEDBY],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding renders supporting text for this state',
          test: facts => facts.described,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject}) => {
          const attribute = await subject.attribute('aria-describedby');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'the binding renders supporting text for this state, but the switch has no aria-describedby, so the text is never attached to the control',
            );
          }
          const targets = await subject.idReferences('aria-describedby');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-describedby points at ${dangling.map(id => `"${id}"`).join(', ')}, which ${dangling.length === 1 ? 'resolves' : 'resolve'} to nothing; that description never reaches anyone`,
            );
          }
        },
      },
      {
        id: 'switch.description.exposed',
        outcome:
          'The supporting text reaches the user as the control’s description, not just as nearby markup.',
        sources: [WCAG_4_1_2, APG_DESCRIBEDBY],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding renders supporting text for this state',
          test: facts => facts.described,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {description} = await subject.computed();
          if (description.trim() === '') {
            throw new Error(
              'the binding renders supporting text for this state, but the browser computes no accessible description, so the explanation is never announced with the control',
            );
          }
        },
      },
      {
        id: 'switch.disabled.exposed',
        outcome:
          'A switch the binding marks unavailable is reported as unavailable, instead of looking available and doing nothing.',
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
              'the binding declares this state unavailable, but the browser reports the switch as available, so the user is invited to change something that will not change',
            );
          }
        },
      },
      {
        id: 'switch.required.declared',
        outcome:
          'A switch that has to be on declares it, so the obligation reaches assistive technology before the user submits.',
        sources: [WCAG_3_3_2, WCAG_4_1_2],
        covers: ['3.3.2-labels-or-instructions'],
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
              'this state is required, but the switch declares neither the native required attribute nor aria-required="true", so nothing tells assistive technology the setting must be on',
            );
          }
        },
      },
      {
        id: 'switch.invalid.exposed',
        outcome:
          'A switch in error is reported as being in error, so the user can find what needs fixing.',
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
              'this state is in error, but the browser does not report the switch as invalid, so the error is only visible to people who can see the message',
            );
          }
        },
      },
      {
        id: 'switch.state.pointer-round-trip',
        outcome:
          'A pointer turns the switch on and back off, and the exposed state follows both ways.',
        sources: [WCAG_4_1_2, APG_STATE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: {
          condition: 'the user is meant to be able to change this state',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_THE_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await roundTrip(
            facts.checked,
            () => harness.click(subject),
            async () => (await subject.computed()).checked,
            'clicking the switch',
          );
        },
      },
      {
        id: 'switch.state.space-round-trip',
        outcome:
          'With focus on the switch, Space turns it on and back off — the keyboard reaches the same function the pointer does.',
        sources: [WCAG_2_1_1, APG_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the user is meant to be able to change this state and to focus it',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_THE_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the switch did not take focus, so Space never reaches it',
            );
          }
          await roundTrip(
            facts.checked,
            () => harness.press('Space'),
            async () => (await subject.computed()).checked,
            'pressing Space on the focused switch',
          );
        },
      },
      {
        id: 'switch.name.stable-across-change',
        outcome:
          'The name stays the same when the switch is turned on and off, so it keeps identifying the setting instead of describing the next action.',
        sources: [APG_STABLE_LABEL, WCAG_4_1_2],
        wcagOutcome:
          'The name in 4.1.2 identifies which setting this is; a name that flips with the state describes an action instead, and a screen-reader user hears the new name announced together with the state it contradicts.',
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the user is meant to be able to change this state',
          test: facts => facts.operable,
        },
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        // The APG is emphatic about this ("it is critical"), but it is an APG
        // requirement with no WCAG success criterion behind it, and no current
        // Astryx record adopts label stability as a contract. Under AST-020 FR9
        // that makes it advisory: it reports, and the day a record adopts it,
        // this line and the enforcement change together.
        enforcement: 'advisory',
        advisoryBecause:
          'The requirement is APG-only. No WCAG 2.2 A/AA criterion states it, and no current Astryx record adopts it, so it reports rather than gating.',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).name;
          await harness.click(subject);
          const changed = (await subject.computed()).name;
          if (collapse(changed) !== collapse(before)) {
            throw new Error(
              `turning the switch on renamed it from "${before}" to "${changed}", so its name describes the action rather than the setting`,
            );
          }
          await harness.click(subject);
          const back = (await subject.computed()).name;
          if (collapse(back) !== collapse(before)) {
            throw new Error(
              `turning the switch back off renamed it from "${before}" to "${back}"`,
            );
          }
        },
      },
      {
        id: 'switch.state.survives-an-aborted-press',
        outcome:
          'A press the user slides off and releases elsewhere leaves the switch alone, so a misplaced touch can be taken back.',
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
              `pressing the switch and releasing away from it still turned it ${onOff(after)}: the change happens on the way down, so a press cannot be taken back`,
            );
          }
        },
      },
      {
        id: 'switch.state.keeps-focus-on-change',
        outcome:
          'Turning the switch on leaves focus on the switch, so a keyboard user is not thrown somewhere else mid-task.',
        sources: [WCAG_3_2_2],
        // Partly: see the 3.2.2 entry in `exemptions` for the half of the
        // criterion a component-level run cannot see.
        covers: ['3.2.2-on-input'],
        appliesWhen: {
          condition:
            'the user is meant to be able to change this state and to focus it',
          test: facts => facts.operable && facts.focusable,
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
              'the switch did not take focus, so this state cannot be changed from the keyboard at all',
            );
          }
          const before = (await subject.computed()).checked;
          await harness.press('Space');
          const after = (await subject.computed()).checked;
          if (after === before) {
            throw new Error(
              `pressing Space left the switch ${onOff(after)}, so nothing changed and this expectation has no change to judge`,
            );
          }
          if (!(await subject.isFocused())) {
            throw new Error(
              `changing the switch to ${onOff(after)} moved focus off it, so the user is somewhere else without having asked to be`,
            );
          }
        },
      },
      {
        id: 'switch.focus.reachable-and-escapable',
        outcome:
          'Tab reaches the switch, and Tab again leaves it, so a keyboard user can get to the setting and carry on past it.',
        sources: [WCAG_2_1_1, WCAG_2_1_2],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: {
          condition: 'this state is meant to be in the tab sequence',
          test: facts => facts.focusable,
        },
        evidenceLayer: 'real-browser',
        // No `alsoNeeds`: this one reads only where focus is, which is a real
        // browser's own answer.
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
              `${TAB_BUDGET} presses of Tab from the start of the document never reached the switch, so a keyboard user cannot get to this setting`,
            );
          }
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error(
              'Tab did not move focus off the switch, so a keyboard user is stuck on it',
            );
          }
        },
      },
      {
        id: 'switch.state.inoperable',
        outcome:
          'A switch the user is not meant to be able to change does not change when it is clicked or when Space is pressed on it.',
        sources: [WCAG_4_1_2, APG_STATE],
        covers: ['4.1.2-name-role-value'],
        // Not keyed on `disabled`: a switch can also be temporarily
        // unchangeable while it waits on the change it already started, and a
        // second press that slips through queues a change nobody asked for.
        appliesWhen: {
          condition: 'the user is not meant to be able to change this state',
          test: facts => !facts.operable,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: READS_THE_TREE,
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const before = (await subject.computed()).checked;
          await harness.click(subject, {ignoreAvailability: true});
          const afterClick = (await subject.computed()).checked;
          if (afterClick !== before) {
            throw new Error(
              `the user is not meant to be able to change this state, but clicking the switch turned it ${onOff(afterClick)}`,
            );
          }
          // A switch kept focusable while it cannot be changed — the usual way
          // to keep a reason or a pending state discoverable — still has to
          // refuse the keyboard.
          if (!facts.focusable) {
            return;
          }
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'this state is meant to stay focusable while it cannot be changed — so the reason or the pending state stays discoverable — but the switch did not take focus',
            );
          }
          await harness.press('Space');
          const afterSpace = (await subject.computed()).checked;
          if (afterSpace !== before) {
            throw new Error(
              `the user is not meant to be able to change this state, but pressing Space on the switch turned it ${onOff(afterSpace)}`,
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
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy:
          "the component's own suite (Switch hides its track and thumb from assistive technology and renders its busy state as text) and the repository axe audit, `pnpm a11y:audit`",
        reason:
          'The pattern owns one control node. Which decorative graphics a binding paints around that node, and whether each is hidden, is a per-component composition fact this contract never sees.',
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the composing page',
        verifiedBy: "the component's DOM-order tests and page-level review",
        reason:
          'A switch is a single control; the order it is read in relative to other content is decided by whatever composes it.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form and caller content',
        verifiedBy:
          'form integration review for any user-information input composed near this setting',
        reason:
          'A switch changes a setting and does not itself collect user information whose purpose can be identified by an autocomplete token.',
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
          'The track, thumb, and focus indicator are painted surfaces; their contrast is a rendered-colour measurement this contract cannot make.',
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
          'page-level review; this contract proves only that the switch is one reachable stop that focus can also leave',
        reason:
          'Order is a property of the sequence a page builds, not of a single focus stop.',
      },
      '2.4.4-link-purpose': {
        owner: 'caller content',
        verifiedBy: 'review of any link a caller places near the control',
        reason: 'The adopted switch pattern has no link part.',
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
          "A focus indicator is a painted result. Astryx switches draw theirs on the track when the switch's own input, the track's preceding sibling, matches `:focus-visible`, so proving it means comparing pixels, which is the visual layer.",
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
          "the repository axe audit's `target-size` rule, which applies WCAG 2.2's spacing exception across neighbouring targets",
        reason:
          'The exception that decides most real switches depends on the clearance between a target and its neighbours, which a binding rendered on its own cannot see.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy:
          'page-level review and the application that hosts the control',
        reason:
          'A component rendered in isolation owns no document language and cannot supply one.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system',
        verifiedBy:
          'this shared contract itself: every component that adopts the pattern binds to the same expectations, so repeated switches are identified the same way',
        reason:
          'Consistency is a property of the whole set of adopters, which one binding cannot demonstrate.',
      },
      '3.2.2-on-input': {
        owner: 'the caller, for its own onChange',
        verifiedBy:
          'integration and page-level review of what a caller does in response to the change',
        reason:
          "A change of context is a change of user agent, viewport, focus, or content that changes the page's meaning. The switch owns exactly one of those: whether activating it moves focus. If a caller's onChange navigates, reloads, or rewrites the page around the control, that is the caller's context change to warn about before the user reaches the switch, and no run of one component can observe it.",
        coversRemainderOnly: true,
      },
      '3.3.1-error-identification': {
        owner: 'the binding component',
        verifiedBy: "the component's own status-message tests",
        reason:
          'Not part-encoded, and deliberately so. 3.3.1 is satisfied in TEXT — "the error must be indicated in text" — and WCAG says the programmatic half "is not required for this success criterion, but may be covered by other criteria such as 4.1.2". switch.invalid.exposed is that 4.1.2 outcome, so it contributes nothing here. The text itself is composed around the switch rather than being part of the control.',
      },
      '4.1.3-status-messages': {
        owner:
          'the binding component, and the assistive-technology verification record for the announcement itself',
        verifiedBy:
          "the component's own live-region regression test, plus real-AT evidence under `docs/specs/AST-009/spec.md` whenever a change claims what is announced",
        reason:
          'A status message is composed around the switch rather than being part of the control, and whether it is announced is a real-AT claim no automated layer here can settle.',
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
          "the component's `prefers-reduced-motion` transition guard and the repository visual gate",
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
