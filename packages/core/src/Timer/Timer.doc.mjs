// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Elapsed time',
    required: true,
    description:
      'Semantic time element containing a standardized elapsed duration.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Timer',
  displayName: 'Timer',
  category: 'Content',
  keywords: [
    'timer',
    'elapsed',
    'duration',
    'seconds',
    'minutes',
    'hours',
    'stopwatch',
    'waiting',
    'loading',
    'processing',
  ],
  props: [
    {
      name: 'startTime',
      type: 'number',
      description:
        "Unix time in milliseconds when the measured operation began. Omit it to start from this Timer's mount.",
    },
    {
      name: 'format',
      type: "'elapsed' | 'clock'",
      description:
        'Standard duration representation. Elapsed uses compact units and drops seconds after one hour; clock uses m:ss or h:mm:ss.',
      default: "'elapsed'",
    },
    {
      name: 'type',
      type: "'body' | 'large' | 'label' | 'supporting' | 'code' | 'display-1' | 'display-2' | 'display-3' | 'inherit'",
      description:
        'Semantic text type. Uses the same typography behavior as Timestamp.',
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
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the Text wrapper. Must be a stylex.create() value.',
    },
    {
      name: 'className',
      type: 'string',
      description:
        'CSS class name for the Text wrapper. Prefer xstyle for styling.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        'Inline styles for the Text wrapper. Prefer xstyle for styling.',
    },
  ],
  examples: [
    {
      label: 'Elapsed duration',
      code: '<Timer />',
    },
    {
      label: 'Stopwatch clock',
      code: '<Timer format="clock" />',
    },
    {
      label: 'Operation that started before mount',
      code: '<Timer startTime={operationStartedAt} />',
    },
    {
      label: 'Match surrounding text',
      code: `<Text>
  Processing for <Timer type="inherit" color="inherit" />
</Text>`,
    },
    {
      label: 'Prominent elapsed time',
      code: '<Timer type="body" size="lg" color="primary" weight="semibold" />',
    },
  ],
  theming: {
    targets: [{className: 'astryx-timer'}],
  },
  usage: {
    anatomy,
    description:
      'Displays a standardized elapsed duration for active work without scheduling a React render on every tick. Elapsed format updates by second below one hour and by minute after one hour; clock format remains second-precise.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use elapsed for compact duration text that may span seconds, minutes, or hours.',
      },
      {
        guidance: true,
        description:
          'Use clock for stopwatch-like surfaces where seconds remain meaningful after an hour.',
      },
      {
        guidance: true,
        description:
          'Pass startTime when the operation began before Timer mounted so the display reflects the complete wait.',
      },
      {
        guidance: false,
        description:
          'Do not use Timer for dates, time zones, or relative calendar language; use Timestamp instead.',
      },
      {
        guidance: false,
        description:
          'Do not add aria-live unless hearing an announcement every tick is appropriate for the specific task.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Standardized elapsed or stopwatch duration with clock-derived, non-rendering DOM updates.',
  propDescriptions: {
    startTime:
      "operation start as Unix milliseconds; omit to count from Timer's mount",
    format: 'elapsed compact units or clock stopwatch notation',
    type: 'semantic text type; defaults to supporting like Timestamp',
    size: 'explicit font size override',
    color: 'text color; defaults to secondary like Timestamp',
    weight: 'font weight override',
    xstyle: 'StyleX styles for the Text wrapper',
    className: 'CSS class for the Text wrapper',
    style: 'inline styles for the Text wrapper',
  },
  usage: {
    anatomy,
    description:
      'Use for active-operation elapsed time when periodic React renders would add avoidable work.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use elapsed for compact durations and clock for stopwatch UI.',
      },
      {
        guidance: true,
        description: 'Pass startTime for work that began before mount.',
      },
      {
        guidance: false,
        description: 'Use Timestamp for dates and relative calendar language.',
      },
    ],
  },
};
