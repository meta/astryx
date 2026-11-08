// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs internationalization/i18n-quick-start`: wrap your app in
 * a provider, load a locale catalog, and swap languages at runtime.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'i18n-quick-start',
  title: 'Quick Start',
  placement: {parent: 'namespace:internationalization', slot: 'guides', order: 10},
  category: 'guide',
  description:
    'Wrap your app in InternationalizationProvider, load a locale catalog, and swap languages at runtime.',
  keywords: [
    'InternationalizationProvider',
    'quick start',
    'language swap',
  ],

  sections: [
    {
      title: 'Quick Start',
      content: [
        {
          type: 'prose',
          text: 'Internationalization ships with `@astryxdesign/core`. There is nothing to install. Wrap your app in `<InternationalizationProvider>` and set the active `locale`; astryx components pick up localized strings from that provider.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Wrap your app',
          code: `import {InternationalizationProvider} from '@astryxdesign/core/i18n';

function App() {
  return (
    <InternationalizationProvider locale="en">
      <YourApp />
    </InternationalizationProvider>
  );
}`,
        },
        {
          type: 'prose',
          text: 'The provider always has the built-in English catalog. Pass additional catalogs through `messages` when you enable another locale.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Load an astryx locale catalog',
          code: `import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import frFR from '@astryxdesign/core/locales/fr-FR.generated.js';

<InternationalizationProvider
  locale="fr-FR"
  messages={{'fr-FR': frFR}}>
  <App />
</InternationalizationProvider>;`,
        },
        {
          type: 'prose',
          text: 'Astryx ships English and first-party translations for supported locales. Compact runtime modules from `@astryxdesign/core/locales/*.generated.js` contain only the messages apps need; the existing `@astryxdesign/core/locales/*.json` files retain translator context. Until a locale is available, apps can pass a local catalog in either shape. Missing keys fall back through the locale chain to English (for example, `pt-BR` walks to `pt`, then to shipped `en`).',
        },
        {
          type: 'prose',
          text: 'Locale catalogs only affect astryx strings. Your app can continue using its own i18n system for product copy.',
        },
      ],
    },
    {
      title: 'Runtime language swap',
      content: [
        {
          type: 'prose',
          text: 'Re-render `<InternationalizationProvider>` with a new `locale` prop and every astryx string updates live. No reload, no separate API call.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Toggle between locales',
          code: `const [locale, setLocale] = useState<'en' | 'fr'>('en');

<InternationalizationProvider locale={locale} messages={{fr}}>
  <Button
    label={locale === 'en' ? 'Français' : 'English'}
    onClick={() => setLocale(l => (l === 'en' ? 'fr' : 'en'))}
  />
  <App />
</InternationalizationProvider>;`,
        },
        {
          type: 'prose',
          text: "Persisting the user's choice (localStorage, cookie, URL segment, account setting) is up to the consumer. Astryx reads whatever `locale` you pass in.",
        },
      ],
    },
  ],
};
