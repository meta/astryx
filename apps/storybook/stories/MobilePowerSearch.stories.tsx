// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file MobilePowerSearch.stories.tsx
 * @input Uses MobilePowerSearch (Lab) with a representative PowerSearch config
 *   covering enum, enum_list, string, entity_list, integer, float, date and
 *   string_list operators, plus a content-search variant
 * @output Storybook try-it stories at phone width (390px): the field-wide
 *   trigger with tokens, the Filters sheet, Add filter, the operator step,
 *   choice rows, and the inline content-search suggestions
 * @position Lab story; touch PowerSearch prototype
 */
import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';
import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import {MobilePowerSearch} from '@astryxdesign/lab';

// =============================================================================
// Sample data (mirrors the Core PowerSearch "full" configuration)
// =============================================================================

const statusValues = [
  {value: 'open', label: 'Open'},
  {value: 'in_progress', label: 'In Progress'},
  {value: 'review', label: 'In Review'},
  {value: 'closed', label: 'Closed'},
  {value: 'blocked', label: 'Blocked'},
];

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
  {id: 'user-1', label: 'Alice Johnson'},
  {id: 'user-2', label: 'Bob Smith'},
  {id: 'user-3', label: 'Charlie Brown'},
  {id: 'user-4', label: 'Diana Prince'},
  {id: 'user-5', label: 'Eve Williams'},
  {id: 'user-6', label: 'Frank Miller'},
];

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users,
};

const fullConfig: PowerSearchConfig = {
  name: 'FullSearch',
  fields: [
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'any_of',
      operators: [
        {
          key: 'any_of',
          label: 'is any of',
          value: {type: 'enum_list', values: statusValues},
        },
        {
          key: 'none_of',
          label: 'is none of',
          value: {type: 'enum_list', values: statusValues},
        },
      ],
    },
    {
      key: 'title',
      label: 'Title',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
        {
          key: 'not_contains',
          label: 'does not contain',
          value: {type: 'string'},
        },
      ],
    },
    {
      key: 'priority',
      label: 'Priority',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'enum', values: priorityValues},
        },
      ],
    },
    {
      key: 'assignee',
      label: 'Assignee',
      defaultOperator: 'any_of',
      typeaheadAliases: ['owner', 'assigned'],
      operators: [
        {
          key: 'any_of',
          label: 'is any of',
          value: {type: 'entity_list', searchSource: userSource},
        },
        {
          key: 'none_of',
          label: 'is none of',
          value: {type: 'entity_list', searchSource: userSource},
        },
      ],
    },
    {
      key: 'tags',
      label: 'Tags',
      group: 'Metadata',
      defaultOperator: 'include',
      operators: [
        {
          key: 'include',
          label: 'include',
          value: {type: 'enum_list', values: tagValues},
        },
        {
          key: 'exclude',
          label: 'exclude',
          value: {type: 'enum_list', values: tagValues},
        },
      ],
    },
    {
      key: 'line_count',
      label: 'Line count',
      group: 'Metadata',
      defaultOperator: 'gt',
      operators: [
        {
          key: 'gt',
          label: 'is greater than',
          value: {
            type: 'integer',
            minValue: 0,
            maxValue: 10000,
            units: 'lines',
          },
        },
        {
          key: 'lt',
          label: 'is less than',
          value: {
            type: 'integer',
            minValue: 0,
            maxValue: 10000,
            units: 'lines',
          },
        },
      ],
    },
    {
      key: 'cost',
      label: 'Cost',
      group: 'Metadata',
      defaultOperator: 'gt',
      operators: [
        {
          key: 'gt',
          label: '>',
          value: {type: 'float', minValue: 0, maxValue: 100000, units: 'USD'},
        },
        {
          key: 'lt',
          label: '<',
          value: {type: 'float', minValue: 0, maxValue: 100000, units: 'USD'},
        },
      ],
    },
    {
      key: 'created',
      label: 'Created',
      group: 'Dates',
      defaultOperator: 'after',
      operators: [
        {
          key: 'after',
          label: 'is after',
          value: {type: 'date_absolute', isDateOnly: true},
        },
        {
          key: 'newer_than',
          label: 'is newer than',
          value: {
            type: 'date_relative',
            isPastAllowed: true,
            isFutureAllowed: false,
          },
        },
        {key: 'between', label: 'is between', value: {type: 'date_range'}},
      ],
    },
    {
      key: 'ids',
      label: 'ID',
      defaultOperator: 'in',
      operators: [
        {key: 'in', label: 'is any of', value: {type: 'string_list'}},
      ],
    },
    {
      key: 'unread',
      label: 'Only show unread',
      defaultOperator: 'yes',
      operators: [{key: 'yes', label: '', value: {type: 'empty'}}],
    },
  ],
};

const contentSearchConfig: PowerSearchConfig = {
  ...fullConfig,
  name: 'ContentSearch',
  contentSearchFieldKey: 'title',
};

// =============================================================================
// Stories
// =============================================================================

const meta: Meta<typeof MobilePowerSearch> = {
  title: 'Lab/MobilePowerSearch',
  component: MobilePowerSearch,
  parameters: {
    layout: 'padded',
    viewport: {defaultViewport: 'mobile2'},
  },
};
export default meta;
type Story = StoryObj<typeof MobilePowerSearch>;

function PhoneFrame({children}: {children: React.ReactNode}) {
  return <div style={{width: 390, maxWidth: '100%'}}>{children}</div>;
}

function FilterDump({filters}: {filters: ReadonlyArray<PowerSearchFilter>}) {
  if (filters.length === 0) {
    return null;
  }
  return (
    <pre
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        fontSize: 12,
        overflow: 'auto',
        maxWidth: 390,
      }}>
      {JSON.stringify(filters, null, 2)}
    </pre>
  );
}

export const TouchFlow: Story = {
  render: args => {
    const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
      {
        field: 'status',
        operator: 'any_of',
        value: {type: 'enum_list', value: ['open', 'in_progress']},
      },
      {field: 'priority', operator: 'is', value: {type: 'enum', value: 'p1'}},
      {
        field: 'created',
        operator: 'after',
        value: {type: 'date_absolute', unixSeconds: 1710039600},
      },
    ]);
    return (
      <PhoneFrame>
        <MobilePowerSearch
          {...args}
          config={fullConfig}
          filters={filters}
          onChange={next => setFilters(next)}
          timezoneID="America/Los_Angeles"
        />
        <FilterDump filters={filters} />
      </PhoneFrame>
    );
  },
  name: 'Touch flow (field-wide trigger, Filters sheet, drill-down)',
};

export const WithContentSearch: Story = {
  render: args => {
    const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>(
      [],
    );
    return (
      <PhoneFrame>
        <MobilePowerSearch
          {...args}
          config={contentSearchConfig}
          filters={filters}
          onChange={next => setFilters(next)}
          placeholder="Search issues…"
        />
        <FilterDump filters={filters} />
      </PhoneFrame>
    );
  },
  name: 'Content search (Add filter with inline suggestions)',
};

export const ReadOnlyAndDisabled: Story = {
  render: () => {
    const filters: ReadonlyArray<PowerSearchFilter> = [
      {field: 'priority', operator: 'is', value: {type: 'enum', value: 'p0'}},
      {
        field: 'tags',
        operator: 'include',
        value: {type: 'enum_list', value: ['bug', 'security']},
        isReadOnly: true,
      },
    ];
    return (
      <PhoneFrame>
        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          <MobilePowerSearch
            label="Read-only filters"
            isLabelHidden={false}
            config={fullConfig}
            filters={filters}
            onChange={() => {}}
            isReadOnly
          />
          <MobilePowerSearch
            label="Disabled filters"
            isLabelHidden={false}
            config={fullConfig}
            filters={filters}
            onChange={() => {}}
            isDisabled
            disabledMessage="Pick a project first"
          />
        </div>
      </PhoneFrame>
    );
  },
  name: 'Read-only and disabled',
};
