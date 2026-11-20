// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {EditIcon, CopyIcon, DeleteIcon} from '@astryxdesign/template-icons';

export default function MoreMenuWithSections() {
  return (
    <MoreMenu
      variant="secondary"
      label="Document actions"
      items={[
        {
          type: 'section',
          title: 'Actions',
          items: [
            {label: 'Edit', icon: EditIcon, onClick: () => {}},
            {
              label: 'Duplicate',
              icon: CopyIcon,
              onClick: () => {},
            },
          ],
        },
        {
          type: 'section',
          title: 'Danger zone',
          items: [{label: 'Delete', icon: DeleteIcon, onClick: () => {}}],
        },
      ]}
    />
  );
}
