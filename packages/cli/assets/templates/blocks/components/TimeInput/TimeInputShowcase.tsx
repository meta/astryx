// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TimeInput, type ISOTimeString} from '@astryxdesign/core/TimeInput';
import {Stack} from '@astryxdesign/core/Layout';

export default function TimeInputShowcase() {
  const [time, setTime] = useState<ISOTimeString | undefined>(undefined);
  return (
    <Stack
      direction="vertical"
      width="100%"
      style={{minWidth: 240, maxWidth: 400}}>
      <TimeInput
        label="Time"
        placeholder="Select a time"
        value={time}
        onChange={setTime}
      />
    </Stack>
  );
}
