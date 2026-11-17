// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.a11y.states.ts
 * @input Tooltip's and useTooltip's representative states and the facts TOOLTIP_PATTERN reads
 * @output TOOLTIP_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test and the Chromium spec (Tooltip and useTooltip under spec:AST-020 FR15)
 */

import type {TooltipStateFacts} from '@astryxdesign/a11y-spec';

/**
 * How the caller attaches the tooltip: wrapping an element, wrapping plain
 * text, pointing `anchorRef` at its own element, or calling `useTooltip`.
 */
export type TooltipAttachment =
  'wrapped-element' | 'text' | 'anchor-ref' | 'hook';

export interface TooltipBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  readonly attachment: TooltipAttachment;
  /**
   * The trigger's visible text. A `button` trigger is also named by it; a
   * text trigger has no role, so the lanes find it by this text.
   */
  readonly triggerText: string;
  readonly triggerRole: 'button' | null;
  /** The tooltip `content`. */
  readonly content: string;
  /** A visible hint the trigger is already described by, besides the tooltip. */
  readonly hint?: string;
  readonly facts: TooltipStateFacts;
}

const story = (id: string) => `a11y-tooltip--${id}`;

/** Tooltip's and useTooltip's default hover delay. */
const DEFAULT_DELAY: TooltipStateFacts = {showsOnHover: true, showDelayMs: 200};

export const TOOLTIP_BINDING_STATES = [
  {
    id: 'wrapped-button',
    summary:
      'a Tooltip wrapping a Button, which attaches to the Button and describes it',
    storyId: story('wrapped-button'),
    attachment: 'wrapped-element',
    triggerText: 'Save',
    triggerRole: 'button',
    content: 'Saves your changes to this draft',
    facts: DEFAULT_DELAY,
  },
  {
    id: 'text-trigger',
    summary:
      'a Tooltip wrapping plain text, which renders its own focusable inline trigger',
    storyId: story('text-trigger'),
    attachment: 'text',
    triggerText: 'Draft',
    triggerRole: null,
    content: 'Only you can see a draft',
    facts: DEFAULT_DELAY,
  },
  {
    id: 'anchor-ref-with-hint',
    summary:
      'a Tooltip attached through anchorRef to a caller button that is already described by a visible hint, so the trigger is described by both',
    storyId: story('anchor-ref-with-hint'),
    attachment: 'anchor-ref',
    triggerText: 'Publish',
    triggerRole: 'button',
    content: 'Makes this page visible to everyone',
    hint: 'Last published yesterday',
    facts: DEFAULT_DELAY,
  },
  {
    id: 'use-tooltip-hook',
    summary:
      "useTooltip on a caller button, which spreads the hook's ref and describedBy onto it and renders the tooltip",
    storyId: story('use-tooltip-hook'),
    attachment: 'hook',
    triggerText: 'Archive',
    triggerRole: 'button',
    content: 'Moves this page out of the list',
    facts: DEFAULT_DELAY,
  },
] as const satisfies ReadonlyArray<TooltipBindingState>;

export const TOOLTIP_EXCLUSIONS = [
  {
    id: 'focus-trigger',
    owner:
      "the 24 core hosts that pass focusTrigger 'always' — the disabledMessage tooltips on the field and choice controls (TextInput, TextArea, NumberInput, Switch, CheckboxInput, CheckboxList, RadioList, Selector, MultiSelector, SegmentedControl, Slider, Typeahead, Tokenizer, FileInput, and the date and time inputs), the Slider value bubble and ProgressBar marks — each through its own suite (for example TextInput.test.tsx 'shows the reason tooltip on keyboard focus'); and any caller that passes 'never'",
    reason:
      "'always' attaches the focus listeners to a wrapper that is not itself focusable, so focusin bubbling from the control inside it shows the hint; the described element and the focused element differ, which this contract's trigger-centred rows do not model, so each host proves its own keyboard path. 'never' detaches focus showing for a trigger inside a composite widget that moves focus itself, which then owns how a keyboard user reaches the hint; no shipped composition uses it. Every state here uses the default 'auto'.",
  },
  {
    id: 'touch-trigger',
    owner:
      'useTooltip.test.tsx and Tooltip.test.tsx (touchTrigger suites) through the shared useTouchTrigger hook, and TouchTrigger.a11y.chromium.spec.ts for real touch input',
    reason:
      'On a touch pointer there is no hover, so a tap opens the tooltip or leaves it to the control the tap operates; the APG defines no touch behaviour, and this contract drives a mouse and a keyboard only, so the touch outcomes have their own real-touch Chromium proof.',
  },
  {
    id: 'controlled-and-disabled',
    owner:
      'Tooltip.test.tsx and useTooltip.test.tsx (isOpen, isDefaultOpen and isEnabled suites)',
    reason:
      'A controlled tooltip answers Escape by reporting instead of hiding, and a disabled one never shows; both hand visibility to the caller, so the hover and focus outcomes this contract reads belong to the uncontrolled, enabled tooltip every state renders.',
  },
  {
    id: 'interactive-hover-content',
    owner: 'the HoverCard binding and the overlay-dismissal family',
    reason:
      'Hover content a user can interact with is a non-modal dialog, not a tooltip, so HoverCard and other interactive popovers are reviewed separately; no state here places a focusable control inside a tooltip.',
  },
  {
    id: 'host-compositions',
    owner:
      "the composing components' own contracts (Button for the IconButton label tooltip, the input status binding for useInputStatusIcon, which renders the on-field status tooltip) and their tests",
    reason:
      'IconButton, useInputStatusIcon and Lab InfoTip render Tooltip or useTooltip for their own purposes; this binding proves the tooltip they render, and what each host adds around it is that host.',
  },
  {
    id: 'placement-and-paint',
    owner:
      'Tooltip.test.tsx (placement and alignment), the layer runtime anchor tests, and the repository visual gate',
    reason:
      'Placement, alignment, the inverted surface and the hover underline on a text trigger are layout and paint; they change no role, description, focus or dismissal outcome, so every state uses the default placement.',
  },
] as const;
