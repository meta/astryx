// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs internationalization/i18n-library-integration`: override
 * default text, coexist with your own i18n library, or use astryx as your
 * i18n library.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'i18n-library-integration',
  title: 'Library Integration',
  placement: {parent: 'namespace:internationalization', slot: 'guides', order: 20},
  category: 'guide',
  description:
    "Override astryx's default text, coexist with react-intl / i18next / next-intl / LinguiJS, or use astryx as your i18n library.",
  keywords: [
    'react-intl',
    'i18next',
    'next-intl',
    'LinguiJS',
    'overrides',
    'useTranslator',
  ],

  sections: [
    {
      title: "Overriding astryx's default text",
      content: [
        {
          type: 'prose',
          text: 'Use `overrides` to change individual strings without shipping a full catalog. Overrides are keyed by locale and merged on top of the built-in and user-supplied catalogs.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Change one string in English',
          code: `<InternationalizationProvider
  locale="en"
  overrides={{en: {'@astryx.pagination.next': 'Next →'}}}
>
  <App />
</InternationalizationProvider>`,
        },
        {
          type: 'prose',
          text: 'Overrides win over both bundled English and any `messages` catalog for the same key. Use them for brand voice tweaks or one-off wording changes.',
        },
      ],
    },
    {
      title: 'Using astryx with your own i18n library',
      content: [
        {
          type: 'prose',
          text: "Astryx components render astryx strings through astryx's provider. Consumer components render consumer strings through whatever i18n library you already use: react-intl, i18next, next-intl, LinguiJS, and so on. The two systems coexist and read from the same source of truth for the active locale.",
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Astryx + react-intl side by side',
          code: `import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Selector} from '@astryxdesign/core/Selector';
import {Button} from '@astryxdesign/core/Button';
import {FormattedMessage, IntlProvider, useIntl} from 'react-intl';
import astryxFr from './locales/astryx/fr.json'; // astryx's UI, in French
import appFr from './locales/app/fr.json';       // your app strings, in French

function Pricing() {
  // Consumer strings — resolved by react-intl.
  const intl = useIntl();

  return (
    <section>
      <h1><FormattedMessage id="pricing.heading" /></h1>

      {/* Astryx Selector — trigger placeholder, search-box placeholder,
          clear-button aria-label all resolved by
          <InternationalizationProvider>. Options come from react-intl. */}
      <Selector
        label={intl.formatMessage({id: 'pricing.region.label'})}
        options={[
          {value: 'na', label: intl.formatMessage({id: 'pricing.region.na'})},
          {value: 'eu', label: intl.formatMessage({id: 'pricing.region.eu'})},
        ]}
        hasSearch
        hasClear
      />

      <Button label={intl.formatMessage({id: 'pricing.cta.subscribe'})} />
    </section>
  );
}

export default function App() {
  return (
    // Same locale, two providers reading their own catalogs.
    <IntlProvider locale="fr" messages={appFr}>
      <InternationalizationProvider locale="fr" messages={{fr: astryxFr}}>
        <Pricing />
      </InternationalizationProvider>
    </IntlProvider>
  );
}`,
        },
        {
          type: 'prose',
          text: 'Keep the two providers in sync on locale, and each library owns its own catalog. Astryx never sees your app strings, and your i18n library never sees astryx internals. Runtime locale swap works the same way: re-render both providers with a new `locale` prop and the whole tree updates live.',
        },
        {
          type: 'prose',
          text: "Single-catalog usage (where an external i18n runtime like react-intl or i18next resolves both your app strings AND astryx's strings through one provider) is on the roadmap via a `Translator` adapter. Track [meta/astryx#4029](https://github.com/meta/astryx/issues/4029). For now, run the two providers side by side as shown above.",
        },
      ],
    },
    {
      title: 'Using astryx as your i18n library',
      content: [
        {
          type: 'prose',
          text: "For production apps with substantial localization needs, we recommend a dedicated i18n library such as react-intl, i18next, next-intl, or LinguiJS. If your app is small or you do not want another runtime, you can resolve your own strings through astryx too. Keep app keys in a separate namespace from `@astryx.*`, and include your own `en` catalog because astryx's built-in English fallback only contains astryx component strings.",
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Translate app strings with astryx',
          code: `import {Button} from '@astryxdesign/core/Button';
import {
  InternationalizationProvider,
  useTranslator,
  type Catalog,
  type MessagesByLocale,
} from '@astryxdesign/core/i18n';

const en: Catalog = {
  '@myapp.actions.save': {defaultMessage: 'Save'},
};

const fr: Catalog = {
  '@myapp.actions.save': {defaultMessage: 'Enregistrer'},
};

const messages: MessagesByLocale = {en, fr};

function SaveButton() {
  const t = useTranslator();
  return <Button label={t('@myapp.actions.save')} />;
}

export default function App() {
  return (
    <InternationalizationProvider locale="fr" messages={messages}>
      <SaveButton />
    </InternationalizationProvider>
  );
}`,
        },
        {
          type: 'prose',
          text: '`Catalog` types the rich `{defaultMessage, description?}` authoring shape. `RuntimeCatalog` types the generated key-to-message string map. `ProviderMessagesByLocale` accepts either shape for the provider, while `MessagesByLocale` keeps the original rich-only context shape.',
        },
      ],
    },
  ],
};
