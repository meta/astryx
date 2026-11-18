// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {useToast} from '@astryxdesign/core/Toast';

export default function SelectorGhostToolbar() {
  const showToast = useToast();
  const [view, setView] = useState<string | undefined>('week');
  const [density, setDensity] = useState<string | undefined>('comfortable');

  return (
    <HStack align="center" gap={2}>
      <Button
        onClick={() =>
          showToast({body: 'Demo: the calendar would jump to today here'})
        }
        label="Today"
        variant="ghost"
      />
      <Selector
        label="Calendar view"
        isLabelHidden
        variant="ghost"
        options={[
          {value: 'day', label: 'Day'},
          {value: 'week', label: 'Week'},
          {value: 'month', label: 'Month'},
        ]}
        value={view}
        onChange={setView}
      />
      <Selector
        label="Density"
        isLabelHidden
        variant="ghost"
        options={[
          {value: 'compact', label: 'Compact'},
          {value: 'comfortable', label: 'Comfortable'},
          {value: 'spacious', label: 'Spacious'},
        ]}
        value={density}
        onChange={setDensity}
        status={{type: 'warning', message: 'This setting affects all users'}}
        statusVariant="tooltip"
      />
      <Button
        onClick={() => showToast({body: 'Demo: an export would start here'})}
        label="Export"
        variant="ghost"
      />
    </HStack>
  );
}
