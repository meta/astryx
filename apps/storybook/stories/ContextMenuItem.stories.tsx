// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {ContextMenu, ContextMenuItem} from '@astryxdesign/core/ContextMenu';
import {Kbd} from '@astryxdesign/core/Kbd';
import {
  DocumentDuplicateIcon,
  PencilIcon,
  ShareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  trigger: {
    paddingBlock: 'var(--spacing-8)',
    paddingInline: 'var(--spacing-10)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border-default)',
    borderRadius: 'var(--radius-element)',
  },
});

const meta: Meta<typeof ContextMenuItem> = {
  title: 'Core/ContextMenuItem',
  component: ContextMenuItem,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The public alias in its supported ContextMenu compound composition. */
export const States: Story = {
  render: () => (
    <ContextMenu
      data-testid="context-menu-item-audit-trigger"
      label="Document actions"
      menuContent={
        <>
          <ContextMenuItem
            icon={PencilIcon}
            label="Edit"
            description="Modify this document"
            endContent={
              <span data-testid="context-menu-item-end-content">
                <Kbd keys="mod+e" />
              </span>
            }
            onClick={() => {}}
          />
          <ContextMenuItem icon={ShareIcon} label="Share" onClick={() => {}} />
          <ContextMenuItem
            icon={DocumentDuplicateIcon}
            label="Duplicate"
            isDisabled
            onClick={() => {}}
          />
          <ContextMenuItem
            icon={TrashIcon}
            label="Delete"
            variant="destructive"
            onClick={() => {}}
          />
        </>
      }>
      <div {...stylex.props(styles.trigger)}>
        Right-click for document actions
      </div>
    </ContextMenu>
  ),
  play: async ({canvasElement}) => {
    canvasElement
      .querySelector('[data-testid="context-menu-item-audit-trigger"]')
      ?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 40,
          clientY: 40,
        }),
      );
  },
};
