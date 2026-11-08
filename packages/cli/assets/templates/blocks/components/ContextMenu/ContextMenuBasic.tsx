// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ContextMenu} from '@astryxdesign/core/ContextMenu';

export default function ContextMenuBasic() {
  return (
    <ContextMenu
      presentation="adaptive"
      items={[
        {label: 'Cut', onClick: () => {}},
        {label: 'Copy', onClick: () => {}},
        {label: 'Paste', onClick: () => {}},
        {type: 'divider'},
        {label: 'Delete', onClick: () => {}},
      ]}>
      <div
        style={{
          padding: '48px',
          borderWidth: '2px',
          borderStyle: 'dashed',
          borderColor: '#d1d5db',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#6b7280',
          userSelect: 'none',
        }}>
        Long-press or right-click this area
      </div>
    </ContextMenu>
  );
}
