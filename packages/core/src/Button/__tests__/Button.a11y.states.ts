// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.a11y.states.ts
 * @input Uses ButtonStateFacts from @astryxdesign/a11y-spec
 * @output BUTTON_BINDING_STATES — every state of every component that adopts the
 *   button pattern that can change what the pattern promises — and
 *   BUTTON_PATTERN_EXCLUSIONS, the parts deliberately left to another pattern.
 * @position The binding inventory required before any assertion moves
 *   (`docs/specs/AST-021/spec.md` FR2, FR4), and the single definition of what
 *   each state IS. Disabled ClickableCard remains focusable and inert under
 *   `docs/specs/AST-085-focusable-disabled/spec.md` FR1 and FR2.
 *
 * A state earns a row when it can change what the button pattern promises: a
 * different name source, a different operability, a different exposure of
 * unavailability, a different attached description. States that change only
 * appearance — variant, size, elevation, width, end content, theme — cannot, so
 * they stay in each component's own suite where that component owns them.
 *
 * This file is DATA ONLY — no JSX, no component imports. The Chromium lane runs
 * under Playwright's plain Node runtime, which does not apply the StyleX
 * transform, so importing a component here would break that lane before it
 * started. How each state is rendered lives beside it in
 * ./Button.a11y.renders.tsx, in a map TypeScript requires to be exhaustive: a
 * new row here is a compile error until it has a rendering.
 *
 * A row without a rendering is a compile error, so that half needs no
 * vigilance. The story export is the half that does.
 *
 * SYNC: Every row needs a named export in
 * - /apps/storybook/stories/ButtonA11y.stories.tsx
 *   Caught at run time, not compile time: the Chromium binding navigates to
 *   each row's `storyId`, so a missing or renamed export fails that lane.
 */

import type {ButtonStateFacts} from '@astryxdesign/a11y-spec';

/** The five components the queue binds to this pattern. */
export type ButtonBinding =
  | 'Button'
  | 'IconButton'
  | 'ClickableCard'
  | 'SideNavCollapseButton'
  | 'ChatSendButton';

/**
 * One row of the inventory, with its id kept as a literal. This — not the wider
 * `ButtonBindingState` interface — is what a lane should accept, so a row it is
 * handed can still index the render map.
 */
export type ButtonBindingRow = (typeof BUTTON_BINDING_STATES)[number];

/**
 * Every state id, as a union of the literals above. The render map is keyed by
 * this, so a row without a rendering — or a rendering for a state that does not
 * exist — is a compile error rather than something a test has to notice.
 */
export type ButtonStateId = (typeof BUTTON_BINDING_STATES)[number]['id'];

/** Every excluded part's id, for the same reason. */
export type ButtonExclusionId =
  (typeof BUTTON_PATTERN_EXCLUSIONS)[number]['id'];

export interface ButtonBindingState {
  /** Stable id, unique across bindings. Named by known-failure records. */
  readonly id: string;
  /** Which component this state belongs to. */
  readonly binding: ButtonBinding;
  /** What this state is, for the report and the test name. */
  readonly summary: string;
  /**
   * What the state is SUPPOSED to be. These select which expectations apply —
   * declaring a state unavailable or described turns those expectations on, and
   * they do not assert the negative when false.
   *
   * Intent, not observation, and the difference matters: a busy button is meant
   * to stay focusable, and two components do not deliver that. Recording what
   * those components actually do would make the expectations that catch it
   * not-applicable — a contract that quietly stops noticing a defect by
   * describing it. The gap is recorded in ./Button.a11y.known-failures.ts
   * instead, and the Chromium binding checks every fact against the page so a
   * declaration cannot drift from reality unnoticed.
   */
  readonly facts: ButtonStateFacts;
  /**
   * The label this state is expected to render where a person can read it, or
   * null when it renders none (an icon-only button).
   *
   * INVENTORY, not contract input. The shared 2.5.3 expectation reads the
   * rendered label itself and never consults this — otherwise a binding could
   * switch a criterion off by describing itself. This exists so the inventory
   * AST-021 FR2 asks for is checked against the page rather than trusted, and a
   * typo here is reported as a stale inventory, not as a standards failure.
   */
  readonly visibleLabel: string | null;
  /**
   * The surface that receives pointer input when it is not the role-bearing
   * element. ClickableCard keeps its button/link hidden for role, name, and
   * keyboard focus, and takes the pointer on the card surface; a binding that
   * aimed the pointer at the hidden control would be testing the wrong surface.
   */
  readonly pointerTargetSelector?: string;
  /** The checked-in Storybook story the Chromium lane drives. */
  readonly storyId: string;
  /**
   * Facts this state deliberately declares as intent that the component does
   * NOT deliver today, each with the known-failure record that owns the gap.
   *
   * The fact-truth check reads this: an unlisted mismatch is a stale inventory
   * and fails, a listed one is recorded debt. Listing something that is not
   * actually mismatched also fails, so this cannot be padded.
   */
  readonly declaredNotDelivered?: ReadonlyArray<{
    readonly fact: 'unavailable' | 'focusable' | 'described';
    /** The known-failure record that owns this gap, by expectation id. */
    readonly owned: string;
  }>;
}

const OPERABLE: ButtonStateFacts = {
  operable: true,
  focusable: true,
  unavailable: false,
  described: false,
};

function facts(overrides: Partial<ButtonStateFacts> = {}): ButtonStateFacts {
  return {...OPERABLE, ...overrides};
}

export const BUTTON_BINDING_STATES = [
  // ---- Button -------------------------------------------------------------
  {
    id: 'button-text',
    binding: 'Button',
    summary: 'the default: a button named by the text a person can read',
    facts: facts(),
    visibleLabel: 'Save changes',
    storyId: 'a11y-button-pattern--button-text',
  },
  {
    id: 'button-icon-only',
    binding: 'Button',
    summary:
      'an icon-only button, where the label is the accessible name and nothing else',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--button-icon-only',
  },
  {
    id: 'button-composed-label',
    binding: 'Button',
    summary:
      'children rendered as the visible content with a separate label as the accessible name — the composed case where the two can drift apart',
    facts: facts(),
    visibleLabel: 'Save changes',
    storyId: 'a11y-button-pattern--button-composed-label',
  },
  {
    id: 'button-disabled',
    binding: 'Button',
    summary: 'a hard-disabled button: unavailable, and out of the tab sequence',
    facts: facts({operable: false, focusable: false, unavailable: true}),
    visibleLabel: 'Save changes',
    storyId: 'a11y-button-pattern--button-disabled',
  },
  {
    id: 'button-disabled-with-tooltip',
    binding: 'Button',
    summary:
      'a disabled button kept focusable by its tooltip, so the reason it is unavailable stays reachable',
    facts: facts({operable: false, unavailable: true, described: true}),
    visibleLabel: 'Save changes',
    storyId: 'a11y-button-pattern--button-disabled-with-tooltip',
  },
  {
    id: 'button-loading',
    binding: 'Button',
    summary:
      'a button waiting on the action it started: the action is unavailable, and it is meant to stay focusable so the user can see that and interrupt it',
    facts: facts({operable: false, unavailable: true}),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--button-loading',
  },

  // ---- IconButton ---------------------------------------------------------
  {
    id: 'icon-button',
    binding: 'IconButton',
    summary: 'an icon-only button named by its label alone',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--icon-button-default',
  },
  {
    id: 'icon-button-disabled',
    binding: 'IconButton',
    summary: 'a disabled icon button',
    facts: facts({operable: false, focusable: false, unavailable: true}),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--icon-button-disabled',
  },
  {
    id: 'icon-button-loading',
    binding: 'IconButton',
    summary:
      'an icon button waiting on the action it started, meant to stay focusable for the same reason',
    facts: facts({operable: false, unavailable: true}),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--icon-button-loading',
  },

  // ---- ClickableCard ------------------------------------------------------
  {
    id: 'clickable-card',
    binding: 'ClickableCard',
    summary:
      "a card whose whole surface performs an action, through the hidden button that carries the card's role and name",
    facts: facts(),
    visibleLabel: null,
    pointerTargetSelector: '[data-a11y-pointer-target]',
    storyId: 'a11y-button-pattern--clickable-card-default',
  },
  {
    id: 'clickable-card-disabled',
    binding: 'ClickableCard',
    summary: 'a disabled action card: focusable, unavailable, and inert',
    facts: facts({operable: false, focusable: true, unavailable: true}),
    visibleLabel: null,
    pointerTargetSelector: '[data-a11y-pointer-target]',
    storyId: 'a11y-button-pattern--clickable-card-disabled',
  },

  // ---- SideNavCollapseButton ----------------------------------------------
  {
    id: 'sidenav-collapse-icon',
    binding: 'SideNavCollapseButton',
    summary:
      'the default collapse control: icon-only, named by the direction it will move the sidebar',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--sidenav-collapse-icon',
  },
  {
    id: 'sidenav-collapse-labelled',
    binding: 'SideNavCollapseButton',
    summary:
      'the collapse control given a label of its own, which reaches the accessible name only — the component hardcodes icon-only, so no visible text is rendered (see the adjacent-findings note in the PR)',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--sidenav-collapse-labelled',
  },

  // ---- ChatSendButton -----------------------------------------------------
  {
    id: 'chat-send',
    binding: 'ChatSendButton',
    summary: 'the composer send control, enabled and ready to send',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--chat-send',
  },
  {
    id: 'chat-send-disabled',
    binding: 'ChatSendButton',
    summary: 'the send control with nothing to send',
    facts: facts({operable: false, focusable: false, unavailable: true}),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--chat-send-disabled',
  },
  {
    id: 'chat-send-stop',
    binding: 'ChatSendButton',
    summary:
      'the same control turned into Stop while a response streams — a different action under a different name, and it must stay operable',
    facts: facts(),
    visibleLabel: null,
    storyId: 'a11y-button-pattern--chat-send-stop',
  },
  // `as const satisfies` rather than a `: ReadonlyArray<…>` annotation: the
  // annotation would widen every `id` to `string`, and ButtonStateId with it,
  // so the render map would silently accept a missing state and an invented
  // one alike. This keeps the literal ids AND still checks every row.
] as const satisfies ReadonlyArray<ButtonBindingState>;

/**
 * Parts that look like they belong to this pattern and deliberately do not,
 * with the reason and the pattern that owns each (AST-021 FR2 asks for the
 * inventory; an exclusion is part of the inventory, not an omission from it).
 *
 * The binding suites assert that each of these really does present the
 * semantics claimed here, so an exclusion cannot quietly become wrong.
 */
interface ButtonPatternExclusion {
  readonly id: string;
  readonly reason: string;
  readonly storyId: string;
  /** The role this part presents instead, checked by the binding suite. */
  readonly presentsRole: string;
}

export const BUTTON_PATTERN_EXCLUSIONS = [
  {
    id: 'button-as-link',
    reason:
      'A Button given `href` renders an anchor and navigates. The APG is explicit that the two functions are distinctly different, so the link pattern owns it — including its own name and purpose requirements.',
    storyId: 'a11y-button-pattern--button-as-link',
    presentsRole: 'link',
  },
  {
    id: 'clickable-card-as-link',
    reason:
      'A ClickableCard given `href` renders an anchor for the same reason.',
    storyId: 'a11y-button-pattern--clickable-card-as-link',
    presentsRole: 'link',
  },
] as const satisfies ReadonlyArray<ButtonPatternExclusion>;
