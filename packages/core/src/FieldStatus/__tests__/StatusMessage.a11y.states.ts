// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file StatusMessage.a11y.states.ts
 * @input Uses StatusMessageStateFacts from the shared accessibility contract
 * @output The AST-021 inventory for current Core status-message parts and states, plus explicit exclusions
 * @position Data-only binding inventory shared by jsdom, Storybook, and Chromium
 */

import type {StatusMessageStateFacts} from '@astryxdesign/a11y-spec';

export type CoreStatusMessageBinding =
  | 'Toast announcement channel'
  | 'Toast card'
  | 'FieldStatus announcement channel'
  | 'Spinner'
  | 'ProgressBar';

export interface CoreStatusMessageBindingDefinition {
  readonly id: string;
  readonly binding: CoreStatusMessageBinding;
  readonly summary: string;
  readonly facts: StatusMessageStateFacts;
  readonly focusSelector?: string;
  readonly storyId: string;
}

function liveFacts({
  role,
  politeness,
  message,
  replacement,
  initialMessage = '',
  messageSource = 'text',
  semanticTransitions,
}: {
  role: 'status' | 'alert' | null;
  politeness: 'polite' | 'assertive';
  message: string;
  replacement: string;
  initialMessage?: string;
  messageSource?: 'text' | 'accessible-name';
  semanticTransitions: ReadonlyArray<'show' | 'replace' | 'clear' | 'repeat'>;
}): StatusMessageStateFacts {
  return {
    kind: 'live-region',
    role,
    politeness,
    messageSource,
    initialMessage,
    message,
    replacement,
    semanticTransitions,
  };
}

export const CORE_STATUS_MESSAGE_BINDING_STATES = [
  {
    id: 'toast-info-announcement',
    binding: 'Toast announcement channel',
    summary:
      'an info toast dispatch updates and can repeat through the persistent polite channel',
    facts: liveFacts({
      role: 'status',
      politeness: 'polite',
      message: 'Changes saved',
      replacement: 'Profile updated',
      semanticTransitions: ['show', 'replace', 'repeat'],
    }),
    storyId: 'a11y-status-message-pattern--toast-info-announcement',
  },
  {
    id: 'toast-error-announcement',
    binding: 'Toast announcement channel',
    summary:
      'an error toast dispatch updates and can repeat through the persistent assertive channel',
    facts: liveFacts({
      role: 'alert',
      politeness: 'assertive',
      message: 'Upload failed',
      replacement: 'Connection failed',
      semanticTransitions: ['show', 'replace', 'repeat'],
    }),
    storyId: 'a11y-status-message-pattern--toast-error-announcement',
  },
  {
    id: 'toast-info-card-mounted',
    binding: 'Toast card',
    summary:
      'the visible info card is mounted with its polite live-region content',
    facts: liveFacts({
      role: 'status',
      politeness: 'polite',
      initialMessage: 'Changes saved',
      message: 'Changes saved',
      replacement: 'Profile updated',
      semanticTransitions: ['replace'],
    }),
    storyId: 'a11y-status-message-pattern--toast-info-card-mounted',
  },
  {
    id: 'toast-error-card-mounted',
    binding: 'Toast card',
    summary:
      'the visible error card is mounted with its assertive live-region content',
    facts: liveFacts({
      role: 'alert',
      politeness: 'assertive',
      initialMessage: 'Upload failed',
      message: 'Upload failed',
      replacement: 'Connection failed',
      semanticTransitions: ['replace'],
    }),
    storyId: 'a11y-status-message-pattern--toast-error-card-mounted',
  },
  {
    id: 'field-status-error-attached',
    binding: 'FieldStatus announcement channel',
    summary:
      'an attached error enters and updates through the persistent assertive channel',
    facts: liveFacts({
      role: 'alert',
      politeness: 'assertive',
      message: 'This field is required',
      replacement: 'Enter a valid email address',
      semanticTransitions: ['show', 'replace', 'repeat'],
    }),
    storyId: 'a11y-status-message-pattern--field-status-error-attached',
  },
  {
    id: 'field-status-warning-detached',
    binding: 'FieldStatus announcement channel',
    summary:
      'a detached warning enters and updates through the persistent polite channel',
    facts: liveFacts({
      role: 'status',
      politeness: 'polite',
      message: 'Check this value',
      replacement: 'This value may be visible to others',
      semanticTransitions: ['show', 'replace', 'repeat'],
    }),
    storyId: 'a11y-status-message-pattern--field-status-warning-detached',
  },
  {
    id: 'field-status-success-detached',
    binding: 'FieldStatus announcement channel',
    summary:
      'a detached success enters and updates through the persistent polite channel',
    facts: liveFacts({
      role: 'status',
      politeness: 'polite',
      message: 'Looks good',
      replacement: 'Changes saved',
      semanticTransitions: ['show', 'replace', 'repeat'],
    }),
    storyId: 'a11y-status-message-pattern--field-status-success-detached',
  },
  {
    id: 'spinner-default-label-mounted',
    binding: 'Spinner',
    summary:
      'a loading spinner is mounted with its default accessible status name',
    facts: liveFacts({
      role: 'status',
      politeness: 'polite',
      initialMessage: 'Loading',
      messageSource: 'accessible-name',
      message: 'Loading',
      replacement: 'Saving',
      semanticTransitions: ['replace'],
    }),
    storyId: 'a11y-status-message-pattern--spinner-default-label-mounted',
  },
  {
    id: 'spinner-visible-label-mounted',
    binding: 'Spinner',
    summary:
      'a loading spinner is mounted with a visible label that names its status role',
    facts: liveFacts({
      role: 'status',
      politeness: 'polite',
      initialMessage: 'Fetching data',
      messageSource: 'accessible-name',
      message: 'Fetching data',
      replacement: 'Saving data',
      semanticTransitions: ['replace'],
    }),
    storyId: 'a11y-status-message-pattern--spinner-visible-label-mounted',
  },
  {
    id: 'progress-loading-to-complete',
    binding: 'ProgressBar',
    summary:
      'an indeterminate operation becomes 40 percent complete and then finishes',
    facts: {
      kind: 'progressbar',
      politeness: null,
      name: 'Upload progress',
      initialValue: null,
      initialMin: 0,
      initialMax: 100,
      progressValue: 40,
      completionValue: 100,
      minValue: 0,
      maxValue: 100,
    },
    storyId: 'a11y-status-message-pattern--progress-loading-to-complete',
  },
  {
    id: 'progress-custom-range',
    binding: 'ProgressBar',
    summary: 'a five-step operation exposes and updates its non-default range',
    facts: {
      kind: 'progressbar',
      politeness: null,
      name: 'Upload progress',
      initialValue: 1,
      initialMin: 0,
      initialMax: 5,
      progressValue: 3,
      completionValue: 5,
      minValue: 0,
      maxValue: 5,
    },
    storyId: 'a11y-status-message-pattern--progress-custom-range',
  },
  {
    id: 'progress-mark-focused-update',
    binding: 'ProgressBar',
    summary:
      'a determinate value update preserves focus on a labeled target mark',
    facts: {
      kind: 'progressbar',
      politeness: null,
      name: 'Upload progress',
      initialValue: 20,
      initialMin: 0,
      initialMax: 100,
      progressValue: 40,
      completionValue: 100,
      minValue: 0,
      maxValue: 100,
    },
    focusSelector: '[tabindex="0"]',
    storyId: 'a11y-status-message-pattern--progress-mark-focused-update',
  },
] as const satisfies ReadonlyArray<CoreStatusMessageBindingDefinition>;

export type CoreStatusMessageBindingState =
  (typeof CORE_STATUS_MESSAGE_BINDING_STATES)[number];
export type CoreStatusMessageStateId = CoreStatusMessageBindingState['id'];

export const CORE_STATUS_MESSAGE_EXCLUSIONS = [
  {
    owner: 'FieldStatus visible message box',
    part: 'visible validation text',
    reason:
      'component:FieldStatus AR2 keeps the visible box role-free as the input description target; its separate persistent announcement channel is bound above.',
  },
  {
    owner: 'Spinner compositions',
    part: 'aria-hidden decorative spinner',
    reason:
      'A composing control that marks Spinner aria-hidden owns the surrounding busy semantics; the decorative ring is not another status message.',
  },
  {
    owner: 'ChatSystemMessage',
    part: 'chat notice or date separator',
    reason:
      'spec:AST-086 FR4: a notice added to a chat log is delivered by the log, so neither the notice row nor the divider carries its own live role; a date or section separator is ordinary transcript content.',
  },
  {
    owner: 'ChatMessageList and streaming logs',
    part: 'role=log transcript updates',
    reason:
      'Sequential log announcements and stream batching are a distinct log pattern, not one atomic status message.',
  },
  {
    owner: 'ChatComposer and ChatToolCalls',
    part: 'composer errors and tool-run states',
    reason:
      'These adjacent surfaces have their own state ownership and were not named by this bounded first status-message migration.',
  },
  {
    owner: 'Switch',
    part: 'busy announcement',
    reason:
      'The current switch pattern has no busy announcement expectation, and overlapping work is changing this path; it is not silently absorbed into this migration.',
  },
  {
    owner: 'ProgressBar marks and Tooltip',
    part: 'focusable target-mark triggers and labels',
    reason:
      'The marked progress state above proves that value updates preserve mark focus. ProgressBar and Tooltip local tests own trigger labeling and interaction; ARIA ownership of focusable descendants is tracked separately.',
  },
  {
    owner: 'ProgressBar component and theme',
    part: 'visual fill, track, animation, and status cadence',
    reason:
      'The binding covers browser-exposed role, name, values, and focus preservation. Paint stays in visual evidence; spoken cadence and timing stay under AST-009.',
  },
] as const;
