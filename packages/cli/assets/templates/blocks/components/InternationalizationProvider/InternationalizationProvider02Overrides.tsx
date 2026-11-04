// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Selector} from '@astryxdesign/core/Selector';

export default function InternationalizationProviderOverrides() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <InternationalizationProvider
      locale="en"
      overrides={{
        en: {
          '@astryx.selector.placeholder': 'Choose...',
        },
      }}>
      <Selector
        controlStyle={{width: 300}}
        label="Billing region"
        options={[
          {value: 'americas', label: 'Americas'},
          {value: 'emea', label: 'EMEA'},
          {value: 'apac', label: 'APAC'},
        ]}
        value={value}
        onChange={setValue}
        hasClear
      />
    </InternationalizationProvider>
  );
}
