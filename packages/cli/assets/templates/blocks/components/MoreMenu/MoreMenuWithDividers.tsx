// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {EditIcon, CopyIcon, DeleteIcon} from '@astryxdesign/template-icons';

export default function MoreMenuWithDividers() {
  return (
    <MoreMenu
      variant="secondary"
      items={[
        {label: 'Edit', icon: EditIcon, onClick: () => {}},
        {label: 'Duplicate', icon: CopyIcon, onClick: () => {}},
        {type: 'divider'},
        {label: 'Delete', icon: DeleteIcon, onClick: () => {}},
      ]}
    />
  );
}
