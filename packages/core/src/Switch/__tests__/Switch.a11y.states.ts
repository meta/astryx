// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Switch.a11y.states.ts
 * @input Uses SwitchStateFacts from @astryxdesign/a11y-spec and SwitchProps
 * @output SWITCH_BINDING_STATES — every Switch state that can change the shared
 *   switch-pattern outcome, what each declares itself to be, and how each is
 *   mounted in either lane.
 * @position The binding inventory required before any assertion moves
 *   (`docs/specs/AST-021/spec.md` FR2, FR4). Shared by the jsdom and Chromium
 *   bindings so both cover the same states and cannot drift apart.
 *
 * A state earns a row when it can change what the switch pattern promises: a
 * different exposed state, a different operability, a different name source, a
 * different attached description. States that change only appearance — size,
 * label position, label spacing, width, theme — cannot, so they stay in
 * Switch.test.tsx where the component owns them.
 *
 * SYNC: Every row's `storyId` must exist in
 * - /apps/storybook/stories/Switch.stories.tsx
 */

import type {SwitchStateFacts} from '@astryxdesign/a11y-spec';
import type {SwitchProps} from '../Switch';

/**
 * The label of the second control the ControlledUpdate story renders beside the
 * switch. Both lanes press it to reach `on-after-controlled-update`.
 *
 * SYNC: /apps/storybook/stories/Switch.stories.tsx — the ControlledUpdate story
 */
export const REMOTE_CONTROL_LABEL = 'Turn on remotely';

export interface SwitchBindingState {
  /** Stable state id. Named by known-failure records, so it does not churn. */
  readonly id: string;
  /** What this state is, for the report and the test name. */
  readonly summary: string;
  /**
   * What the state declares itself to be. `checked` is compared against what
   * the browser exposes, so a binding cannot pass by rendering on and reporting
   * off. The rest select which expectations apply to this state — declaring a
   * state described, disabled, required, or in error turns those expectations
   * on; it does not assert the negative when they are false.
   */
  readonly facts: SwitchStateFacts;
  /**
   * The label this state is expected to render where a person can read it, or
   * null when it renders none.
   *
   * INVENTORY, not contract input. The shared 2.5.3 expectation reads the
   * rendered label itself and never consults this — otherwise a binding could
   * switch a criterion off by describing itself. This exists so the inventory
   * AST-021 FR2 asks for is checked against the page rather than trusted, and a
   * typo here is reported as a stale inventory, not as a standards failure.
   */
  readonly visibleLabel: string | null;
  /**
   * The props the jsdom lane renders the switch with. `value` is always the
   * value it is FIRST rendered with — for a state the owner updates into, that
   * is the value before the update, and `facts.checked` is where the update
   * takes it.
   */
  readonly props: Omit<SwitchProps, 'onChange'>;
  /** The checked-in Storybook story the Chromium lane drives. */
  readonly storyId: string;
  /**
   * How this state comes to be, when it is not simply how the binding first
   * renders. `controlled-update` means the switch renders with `props.value`
   * and the owner then moves it to `facts.checked` through a second control —
   * nobody touched the switch — so both lanes press that control during mount
   * rather than asserting anything about it.
   */
  readonly arrivesBy?: 'controlled-update';
}

export const SWITCH_BINDING_STATES: ReadonlyArray<SwitchBindingState> = [
  {
    id: 'off',
    summary: 'the default: a labelled switch that is off and can be turned on',
    storyId: 'core-switch--default',
    visibleLabel: 'Enable notifications',
    props: {label: 'Enable notifications', value: false},
    facts: {
      checked: false,
      operable: true,
      focusable: true,
      disabled: false,
      described: false,
      required: false,
      invalid: false,
    },
  },
  {
    id: 'on',
    summary: 'a switch whose controlled value is already on',
    storyId: 'core-switch--on',
    visibleLabel: 'Notifications enabled',
    props: {label: 'Notifications enabled', value: true},
    facts: {
      checked: true,
      operable: true,
      focusable: true,
      disabled: false,
      described: false,
      required: false,
      invalid: false,
    },
  },
  {
    id: 'described',
    summary: 'a switch with supporting text under its label',
    storyId: 'core-switch--with-description',
    visibleLabel: 'Dark mode',
    props: {
      label: 'Dark mode',
      description: 'Switch to a darker color scheme for reduced eye strain.',
      value: false,
    },
    facts: {
      checked: false,
      operable: true,
      focusable: true,
      disabled: false,
      described: true,
      required: false,
      invalid: false,
    },
  },
  {
    id: 'label-hidden',
    summary:
      'a switch whose label is read by assistive technology but not rendered visibly',
    storyId: 'core-switch--with-hidden-label',
    visibleLabel: null,
    props: {label: 'Toggle row', isLabelHidden: true, value: false},
    facts: {
      checked: false,
      operable: true,
      focusable: true,
      disabled: false,
      // Nothing is rendered visibly, so WCAG 2.5.3 has nothing to compare against.
      described: false,
      required: false,
      invalid: false,
    },
  },
  {
    id: 'disabled',
    summary: 'a disabled switch that keeps its tab stop',
    storyId: 'core-switch--disabled',
    visibleLabel: 'Premium feature',
    props: {
      label: 'Premium feature',
      description: 'Upgrade to enable this option',
      isDisabled: true,
      value: false,
    },
    facts: {
      checked: false,
      operable: false,
      focusable: true,
      disabled: true,
      described: true,
      required: false,
      invalid: false,
    },
  },
  {
    id: 'focusable-disabled',
    summary:
      'a switch disabled with a reason: still focusable so the reason is discoverable, still not operable',
    storyId: 'core-switch--disabled-with-message',
    visibleLabel: 'Enable notifications',
    props: {
      label: 'Enable notifications',
      isDisabled: true,
      disabledMessage: 'Notifications are turned off org-wide',
      value: false,
    },
    facts: {
      checked: false,
      operable: false,
      focusable: true,
      disabled: true,
      described: true,
      required: false,
      invalid: false,
    },
  },
  {
    id: 'required',
    summary: 'a switch that has to be on before the form can be submitted',
    storyId: 'core-switch--required',
    visibleLabel: 'Accept terms and conditions',
    props: {
      label: 'Accept terms and conditions',
      isRequired: true,
      value: false,
    },
    facts: {
      checked: false,
      operable: true,
      focusable: true,
      disabled: false,
      described: false,
      required: true,
      invalid: false,
    },
  },
  {
    id: 'invalid',
    // Chromium also derives an invalid state from constraint validation on a
    // required-but-off checkbox, so this state proves that a switch in error is
    // reported as being in error — not that Switch's own error-status-to-
    // aria-invalid mapping is what does it. That mapping stays gated in
    // Switch.test.tsx.
    summary: 'a required switch reporting an error, with the message attached',
    storyId: 'core-switch--with-error-status',
    visibleLabel: 'Accept terms and conditions',
    props: {
      label: 'Accept terms and conditions',
      isRequired: true,
      status: {
        type: 'error',
        message: 'You must accept the terms to continue',
      },
      value: false,
    },
    facts: {
      checked: false,
      operable: true,
      focusable: true,
      disabled: false,
      described: true,
      required: true,
      invalid: true,
    },
  },
  {
    id: 'on-after-controlled-update',
    summary:
      'a switch the owner turned on through another control — the value changed, nobody touched the switch',
    storyId: 'core-switch--controlled-update',
    arrivesBy: 'controlled-update',
    visibleLabel: 'Sync photos',
    props: {label: 'Sync photos', value: false},
    facts: {
      checked: true,
      operable: true,
      focusable: true,
      disabled: false,
      described: false,
      required: false,
      invalid: false,
    },
  },
  {
    id: 'loading',
    summary:
      'a switch waiting on the change it started: focusable, busy, and not operable until it settles',
    storyId: 'core-switch--loading',
    visibleLabel: 'Sync photos',
    props: {label: 'Sync photos', isLoading: true, value: false},
    facts: {
      checked: false,
      operable: false,
      focusable: true,
      disabled: false,
      described: false,
      required: false,
      invalid: false,
    },
  },
];
