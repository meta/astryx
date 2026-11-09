// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CollapsibleGroup.a11y.states.ts
 * @input CollapsibleGroup's representative accordion states and the facts the ACCORDION_PATTERN contract reads
 * @output COLLAPSIBLE_GROUP_ACCORDION_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test and the Chromium spec (component:CollapsibleGroup AR4)
 */

import type {AccordionStateFacts} from '@astryxdesign/a11y-spec';

export interface CollapsibleGroupAccordionState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** The subject header's visible label. */
  readonly label: string;
  /** The header that follows the subject in the page Tab order, when one exists. */
  readonly nextLabel?: string;
  /** The other header that starts expanded in a single-expansion group, when one exists. */
  readonly openSiblingLabel?: string;
  readonly facts: AccordionStateFacts;
  readonly type: 'single' | 'multiple';
  /** Values open at mount. */
  readonly defaultValue: ReadonlyArray<string>;
  /** Items that are disabled at mount. */
  readonly disabled?: ReadonlyArray<string>;
}

const ITEMS = [
  {value: 'profile', label: 'Profile settings'},
  {value: 'privacy', label: 'Privacy settings'},
  {value: 'notifications', label: 'Notification settings'},
] as const;

export const COLLAPSIBLE_GROUP_ITEMS = ITEMS;

function facts(
  overrides: Partial<AccordionStateFacts> = {},
): AccordionStateFacts {
  return {
    expanded: false,
    operable: true,
    focusable: true,
    single: true,
    hasNextHeader: true,
    hasOpenSibling: true,
    ...overrides,
  };
}

const story = (id: string) => `a11y-collapsiblegroup-accordion--${id}`;

export const COLLAPSIBLE_GROUP_ACCORDION_STATES = [
  {
    id: 'single-collapsed-middle',
    summary:
      'the collapsed middle header of a single-expansion group whose first header is open',
    storyId: story('single-collapsed-middle'),
    label: 'Privacy settings',
    nextLabel: 'Notification settings',
    openSiblingLabel: 'Profile settings',
    facts: facts(),
    type: 'single',
    defaultValue: ['profile'],
  },
  {
    id: 'single-expanded-first',
    summary: 'the expanded first header of a single-expansion group',
    storyId: story('single-expanded-first'),
    label: 'Profile settings',
    nextLabel: 'Privacy settings',
    facts: facts({expanded: true, hasOpenSibling: false}),
    type: 'single',
    defaultValue: ['profile'],
  },
  {
    id: 'multiple-collapsed-last',
    summary:
      'the collapsed last header of a group that allows several open panels',
    storyId: story('multiple-collapsed-last'),
    label: 'Notification settings',
    facts: facts({
      single: false,
      hasNextHeader: false,
      hasOpenSibling: false,
    }),
    type: 'multiple',
    defaultValue: ['profile', 'privacy'],
  },
  {
    id: 'single-disabled-collapsed',
    summary:
      'a disabled collapsed header that stays named and exposed but leaves the Tab order and cannot be toggled',
    storyId: story('single-disabled-collapsed'),
    label: 'Privacy settings',
    facts: facts({
      operable: false,
      focusable: false,
      hasNextHeader: false,
      hasOpenSibling: false,
    }),
    type: 'single',
    defaultValue: ['profile'],
    disabled: ['privacy'],
  },
  {
    id: 'single-disabled-expanded',
    summary:
      'a disabled header whose panel stays open: it says aria-disabled, leaves the Tab order, and cannot be collapsed',
    storyId: story('single-disabled-expanded'),
    label: 'Profile settings',
    facts: facts({
      expanded: true,
      operable: false,
      focusable: false,
      hasNextHeader: false,
      hasOpenSibling: false,
    }),
    type: 'single',
    defaultValue: ['profile'],
    disabled: ['profile'],
  },
] as const satisfies ReadonlyArray<CollapsibleGroupAccordionState>;

export const COLLAPSIBLE_GROUP_ACCORDION_EXCLUSIONS = [
  {
    id: 'collapsible-disclosure-semantics',
    owner: 'DISCLOSURE_PATTERN and Collapsible.a11y.test.tsx',
    reason:
      'Each header is a Collapsible trigger. Its standalone disclosure state, pointer round trip, and aborted-press behavior are already bound to the disclosure contract; this binding proves the Accordion parts across the group — header role and name, aria-controls, aria-disabled on a fixed panel, Enter and Space — and, advisory until the record is current, what the group adds: single-expansion sibling collapse, the page Tab step between headers, and the absence of arrow-key focus movement.',
  },
  {
    id: 'heading-wrapper-and-region-panels',
    owner: 'component:CollapsibleGroup AR4 and the composing page',
    reason:
      'The record adopts the Accordion pattern without a heading element around each header and without the optional region role on panels; the caller places the group in its own heading structure. Neither is asserted here because neither is a component promise.',
  },
] as const;
