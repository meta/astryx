// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file link.ts
 * @input Uses ../contract (definePattern and the expectation vocabulary) and
 *   ../spoken
 * @output LINK_PATTERN, LinkCurrentToken, and LinkStateFacts
 * @position Reusable semantic contract for one available navigation link: its
 *   role, its name, its current-item state, and how a keyboard and a pointer
 *   follow it — whichever element or router component renders it.
 *
 * Every gate is a WCAG 2.2 A or AA outcome. The APG Link pattern is cited as
 * the source of the exact role and Enter mechanics those outcomes rest on; no
 * APG-only detail gates here.
 *
 * Which destinations are safe to follow is not an accessibility outcome and
 * stays with `family:navigation-destinations`; this contract follows only
 * destinations the binding has already accepted. Disabled links are not bound:
 * that family's FR7 leaves disabled semantics with each member.
 *
 * SYNC: When an expectation changes, update
 * - /internal/a11y-spec/README.md
 * - /packages/core/src/Link/__tests__/Link.a11y.test.tsx (the jsdom binding)
 * - /packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts (Chromium)
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';
import {saysInOrder, spokenWords} from '../spoken';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/link/';
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
const WCAG_2_1_1 = wcag('2.1.1', 'Keyboard', 'A', 'keyboard');
const WCAG_2_1_2 = wcag('2.1.2', 'No Keyboard Trap', 'A', 'no-keyboard-trap');
const WCAG_2_4_4 = wcag(
  '2.4.4',
  'Link Purpose (In Context)',
  'A',
  'link-purpose-in-context',
);
const WCAG_2_5_2 = wcag(
  '2.5.2',
  'Pointer Cancellation',
  'A',
  'pointer-cancellation',
);
const WCAG_2_5_3 = wcag('2.5.3', 'Label in Name', 'A', 'label-in-name');
const WCAG_4_1_2 = wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value');

const APG_ROLE: ApgRequirement = {
  standard: 'apg',
  pattern: 'link',
  requirement:
    'The element containing the link text or graphic has a role of link.',
  url: `${APG_URL}#wai-ariaroles,states,andproperties`,
};
const APG_ENTER: ApgRequirement = {
  standard: 'apg',
  pattern: 'link',
  requirement: 'Enter: Executes the link and moves focus to the link target.',
  url: `${APG_URL}#keyboardinteraction`,
};

/** The `aria-current` tokens that mark a link as the current item in a set. */
export type LinkCurrentToken =
  'page' | 'step' | 'location' | 'date' | 'time' | 'true';

export interface LinkStateFacts {
  /** The accessible name the binding declares the link computes. */
  readonly name: string;
  /**
   * The current-item token the binding declares, or null when the link is not
   * the current item of any set it belongs to.
   */
  readonly current: LinkCurrentToken | null;
}

/** Applies to every bound state; every bound state is an available link. */
const ALWAYS = {
  condition: 'the binding renders an available link',
  test: () => true,
};

/**
 * How many Tab presses count as "reachable". Ten is generous for one link on a
 * fixture page and short enough that an unreachable link fails fast.
 */
const TAB_BUDGET = 10;

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function describeNavigations(count: number): string {
  return count === 1 ? 'one navigation' : `${count} navigations`;
}

export const LINK_PATTERN: PatternContract<LinkStateFacts> =
  definePattern<LinkStateFacts>({
    pattern: 'link',
    url: APG_URL,
    scope:
      'One available navigation link: reported as a link with the name its binding declares, marked current only when it is, reachable by Tab, and followed exactly once by Enter or a completed pointer press — whether a native anchor or a router component renders it.',
    expectations: [
      {
        id: 'link.role.exposed',
        outcome:
          'It is announced as a link, so people know activating it takes them somewhere rather than doing something here.',
        sources: [WCAG_4_1_2, APG_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'link') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this link, so assistive technology cannot announce it'
                : role === 'button'
                  ? 'the browser reports this destination as a button, so it promises an action here while it takes people somewhere else'
                  : `the browser reports this destination as "${role}", not as a link`,
            );
          }
        },
      },
      {
        id: 'link.name.exposed',
        outcome:
          'The link computes exactly the name its binding declares, so people can tell where it goes from the link itself or its context.',
        sources: [WCAG_4_1_2, WCAG_2_4_4],
        covers: ['4.1.2-name-role-value', '2.4.4-link-purpose'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const name = normalized((await subject.computed()).name);
          if (name === '') {
            throw new Error(
              `the browser computes no accessible name, so the link is announced without saying where it goes; the binding declares "${facts.name}"`,
            );
          }
          if (name !== normalized(facts.name)) {
            throw new Error(
              `the link should be named "${facts.name}", but the browser computes "${name}"`,
            );
          }
        },
      },
      {
        id: 'link.name.matches-visible-label',
        outcome:
          'The accessible name contains the words people can read on the link, so someone using speech input can say what they see.',
        sources: [WCAG_2_5_3],
        covers: ['2.5.3-label-in-name'],
        // Both sides are read off the rendered page, so a binding cannot
        // switch the criterion off by describing itself.
        appliesWhen: ALWAYS,
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            return notApplicable(
              'this state renders no words where a person can read them, so there is no visible label for a speech-input user to say',
            );
          }
          const {name} = await subject.computed();
          if (!saysInOrder(spokenWords(name), spokenWords(visible))) {
            throw new Error(
              `the link reads "${visible}" but the browser computes the accessible name as "${name}", so speaking the visible words does not reach it`,
            );
          }
        },
      },
      {
        id: 'link.focus.reachable-and-escapable',
        outcome:
          'Tab reaches the link, and Tab again leaves it, so a keyboard user can get to the destination and carry on past it.',
        sources: [WCAG_2_1_1, WCAG_2_1_2],
        covers: ['2.1.1-keyboard', '2.1.2-no-keyboard-trap'],
        appliesWhen: ALWAYS,
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
              `${TAB_BUDGET} presses of Tab from the start of the document never reached the link, so a keyboard user cannot get to this destination`,
            );
          }
          await harness.press('Tab');
          if (await subject.isFocused()) {
            throw new Error(
              'Tab did not move focus off the link, so a keyboard user is stuck on it',
            );
          }
        },
      },
      {
        id: 'link.navigation.runs-on-enter',
        outcome:
          'With focus on the link, Enter follows it exactly once — the keyboard reaches the same destination the pointer does.',
        sources: [WCAG_2_1_1, APG_ENTER],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, activations}) => {
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the link did not take focus, so Enter never reaches it',
            );
          }
          const before = await activations();
          await harness.press('Enter');
          const followed = (await activations()) - before;
          if (followed === 0) {
            throw new Error(
              'pressing Enter on the focused link requested no navigation, so its destination is out of reach from the keyboard',
            );
          }
          if (followed > 1) {
            throw new Error(
              `one press of Enter requested ${describeNavigations(followed)}, so the keyboard does not land where the link says it goes`,
            );
          }
        },
      },
      {
        id: 'link.navigation.completes-on-release',
        outcome:
          'A press slid off the link and released elsewhere goes nowhere, and a press released on the link follows it once, so a misplaced press can be taken back.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, activations}) => {
          const before = await activations();
          await harness.abortedPress(subject);
          const aborted = (await activations()) - before;
          if (aborted !== 0) {
            throw new Error(
              `pressing the link and releasing away from it still requested ${describeNavigations(aborted)}: navigation starts on the way down, so a press cannot be taken back`,
            );
          }
          await harness.click(subject);
          const completed = (await activations()) - before;
          if (completed !== 1) {
            throw new Error(
              completed === 0
                ? 'a press released on the link requested no navigation, so the up-event never completes the link'
                : `a press released on the link requested ${describeNavigations(completed)}, not one`,
            );
          }
        },
      },
      {
        id: 'link.current.exposed',
        outcome:
          'A link marked as the current item says so programmatically, and a link that is not current never claims to be.',
        sources: [WCAG_1_3_1, WCAG_4_1_2],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: ALWAYS,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const authored = await subject.attribute('aria-current');
          const current =
            authored == null || authored === 'false' ? null : authored;
          if (current === facts.current) {
            return;
          }
          if (facts.current == null) {
            throw new Error(
              `the link is not the current item, but it carries aria-current="${authored}", so it tells people they are already there`,
            );
          }
          throw new Error(
            current == null
              ? `the link is the current ${facts.current}, but it carries no aria-current, so only sighted people can tell`
              : `the link is the current ${facts.current}, but it carries aria-current="${authored}"`,
          );
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'The binding component and caller content',
        verifiedBy:
          'Component tests that hide decorative icons, plus the repository axe audit',
        reason:
          'Whether a glyph inside a link is decorative or informative is a composition fact. This contract proves only that the link’s computed name carries its purpose.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'The composing navigation, list, or prose',
        verifiedBy:
          'Breadcrumb and navigation-aggregate contracts plus content review',
        reason:
          'This contract encodes the link’s own current-item state. Lists, landmarks, and grouping around links belong to the components that compose them.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'The composing component and page',
        verifiedBy: 'Component DOM-order tests and reading-order review',
        reason:
          'Where a link sits in reading order is composition, not link semantics.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'Form controls',
        verifiedBy: 'Text-input contract bindings',
        reason: 'A link collects no information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'The binding and the active theme',
        verifiedBy:
          'Rendered review of inline-link underline and hover treatment and the repository visual gate',
        reason:
          'Whether an inline link is distinguishable from surrounding text without color is a paint outcome.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'The binding and the active theme',
        verifiedBy: 'Rendered contrast audit',
        reason: 'Link text contrast depends on resolved colors and backdrop.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'The binding and the active theme',
        verifiedBy: 'Rendered focus-indicator and icon contrast review',
        reason: 'Icon and focus-ring contrast are paint outcomes.',
      },
      '2.4.2-page-titled': {
        owner: 'The page',
        verifiedBy: 'Page-level title review',
        reason: 'A link does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'The composing component and page',
        verifiedBy: 'Real-browser keyboard-order review',
        reason:
          'Sequential order among several links depends on composition; this contract proves one link joins and leaves the tab sequence.',
      },
      '2.4.4-link-purpose': {
        owner: 'Caller-provided link text and labels',
        verifiedBy: 'Content review of link wording in context',
        reason:
          'This contract proves the link computes its declared name, not that the caller’s words describe the destination.',
        coversRemainderOnly: true,
      },
      '2.4.6-headings-and-labels': {
        owner: 'Caller-provided link text and labels',
        verifiedBy: 'Content review',
        reason: 'Whether a label describes its purpose is a wording judgement.',
      },
      '2.4.7-focus-visible': {
        owner: 'The binding and the active theme',
        verifiedBy: 'Rendered keyboard-focus review and visual regression',
        reason: 'A visible focus indicator is a paint outcome.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'The composing page and the overlay system',
        verifiedBy: 'Constrained-viewport and sticky-region browser review',
        reason:
          'Whether author content hides a focused link depends on layout around it.',
      },
      '2.5.8-target-size': {
        owner: 'The binding and the composing layout',
        verifiedBy:
          'Rendered target geometry review; inline links in sentences use the inline exception',
        reason: 'Target size is geometry, not link semantics.',
      },
      '3.1.1-language-of-page': {
        owner: 'The page and localization provider',
        verifiedBy: 'Document-language checks',
        reason: 'A link does not own the document language.',
      },
      '3.2.2-on-input': {
        owner: 'Form controls',
        verifiedBy: 'Role-specific interaction tests',
        reason:
          'A link has no input value; following it is the activation the user asked for.',
      },
      '3.2.4-consistent-identification': {
        owner: 'The design system and caller content',
        verifiedBy: 'Cross-page review of repeated link names',
        reason:
          'Consistent naming of the same destination is a property of repeated pages.',
      },
      '3.3.1-error-identification': {
        owner: 'The composing form',
        verifiedBy: 'Form-level error review',
        reason: 'A link defines no validation error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'Form controls',
        verifiedBy: 'Form-level label review',
        reason: 'A link is not a form input.',
      },
      '4.1.3-status-messages': {
        owner: 'The destination and the status-message pattern',
        verifiedBy:
          'Status-message tests and AST-009 when spoken timing is claimed',
        reason: 'Following a link is navigation, not a status message.',
      },
      'apg-interaction': {
        owner: 'The browser and each binding’s current authority',
        verifiedBy:
          'Real-browser focus review at the destination; AST-009 for spoken claims',
        reason:
          'The contract gates the APG role and Enter mechanics through WCAG 2.2 4.1.2 and 2.1.1. Where focus lands after a same-document destination and the optional Shift + F10 context menu belong to the browser, not the link.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'The binding and the active theme',
        verifiedBy: 'Rendered forced-colors review',
        reason: 'Semantic exposure does not prove forced-colors paint.',
      },
      'reduced-motion': {
        owner: 'The binding',
        verifiedBy: 'Component motion tests and rendered review',
        reason: 'Link semantics add no motion of their own.',
      },
      'at-facing-strings': {
        owner: 'The binding’s localization and caller-provided labels',
        verifiedBy:
          'Catalog checks and localized component tests; AST-009 for speech claims',
        reason:
          'The contract verifies a deterministic computed name, including any new-tab suffix the binding declares, without claiming spoken wording, order, or timing.',
      },
    },
  });
