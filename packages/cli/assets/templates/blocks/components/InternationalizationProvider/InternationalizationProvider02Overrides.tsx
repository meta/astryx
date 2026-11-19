// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {VStack} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';

const regions = [
  {value: 'americas', label: 'Americas'},
  {value: 'emea', label: 'EMEA'},
  {value: 'apac', label: 'APAC'},
];

const currencies = [
  {value: 'usd', label: 'US dollar'},
  {value: 'eur', label: 'Euro'},
  {value: 'jpy', label: 'Japanese yen'},
];

export default function InternationalizationProviderOverrides() {
  const [region, setRegion] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  // In an app, render one provider at the root. Its overrides then apply to
  // every Selector below it.
  return (
    <InternationalizationProvider
      locale="en"
      overrides={{
        en: {
          '@astryx.selector.placeholder': 'Choose...',
        },
      }}>
      <VStack gap={4}>
        <Selector
          width={300}
          label="Billing region"
          options={regions}
          value={region}
          onChange={setRegion}
          hasClear
        />
        <Selector
          width={300}
          label="Currency"
          placeholder="Pick a currency"
          options={currencies}
          value={currency}
          onChange={setCurrency}
          hasClear
        />
      </VStack>
    </InternationalizationProvider>
  );
}
