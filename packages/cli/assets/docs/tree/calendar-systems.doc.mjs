// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs internationalization/calendars/calendar-systems`:
 * choosing a calendar, the supported calendars, loading Temporal on the server
 * and in the browser, the Chinese and Korean calendars, and week numbers.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'calendar-systems',
  title: 'Calendar systems',
  placement: {
    parent: 'namespace:calendars',
    slot: 'guides',
    order: 10,
  },
  category: 'guide',
  description:
    'Choosing a calendar, which calendars need Temporal, server rendering, the Chinese and Korean calendars, and week numbers.',

  sections: [
    {
      title: 'Choose a calendar',
      content: [
        {
          type: 'prose',
          text: '`Calendar` shows the Gregorian calendar unless you choose another one. Pass `calendar` to `<InternationalizationProvider>` to set it for a subtree. A locale with an explicit `-u-ca-` keyword, such as `th-TH-u-ca-buddhist`, selects its calendar too. A locale on its own never changes the calendar: `fa-IR` shows Gregorian dates in Persian until you pass `calendar="persian"`.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Persian dates in a Persian interface',
          code: `import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Calendar} from '@astryxdesign/core/Calendar';

<InternationalizationProvider locale="fa-IR" calendar="persian">
  {/* shows Aban 1405; value and onChange stay '2026-10-30' */}
  <Calendar value={date} onChange={setDate} />
</InternationalizationProvider>;`,
        },
        {
          type: 'prose',
          text: 'Calendar and language are independent: `locale="en" calendar="hebrew"` shows Hebrew dates in English. `Calendar` also takes its own `calendar`, which wins over the provider. Use it when one screen shows two calendars side by side.',
        },
        {
          type: 'prose',
          text: 'Values never change with the calendar. `value`, `defaultValue`, `onChange`, `min`, and `max` stay Gregorian ISO dates (`YYYY-MM-DD`) in every calendar, so your data, server code, and existing handlers keep working.',
        },
      ],
    },
    {
      title: 'Supported calendars',
      content: [
        {
          type: 'table',
          headers: ['Calendar', 'Identifiers', 'Needs Temporal'],
          rows: [
            ['Gregorian', '`gregory`, `iso8601`', 'No'],
            ['Buddhist (Thai)', '`buddhist`', 'No'],
            ['Republic of China (Minguo)', '`roc`', 'No'],
            ['Japanese (eras)', '`japanese`', 'No'],
            ['Persian (Solar Hijri)', '`persian`', 'Yes'],
            ['Indian national (Saka)', '`indian`', 'Yes'],
            ['Hebrew', '`hebrew`', 'Yes'],
            [
              'Islamic (Hijri)',
              '`islamic-umalqura`, `islamic-civil`, `islamic-tbla`',
              'Yes',
            ],
            ['Chinese', '`chinese`', 'Yes'],
            ['Korean (Dangi)', '`dangi`', 'Yes'],
            ['Coptic', '`coptic`', 'Yes'],
            ['Ethiopian', '`ethiopic`, `ethioaa`', 'Yes'],
          ],
        },
        {
          type: 'prose',
          text: 'A `-u-ca-islamic` keyword resolves to `islamic-tbla`. Any other identifier shows Gregorian dates and warns once in development.',
        },
      ],
    },
    {
      title: 'Load Temporal where the runtime lacks it',
      content: [
        {
          type: 'prose',
          text: "Calendars whose months are not Gregorian use the runtime's `Temporal` for their month lengths, leap months, and years. Chrome and Edge 144 and later, Firefox 139 and later, and Node.js 26 and later ship it. Safari and older runtimes do not. Astryx bundles no polyfill, so Gregorian applications pay nothing.",
        },
        {
          type: 'prose',
          text: 'Where `Temporal` is missing, load the full build of `temporal-polyfill` before your app renders. The default build has no non-ISO calendars. Load it only where `Temporal` is missing: a native implementation is more accurate for the Chinese and Korean calendars.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Load the polyfill only where Temporal is missing',
          code: `// temporal-setup.ts: import before your app renders, on the server and in the browser
if (!('Temporal' in globalThis)) {
  await import('temporal-polyfill/full/global');
}`,
        },
        {
          type: 'prose',
          text: 'If you render on the server, load it there too. `Calendar` resolves its calendar during render, so a server without `Temporal` renders Gregorian dates, and a browser with it renders Persian ones: hydration then fails. When both have `Temporal`, or both lack it, they render the same markup.',
        },
        {
          type: 'prose',
          text: 'Without a `Temporal` that supports it, a calendar that needs one shows Gregorian dates and warns once in development, on the server and in the browser. The Gregorian-aligned calendars (`buddhist`, `roc`, `japanese`) work everywhere without it.',
        },
      ],
    },
    {
      title: 'Chinese and Korean calendars',
      content: [
        {
          type: 'prose',
          text: "Chinese and Korean months start on new moons computed from astronomy, and runtimes do not all agree on a few of them. Astryx follows the runtime's `Temporal` and does not correct it.",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Native `Temporal` in Chrome, Edge, Firefox, and Node.js 26 agrees with official observatory data from 1900 through 2100.',
            "A polyfill reads the platform's `Intl` data instead. Under a polyfill, Node.js 24 starts nine Chinese and four Korean months in that range one day apart from the native result: Chinese New Year 2027 is February 6 with native `Temporal` and February 7 under the polyfill. Safari uses the same kind of `Intl` data, so expect the same differences there.",
            'Within one browser, the day numbers a person sees, the dates a screen reader announces, and the value they pick agree. Only two different runtimes can disagree.',
          ],
        },
        {
          type: 'prose',
          text: 'If you render on the server, a server and a browser that use different implementations can disagree on one of these month starts. The browser then renders that month differently from the server markup, and React renders that part again on the client during hydration. When identical server and browser markup for these calendars matters more than matching official data, load the same `Temporal` implementation on both sides. Otherwise, do not install a polyfill over a native `Temporal`: that makes native environments less accurate.',
        },
      ],
    },
    {
      title: 'Week numbers',
      content: [
        {
          type: 'prose',
          text: "`Calendar`'s `hasWeekNumbers` shows ISO 8601 week numbers in every calendar. Temporal defines week numbering only for the ISO calendar.",
        },
      ],
    },
  ],
};
