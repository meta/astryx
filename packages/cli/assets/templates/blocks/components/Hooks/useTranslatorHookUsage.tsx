// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {
  InternationalizationProvider,
  useTranslator,
  type MessagesByLocale,
} from '@astryxdesign/core/i18n';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';

type Locale = 'en' | 'fr';

const MESSAGES: MessagesByLocale = {
  en: {
    '@myapp.invoices.loadMore': {defaultMessage: 'Load more'},
    '@myapp.invoices.showing': {
      defaultMessage: 'Showing {shown, number} of {total, number}',
    },
  },
  fr: {
    '@myapp.invoices.loadMore': {defaultMessage: 'Charger plus'},
    '@myapp.invoices.showing': {
      defaultMessage: '{shown, number} sur {total, number} affichées',
    },
  },
};

const INVOICES = Array.from({length: 9}, (_, index) => `INV-${1001 + index}`);
const PAGE_SIZE = 3;

function InvoiceList() {
  const translate = useTranslator();
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const total = INVOICES.length;

  return (
    <VStack gap={3}>
      <List density="compact" hasDividers>
        {INVOICES.slice(0, shownCount).map(invoice => (
          <ListItem key={invoice} label={invoice} />
        ))}
      </List>
      <HStack gap={2} hAlign="between" vAlign="center">
        <Text type="supporting">
          {translate('@myapp.invoices.showing', {shown: shownCount, total})}
        </Text>
        <Button
          label={translate('@myapp.invoices.loadMore')}
          size="sm"
          isDisabled={shownCount >= total}
          onClick={() => setShownCount(count => count + PAGE_SIZE)}
        />
      </HStack>
    </VStack>
  );
}

export default function UseTranslatorHookUsage() {
  const [locale, setLocale] = useState<Locale>('en');

  return (
    <InternationalizationProvider locale={locale} messages={MESSAGES}>
      <Card width={360} padding={4}>
        <VStack gap={3}>
          <SegmentedControl
            label="Language"
            value={locale}
            onChange={nextLocale => setLocale(nextLocale as Locale)}
            size="sm">
            <SegmentedControlItem value="en" label="English" />
            <SegmentedControlItem value="fr" label="Français" />
          </SegmentedControl>
          <InvoiceList />
        </VStack>
      </Card>
    </InternationalizationProvider>
  );
}
