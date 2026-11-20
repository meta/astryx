// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  ArchiveIcon,
  CopyIcon,
  EditIcon,
  ShareIcon,
} from '@astryxdesign/template-icons';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {useMediaQuery} from '@astryxdesign/core/hooks';

const COMPACT_TOUCH_QUERY =
  '(max-width: 639px) and (pointer: coarse) and (hover: none)';

const ACTIONS = [
  {label: 'Edit project', icon: EditIcon},
  {label: 'Duplicate project', icon: CopyIcon},
  {label: 'Share project', icon: ShareIcon},
  {label: 'Archive project', icon: ArchiveIcon},
] as const;

export default function DropdownMenuBottomSheet() {
  const [lastAction, setLastAction] = useState<string | null>(null);
  const isCompactTouchSurface = useMediaQuery(COMPACT_TOUCH_QUERY);

  return (
    <VStack gap={3}>
      <DropdownMenu
        button={{label: 'Project actions'}}
        presentation={isCompactTouchSurface ? 'bottom-sheet' : 'popover'}
        items={ACTIONS.map(({label, icon}) => ({
          label,
          icon,
          onClick: () => setLastAction(label),
        }))}
      />
      {lastAction && (
        <Text type="supporting" color="secondary">
          Last action: {lastAction}
        </Text>
      )}
    </VStack>
  );
}
