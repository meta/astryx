// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Timestamp',
  displayName: 'Timestamp',
  category: 'Content',
  keywords: ['date', 'time', 'datetime', 'relative', 'ago', 'clock', 'format', 'duration', 'relativetime'],
  playground: {
    // `value` is required but has no semantic default, so the properties-tab
    // preview fell back to the literal string "value" — which
    // `new Date("value")` rejects, crashing the preview with "Invalid time
    // value". Seed a valid ISO 8601 date so the interactive preview renders.
    defaults: {
      value: '2026-02-19T17:00:00Z',
    },
  },
  props: [
    {
      name: 'value',
      type: 'string | number',
      description:
        'The date/time to display. Accepts Unix timestamps (seconds) or ISO 8601 strings.',
      required: true,
    },
    {
      name: 'format',
      type: "'relative' | 'relative_short' | 'auto' | 'date' | 'date_long' | 'date_weekday' | 'date_time' | 'time' | 'system_date' | 'system_date_time' | 'system_time' | 'unix_seconds'",
      description:
        "Display format. 'relative' uses the locale's native long relative-time wording ('2 hours ago' in English), 'relative_short' uses its narrow pattern ('2h ago' in English) for compact surfaces, 'date' shows 'Mar 21, 2025', 'date_long' shows 'March 21, 2025', 'date_weekday' shows 'Wed, Mar 21, 2025', 'date_time' shows 'Mar 21, 2025, 2:51 PM', 'time' shows '2:51 PM', 'system_*' variants use ISO-style formatting, 'unix_seconds' shows the Unix time in whole seconds since the epoch (an absolute, zone-independent value), 'auto' switches from relative to date_time based on recency. Absolute formats never read the current time. 'relative', 'relative_short' and 'auto' read it on the client only: a server render or static prerender shows the full date and time in UTC, labelled, and the client switches to the format's normal output after hydration.",
      default: "'auto'",
    },
    {
      name: 'autoThreshold',
      type: 'number',
      description:
        "Threshold in seconds for 'auto' format to switch from relative to date_time.",
      default: '604800',
    },
    {
      name: 'hasTooltip',
      type: 'boolean',
      description:
        'Whether to show a copyable hover card with the full date/time on hover. Applies to relative timestamps and to any format once tooltipEntries is configured.',
      default: 'true',
    },
    {
      name: 'tooltipEntries',
      type: 'ReadonlyArray<{timezoneID?: string; format?: TimestampTooltipFormat; label?: string; isCopyable?: boolean}>',
      description:
        "Lines to show on hover, so one instant can be read (and optionally copied) in several time zones and/or formats at once. Each entry is one line, in the order given. Omit timezoneID (or pass 'local') for the viewer's own zone; format defaults to the full absolute style and also accepts 'full' alongside every non-relative TimestampFormat. Rows are read-only unless they set isCopyable (default false); copyable rows show a copy button in a dedicated trailing action column so buttons align, and the column is only present when some row is copyable. With no entries the card shows a single default row with the full absolute time, which is copyable. Configuring entries also attaches the surface to absolute formats, which otherwise have none.",
    },
    {
      name: 'isTimezoneShown',
      type: 'boolean',
      description:
        'Whether to append the timezone abbreviation to the visible text. Applies to the date_time and time formats; system_* formats stay machine-readable and never carry one. Use tooltipEntries to control the tooltip\'s time zones.',
      default: 'false',
    },
    {
      name: 'isLive',
      type: 'boolean',
      description:
        'Whether the relative time should update live (e.g. "2 min ago" \u2192 "3 min ago").',
      default: 'false',
    },
    {
      name: 'type',
      type: "'body' | 'large' | 'label' | 'supporting' | 'code' | 'display-1' | 'display-2' | 'display-3' | 'inherit'",
      description: 'Semantic text type from Text. Determines size, weight, and line-height.',
      default: "'supporting'",
    },
    {
      name: 'size',
      type: "'4xs' | '3xs' | '2xs' | 'xsm' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'",
      description: 'Explicit font size override. Overrides the size from type.',
    },
    {
      name: 'color',
      type: "'primary' | 'secondary' | 'disabled' | 'placeholder' | 'accent' | 'inherit'",
      description: 'Text color.',
      default: "'secondary'",
    },
    {
      name: 'weight',
      type: "'normal' | 'medium' | 'semibold' | 'bold'",
      description: 'Font weight override.',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-timestamp', visualProps: ['type', 'color', 'format']},
      {className: 'astryx-timestamp-copy-button'},
    ],
  },
  usage: {
    description:
      'Timestamp formats a date or time value into human-readable text. Use it to show when something was created, updated, or is scheduled; picking relative for recency, absolute for precision, or auto to let the component decide.',
    bestPractices: [
      {guidance: true, description: 'Use the auto format in feeds and lists so recent items show "2 hours ago" and older items show the full date automatically.'},
      {guidance: true, description: 'Keep formatting consistent within the same list or table; mixing relative and absolute timestamps in the same column confuses scanning.'},
      {guidance: true, description: 'Enable isTimezoneShown when the audience spans multiple time zones, like a global team calendar or audit log.'},
      {guidance: true, description: 'Use tooltipEntries when readers must compare zones, such as an incident log where the reader\'s time and the event\'s origin zone both matter.'},
      {guidance: true, description: 'Label every entry once a tooltip shows more than one zone; a bare abbreviation is not always recognizable (Tokyo renders as "GMT+9", not "JST").'},
      {guidance: true, description: 'Use isLive for active dashboards or real-time feeds so the relative time stays accurate without a page refresh.'},
      {guidance: true, description: 'Reach for tooltipEntries when readers need to grab an exact value: an incident log or deploy record where someone pastes the UTC time or Unix seconds elsewhere; configuring entries turns the hover into copy-to-clipboard rows.'},
      {guidance: false, description: 'Don\'t display raw Unix timestamps or ISO strings to users; always pass them through Timestamp to get a human-readable format.'},
      {guidance: false, description: 'Avoid system_date or system_time formats in user-facing UI; they are meant for developer tools, logs, and machine-readable contexts.'},
      {guidance: false, description: 'Don\'t disable the hover card on relative timestamps; users expect to hover for the full date when they see "3 hours ago".'},
      {guidance: false, description: 'Don\'t stack many zones into one card; it is capped at 300px wide and long labelled lines wrap. Two or three entries read well.'},
      {guidance: false, description: 'Don\'t pass a fixed-offset abbreviation like "EST" as timezoneID; it is a valid identifier but never observes daylight saving, so it reads an hour wrong for half the year. Use the region id, "America/New_York".'},
    ],
    anatomy: [
      {name: 'Formatted text', required: true, description: 'The rendered date, time, or relative label like "2 hours ago" or "Mar 21, 2025".'},
      {name: 'Hover card', required: false, description: 'A copyable hover card showing the full absolute date and time when the display is relative, or the rows configured via tooltipEntries. Its default single row carries the full absolute time.'},
      {name: 'Hover card row', required: false, description: 'One row of the card: an optional label beside the instant rendered in one time zone and format. Rows opt into a copy button via isCopyable.'},
      {name: 'Copy button', required: true, description: 'Per-row copy-to-clipboard button in the hover card; copies that row\'s formatted value.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  propDescriptions: {
    value: '\u8981\u663e\u793a\u7684\u65e5\u671f/\u65f6\u95f4\u3002\u63a5\u53d7 Unix \u65f6\u95f4\u6233\uff08\u79d2\uff09\u6216 ISO 8601 \u5b57\u7b26\u4e32\u3002',
    format: "\u663e\u793a\u683c\u5f0f\u3002'relative' \u663e\u793a '2\u5c0f\u65f6\u524d'\uff0c'date' \u663e\u793a\u65e5\u671f\uff0c'date_long' \u663e\u793a\u957f\u6708\u4efd\u65e5\u671f\uff0c'date_weekday' \u663e\u793a\u661f\u671f+\u65e5\u671f\uff0c'auto' \u6839\u636e\u65f6\u95f4\u8fdc\u8fd1\u81ea\u52a8\u5207\u6362\u3002",
    autoThreshold: "auto \u683c\u5f0f\u4ece\u76f8\u5bf9\u65f6\u95f4\u5207\u6362\u5230 date_time \u7684\u9608\u503c\u79d2\u6570\u3002",
    hasTooltip: '\u60ac\u505c\u65f6\u662f\u5426\u663e\u793a\u5305\u542b\u5b8c\u6574\u65e5\u671f/\u65f6\u95f4\u7684\u53ef\u590d\u5236\u60ac\u505c\u5361\u7247\uff08\u76f8\u5bf9\u65f6\u95f4\u6a21\u5f0f\uff0c\u6216\u914d\u7f6e tooltipEntries \u7684\u4efb\u610f\u683c\u5f0f\uff09\u3002',
    tooltipEntries:
      '\u60ac\u505c\u65f6\u8981\u663e\u793a\u7684\u884c\uff0c\u7528\u4e8e\u540c\u65f6\u5c55\u793a\u591a\u4e2a\u65f6\u533a\u548c/\u6216\u591a\u79cd\u683c\u5f0f\u3002\u6bcf\u9879\u4e3a\u4e00\u884c\uff0c\u6309\u987a\u5e8f\u6e32\u67d3\uff1b\u7701\u7565 timezoneID\uff08\u6216\u4f20\u5165 \'local\'\uff09\u8868\u793a\u67e5\u770b\u8005\u672c\u5730\u65f6\u533a\u3002\u60ac\u505c\u9762\u677f\u59cb\u7ec8\u662f\u53ef\u9010\u884c\u590d\u5236\u5230\u526a\u8d34\u677f\u7684\u4ea4\u4e92\u5f0f\u5361\u7247\uff0c\u8fd9\u4e9b\u914d\u7f6e\u9879\u81ea\u5b9a\u4e49\u5176\u884c\uff1b\u672a\u914d\u7f6e\u65f6\u5361\u7247\u663e\u793a\u4e00\u884c\u9ed8\u8ba4\u7684\u5b8c\u6574\u7edd\u5bf9\u65f6\u95f4\u3002\u914d\u7f6e\u540e\u7edd\u5bf9\u65f6\u95f4\u683c\u5f0f\u4e5f\u4f1a\u56e0\u6b64\u83b7\u5f97\u60ac\u505c\u9762\u677f\u3002',
    isTimezoneShown:
      '\u662f\u5426\u5728\u53ef\u89c1\u6587\u672c\u540e\u9644\u52a0\u65f6\u533a\u7f29\u5199\uff08\u4ec5 date_time \u548c time\uff1bsystem_* \u683c\u5f0f\u4e0d\u9644\u52a0\uff09\u3002',
    isLive: '\u76f8\u5bf9\u65f6\u95f4\u662f\u5426\u5b9e\u65f6\u66f4\u65b0\u3002',
    type: '\u6765\u81ea Text \u7684\u8bed\u4e49\u6587\u672c\u7c7b\u578b\u3002',
    size: '\u663e\u5f0f\u5b57\u4f53\u5927\u5c0f\u8986\u76d6\u3002',
    color: '\u6587\u5b57\u989c\u8272\u3002',
    weight: '\u5b57\u4f53\u7c97\u7ec6\u8986\u76d6\u3002',
  },
  usage: {
    description:
      'Timestamp formats a date or time value into human-readable text. Use it to show when something was created, updated, or is scheduled; picking relative for recency, absolute for precision, or auto to let the component decide.',
    bestPractices: [
      {guidance: true, description: 'Use the auto format in feeds and lists so recent items show "2 hours ago" and older items show the full date automatically.'},
      {guidance: true, description: 'Keep formatting consistent within the same list or table; mixing relative and absolute timestamps in the same column confuses scanning.'},
      {guidance: true, description: 'Enable isTimezoneShown when the audience spans multiple time zones, like a global team calendar or audit log.'},
      {guidance: true, description: 'Use tooltipEntries when readers must compare zones, such as an incident log where the reader\'s time and the event\'s origin zone both matter.'},
      {guidance: true, description: 'Label every entry once a tooltip shows more than one zone; a bare abbreviation is not always recognizable (Tokyo renders as "GMT+9", not "JST").'},
      {guidance: true, description: 'Use isLive for active dashboards or real-time feeds so the relative time stays accurate without a page refresh.'},
      {guidance: true, description: 'Reach for tooltipEntries when readers need to grab an exact value: an incident log or deploy record where someone pastes the UTC time or Unix seconds elsewhere; configuring entries turns the hover into copy-to-clipboard rows.'},
      {guidance: false, description: 'Don\'t display raw Unix timestamps or ISO strings to users; always pass them through Timestamp to get a human-readable format.'},
      {guidance: false, description: 'Avoid system_date or system_time formats in user-facing UI; they are meant for developer tools, logs, and machine-readable contexts.'},
      {guidance: false, description: 'Don\'t disable the hover card on relative timestamps; users expect to hover for the full date when they see "3 hours ago".'},
      {guidance: false, description: 'Don\'t stack many zones into one card; it is capped at 300px wide and long labelled lines wrap. Two or three entries read well.'},
      {guidance: false, description: 'Don\'t pass a fixed-offset abbreviation like "EST" as timezoneID; it is a valid identifier but never observes daylight saving, so it reads an hour wrong for half the year. Use the region id, "America/New_York".'},
    ],
    anatomy: [
      {name: 'Formatted text', required: true, description: 'The rendered date, time, or relative label like "2 hours ago" or "Mar 21, 2025".'},
      {name: 'Hover card', required: false, description: 'A copyable hover card showing the full absolute date and time when the display is relative, or the rows configured via tooltipEntries. Its default single row carries the full absolute time.'},
      {name: 'Hover card row', required: false, description: 'One row of the card: an optional label beside the instant rendered in one time zone and format. Rows opt into a copy button via isCopyable.'},
      {name: 'Copy button', required: true, description: 'Per-row copy-to-clipboard button in the hover card; copies that row\'s formatted value.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'formatted timestamp with relative/absolute/auto modes, live updates, timezone display, and a copyable multi-zone hover card (default single full-time row, customized via tooltipEntries)',
  usage: {
    description:
      'Timestamp formats a date or time into readable text. Use for creation dates, update times, or schedules; relative for recency, absolute for precision, auto to switch automatically.',
    bestPractices: [
      {guidance: true, description: 'Auto format in feeds and lists; recent shows relative, older shows date_time.'},
      {guidance: true, description: 'Consistent formatting within the same list or table column.'},
      {guidance: true, description: 'isTimezoneShown for multi-timezone audiences.'},
      {guidance: true, description: 'tooltipEntries to compare zones when the reader time and event zone both matter.'},
      {guidance: true, description: 'Label each entry once a tooltip shows more than one zone; a bare abbreviation is not always recognizable (Tokyo renders "GMT+9", not "JST").'},
      {guidance: true, description: 'isLive for dashboards so relative time stays current.'},
      {guidance: true, description: 'tooltipEntries when readers must grab an exact value: an incident log or deploy record where someone pastes the UTC time or Unix seconds; entries turn the hover into copy-to-clipboard rows.'},
      {guidance: false, description: 'Don\'t show raw Unix timestamps or ISO strings; always use Timestamp.'},
      {guidance: false, description: 'Avoid system_* formats in user-facing UI; those are for dev tools and logs.'},
      {guidance: false, description: 'Don\'t disable the hover card on relative timestamps; users expect the full date on hover.'},
      {guidance: false, description: 'Don\'t stack many zones in one card; it caps at 300px and long labels wrap. Two or three read well.'},
      {guidance: false, description: 'Don\'t use fixed-offset ids like "EST" for timezoneID; they skip DST. Use region ids like "America/New_York".'},
    ],
  },
  propDescriptions: {
    value: 'date/time as unix seconds or ISO string',
    format: "display mode: 'relative' (locale-native long wording), 'relative_short' (locale-native narrow wording), 'auto', 'date', 'date_long', 'date_weekday', 'date_time', 'time', 'system_date', 'system_date_time', 'system_time', 'unix_seconds'",
    autoThreshold: 'seconds threshold for auto relative\u2192date_time switch',
    hasTooltip: 'show copyable full-time hover card on hover (relative mode, or any format with tooltipEntries)',
    tooltipEntries:
      "hover rows across zones/formats: [{timezoneID?, format?, label?}]; timezoneID omitted or 'local' = viewer zone, format defaults to 'full'; the hover surface is always a copy-to-clipboard card, these customize its rows (default: a single full-time row), and configuring entries enables the card on absolute formats",
    isTimezoneShown:
      'append timezone abbreviation to visible text (date_time and time only)',
    isLive: 'live-update relative time',
    type: 'Text semantic type',
    size: 'font size override',
    color: 'text color',
    weight: 'font weight override',
  },
};
