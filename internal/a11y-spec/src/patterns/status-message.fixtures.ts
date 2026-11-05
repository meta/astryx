// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file status-message.fixtures.ts
 * @input Uses the status-message binding facts
 * @output Plain-HTML conforming and deliberately violating fixtures, transition data, and mutation map
 * @position Contract self-test fixtures; no Astryx component is used here
 */

import type {StatusMessageStateFacts} from './status-message';

export const STATUS_MESSAGE_SUBJECT_SELECTOR = '[data-a11y-subject]';

export type StatusMessageTransition =
  'show' | 'replace' | 'clear' | 'repeat' | 'progress' | 'complete';

export interface StatusMessageFixtureTransition {
  readonly value?: string | null;
  readonly attribute?: 'aria-label' | 'aria-valuenow';
  readonly attributes?: Readonly<Record<string, string | null>>;
  readonly hiddenValue?: string;
  readonly replaceSubject?: boolean;
  readonly removeSubject?: boolean;
  readonly pulse?: boolean;
  readonly focusSelector?: string;
}

export interface StatusMessageFixture {
  readonly id: string;
  readonly facts: StatusMessageStateFacts;
  readonly html: string;
  readonly transitions?: Readonly<
    Partial<Record<StatusMessageTransition, StatusMessageFixtureTransition>>
  >;
}

const POLITE_FACTS: StatusMessageStateFacts = {
  kind: 'live-region',
  role: 'status',
  politeness: 'polite',
  messageSource: 'text',
  initialMessage: '',
  message: 'Changes saved',
  replacement: 'Profile updated',
  semanticTransitions: ['show', 'replace', 'repeat', 'clear'],
};

const MOUNTED_POLITE_FACTS: StatusMessageStateFacts = {
  ...POLITE_FACTS,
  initialMessage: 'Changes saved',
  semanticTransitions: ['replace'],
};

const ASSERTIVE_FACTS: StatusMessageStateFacts = {
  ...POLITE_FACTS,
  role: 'alert',
  politeness: 'assertive',
  message: 'Upload failed',
  replacement: 'Connection failed',
};

const NAMED_FACTS: StatusMessageStateFacts = {
  ...POLITE_FACTS,
  role: 'status',
  messageSource: 'accessible-name',
  semanticTransitions: ['show', 'replace'],
};

const PROGRESS_FACTS: StatusMessageStateFacts = {
  kind: 'progressbar',
  politeness: null,
  name: 'Upload progress',
  initialValue: null,
  initialMin: 0,
  initialMax: 100,
  progressValue: 40,
  completionValue: 100,
  minValue: 0,
  maxValue: 100,
};

const REVERSED_INITIAL_PROGRESS_FACTS: StatusMessageStateFacts = {
  ...PROGRESS_FACTS,
  initialMin: 5,
  initialMax: 0,
};

const OUT_OF_INITIAL_RANGE_PROGRESS_FACTS: StatusMessageStateFacts = {
  ...PROGRESS_FACTS,
  initialValue: 10,
  initialMin: 0,
  initialMax: 5,
};

const REVERSED_PROGRESS_FACTS: StatusMessageStateFacts = {
  ...PROGRESS_FACTS,
  minValue: 100,
  maxValue: 0,
};

const OUT_OF_RANGE_PROGRESS_FACTS: StatusMessageStateFacts = {
  ...PROGRESS_FACTS,
  progressValue: 120,
};

const POLITE_TRANSITIONS = {
  show: {value: 'Changes saved'},
  replace: {value: 'Profile updated'},
  clear: {value: ''},
  repeat: {value: 'Changes saved', pulse: true},
} as const;

export const STATUS_MESSAGE_FIXTURES: readonly StatusMessageFixture[] = [
  {
    id: 'conforming-polite-channel',
    facts: POLITE_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Save</button><div data-a11y-subject role="status" aria-live="polite" aria-atomic="true"></div>',
    transitions: POLITE_TRANSITIONS,
  },
  {
    id: 'conforming-removable-status',
    facts: POLITE_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Save</button><div data-a11y-subject role="status" aria-live="polite" aria-atomic="true"></div>',
    transitions: {
      show: {value: 'Changes saved'},
      replace: {value: 'Profile updated'},
      repeat: {value: 'Changes saved', pulse: true},
      clear: {removeSubject: true},
    },
  },
  {
    id: 'conforming-assertive-channel',
    facts: ASSERTIVE_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Upload</button><div data-a11y-subject role="alert" aria-live="assertive" aria-atomic="true"></div>',
    transitions: {
      show: {value: 'Upload failed'},
      replace: {value: 'Connection failed'},
      clear: {value: ''},
      repeat: {value: 'Upload failed', pulse: true},
    },
  },
  {
    id: 'conforming-named-channel',
    facts: NAMED_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Load</button><div data-a11y-subject role="status" aria-label=""></div>',
    transitions: {
      show: {attribute: 'aria-label', value: 'Changes saved'},
      replace: {attribute: 'aria-label', value: 'Profile updated'},
    },
  },
  {
    id: 'conforming-progress',
    facts: PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
    transitions: {
      progress: {attribute: 'aria-valuenow', value: '40'},
      complete: {attribute: 'aria-valuenow', value: '100'},
    },
  },
  {
    id: 'violating-unexposed-channel',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject></div>',
  },
  {
    id: 'violating-wrong-channel',
    facts: ASSERTIVE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
  },
  {
    id: 'violating-loses-channel',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {
      show: {value: 'Changes saved', attributes: {'aria-live': 'assertive'}},
    },
  },
  {
    id: 'violating-wrong-role',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="log" aria-live="polite" aria-atomic="true"></div>',
  },
  {
    id: 'violating-loses-role',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {
      show: {
        value: 'Changes saved',
        attributes: {role: 'log', 'aria-live': 'polite', 'aria-atomic': 'true'},
      },
    },
  },
  {
    id: 'violating-replaced-on-show',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {show: {value: 'Changes saved', replaceSubject: true}},
  },
  {
    id: 'violating-replaced-on-first-update',
    facts: MOUNTED_POLITE_FACTS,
    html: '<div data-a11y-subject role="status">Changes saved</div>',
    transitions: {
      replace: {value: 'Profile updated', replaceSubject: true},
    },
  },
  {
    id: 'violating-missing-message',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {show: {}},
  },
  {
    id: 'violating-hidden-message',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {show: {hiddenValue: 'Changes saved'}},
  },
  {
    id: 'violating-non-atomic',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status" aria-atomic="false"></div>',
  },
  {
    id: 'violating-loses-atomicity',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {
      show: {value: 'Changes saved', attributes: {'aria-atomic': 'false'}},
    },
  },
  {
    id: 'violating-replaced-region',
    facts: POLITE_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Save</button><div data-a11y-subject role="status"></div>',
    transitions: {
      show: {value: 'Changes saved'},
      replace: {value: 'Profile updated', replaceSubject: true},
      clear: {value: ''},
      repeat: {value: 'Changes saved', pulse: true},
    },
  },
  {
    id: 'violating-wrong-replacement',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {
      show: {value: 'Changes saved'},
      replace: {value: 'Changes saved'},
    },
  },
  {
    id: 'violating-hidden-replacement',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {
      show: {value: 'Changes saved'},
      replace: {hiddenValue: 'Profile updated'},
    },
  },
  {
    id: 'violating-hidden-repeat',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {
      show: {value: 'Changes saved'},
      replace: {value: 'Profile updated'},
      repeat: {hiddenValue: 'Changes saved'},
    },
  },
  {
    id: 'violating-stale-clear',
    facts: POLITE_FACTS,
    html: '<div data-a11y-subject role="status"></div>',
    transitions: {
      show: {value: 'Changes saved'},
      replace: {value: 'Profile updated'},
      repeat: {value: 'Changes saved', pulse: true},
      clear: {},
    },
  },
  {
    id: 'violating-named-never-updates',
    facts: NAMED_FACTS,
    html: '<div data-a11y-subject role="status" aria-label=""></div>',
    transitions: {show: {}},
  },
  {
    id: 'violating-moves-focus',
    facts: POLITE_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Save</button><div data-a11y-subject role="status" tabindex="-1"></div>',
    transitions: {
      show: {
        value: 'Changes saved',
        focusSelector: STATUS_MESSAGE_SUBJECT_SELECTOR,
      },
    },
  },
  {
    id: 'violating-progress-role',
    facts: PROGRESS_FACTS,
    html: '<div data-a11y-subject aria-label="Upload progress"></div>',
  },
  {
    id: 'violating-progress-loses-role',
    facts: PROGRESS_FACTS,
    html: '<div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
    transitions: {
      progress: {
        attribute: 'aria-valuenow',
        value: '40',
        attributes: {role: 'group'},
      },
      complete: {attribute: 'aria-valuenow', value: '100'},
    },
  },
  {
    id: 'violating-progress-name',
    facts: PROGRESS_FACTS,
    html: '<div data-a11y-subject role="progressbar"></div>',
  },
  {
    id: 'violating-progress-loses-name',
    facts: PROGRESS_FACTS,
    html: '<div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
    transitions: {
      progress: {
        attribute: 'aria-valuenow',
        value: '40',
        attributes: {'aria-label': null},
      },
      complete: {attribute: 'aria-valuenow', value: '100'},
    },
  },
  {
    id: 'violating-progress-initial-value',
    facts: PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress" aria-valuenow="5"></div>',
    transitions: {
      progress: {attribute: 'aria-valuenow', value: '40'},
      complete: {attribute: 'aria-valuenow', value: '100'},
    },
  },
  {
    id: 'violating-reversed-initial-progress-range',
    facts: REVERSED_INITIAL_PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
  },
  {
    id: 'violating-out-of-initial-range-value',
    facts: OUT_OF_INITIAL_RANGE_PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="5" aria-valuenow="10"></div>',
  },
  {
    id: 'violating-reversed-progress-range',
    facts: REVERSED_PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
  },
  {
    id: 'violating-out-of-range-progress-value',
    facts: OUT_OF_RANGE_PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
  },
  {
    id: 'violating-frozen-progress',
    facts: PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
    transitions: {progress: {}, complete: {}},
  },
  {
    id: 'violating-incomplete-progress',
    facts: PROGRESS_FACTS,
    html: '<button data-a11y-relation="focus-anchor">Start upload</button><div data-a11y-subject role="progressbar" aria-label="Upload progress"></div>',
    transitions: {
      progress: {attribute: 'aria-valuenow', value: '40'},
      complete: {attribute: 'aria-valuenow', value: '40'},
    },
  },
];

export const STATUS_MESSAGE_CONFORMING_FIXTURES = [
  'conforming-polite-channel',
  'conforming-removable-status',
  'conforming-assertive-channel',
  'conforming-named-channel',
  'conforming-progress',
] as const;

export interface StatusMessageMutation {
  readonly fixture: string;
  /** Semantic detail that proves the intended branch, not a harness failure, failed. */
  readonly failureIncludes: string;
}

export const STATUS_MESSAGE_MUTATIONS: Readonly<
  Record<string, readonly StatusMessageMutation[]>
> = {
  'status-message.role.exposed': [
    {
      fixture: 'violating-wrong-role',
      failureIncludes: 'not as the declared "status" role',
    },
    {
      fixture: 'violating-loses-role',
      failureIncludes: 'after the "show" transition',
    },
  ],
  'status-message.channel.exposed': [
    {
      fixture: 'violating-unexposed-channel',
      failureIncludes: 'exposes no live channel at the pre-update boundary',
    },
    {
      fixture: 'violating-wrong-channel',
      failureIncludes: 'not the intended assertive channel',
    },
    {
      fixture: 'violating-loses-channel',
      failureIncludes:
        'after the "show" transition, not the intended polite channel',
    },
  ],
  'status-message.region.precedes-update': [
    {
      fixture: 'violating-replaced-on-show',
      failureIncludes:
        'role=status container was replaced by the "show" update',
    },
    {
      fixture: 'violating-replaced-on-first-update',
      failureIncludes:
        'role=status container was replaced by the "replace" update',
    },
  ],
  'status-message.message.text-exposed': [
    {
      fixture: 'violating-missing-message',
      failureIncludes: 'not the complete authored message',
    },
    {
      fixture: 'violating-hidden-message',
      failureIncludes: 'accessibility tree exposes ""',
    },
    {
      fixture: 'violating-wrong-replacement',
      failureIncludes:
        'after the "replace" transition, not the complete authored message "Profile updated"',
    },
    {
      fixture: 'violating-hidden-replacement',
      failureIncludes:
        'accessibility tree exposes "" after the "replace" transition',
    },
    {
      fixture: 'violating-hidden-repeat',
      failureIncludes:
        'accessibility tree exposes "" after the "repeat" transition',
    },
    {
      fixture: 'violating-stale-clear',
      failureIncludes:
        'after the "clear" transition, not the complete authored message ""',
    },
  ],
  'status-message.message.name-exposed': [
    {
      fixture: 'violating-named-never-updates',
      failureIncludes: 'not "Changes saved"',
    },
  ],
  'status-message.region.atomic': [
    {
      fixture: 'violating-non-atomic',
      failureIncludes:
        'not expose this status region as atomic at the pre-update boundary',
    },
    {
      fixture: 'violating-loses-atomicity',
      failureIncludes:
        'not expose this status region as atomic after the "show" transition',
    },
  ],
  'status-message.focus.unchanged': [
    {
      fixture: 'violating-moves-focus',
      failureIncludes: 'status transition moved focus away',
    },
  ],
  'status-message.progress.role-exposed': [
    {
      fixture: 'violating-progress-role',
      failureIncludes: 'not as a progress bar',
    },
    {
      fixture: 'violating-progress-loses-role',
      failureIncludes: 'after the "progress" transition, not as a progress bar',
    },
  ],
  'status-message.progress.name-exposed': [
    {
      fixture: 'violating-progress-name',
      failureIncludes: 'browser computes no accessible name',
    },
    {
      fixture: 'violating-progress-loses-name',
      failureIncludes: 'after the "progress" transition',
    },
  ],
  'status-message.progress.values-exposed': [
    {
      fixture: 'violating-reversed-initial-progress-range',
      failureIncludes: 'reversed initial progress range 5..0',
    },
    {
      fixture: 'violating-out-of-initial-range-value',
      failureIncludes: 'initial progress value 10 outside 0..5',
    },
    {
      fixture: 'violating-reversed-progress-range',
      failureIncludes: 'binding declares a reversed progress range 100..0',
    },
    {
      fixture: 'violating-out-of-range-progress-value',
      failureIncludes: 'progress value 120 outside 0..100',
    },
    {
      fixture: 'violating-progress-initial-value',
      failureIncludes: 'initial progress as value=5',
    },
    {
      fixture: 'violating-frozen-progress',
      failureIncludes: 'browser exposes progress as value=',
    },
    {
      fixture: 'violating-incomplete-progress',
      failureIncludes: 'browser exposes completion as value=',
    },
  ],
};

export function statusMessageFixture(id: string): StatusMessageFixture {
  const found = STATUS_MESSAGE_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown status-message fixture "${id}"`);
  }
  return found;
}
