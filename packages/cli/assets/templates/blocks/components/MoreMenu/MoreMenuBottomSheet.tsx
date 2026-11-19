// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {
  CopyIcon,
  EditIcon,
  ShareIcon,
  DeleteIcon,
} from '@astryxdesign/template-icons';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';

export default function MoreMenuBottomSheet() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        width: 'min(100%, 360px)',
        padding: '16px',
        border: '1px solid var(--color-border-emphasized)',
        borderRadius: '12px',
      }}>
      <VStack gap={1}>
        <strong>Quarterly plan</strong>
        <span>Updated a few minutes ago</span>
      </VStack>
      <MoreMenu
        presentation="bottom-sheet"
        label="Project actions"
        items={[
          {
            label: 'Rename project',
            description: 'Update the project title.',
            icon: EditIcon,
            onClick: () => {},
          },
          {
            label: 'Duplicate project',
            description: 'Create a copy in this workspace.',
            icon: CopyIcon,
            onClick: () => {},
          },
          {
            label: 'Share project',
            description: 'Invite people to collaborate.',
            icon: ShareIcon,
            onClick: () => {},
          },
          {
            label: 'Delete project',
            description: 'Move this project to the trash.',
            icon: DeleteIcon,
            variant: 'destructive',
            onClick: () => {},
          },
        ]}
      />
    </div>
  );
}
