// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {TreeList} from '@astryxdesign/core/TreeList';
import {Icon} from '@astryxdesign/core/Icon';
import {rtlStyles} from '@astryxdesign/core/utils';
import {Cog6ToothIcon, ChevronRightIcon} from '@heroicons/react/24/outline';

export default function TreeListInteractiveSettings() {
  return (
    <TreeList
      items={[
        {
          id: 'settings',
          label: 'Settings',
          isExpanded: true,
          startContent: <Icon icon={Cog6ToothIcon} size="sm" />,
          children: [
            {
              id: 'general',
              label: 'General',
              onClick: () => {},
            },
            {
              id: 'advanced',
              label: 'Advanced',
              onClick: () => {},
            },
          ],
        },
        {
          id: 'docs',
          label: 'Documentation',
          href: '#',
          endContent: (
            <Icon icon={ChevronRightIcon} size="sm" xstyle={rtlStyles.mirror} />
          ),
        },
      ]}
    />
  );
}
