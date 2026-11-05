// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs internationalization/i18n-rtl-and-testing`: text
 * direction (RTL), pseudo-locale testing, and contributor guidance.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'i18n-rtl-and-testing',
  title: 'RTL & Testing',
  placement: {parent: 'namespace:internationalization', slot: 'guides', order: 30},
  category: 'guide',
  description:
    'Text direction (RTL), pseudo-locale testing, and contributor guidance for developers and translators.',
  keywords: [
    'dir',
    'pseudo locale',
    'testing',
    'Crowdin',
    'logical properties',
  ],

  sections: [
    {
      title: 'Text direction (RTL)',
      content: [
        {
          type: 'prose',
          text: "Astryx tracks text direction (`'ltr'` or `'rtl'`) alongside the locale. By default the direction is derived from the `locale` you pass to `<InternationalizationProvider>` via [`Intl.Locale.getTextInfo()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo), so RTL locales such as Arabic (`ar`), Hebrew (`he`), Farsi (`fa`), and Urdu (`ur`) resolve to `'rtl'` automatically.",
        },
        {
          type: 'prose',
          text: "You don't wire anything per component. Once the direction is set, astryx components mirror on their own: layout and spacing flip via CSS logical properties, directional icons (chevrons, carets) flip in place, keyboard arrow keys swap left/right, and overlays position on the correct side. Set the direction once and the whole component tree follows.",
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Direction derived from locale',
          code: `import {InternationalizationProvider} from '@astryxdesign/core/i18n';

// direction resolves to 'rtl' automatically from the Arabic locale
<InternationalizationProvider locale="ar">
  <App />
</InternationalizationProvider>;`,
        },
        {
          type: 'prose',
          text: 'Pass the optional `dir` prop to force a direction. This overrides the locale-derived default; useful for RTL layout testing under an English catalog, or to skip derivation when you already know the direction.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Explicit direction override',
          code: `// force RTL layout while keeping English strings
<InternationalizationProvider locale="en" dir="rtl">
  <App />
</InternationalizationProvider>;`,
        },
        {
          type: 'prose',
          text: "There's one more step: tell the browser about the direction too. Add a `dir` attribute to your page; usually on the `<html>` tag. This is what makes text align to the correct side, punctuation and mixed-language text flow correctly, and layouts mirror. The provider handles astryx components; the `dir` attribute handles everything else on the page.",
        },
        {
          type: 'prose',
          text: "Astryx doesn't set `dir` for you; you set it, alongside the same direction you pass to the provider. If your app is server-rendered (like Next.js), the `getLocaleDirection()` helper computes the direction from a locale so you can set it while the page renders:",
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Set <html dir> in a Next.js root layout',
          code: `import {getLocaleDirection} from '@astryxdesign/core/i18n';

export default function RootLayout({children, params}) {
  const {locale} = params;
  return (
    <html lang={locale} dir={getLocaleDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}`,
        },
        {
          type: 'prose',
          text: "In a plain client app, set the same attribute on `<html>` whenever the locale changes. (`getLocaleDirection()` safely returns `'ltr'` for anything it doesn't recognize, so you can call it with any locale string.)",
        },
        {
          type: 'prose',
          text: 'To make just one part of a left-to-right page right-to-left; say an Arabic quote or a comment thread; wrap that part in its own `<InternationalizationProvider dir="rtl">` and add `dir="rtl"` to the element around it. Pop-up overlays; menus, dialogs, popovers, tooltips; opened from inside that region mirror too: they position with logical CSS anchor placement, so they land on the correct side and inherit the region\'s direction automatically.',
        },
      ],
    },
    {
      title: 'Testing your translations',
      content: [
        {
          type: 'prose',
          text: 'Astryx generates a `pseudo` locale that wraps every string in `⟦…⟧` and replaces letters with accented look-alikes. Turn it on in development to catch hardcoded astryx strings and layout issues caused by longer text.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Turn on pseudo-localization',
          code: `import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import pseudo from '@astryxdesign/core/locales/pseudo.generated.js';

<InternationalizationProvider locale="pseudo" messages={{pseudo}}>
  <App />
</InternationalizationProvider>;`,
        },
      ],
    },
    {
      title: 'For contributors',
      content: [
        {
          type: 'heading',
          level: 3,
          text: 'Developers',
        },
        {
          type: 'prose',
          text: 'Astryx component authors read strings with `useTranslator()` rather than hardcoding user-facing text.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Read an astryx string',
          code: `import {useTranslator} from '@astryxdesign/core/i18n';

function SaveButton() {
  const t = useTranslator();
  return <button>{t('@astryx.actions.save')}</button>;
}`,
        },
        {
          type: 'prose',
          text: "Astryx's own strings live in `packages/core/locales/en.json`. New user-facing strings must go through `useTranslator`; this is enforced by the `@astryx/no-hardcoded-i18n-string` ESLint rule. See the AI contribution guide for the alias-and-resolve pattern used when adding new keys.",
        },
        {
          type: 'prose',
          text: 'When you author a component that needs to respond to direction, resolve it from the DOM, not from a render-time JavaScript read, and reach for the lightest tool that works. In priority order:',
        },
        {
          type: 'heading',
          level: 4,
          text: '1. CSS logical properties first',
        },
        {
          type: 'prose',
          text: 'Use `insetInlineStart`, `paddingInlineEnd`, `marginInline`, and friends instead of physical `left`/`right`. Most mirroring needs nothing more; the browser flips it from the ambient `dir`. The `@astryx/no-physical-properties` ESLint rule enforces this.',
        },
        {
          type: 'heading',
          level: 4,
          text: '2. Directional icons: mirror with CSS, not a name-swap',
        },
        {
          type: 'prose',
          text: 'Render one fixed glyph and wrap it in the shared `rtlStyles.mirror` (a `scaleX(-1)` that only applies under `[dir="rtl"]`). It flips from the ancestor `dir` through the cascade, so it works on the server with no hydration flash. Do not pick `chevronLeft` vs `chevronRight` in JS. This is how Pagination, Calendar, and Carousel handle their chevrons.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Mirror a directional icon with CSS',
          code: `import * as stylex from '@stylexjs/stylex';
import {rtlStyles} from '@astryxdesign/core';

function NextButton() {
  // One glyph; CSS flips it under RTL. No direction read.
  return (
    <span {...stylex.props(rtlStyles.mirror)}>
      <Icon icon="chevronRight" />
    </span>
  );
}`,
        },
        {
          type: 'heading',
          level: 4,
          text: '3. Behavioral logic: read the DOM lazily, on the event',
        },
        {
          type: 'prose',
          text: "For things CSS can't express; keyboard arrow-key mapping, drag/scroll math; read direction at interaction time with `isRtlElement(el)` (a `getComputedStyle().direction` check), never during render. The focus primitives (`useListFocus`, `useGridFocus`, `useTreeFocus`) already auto-detect direction from their container, so arrow keys flip for free; don't pass a direction flag to them.",
        },
        {
          type: 'heading',
          level: 4,
          text: '4. useDirection() context: the last resort',
        },
        {
          type: 'prose',
          text: "Reach for it only when you genuinely need the direction value during render and none of the above fit. It's SSR-safe and returns `'ltr'` outside a provider (matching `useTranslator`'s silent fallback), but it's the one path that can mismatch on hydration if the provider's `direction` disagrees with `<html dir>`; so prefer the options above, which resolve purely from the DOM. As of the CSS-mirror migration, no astryx component reads direction from context at render time.",
        },
        {
          type: 'heading',
          level: 3,
          text: 'Translators',
        },
        {
          type: 'prose',
          text: 'Crowdin is the preferred way to contribute; [join a language](https://crowdin.com/project/astryx), translate strings in the web UI, and your work syncs back to the repo without opening a PR. Direct PRs against `packages/core/locales/*.json` also work if you prefer that flow.',
        },
      ],
    },
  ],
};
