// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DialogA11y.stories.tsx
 * @input Uses Dialog's shared modal-dialog state inventory and render map, and
 *   AlertDialog for the last-input focus fixture
 * @output One checked-in browser reproduction story for every bound state, plus
 *   PointerFocusVisibility
 * @position Stable real-browser fixtures required by AST-009 FR30 and AST-021.
 *
 * PointerFocusVisibility is the one fixture outside that inventory: it backs
 * Dialog.a11y.browser.spec.ts, the Chromium and WebKit proof that Dialog's
 * focus moves follow the last input (interaction-modality INV1).
 *
 * SYNC: A new row in Dialog.a11y.states.ts needs a named export here. The
 * Chromium binding catches a missing or renamed story by its stable storyId.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {AlertDialog} from '../../../packages/core/src/AlertDialog';
import {DIALOG_MODAL_BINDING_STATES} from '../../../packages/core/src/Dialog/__tests__/Dialog.a11y.states';
import {renderDialogModalState} from '../../../packages/core/src/Dialog/__tests__/Dialog.a11y.renders';

function storyFor(id: string): StoryObj {
  const state = DIALOG_MODAL_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no Dialog modal binding state "${id}"`);
  }
  return {
    name: state.id,
    render: () => renderDialogModalState(state),
  };
}

const meta: Meta = {
  title: 'a11y/Dialog modal pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Stable browser states for Dialog’s shared modal-dialog accessibility contract. They are exercised interactively rather than used as visual baselines.',
      },
    },
  },
};

export default meta;

export const LabelledDescribedDefaultTitle = storyFor(
  'labelled-described-default-title',
);
export const ExplicitDescendantFocus = storyFor('explicit-descendant-focus');
export const ConditionalContentFocusRestoration = storyFor(
  'conditional-content-focus-restoration',
);
export const NoFocusableContent = storyFor('no-focusable-content');

/**
 * An AlertDialog opened from a button WebKit focuses on click. WebKit leaves a
 * plain clicked button unfocused, so the explicit `tabIndex` is what lets both
 * engines show where focus returns after a pointer close.
 */
export const PointerFocusVisibility: StoryObj = {
  render: function PointerFocusVisibilityStory() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button type="button" tabIndex={0} onClick={() => setIsOpen(true)}>
          Delete item
        </button>
        <AlertDialog
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title="Delete item?"
          description="This action cannot be undone."
          actionLabel="Delete"
          onAction={() => setIsOpen(false)}
        />
      </>
    );
  },
};
