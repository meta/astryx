// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Selector} from '@astryxdesign/core/Selector';

export default function SelectorWithSections() {
  const [value, setValue] = useState<string | undefined>();
  return (
    <Selector
      controlStyle={{width: 300}}
      label="Office"
      options={[
        {
          type: 'section',
          title: 'North America',
          options: [
            {value: 'nyc', label: 'New York'},
            {value: 'sf', label: 'San Francisco'},
            {value: 'sea', label: 'Seattle'},
          ],
        },
        {
          type: 'section',
          title: 'Europe',
          options: [
            {value: 'ldn', label: 'London'},
            {value: 'ber', label: 'Berlin'},
          ],
        },
        {
          type: 'section',
          title: 'Asia Pacific',
          options: [
            {value: 'tyo', label: 'Tokyo'},
            {value: 'sgp', label: 'Singapore'},
          ],
        },
      ]}
      value={value}
      onChange={setValue}
      placeholder="Choose an office..."
    />
  );
}
