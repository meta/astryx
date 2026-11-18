// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'InternationalizationProvider',
  displayName: 'Internationalization Provider',
  group: 'Utilities',
  category: 'Utility',
  isHiddenFromOverview: true,
  keywords: [
    'i18n',
    'internationalization',
    'localization',
    'locale',
    'translation',
    'translations',
    'provider',
    'language',
  ],
  usage: {
    description:
      'Wraps your app to set the active locale and (optionally) merge additional translation catalogs + per-locale overrides. Astryx components inside the subtree resolve their strings against this context. If no provider is present, components fall back to the shipped English defaults.',
    anatomy: [
      {
        name: 'Provider boundary',
        required: true,
        description:
          'A nonvisual context boundary that supplies locale, message catalogs, overrides, and direction to descendant Astryx components, and a calendar system to `Calendar`. It renders no DOM element.',
      },
    ],
    bestPractices: [
      {
        guidance: true,
        description:
          'Use shipped Astryx locale catalogs from `@astryxdesign/core/locales/*` when one exists for your target locale.',
      },
      {
        guidance: true,
        description:
          'Use a same-shape local catalog only when Astryx has not shipped that locale yet or you are testing in-progress translations.',
      },
      {
        guidance: true,
        description:
          'Use real BCP 47 tags such as `fr-FR`, `pt-BR`, or `ar-SA`; regional locales fall back to their base language before English.',
      },
      {
        guidance: true,
        description:
          "Set the `dir` attribute on `<html>` (or a wrapping element) yourself; the provider does not set it. Astryx components mirror layout and directional icons from the DOM `dir`, so an RTL locale won't visually mirror without it. Use `getLocaleDirection(locale)` to derive the value for both the provider and the DOM.",
      },
      {
        guidance: true,
        description:
          'Set `calendar` to show `Calendar`, `DateInput`, `DateRangeInput`, and `DateTimeInput` in another calendar system and write Timestamp, PowerSearch, and Schedule dates in it. A locale never selects the calendar: `fa-IR` shows Gregorian dates until you set `calendar="persian"`, and a `-u-ca-` keyword in `locale`, as in `th-TH-u-ca-buddhist`, keeps Gregorian dates too. Date values stay Gregorian ISO strings.',
      },
      {
        guidance: false,
        description:
          'Cast custom catalog maps to `any`; the i18n package exports `ProviderMessagesByLocale`, `MessagesByLocale`, `Catalog`, and `RuntimeCatalog` for local catalog typing.',
      },
    ],
  },
  props: [
    {
      name: 'locale',
      type: 'string',
      required: true,
      description:
        'BCP 47 language tag for the active locale (e.g. "en", "pt", "pt-BR", "zh-Hans"). Regional tags fall back to their base language, then to the shipped "en" catalog.',
    },
    {
      name: 'messages',
      type: 'ProviderMessagesByLocale',
      required: false,
      description:
        'Optional map of BCP 47 tag to a rich or generated runtime catalog. Import compact shipped catalogs from `@astryxdesign/core/locales/*.generated.js`; the shipped "en" catalog is always available and does not need to be listed here.',
    },
    {
      name: 'overrides',
      type: 'Overrides',
      required: false,
      description:
        'Sparse per-locale key overrides applied on top of shipped defaults. Overrides are locale-keyed so a runtime locale swap picks up the correct set.',
    },
    {
      name: 'dir',
      type: "'ltr' | 'rtl'",
      required: false,
      description:
        'Explicit text-direction override for the context. When omitted, direction is derived from `locale` via `Intl.Locale.getTextInfo()`. This sets the direction Astryx reads, but it does NOT set the DOM `dir` attribute; you must set `dir` on `<html>` (or a wrapping element) yourself, since Astryx components mirror layout and directional icons from the DOM `dir`, not from this prop. Set both to the same value and keep them in sync.',
    },
    {
      name: 'calendar',
      type: "'gregory' | 'iso8601' | 'buddhist' | 'roc' | 'japanese' | 'persian' | 'indian' | 'hebrew' | 'chinese' | 'dangi' | 'coptic' | 'ethiopic' | 'ethioaa' | 'islamic-civil' | 'islamic-tbla' | 'islamic-umalqura'",
      required: false,
      description:
        "Calendar system of the subtree, such as 'persian', 'hebrew', or 'buddhist'. `Calendar`, `DateInput`, `DateRangeInput`, and `DateTimeInput` show it, and Timestamp, PowerSearch, and Lab's Schedule write their dates in it. When omitted, the calendar is Gregorian: a locale never selects it, neither by its default calendar nor by a `-u-ca-` keyword. A component's own `calendar` prop takes precedence. Values stay Gregorian ISO dates. Calendars other than gregory, iso8601, buddhist, roc, and japanese need `Temporal`; the context keeps the requested calendar, and where the runtime lacks `Temporal`, these components show Gregorian dates and warn in development. Load a polyfill such as `temporal-polyfill/full/global` on the server and in the browser.",
    },
    {
      name: 'children',
      type: 'ReactNode',
      required: true,
      description: 'Content to render with the internationalization provider.',
    },
  ],
  examples: [
    {
      label: 'Load a shipped Astryx locale catalog',
      code: `import type {ReactNode} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import frFR from '@astryxdesign/core/locales/fr-FR.generated.js';

export function AppI18n({children}: {children: ReactNode}) {
  return (
    <InternationalizationProvider locale="fr-FR" messages={{'fr-FR': frFR}}>
      {children}
    </InternationalizationProvider>
  );
}`,
    },
    {
      label: 'Mirror the layout for right-to-left text',
      code: `import type {ReactNode} from 'react';
import {
  InternationalizationProvider,
  getLocaleDirection,
} from '@astryxdesign/core/i18n';

// Pass the same direction to the provider and to the element that holds the
// content, so Astryx components and the page mirror together.
export function AppI18n({children}: {children: ReactNode}) {
  const locale = 'ar-SA';
  const dir = getLocaleDirection(locale);
  return (
    <InternationalizationProvider locale={locale} dir={dir}>
      <div dir={dir}>{children}</div>
    </InternationalizationProvider>
  );
}`,
    },
    {
      label: 'Override one Astryx string',
      code: `import type {ReactNode} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';

export function AppI18n({children}: {children: ReactNode}) {
  return (
    <InternationalizationProvider
      locale="en"
      overrides={{
        en: {'@astryx.selector.placeholder': 'Choose...'},
      }}
    >
      {children}
    </InternationalizationProvider>
  );
}`,
    },
    {
      label: 'Provide a local fallback catalog',
      code: `import type {ReactNode} from 'react';
import {
  InternationalizationProvider,
  type MessagesByLocale,
} from '@astryxdesign/core/i18n';
import ptBR from './locales/pt-BR.json';

const messages: MessagesByLocale = {'pt-BR': ptBR};

export function AppI18n({children}: {children: ReactNode}) {
  return (
    <InternationalizationProvider locale="pt-BR" messages={messages}>
      {children}
    </InternationalizationProvider>
  );
}`,
    },
    {
      label: 'Show Calendar in the Persian calendar',
      code: `import type {ReactNode} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';

// Values stay Gregorian ISO dates, for example '2026-10-30'.
export function AppI18n({children}: {children: ReactNode}) {
  return (
    <InternationalizationProvider locale="fa-IR" calendar="persian">
      {children}
    </InternationalizationProvider>
  );
}`,
    },
    {
      label: 'Show Calendar and DateInput in another calendar',
      code: `import {useState} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {VStack} from '@astryxdesign/core/Layout';

// Japanese, Buddhist, and Minguo calendar dates need no Temporal, so they work
// in every browser. The value stays a Gregorian ISO date.
export function StartDate() {
  const [value, setValue] = useState<ISODateString | undefined>('2026-10-30');
  return (
    <InternationalizationProvider locale="en" calendar="japanese">
      <VStack gap={4}>
        <DateInput label="Start date" value={value} onChange={setValue} />
        <Calendar value={value ?? null} onChange={next => setValue(next)} />
      </VStack>
    </InternationalizationProvider>
  );
}`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Wraps app to set active locale and (optionally) merge translation catalogs + per-locale overrides. Astryx components resolve strings against this context; missing keys fall back to shipped English.',
  usage: {
    description:
      'Wraps app to set active locale and (optionally) merge translation catalogs + per-locale overrides. Astryx components resolve strings against this context; missing keys fall back to shipped English.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use compact shipped Astryx catalogs from `@astryxdesign/core/locales/*.generated.js` when one exists for the target locale.',
      },
      {
        guidance: true,
        description:
          'Use a rich `Catalog` or compact `RuntimeCatalog` when Astryx has not shipped the target locale or when testing in-progress translations.',
      },
      {
        guidance: true,
        description:
          'Use real BCP 47 tags like `fr-FR`, `pt-BR`, or `ar-SA`; regional locales fall back to base language before English.',
      },
      {
        guidance: true,
        description:
          'Set `dir` on `<html>` (or a wrapper) yourself; the provider does not. Astryx mirrors layout and directional icons from the DOM `dir`, so an RTL locale will not mirror without it. Use `getLocaleDirection(locale)` for both the provider and the DOM.',
      },
      {
        guidance: false,
        description:
          'Cast custom catalog maps to `any`; the i18n package exports `ProviderMessagesByLocale`, `MessagesByLocale`, `Catalog`, and `RuntimeCatalog` for local catalog typing.',
      },
    ],
  },
  propDescriptions: {
    locale:
      'BCP 47 language tag (e.g. "en", "pt-BR"); regional tags fall back to base language then "en"',
    messages:
      'map of BCP 47 tag to a rich Catalog or generated RuntimeCatalog; "en" is always available',
    overrides:
      'sparse per-locale key overrides applied on top of shipped defaults',
    calendar:
      'calendar system for Calendar, DateInput, DateRangeInput, DateTimeInput, Timestamp, PowerSearch, and Schedule dates (default: gregory; a -u-ca- keyword in locale does not select it); values stay Gregorian ISO; non-Gregorian-aligned calendars need Temporal',
  },
};
