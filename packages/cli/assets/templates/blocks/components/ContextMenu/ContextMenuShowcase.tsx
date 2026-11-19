// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

import {ContextMenu} from '@astryxdesign/core/ContextMenu';

export default function ContextMenuShowcase() {
  return (
    <ContextMenu
      presentation="adaptive"
      items={[
        {label: 'Cut', onClick: () => {}},
        {label: 'Copy', onClick: () => {}},
        {label: 'Paste', onClick: () => {}},
      ]}>
      <div
        style={{
          padding: '48px',
          borderWidth: '2px',
          borderStyle: 'dashed',
          borderColor: 'var(--color-border-emphasized)',
          borderRadius: '8px',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          userSelect: 'none',
        }}>
        Long-press or right-click this area
      </div>
    </ContextMenu>
  );
}
