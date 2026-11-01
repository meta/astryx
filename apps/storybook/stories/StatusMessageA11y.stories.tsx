// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file StatusMessageA11y.stories.tsx
 * @input Uses the Core and Lab status-message binding inventories and render maps
 * @output One checked-in reproduction story for every status-message contract state
 * @position Stable browser fixtures required by AST-009 FR30 and AST-021
 */

import type {Meta, StoryObj} from '@storybook/react';
import {CORE_STATUS_MESSAGE_STATE_RENDERS} from '../../../packages/core/src/FieldStatus/__tests__/StatusMessage.a11y.renders';
import {CORE_STATUS_MESSAGE_BINDING_STATES} from '../../../packages/core/src/FieldStatus/__tests__/StatusMessage.a11y.states';
import {CHAT_TYPING_STATUS_STATE_RENDERS} from '../../../packages/lab/src/Chat/__tests__/ChatTypingIndicator.a11y.renders';
import {CHAT_TYPING_STATUS_BINDING_STATES} from '../../../packages/lab/src/Chat/__tests__/ChatTypingIndicator.a11y.states';

function coreStory(id: string): StoryObj {
  const state = CORE_STATUS_MESSAGE_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(
      `no Core binding state "${id}" — see StatusMessage.a11y.states.ts`,
    );
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => CORE_STATUS_MESSAGE_STATE_RENDERS[state.id](),
  };
}

function labStory(id: string): StoryObj {
  const state = CHAT_TYPING_STATUS_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(
      `no Lab binding state "${id}" — see ChatTypingIndicator.a11y.states.ts`,
    );
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => CHAT_TYPING_STATUS_STATE_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Status message pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the shared status-message accessibility contract. The controls drive real empty, update, replacement, clear, repeat, and progress transitions.',
      },
    },
  },
};

export default meta;

export const ToastInfoAnnouncement = coreStory('toast-info-announcement');
export const ToastErrorAnnouncement = coreStory('toast-error-announcement');
export const ToastInfoCardMounted = coreStory('toast-info-card-mounted');
export const ToastErrorCardMounted = coreStory('toast-error-card-mounted');
export const FieldStatusErrorAttached = coreStory(
  'field-status-error-attached',
);
export const FieldStatusWarningDetached = coreStory(
  'field-status-warning-detached',
);
export const FieldStatusSuccessDetached = coreStory(
  'field-status-success-detached',
);
export const SpinnerDefaultLabelMounted = coreStory(
  'spinner-default-label-mounted',
);
export const SpinnerVisibleLabelMounted = coreStory(
  'spinner-visible-label-mounted',
);
export const ProgressLoadingToComplete = coreStory(
  'progress-loading-to-complete',
);
export const ProgressCustomRange = coreStory('progress-custom-range');
export const ProgressMarkFocusedUpdate = coreStory(
  'progress-mark-focused-update',
);

export const ChatTypingEmptyToMessage = labStory(
  'chat-typing-empty-to-message',
);
