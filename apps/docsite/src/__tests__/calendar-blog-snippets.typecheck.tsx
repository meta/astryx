// Copyright (c) Meta Platforms, Inc. and affiliates.

// The code samples in the "What year is it? Bringing other calendars to
// Astryx" blog post (src/content/blog/posts/calendar-systems-in-astryx.md),
// kept here so `pnpm typecheck` fails if the published API they show changes.

import {useState} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';

export function PersianCalendar() {
  const [date, setDate] = useState<ISODateString>('2026-10-30');
  return (
    <InternationalizationProvider locale="fa-IR" calendar="persian">
      {/* shows Aban 1405; value and onChange stay '2026-10-30' */}
      <Calendar value={date} onChange={setDate} />
    </InternationalizationProvider>
  );
}
