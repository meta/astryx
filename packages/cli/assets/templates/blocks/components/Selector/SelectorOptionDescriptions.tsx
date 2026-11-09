// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Selector, SelectorOption} from '@astryxdesign/core/Selector';
import {InputGroup} from '@astryxdesign/core/InputGroup';
import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {LockClosedIcon, GlobeAltIcon} from '@heroicons/react/24/outline';

const VISIBILITY = [
  {
    value: 'private',
    label: 'Private',
    icon: LockClosedIcon,
    description: 'Only members can access this space and its content.',
  },
  {
    value: 'public',
    label: 'Public',
    icon: GlobeAltIcon,
    description: 'Anyone at the company can find and join this space.',
  },
];

export default function SelectorOptionDescriptions() {
  const [condensed, setCondensed] = useState<string | undefined>('private');
  const [full, setFull] = useState<string | undefined>('private');
  const [grouped, setGrouped] = useState<string | undefined>('private');

  return (
    <Stack direction="vertical" gap={6}>
      <Selector
        controlStyle={{width: 320}}
        label="Visibility"
        description="Default trigger: one line at the size token."
        options={VISIBILITY}
        value={condensed}
        onChange={setCondensed}
      />
      <Selector
        controlStyle={{width: 320}}
        label="Visibility"
        description="A stacked SelectorOption: the description gets its own line, and the trigger grows by exactly one line."
        options={VISIBILITY}
        value={full}
        onChange={setFull}
        renderValue={option => (
          <SelectorOption
            icon={option.icon}
            label={option.label ?? option.value}
            description={option.description}
          />
        )}
      />
      <InputGroup label="Visibility">
        <Selector
          label="Visibility"
          isLabelHidden
          options={VISIBILITY}
          value={grouped}
          onChange={setGrouped}
          renderValue={option => (
            <SelectorOption
              icon={option.icon}
              label={option.label ?? option.value}
              description={option.description}
            />
          )}
        />
        <Button label="Save" />
      </InputGroup>
    </Stack>
  );
}
