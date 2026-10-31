// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Alert.a11y.states.ts
 * @input Uses StatusMessageStateFacts from the shared accessibility contract
 * @output The AST-021 inventory for Banner states that explicitly request urgent alert semantics
 * @position Data-only binding inventory shared by jsdom, Storybook, and Chromium
 */

import type {StatusMessageStateFacts} from '@astryxdesign/a11y-spec';

type AlertFacts = Extract<StatusMessageStateFacts, {kind: 'live-region'}>;

export interface BannerAlertBindingDefinition {
  readonly id: string;
  readonly binding: 'Banner urgent alert';
  readonly summary: string;
  readonly facts: AlertFacts;
  readonly status: 'warning' | 'error';
  /** The title the caller authors first; the public update replaces it. */
  readonly title: string;
  readonly replacementTitle: string;
  /** Caller-authored supporting text, part of the alert's message. */
  readonly description?: string;
  readonly dismissible: boolean;
  /** Label of a caller-supplied `endContent` action. */
  readonly endContentLabel?: string;
  /** Supporting content behind Banner's default collapsed disclosure. */
  readonly collapsedContent?: string;
  readonly storyId: string;
}

/**
 * The message is everything the caller authors as the alert's text: the title
 * and, when present, the description. Controls are not message text.
 */
function alertFacts(
  title: string,
  replacementTitle: string,
  description?: string,
): AlertFacts {
  const message = (value: string) =>
    description == null ? value : `${value} ${description}`;
  return {
    kind: 'live-region',
    role: 'alert',
    politeness: 'assertive',
    messageSource: 'text',
    initialMessage: message(title),
    message: message(title),
    replacement: message(replacementTitle),
    semanticTransitions: ['replace'],
  };
}

export type BannerAlertStateId =
  | 'banner-error-alert-mounted'
  | 'banner-warning-alert-dismissible'
  | 'banner-warning-alert-collapsible'
  | 'banner-error-alert-end-content'
  | 'banner-error-alert-description';

export const BANNER_ALERT_BINDING_STATES: ReadonlyArray<
  BannerAlertBindingDefinition & {readonly id: BannerAlertStateId}
> = [
  {
    id: 'banner-error-alert-mounted',
    binding: 'Banner urgent alert',
    summary:
      'an explicitly urgent error banner remains an assertive alert when its message is replaced',
    facts: alertFacts('Upload failed', 'Connection failed'),
    status: 'error',
    title: 'Upload failed',
    replacementTitle: 'Connection failed',
    dismissible: false,
    storyId: 'a11y-alert-pattern--banner-error-alert-mounted',
  },
  {
    id: 'banner-warning-alert-dismissible',
    binding: 'Banner urgent alert',
    summary:
      'an explicitly urgent dismissible warning remains an assertive alert when its message is replaced',
    facts: alertFacts('Session expires soon', 'Session has expired'),
    status: 'warning',
    title: 'Session expires soon',
    replacementTitle: 'Session has expired',
    dismissible: true,
    storyId: 'a11y-alert-pattern--banner-warning-alert-dismissible',
  },
  {
    id: 'banner-warning-alert-collapsible',
    binding: 'Banner urgent alert',
    summary:
      'an explicitly urgent warning with collapsed supporting content remains an assertive alert when its message is replaced',
    facts: alertFacts('Session expires soon', 'Session has expired'),
    status: 'warning',
    title: 'Session expires soon',
    replacementTitle: 'Session has expired',
    dismissible: false,
    collapsedContent: 'Save your work to keep your changes.',
    storyId: 'a11y-alert-pattern--banner-warning-alert-collapsible',
  },
  {
    id: 'banner-error-alert-end-content',
    binding: 'Banner urgent alert',
    summary:
      'an explicitly urgent error with a caller action remains an assertive alert when its message is replaced',
    facts: alertFacts('Upload failed', 'Connection failed'),
    status: 'error',
    title: 'Upload failed',
    replacementTitle: 'Connection failed',
    dismissible: false,
    endContentLabel: 'Retry',
    storyId: 'a11y-alert-pattern--banner-error-alert-end-content',
  },
  {
    id: 'banner-error-alert-description',
    binding: 'Banner urgent alert',
    summary:
      'an explicitly urgent error with a description remains an assertive alert when its title is replaced',
    facts: alertFacts(
      'Upload failed',
      'Connection failed',
      'Check your network and try again.',
    ),
    status: 'error',
    title: 'Upload failed',
    replacementTitle: 'Connection failed',
    description: 'Check your network and try again.',
    dismissible: false,
    storyId: 'a11y-alert-pattern--banner-error-alert-description',
  },
];

export type BannerAlertBindingState = BannerAlertBindingDefinition & {
  readonly id: BannerAlertStateId;
};

export const BANNER_ALERT_EXCLUSIONS = [
  {
    owner: 'component:Banner',
    part: 'non-alert and status-to-role selection',
    reason:
      'This binding starts after Banner has resolved the public role to alert. Its non-alert states and status-to-role selection remain component-owned.',
  },
  {
    owner: 'Button, Disclosure, and Banner',
    part: 'disclosure and action control behavior',
    reason:
      'The bound states include the dismiss, disclosure, and caller-action controls only for their effect on the alert region. Button behavior, disclosure state, callback effects, and dismissal focus handoff keep their own component contracts and tests.',
  },
  {
    owner: 'spec:AST-009',
    part: 'spoken announcement output and timing',
    reason:
      'This binding checks DOM, Chromium accessibility-tree, and browser focus outcomes only; real assistive technology owns speech and timing claims.',
  },
] as const;
