// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file button.ts
 * @input Uses ../contract (definePattern and the expectation vocabulary)
 * @output BUTTON_PATTERN — the adopted WAI-ARIA APG "button" pattern as a
 *   reusable contract — and ButtonStateFacts, what a binding declares each of
 *   its states is supposed to be.
 * @position The second authored pattern, modelled on ./switch.ts.
 *
 * Adopted pattern: https://www.w3.org/WAI/ARIA/apg/patterns/button/
 *
 * What this contract owns is the part of "is it a button" that is the same for
 * every component that adopts the pattern: the control is reported as a button
 * and not a link, it is named, its description reaches the user, a pointer runs
 * its action, BOTH Enter and Space run its action, a press slid off the control
 * is taken back, focus can reach it and leave it, and a button that cannot act
 * says so and stays inert.
 *
 * Two things the APG names are deliberately out of scope. A TOGGLE button
 * carries `aria-pressed` and has its own contract; this one covers the ordinary
 * command button. And an element that adopts LINK semantics — Astryx buttons
 * render an anchor when given `href` — is a link, so the APG's own note applies
 * ("the types of actions performed by buttons are distinctly different from the
 * function of a link") and the link pattern owns it.
 *
 * SYNC: When an expectation changes, update
 * - /internal/a11y-spec/README.md
 * - /packages/core/src/Button/__tests__/Button.a11y.test.tsx (the jsdom binding)
 * - /packages/core/src/Button/__tests__/Button.a11y.chromium.spec.ts (Chromium)
 */

import {
  definePattern,
  type ApgRequirement,
  type AstryxRecord,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import {saysInOrder, spokenWords} from '../spoken';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/button/';
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
const WCAG_2_5_3: WcagCriterion = {
  standard: 'wcag',
  id: '2.5.3',
  name: 'Label in Name',
  level: 'A',
  url: `${UNDERSTANDING}/label-in-name.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

/**
 * The buttons family record: `authority: current`, approved 2026-09-04.
 *
 * Pinned to the commit that wrote these clauses rather than to a branch. A
 * normative citation that follows `main` cites whatever the record later
 * becomes, and the whole point of quoting it is that the quote stays true.
 */
const FAMILY_BUTTONS =
  'https://github.com/meta/astryx/blob/cb13c1eaa89065cf7656a0d647be428447040d71/docs/families/buttons.md';

/**
 * The clause that adopts operability and keyboard activation.
 *
 * Reading it as adopting POINTER operability is an interpretation, and worth
 * naming as one: the clause never says "pointer". It attaches three properties
 * to the noun "an operable button" — keyboard activation, focus-visible
 * feedback, `type="button"` — which makes operability a property in its own
 * right rather than a synonym for the keyboard half, and the clause heading is
 * "Native action semantics are the default". A control that swallows a click
 * has no native action semantics. If the family owner reads it more narrowly,
 * the fix is one line here and the expectation becomes advisory.
 */
const FAMILY_BUTTONS_FR2: AstryxRecord = {
  standard: 'astryx',
  id: 'family:buttons',
  clause: 'FR2',
  requirement:
    'A momentary or persistent action renders an operable button with keyboard activation, focus-visible feedback, and `type="button"` unless the component\'s documented form mode says otherwise.',
  // The lines the quoted sentence spans. A line anchor cannot stop mid-line, so
  // the range also shows the start of the sentence that follows it; the
  // `requirement` above is the exact text this expectation rests on.
  url: `${FAMILY_BUTTONS}#L108-L111`,
};

/**
 * The clause that adopts inertness. Quoted as the MUST sentence alone: the
 * sentence after it is a MAY about focusable `aria-disabled`, and splicing the
 * two would quote a requirement the record does not make.
 */
const FAMILY_BUTTONS_FR3: AstryxRecord = {
  standard: 'astryx',
  id: 'family:buttons',
  clause: 'FR3',
  requirement: 'A disabled member MUST NOT invoke its callback or Action.',
  // The lines the MUST sentence spans. It ends mid-L114, so the range also
  // shows the start of the MAY that follows — which is a limit of line anchors,
  // not a widening of the citation: `requirement` above is the MUST alone.
  url: `${FAMILY_BUTTONS}#L113-L114`,
};

const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement: 'The button has role of button.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_LABEL: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement:
    'The button has an accessible label. By default, the accessible name is computed from any text content inside the button element. However, it can also be provided with aria-labelledby or aria-label.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_DESCRIBEDBY: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement:
    "If a description of the button's function is present, the button element has aria-describedby set to the ID of the element containing the description.",
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_UNAVAILABLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement:
    'When the action associated with a button is unavailable, the button has aria-disabled set to true.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_ENTER: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement: 'Enter: Activates the button.',
  url: `${APG_URL}#keyboardinteraction`,
};
const APG_SPACE: ApgRequirement = {
  standard: 'apg',
  pattern: 'button',
  requirement: 'Space: Activates the button.',
  url: `${APG_URL}#keyboardinteraction`,
};

/**
 * What a binding declares one of its states is supposed to be. The contract
 * asks the browser what it actually exposes and compares against this — so a
 * binding cannot pass by being consistently wrong, and an expectation knows
 * which states it applies to (AST-020 FR5, AST-021 FR4).
 */
export interface ButtonStateFacts {
  /** Whether pressing it is meant to run its action. */
  readonly operable: boolean;
  /** Whether it is meant to be reachable in the tab sequence. */
  readonly focusable: boolean;
  /** Whether its action is meant to be exposed as unavailable. */
  readonly unavailable: boolean;
  /** Whether supporting text is meant to be attached as a description. */
  readonly described: boolean;
}

/** Applies to every state; the outcome never stops mattering. */
const ALWAYS = {
  condition: 'the binding renders the pattern at all',
  test: () => true,
};

/**
 * How many Tab presses count as "reachable". Ten is generous for one control on
 * a fixture page and short enough that an unreachable button fails fast.
 */
const TAB_BUDGET = 10;

export const BUTTON_PATTERN: PatternContract<ButtonStateFacts> =
  definePattern<ButtonStateFacts>({
    pattern: 'button',
    url: APG_URL,
    scope:
      'One command control that is reported as a button, named, described, and runs its action from a pointer, Enter, and Space alike — or says it cannot.',

    expectations: [
      {
        id: 'button.role.exposed',
        outcome:
          'It is announced as a button, so the user knows it does something here rather than taking them somewhere else.',
        sources: [WCAG_4_1_2, APG_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'button') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this control — it is not in the accessibility tree at all, so assistive technology cannot announce it'
                : role === 'link'
                  ? 'the browser reports this control as a link, so it promises navigation while performing an action; the APG is explicit that the two are distinctly different'
                  : `the browser reports this control as "${role}", not as a button`,
            );
          }
        },
      },
      {
        id: 'button.name.exposed',
        outcome:
          'The button has an accessible name, so the user knows what pressing it will do.',
        sources: [WCAG_4_1_2, APG_LABEL],
        covers: ['4.1.2-name-role-value', '2.4.6-headings-and-labels'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this button, so it is announced as an unlabelled control and nothing says what it does',
            );
          }
        },
      },
      {
        id: 'button.name.matches-visible-label',
        outcome:
          'The accessible name contains the visible label, so someone using speech input can say what they can read.',
        sources: [WCAG_2_5_3, APG_LABEL],
        covers: ['2.5.3-label-in-name'],
        // Both sides are read off the rendered page: a criterion a binding could
        // switch off by describing itself would not be a criterion.
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            // An icon-only button presents no words, so there is nothing for a
            // speech user to say: 2.5.3 applies to "components with labels that
            // include text or images of text".
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
        id: 'button.description.resolvable',
        outcome:
          'Every piece of supporting text the button points at exists, so none of the explanation is silently dropped.',
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
              'the binding renders supporting text for this state, but the button has no aria-describedby, so the text is never attached to the control',
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
        id: 'button.description.exposed',
        outcome:
          "The supporting text reaches the user as the control's description, not just as nearby markup.",
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
        id: 'button.unavailable.exposed',
        outcome:
          'A button whose action is unavailable says so, instead of looking available and doing nothing.',
        sources: [WCAG_4_1_2, APG_UNAVAILABLE],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding declares this state unavailable',
          test: facts => facts.unavailable,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {disabled} = await subject.computed();
          if (!disabled) {
            throw new Error(
              'this state is declared unavailable, but the browser reports the button as available, so the user is invited to do something that will not happen',
            );
          }
        },
      },
      {
        id: 'button.action.runs-on-pointer',
        outcome: 'Clicking the button runs its action.',
        // Astryx-primary. FR2 requires "an operable button with keyboard
        // activation" — operability and keyboard activation as two properties,
        // not one — so a control that does nothing when clicked fails the
        // first of them. 4.1.2 is listed after because it governs how a control
        // is EXPOSED, not what it does, and leading with it would buy the gate
        // with a citation that does not carry the claim.
        sources: [FAMILY_BUTTONS_FR2, APG_ROLE, WCAG_4_1_2],
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'pressing this state is meant to run its action',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, activations}) => {
          const before = await activations();
          await harness.click(subject);
          const after = await activations();
          if (after === before) {
            throw new Error(
              'clicking the button ran nothing, so the control announces an action it does not perform',
            );
          }
        },
      },
      {
        id: 'button.action.runs-on-enter',
        outcome:
          'With focus on the button, Enter runs its action — the keyboard reaches the same function the pointer does.',
        sources: [WCAG_2_1_1, APG_ENTER],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'pressing this state is meant to run its action and it is meant to be focusable',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, activations}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the button did not take focus, so Enter never reaches it',
            );
          }
          const before = await activations();
          await harness.press('Enter');
          if ((await activations()) === before) {
            throw new Error(
              'pressing Enter on the focused button ran nothing, so this action is out of reach from the keyboard',
            );
          }
        },
      },
      {
        id: 'button.action.runs-on-space',
        outcome:
          'With focus on the button, Space runs its action too — the APG requires both keys, and a div-button usually forgets one.',
        sources: [WCAG_2_1_1, APG_SPACE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'pressing this state is meant to run its action and it is meant to be focusable',
          test: facts => facts.operable && facts.focusable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, activations}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the button did not take focus, so Space never reaches it',
            );
          }
          const before = await activations();
          await harness.press('Space');
          if ((await activations()) === before) {
            throw new Error(
              'pressing Space on the focused button ran nothing; the APG requires Enter AND Space, and a control that answers only one leaves half its keyboard users stuck',
            );
          }
        },
      },
      {
        id: 'button.action.survives-an-aborted-press',
        outcome:
          'A press the user slides off and releases elsewhere runs nothing, so a misplaced touch can be taken back.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'pressing this state is meant to run its action',
          test: facts => facts.operable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, activations}) => {
          const before = await activations();
          await harness.abortedPress(subject);
          if ((await activations()) !== before) {
            throw new Error(
              'pressing the button and releasing away from it still ran the action: it fires on the way down, so a press cannot be taken back',
            );
          }
        },
      },
      {
        id: 'button.focus.reachable-and-escapable',
        outcome:
          'Tab reaches the button, and Tab again leaves it, so a keyboard user can get to the action and carry on past it.',
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
              `${TAB_BUDGET} presses of Tab from the start of the document never reached the button, so a keyboard user cannot get to this action`,
            );
          }
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error(
              'Tab did not move focus off the button, so a keyboard user is stuck on it',
            );
          }
        },
      },
      {
        id: 'button.unavailable.inert',
        outcome:
          'A button reported as unavailable runs nothing when it is clicked — nor when Enter or Space is pressed on it, wherever it can still be focused.',
        // Astryx-primary. 4.1.2 requires unavailability to be EXPOSED — which
        // button.unavailable.exposed gates on — and says nothing about whether
        // the control then declines to act. What DOES require the behaviour is
        // a current Astryx record, so under AST-020 FR9 this gates on that.
        sources: [FAMILY_BUTTONS_FR3, APG_UNAVAILABLE, WCAG_4_1_2],
        covers: ['apg-interaction'],
        appliesWhen: {
          condition: 'the binding declares this state unavailable',
          test: facts => facts.unavailable,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, facts, activations}) => {
          const before = await activations();
          await harness.click(subject, {ignoreAvailability: true});
          if ((await activations()) !== before) {
            throw new Error(
              'the button is reported as unavailable, but clicking it ran the action anyway',
            );
          }
          // The keyboard half exists only for a state a keyboard can reach. A
          // natively disabled button is out of the tab sequence, so there is no
          // "press Enter on it" to prove, and claiming one would report an
          // observation nobody made.
          if (!facts.focusable) {
            return;
          }
          // Past here the binding has DECLARED this state focusable — the usual
          // way to keep the reason for unavailability discoverable. A state
          // that then cannot take focus has broken its own declaration, and
          // reporting a pass would hide that behind the very check meant to
          // catch it.
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'this state is declared focusable so its reason stays reachable, but it cannot take focus — so a keyboard user can neither read why it is unavailable nor reach it to confirm it refuses to act',
            );
          }
          for (const key of ['Enter', 'Space'] as const) {
            await harness.press(key);
            if ((await activations()) !== before) {
              throw new Error(
                `the button is reported as unavailable, but pressing ${key} on it ran the action anyway`,
              );
            }
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
          "the component's own suite (an icon-only button names itself with aria-label and hides its glyph) and the repository axe audit, `pnpm a11y:audit`",
        reason:
          'The pattern owns one control node. Which decorative graphics a binding paints inside it, and whether each is hidden, is a per-component composition fact this contract never sees.',
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the composing page',
        verifiedBy: "the component's DOM-order tests and page-level review",
        reason:
          'A button is a single control; the order it is read in relative to other content is decided by whatever composes it.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form and caller content',
        verifiedBy:
          'form integration review for any user-information input composed with this action',
        reason:
          'A button performs an action and does not itself collect user information whose purpose can be identified by an autocomplete token.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and the theme',
        verifiedBy:
          "the component's forced-colors suite and the repository visual gate",
        reason:
          'WCAG is explicit that exposure to assistive technology contributes nothing here: "even if information that is conveyed by color differences is appropriately conveyed to assistive technologies, it does not necessarily pass this criterion". It is entirely about what a sighted person who cannot distinguish two colours can see, which is a pixel fact no layer this contract observes can read.',
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
          "A button's boundary, its icon, and its focus indicator are painted surfaces; their contrast is a rendered-colour measurement this contract cannot make.",
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
          'page-level review; this contract proves only that the button is one reachable stop that focus can also leave',
        reason:
          'Order is a property of the sequence a page builds, not of a single focus stop.',
      },
      '2.4.4-link-purpose': {
        owner: 'the link pattern and caller content',
        verifiedBy:
          'review of any link a caller places near the control, and the link pattern for a button-styled element that adopts link semantics',
        reason:
          'This contract covers command buttons. An element rendered as a link — an Astryx button given `href` — adopts link semantics, and the APG is explicit that the two are distinctly different functions.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content and component review',
        verifiedBy:
          'review of the label text against the action it performs; button.name.exposed proves a name exists, not that "Save changes" beats "OK"',
        reason:
          'Whether a label describes its purpose is a judgement about wording that no runtime layer can make.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner:
          'the interaction-modality architecture record and the binding component',
        verifiedBy:
          "the repository visual gate and the component's own focus-ring styling",
        reason:
          'A focus indicator is a painted result, so proving it means comparing pixels, which is the visual layer.',
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
          'The exception that decides most real buttons depends on the clearance between a target and its neighbours, which a binding rendered on its own cannot see.',
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
          'this shared contract itself: every component that adopts the pattern binds to the same expectations, so repeated buttons are identified the same way',
        reason:
          'Consistency is a property of the whole set of adopters, which one binding cannot demonstrate.',
      },
      '3.2.2-on-input': {
        owner: 'the caller, for what its own handler does',
        verifiedBy:
          'integration and page-level review of what a caller does in response to the press',
        reason:
          'Not part-encoded, and deliberately so: 3.2.2 does not reach a button at all. It governs "changing the setting of any user interface component", and its Understanding text draws the line outright — "checking a checkbox, entering text into a text field, or changing the selected option in a list control changes its setting, but activating a link or a button does not". A button has no setting. What a CALLER does in response to a press can change the context, and that is the caller\'s to warn about.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'the composing form and caller content',
        verifiedBy: 'form-level review of the instructions around the control',
        reason:
          '3.3.2 is about labels and instructions "when content requires user input" — what a form tells someone about what to enter. A command button collects no input, and proving the control has a name is a different fact from a form saying what is expected.',
      },
      '3.3.1-error-identification': {
        owner: 'the binding component and the composing form',
        verifiedBy: "the component's own status-message tests and form review",
        reason:
          'A command button reports no validation state of its own. 3.3.1 is satisfied in text by whatever describes the error, which is composed around the button rather than being part of it.',
      },
      '4.1.3-status-messages': {
        owner:
          'the binding component, and the assistive-technology verification record for the announcement itself',
        verifiedBy:
          "the component's own live-region regression test, plus real-AT evidence under `docs/specs/AST-009/spec.md` whenever a change claims what is announced",
        reason:
          'A status message is composed around the button rather than being part of the control, and whether it is announced is a real-AT claim no automated layer here can settle.',
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
          "the component's `prefers-reduced-motion` guard and the repository visual gate",
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
