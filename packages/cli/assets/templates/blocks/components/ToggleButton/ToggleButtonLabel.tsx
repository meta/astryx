// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  LocationIcon,
} from '@astryxdesign/template-icons';

export default function ToggleButtonLabel() {
  const [isVisible, setIsVisible] = useState(true);
  const [filters, setFilters] = useState<string[]>([]);

  return (
    <Stack direction="vertical" gap={4}>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Standalone with label and icon
        </Text>
        <Stack direction="horizontal" gap={3} vAlign="center">
          <ToggleButton
            label="Visible"
            icon={<Icon icon={EyeIcon} />}
            pressedIcon={<Icon icon={EyeSlashIcon} />}
            isPressed={isVisible}
            onPressedChange={setIsVisible}>
            {isVisible ? 'Visible' : 'Hidden'}
          </ToggleButton>
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Labeled group — filter toolbar
        </Text>
        <ToggleButtonGroup
          type="multiple"
          value={filters}
          onChange={setFilters}
          label="Filters">
          <ToggleButton
            value="filter"
            label="Filter"
            icon={<Icon icon={FunnelIcon} />}>
            Filter
          </ToggleButton>
          <ToggleButton
            value="nearby"
            label="Nearby"
            icon={<Icon icon={LocationIcon} />}>
            Nearby
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  );
}
