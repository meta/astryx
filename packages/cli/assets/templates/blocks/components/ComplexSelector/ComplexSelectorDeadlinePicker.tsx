// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {ComplexSelector} from '@astryxdesign/core/ComplexSelector';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {DateInput} from '@astryxdesign/core/DateInput';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';

type ISODate =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
type ISOTime = string & {readonly __brand: 'ISOTimeString'};

interface Deadline {
  preset: 'today' | 'next-week' | 'custom';
  date: ISODate;
  time: ISOTime;
}

const presetLabels: Record<Deadline['preset'], string> = {
  today: 'Today',
  'next-week': 'Next week',
  custom: 'Custom date',
};

function formatDeadline(value: Deadline) {
  if (value.preset === 'custom') {
    return `${value.date} at ${value.time}`;
  }
  return presetLabels[value.preset];
}

export default function ComplexSelectorDeadlinePicker() {
  const [value, setValue] = useState<Deadline>({
    preset: 'today',
    date: '2026-04-06' as ISODate,
    time: '17:00' as ISOTime,
  });

  return (
    <ComplexSelector<Deadline>
      label="Deadline"
      description="Choose a preset or set a custom date and time."
      value={value}
      onChange={setValue}
      triggerLabel={formatDeadline(value)}
      controlStyle={{width: 320}}>
      {(selectedValue, onChange, close) => {
        const set = (patch: Partial<Deadline>) =>
          onChange({...selectedValue, ...patch});

        return (
          <VStack gap={4} style={{width: 320}}>
            <RadioList
              label="When is it due?"
              value={selectedValue.preset}
              onChange={preset => set({preset: preset as Deadline['preset']})}>
              <RadioListItem label="Today" value="today" />
              <RadioListItem label="Next week" value="next-week" />
              <RadioListItem label="Custom date" value="custom" />
            </RadioList>

            {selectedValue.preset === 'custom' && (
              <VStack gap={3}>
                <DateInput
                  label="Date"
                  value={selectedValue.date}
                  onChange={date => date && set({date})}
                />
                <TimeInput
                  label="Time"
                  value={selectedValue.time}
                  onChange={time => time && set({time})}
                />
              </VStack>
            )}

            <Button label="Apply" variant="primary" onClick={close} />
          </VStack>
        );
      }}
    </ComplexSelector>
  );
}
