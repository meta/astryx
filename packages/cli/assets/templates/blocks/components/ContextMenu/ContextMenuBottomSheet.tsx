// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  DocumentDuplicateIcon,
  PencilIcon,
  ShareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';

export default function ContextMenuBottomSheet() {
  return (
    <ContextMenu
      presentation="bottom-sheet"
      label="Document actions"
      items={[
        {
          label: 'Rename document',
          description: 'Change the title shown to collaborators.',
          icon: PencilIcon,
          onClick: () => {},
        },
        {
          label: 'Duplicate document',
          description: 'Create a copy in the same workspace.',
          icon: DocumentDuplicateIcon,
          onClick: () => {},
        },
        {
          label: 'Share document',
          description: 'Invite people or copy a share link.',
          icon: ShareIcon,
          onClick: () => {},
        },
        {
          label: 'Delete document',
          description: 'Move this document to the trash.',
          icon: TrashIcon,
          variant: 'destructive',
          onClick: () => {},
        },
      ]}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '32px',
          border: '1px solid #d1d5db',
          borderRadius: '12px',
        }}>
        <strong>Quarterly plan</strong>
        <span>Long-press on touch or right-click for document actions.</span>
      </div>
    </ContextMenu>
  );
}
