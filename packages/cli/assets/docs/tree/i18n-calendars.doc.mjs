// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs internationalization/i18n-calendars`: the short version of
 * showing dates in another calendar. The `internationalization/calendars`
 * namespace beside it holds the detail.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'i18n-calendars',
  title: 'Other calendars',
  placement: {
    parent: 'namespace:internationalization',
    slot: 'guides',
    order: 25,
  },
  category: 'guide',
  description:
    'Show dates in the Persian, Hebrew, Islamic, Buddhist, Japanese, and other calendars while values stay Gregorian ISO dates.',

  sections: [
    {
      title: 'Show dates in another calendar',
      content: [
        {
          type: 'prose',
          text: 'Set `calendar` on `<InternationalizationProvider>` for a subtree, or on `Calendar` itself; without it, `Calendar` is Gregorian. Values stay Gregorian ISO dates (`YYYY-MM-DD`) in every calendar.',
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
          text: "Most calendars need the runtime's `Temporal`. Safari and older runtimes lack it: load `temporal-polyfill/full/global` there, on the server and in the browser. Without it, those calendars show Gregorian dates. See {@link namespace:calendars} for the supported calendars, server rendering, and the Chinese and Korean calendars.",
        },
      ],
    },
  ],
};
