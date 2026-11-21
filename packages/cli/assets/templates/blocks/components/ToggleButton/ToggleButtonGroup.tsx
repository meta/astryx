// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {ListIcon, GridViewIcon, TableIcon} from '@astryxdesign/template-icons';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
} from '@astryxdesign/template-icons';

export default function ToggleButtonGroupBlock() {
  const [view, setView] = useState<string | null>('list');
  const [formats, setFormats] = useState<string[]>(['bold']);

  return (
    <Stack direction="vertical" gap={4}>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Single selection
        </Text>
        <ToggleButtonGroup value={view} onChange={setView} label="View mode">
          <ToggleButton
            value="list"
            label="List view"
            icon={<Icon icon={ListIcon} />}
            isIconOnly
          />
          <ToggleButton
            value="grid"
            label="Grid view"
            icon={<Icon icon={GridViewIcon} />}
            isIconOnly
          />
          <ToggleButton
            value="table"
            label="Table view"
            icon={<Icon icon={TableIcon} />}
            isIconOnly
          />
        </ToggleButtonGroup>
      </Stack>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Multiple selections
        </Text>
        <ToggleButtonGroup
          type="multiple"
          value={formats}
          onChange={setFormats}
          label="Text formatting">
          <ToggleButton
            value="bold"
            label="Bold"
            icon={<Icon icon={BoldIcon} />}
            isIconOnly
          />
          <ToggleButton
            value="italic"
            label="Italic"
            icon={<Icon icon={ItalicIcon} />}
            isIconOnly
          />
          <ToggleButton
            value="underline"
            label="Underline"
            icon={<Icon icon={UnderlineIcon} />}
            isIconOnly
          />
          <ToggleButton
            value="strikethrough"
            label="Strikethrough"
            icon={<Icon icon={StrikethroughIcon} />}
            isIconOnly
          />
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  );
}
