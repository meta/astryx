// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Collapsible.a11y.states.ts
 * @input Uses DisclosureStateFacts and CollapsibleProps as type-only contracts
 * @output COLLAPSIBLE_DISCLOSURE_STATES and explicit non-adoptions
 * @position Collapsible.trigger binding inventory shared by jsdom and Chromium.
 */

import type {DisclosureStateFacts} from '@astryxdesign/a11y-spec';
import type {CollapsibleProps} from '../Collapsible';

export interface CollapsibleDisclosureState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  readonly label: string;
  readonly facts: DisclosureStateFacts;
  readonly props: Omit<
    CollapsibleProps,
    'children' | 'trigger' | 'onOpenChange' | 'isOpen'
  >;
  readonly controlled?: boolean;
  readonly direction?: 'ltr' | 'rtl';
}

function facts(
  overrides: Partial<DisclosureStateFacts> = {},
): DisclosureStateFacts {
  return {
    expanded: true,
    controls: true,
    operable: true,
    focusable: true,
    ...overrides,
  };
}

export const COLLAPSIBLE_DISCLOSURE_STATES = [
  {
    id: 'uncontrolled-open-end-ltr',
    summary:
      'the default standalone Collapsible, open with its trailing chevron',
    storyId: 'a11y-collapsible-disclosure--uncontrolled-open-end-ltr',
    label: 'Account details',
    facts: facts(),
    props: {},
  },
  {
    id: 'uncontrolled-closed-start-rtl',
    summary:
      'a standalone Collapsible initially closed, with its leading chevron under RTL',
    storyId: 'a11y-collapsible-disclosure--uncontrolled-closed-start-rtl',
    label: 'Privacy details',
    facts: facts({expanded: false}),
    props: {defaultIsOpen: false, chevronPosition: 'start'},
    direction: 'rtl',
  },
  {
    id: 'controlled-open-end-ltr',
    summary:
      'a controlled standalone Collapsible whose owner starts it open and follows changes',
    storyId: 'a11y-collapsible-disclosure--controlled-open-end-ltr',
    label: 'Notification details',
    facts: facts(),
    props: {},
    controlled: true,
  },
  {
    id: 'controlled-closed-start-ltr',
    summary:
      'a controlled standalone Collapsible whose owner starts it closed and follows changes',
    storyId: 'a11y-collapsible-disclosure--controlled-closed-start-ltr',
    label: 'Security details',
    facts: facts({expanded: false}),
    props: {chevronPosition: 'start'},
    controlled: true,
  },
  {
    id: 'disabled-open-end-ltr',
    summary:
      'an unavailable standalone Collapsible that preserves its visible content',
    storyId: 'a11y-collapsible-disclosure--disabled-open-end-ltr',
    label: 'Archived details',
    facts: facts({operable: false, focusable: false}),
    props: {isDisabled: true},
  },
  {
    id: 'disabled-closed-start-rtl',
    summary:
      'an unavailable standalone Collapsible that preserves its hidden content under RTL',
    storyId: 'a11y-collapsible-disclosure--disabled-closed-start-rtl',
    label: 'Restricted details',
    facts: facts({expanded: false, operable: false, focusable: false}),
    props: {
      isDisabled: true,
      defaultIsOpen: false,
      chevronPosition: 'start',
    },
    direction: 'rtl',
  },
] as const satisfies ReadonlyArray<CollapsibleDisclosureState>;

export const COLLAPSIBLE_DISCLOSURE_EXCLUSIONS = [
  {
    id: 'collapsible-group-coordination',
    owner: 'CollapsibleGroup.test.tsx and useCollapsible.test.tsx',
    reason:
      'Single/multiple group coordination changes sibling state and callback payloads. This PR binds only the standalone Collapsible trigger; it does not adopt an Accordion or group pattern.',
  },
  {
    id: 'collapsible-button-semantics',
    owner: 'BUTTON_PATTERN and Collapsible.test.tsx',
    reason:
      'Role, accessible name, generic focus navigation, and unavailable-button semantics are button outcomes. The disclosure contract owns only expanded state, controlled content, and disclosure-specific transitions.',
  },
] as const;
