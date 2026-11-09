// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file page.tsx
 * @position A standalone phone page for PowerSearch's bottom-sheet flow, with
 *   a config sized like real product filter bars and every value type
 *   PowerSearch edits. The page scrolls as a normal document, so touch
 *   scrolling and the sheets behave as they do in a product, outside any
 *   Storybook frame.
 * @input None
 * @output The PowerSearch trigger in a document-scrolling page
 */

'use client';

import {useState} from 'react';
import {PowerSearch} from '@astryxdesign/core/PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';
import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Heading, Text} from '@astryxdesign/core/Text';

const priorityValues = [
  {value: 'p0', label: 'P0 - Critical'},
  {value: 'p1', label: 'P1 - High'},
  {value: 'p2', label: 'P2 - Medium'},
  {value: 'p3', label: 'P3 - Low'},
];

const tagValues = [
  {value: 'bug', label: 'Bug'},
  {value: 'feature', label: 'Feature'},
  {value: 'docs', label: 'Documentation'},
  {value: 'perf', label: 'Performance'},
  {value: 'security', label: 'Security'},
  {value: 'ux', label: 'UX'},
  {value: 'infra', label: 'Infrastructure'},
];

const users: SearchableItem[] = [
  {
    id: 'user-1',
    label: 'Alice Johnson',
    auxiliaryData: {photo: 'https://i.pravatar.cc/150?u=alice'},
  },
  {
    id: 'user-2',
    label: 'Bob Smith',
    auxiliaryData: {photo: 'https://i.pravatar.cc/150?u=bob'},
  },
  {
    id: 'user-3',
    label: 'Charlie Brown',
    auxiliaryData: {photo: 'https://i.pravatar.cc/150?u=charlie'},
  },
  {
    id: 'user-4',
    label: 'Diana Prince',
    auxiliaryData: {photo: 'https://i.pravatar.cc/150?u=diana'},
  },
  {
    id: 'user-5',
    label: 'Eve Williams',
    auxiliaryData: {photo: 'https://i.pravatar.cc/150?u=eve'},
  },
  {
    id: 'user-6',
    label: 'Frank Miller',
    auxiliaryData: {photo: 'https://i.pravatar.cc/150?u=frank'},
  },
];

const realisticRegions = Array.from({length: 60}, (_, index) => ({
  value: `region_${index + 1}`,
  label: `Region ${String(index + 1).padStart(2, '0')} · ${(
    (index * 7919) %
    9000
  ).toLocaleString('en-US')} items`,
}));

const realisticStages = [
  'Draft',
  'Submitted',
  'In triage',
  'Accepted',
  'In progress',
  'Blocked by dependency',
  'In review',
  'Ready to release',
  'Released',
  'Won’t do',
  'Archived',
].map((label, index) => ({value: `stage_${index}`, label}));

const realisticOwnerSource: SearchSource = {
  search: async (query: string) => {
    await new Promise(resolve => setTimeout(resolve, 150));
    return users.filter(user =>
      user.label.toLowerCase().includes(query.toLowerCase()),
    );
  },
  bootstrap: () => users,
};

const realisticTagSource: SearchSource = {
  search: (query: string) =>
    tagValues
      .filter(tag => tag.label.toLowerCase().includes(query.toLowerCase()))
      .map(tag => ({id: tag.value, label: tag.label})),
  bootstrap: () => tagValues.map(tag => ({id: tag.value, label: tag.label})),
};

function RealisticCodeEditor({
  value,
  onChange,
  placeholder,
  isDisabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  isDisabled?: boolean;
}) {
  return (
    <TextInput
      label="Code"
      isLabelHidden
      value={value ?? ''}
      placeholder={placeholder}
      isDisabled={isDisabled}
      width="100%"
      onChange={next => onChange(next === '' ? null : next.toUpperCase())}
    />
  );
}

const realisticTextOperators: PowerSearchConfig['fields'][number]['operators'] =
  [
    {key: 'contains', label: 'contains', value: {type: 'string'}},
    {key: 'not_contains', label: 'does not contain', value: {type: 'string'}},
    {key: 'is', label: 'is exactly', value: {type: 'string'}},
    {key: 'is_not', label: 'is not exactly', value: {type: 'string'}},
    {key: 'starts', label: 'starts with', value: {type: 'string'}},
    {key: 'ends', label: 'ends with', value: {type: 'string'}},
    {key: 'any', label: 'is any of', value: {type: 'string_list'}},
    {key: 'none', label: 'is none of', value: {type: 'string_list'}},
    {key: 'set', label: 'is set', value: {type: 'empty'}},
    {key: 'unset', label: 'is not set', value: {type: 'empty'}},
  ];

function realisticNumberOperators(
  type: 'integer' | 'float',
  units?: string,
): PowerSearchConfig['fields'][number]['operators'] {
  const value = {type, minValue: 0, units} as const;
  return [
    {key: 'eq', label: 'equals', value},
    {key: 'ne', label: 'does not equal', value},
    {key: 'gt', label: 'is greater than', value},
    {key: 'gte', label: 'is at least', value},
    {key: 'lt', label: 'is less than', value},
    {key: 'lte', label: 'is at most', value},
    {key: 'set', label: 'is set', value: {type: 'empty'}},
    {key: 'unset', label: 'is not set', value: {type: 'empty'}},
  ];
}

const realisticConfig: PowerSearchConfig = {
  name: 'RealisticSearch',
  fields: [
    {
      key: 'title',
      label: 'Title',
      group: 'Basics',
      defaultOperator: 'contains',
      operators: realisticTextOperators,
    },
    {
      key: 'stage',
      label: 'Stage',
      group: 'Basics',
      description: 'Where the item is in its workflow, from draft to archived.',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'enum', values: realisticStages},
        },
        {
          key: 'is_not',
          label: 'is not',
          value: {type: 'enum', values: realisticStages},
        },
        {
          key: 'any',
          label: 'is any of',
          value: {type: 'enum_list', values: realisticStages},
        },
        {
          key: 'none',
          label: 'is none of',
          value: {type: 'enum_list', values: realisticStages},
        },
        {key: 'set', label: 'is set', value: {type: 'empty'}},
        {key: 'unset', label: 'is not set', value: {type: 'empty'}},
      ],
    },
    {
      key: 'priority',
      label: 'Priority',
      group: 'Basics',
      operators: [
        {key: 'is', label: 'is', value: {type: 'enum', values: priorityValues}},
        {
          key: 'is_not',
          label: 'is not',
          value: {type: 'enum', values: priorityValues},
        },
        {
          key: 'any',
          label: 'is any of',
          value: {type: 'enum_list', values: priorityValues},
        },
        {
          key: 'none',
          label: 'is none of',
          value: {type: 'enum_list', values: priorityValues},
        },
      ],
    },
    {
      key: 'region',
      label: 'Primary delivery region',
      group: 'Basics',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'enum', values: realisticRegions},
        },
        {
          key: 'any',
          label: 'is any of',
          value: {type: 'enum_list', values: realisticRegions},
        },
        {
          key: 'none',
          label: 'is none of',
          value: {type: 'enum_list', values: realisticRegions},
        },
      ],
    },
    {
      key: 'owner',
      label: 'Owner',
      group: 'People',
      operators: [
        {
          key: 'any',
          label: 'is any of',
          value: {type: 'entity_list', searchSource: realisticOwnerSource},
        },
        {
          key: 'none',
          label: 'is none of',
          value: {type: 'entity_list', searchSource: realisticOwnerSource},
        },
        {key: 'set', label: 'is set', value: {type: 'empty'}},
        {key: 'unset', label: 'is not set', value: {type: 'empty'}},
      ],
    },
    {
      key: 'reviewer',
      label: 'Reviewer (searches as you type)',
      group: 'People',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'string', searchSource: realisticOwnerSource},
        },
        {
          key: 'is_not',
          label: 'is not',
          value: {type: 'string', searchSource: realisticOwnerSource},
        },
      ],
    },
    {
      key: 'labels',
      label: 'Labels',
      group: 'People',
      operators: [
        {
          key: 'include',
          label: 'include',
          value: {
            type: 'string_list',
            searchSource: realisticTagSource,
            isArbitraryStringAllowed: true,
          },
        },
        {
          key: 'exclude',
          label: 'exclude',
          value: {
            type: 'string_list',
            searchSource: realisticTagSource,
            isArbitraryStringAllowed: true,
          },
        },
      ],
    },
    {
      key: 'estimate',
      label: 'Estimate',
      group: 'Numbers',
      operators: realisticNumberOperators('integer', 'points'),
    },
    {
      key: 'budget',
      label: 'Approved budget',
      group: 'Numbers',
      description:
        'The amount approved at the last planning review, in US dollars.',
      operators: realisticNumberOperators('float', 'USD'),
    },
    {
      key: 'created',
      label: 'Created',
      group: 'Dates',
      operators: [
        {
          key: 'on',
          label: 'is on',
          value: {type: 'date_absolute', isDateOnly: true},
        },
        {
          key: 'before',
          label: 'is before',
          value: {type: 'date_absolute', isDateOnly: true},
        },
        {
          key: 'after',
          label: 'is after',
          value: {type: 'date_absolute', isDateOnly: true},
        },
        {
          key: 'within',
          label: 'is within the last',
          value: {
            type: 'date_relative',
            isPastAllowed: true,
            isFutureAllowed: false,
          },
        },
        {key: 'between', label: 'is between', value: {type: 'date_range'}},
        {key: 'set', label: 'is set', value: {type: 'empty'}},
      ],
    },
    {
      key: 'due',
      label: 'Due',
      group: 'Dates',
      operators: [
        {
          key: 'before',
          label: 'is before',
          value: {type: 'date_absolute', isDateOnly: false},
        },
        {
          key: 'after',
          label: 'is after',
          value: {type: 'date_absolute', isDateOnly: false},
        },
        {
          key: 'next',
          label: 'is within the next',
          value: {
            type: 'date_relative',
            isPastAllowed: false,
            isFutureAllowed: true,
          },
        },
        {key: 'unset', label: 'is not set', value: {type: 'empty'}},
      ],
    },
    {
      key: 'window',
      label: 'Maintenance window',
      group: 'Dates',
      operators: [
        {key: 'between', label: 'is between', value: {type: 'date_range'}},
      ],
    },
    {
      key: 'start_time',
      label: 'Daily start time',
      group: 'Dates',
      operators: [
        {key: 'before', label: 'is before', value: {type: 'time'}},
        {key: 'after', label: 'is after', value: {type: 'time'}},
      ],
    },
    {
      key: 'code',
      label: 'Cost center code',
      group: 'Other',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'custom',
            Editor: RealisticCodeEditor,
            getString: value => value,
          },
        },
      ],
    },
    {
      key: 'flagged',
      label: 'Flagged for follow-up only',
      group: 'Other',
      operators: [{key: 'yes', label: '', value: {type: 'empty'}}],
    },
    {
      key: 'notes',
      label: 'Notes',
      group: 'Other',
      defaultOperator: 'contains',
      operators: realisticTextOperators.slice(0, 6),
    },
    {
      key: 'any_of_group',
      label: 'Any of these conditions',
      group: 'Other',
      operators: [
        {key: 'match_any', label: 'match any', value: {type: 'nested'}},
        {key: 'match_all', label: 'match all', value: {type: 'nested'}},
      ],
    },
  ],
};

const realisticPresetFilters: ReadonlyArray<PowerSearchFilter> = [
  {
    field: 'stage',
    operator: 'any',
    value: {type: 'enum_list', value: ['stage_1', 'stage_4', 'stage_6']},
  },
  {field: 'priority', operator: 'is', value: {type: 'enum', value: 'p1'}},
];

export default function PowerSearchPhonePage() {
  const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>(
    realisticPresetFilters,
  );
  return (
    <main
      style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
      <Heading level={1}>Filters on a phone</Heading>
      <PowerSearch
        config={realisticConfig}
        filters={filters}
        onChange={next => setFilters(next)}
        timezoneID="America/Los_Angeles"
        presentation="bottom-sheet"
      />
      {Array.from({length: 24}, (_, index) => (
        <Text key={index} type="body">
          {`Result ${index + 1}. The page scrolls as a normal document behind the filters, so a sheet opens over a page that scrolls on its own.`}
        </Text>
      ))}
    </main>
  );
}
