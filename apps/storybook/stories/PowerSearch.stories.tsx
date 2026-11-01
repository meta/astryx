// Copyright (c) Meta Platforms, Inc. and affiliates.

import React, {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {PowerSearch} from '@astryxdesign/core/PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';
import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import {Button} from '@astryxdesign/core/Button';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';

// =============================================================================
// Sample data
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

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users,
};

// =============================================================================
// Configs
// =============================================================================

const basicConfig: PowerSearchConfig = {
  name: 'BasicSearch',
  fields: [
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'enum', values: statusValues},
        },
        {
          key: 'is_not',
          label: 'is not',
          value: {type: 'enum', values: statusValues},
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
  ],
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
        {
          key: 'between',
          label: 'is between',
          value: {type: 'date_range'},
        },
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
      label: 'Unread only',
      defaultOperator: 'yes',
      operators: [{key: 'yes', label: '', value: {type: 'empty'}}],
    },
  ],
};

function simpleField(
  key: string,
  label: string,
  group?: string,
): PowerSearchConfig['fields'][number] {
  return {
    key,
    label,
    group,
    defaultOperator: 'contains',
    operators: [
      {key: 'contains', label: 'contains', value: {type: 'string'}},
      {
        key: 'not_contains',
        label: 'does not contain',
        value: {type: 'string'},
      },
    ],
  };
}

const issueTrackerPeople: SearchableItem[] = Array.from(
  {length: 25},
  (_, index) => ({
    id: `person-${index + 1}`,
    label: `Person ${String(index + 1).padStart(2, '0')}`,
  }),
);

const issueTrackerPeopleSource: SearchSource = {
  search: query =>
    issueTrackerPeople.filter(person =>
      person.label.toLowerCase().includes(query.toLowerCase()),
    ),
  bootstrap: () => issueTrackerPeople,
};

function peopleField(
  key: string,
  label: string,
): PowerSearchConfig['fields'][number] {
  return {
    key,
    label,
    group: 'People',
    defaultOperator: 'any_of',
    operators: [
      {
        key: 'any_of',
        label: 'is any of',
        value: {type: 'entity_list', searchSource: issueTrackerPeopleSource},
      },
    ],
  };
}

const issueTrackerConfig: PowerSearchConfig = {
  name: 'IssueTrackerSearch',
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
      ],
    },
    {
      key: 'priority',
      label: 'Priority',
      defaultOperator: 'is',
      operators: [
        {key: 'is', label: 'is', value: {type: 'enum', values: priorityValues}},
      ],
    },
    simpleField('title', 'Title'),
    simpleField('labels', 'Labels'),
    peopleField('owner', 'Owner'),
    peopleField('creator', 'Creator'),
    peopleField('subscriber', 'Subscriber'),
    peopleField('reviewer', 'Reviewer'),
    simpleField('project', 'Project', 'Planning'),
    simpleField('milestone', 'Milestone', 'Planning'),
    simpleField('sprint', 'Sprint', 'Planning'),
    simpleField('estimate', 'Estimate', 'Planning'),
    {
      key: 'due_date',
      label: 'Due date',
      group: 'Planning',
      defaultOperator: 'before',
      operators: [
        {
          key: 'before',
          label: 'is before',
          value: {type: 'date_absolute', isDateOnly: true},
        },
      ],
    },
    {
      key: 'created',
      label: 'Created',
      group: 'Activity',
      defaultOperator: 'after',
      operators: [
        {
          key: 'after',
          label: 'is after',
          value: {type: 'date_absolute', isDateOnly: true},
        },
      ],
    },
    {
      key: 'updated',
      label: 'Updated',
      group: 'Activity',
      defaultOperator: 'after',
      operators: [
        {
          key: 'after',
          label: 'is after',
          value: {type: 'date_absolute', isDateOnly: true},
        },
      ],
    },
    {
      key: 'comment_count',
      label: 'Comment count',
      group: 'Activity',
      defaultOperator: 'gt',
      operators: [
        {
          key: 'gt',
          label: 'is greater than',
          value: {type: 'integer', minValue: 0},
        },
      ],
    },
    simpleField('linked_items', 'Linked items', 'Activity'),
  ],
};

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof PowerSearch> = {
  title: 'Core/PowerSearch',
  component: PowerSearch,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div style={{width: 600}}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    placeholder: {control: 'text'},
    isDisabled: {control: 'boolean'},
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the search is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (input stays blocked). Use this instead of wrapping a disabled PowerSearch in Tooltip.',
    },
    isReadOnly: {control: 'boolean'},
    hasClear: {control: 'boolean'},
    maxTokenLength: {control: 'number'},
    maxSearchResults: {
      control: 'number',
      description: 'Main ranked results shown after typing a query.',
    },
    maxOperatorMenuItems: {
      control: 'number',
      description:
        'Value results shown after selecting a field, such as people in the Owner picker.',
    },
    menuWidth: {
      control: 'number',
      description: 'Main field/search menu width in pixels.',
    },
    popoverSaveButtonLabel: {control: 'text'},
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Search input size',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PowerSearch>;

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Search by status, title, priority...',
  },
};

export const WithPresetFilters: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
      {
        field: 'priority',
        operator: 'is',
        value: {type: 'enum', value: 'p1'},
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  name: 'Pre-set Filters',
};

/**
 * A nearly full token row keeps its empty combobox on that row instead of
 * growing the field with a blank trailing row. Typing still restores the
 * input's normal editing width and may wrap visibly when space is exhausted.
 */
export const NearFullTokenRow: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
      {
        field: 'priority',
        operator: 'is',
        value: {type: 'enum', value: 'p1'},
      },
      {
        field: 'title',
        operator: 'contains',
        value: {type: 'string', value: 'aaaaaaaaaaaaa'},
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  name: 'Near-full Token Row',
  play: async ({canvasElement}) => {
    const wrapper =
      canvasElement.querySelector<HTMLElement>('.astryx-tokenizer');
    const input = wrapper?.querySelector<HTMLInputElement>('[role="combobox"]');
    const tokens = wrapper?.querySelectorAll<HTMLElement>(':scope > span');
    const firstToken = tokens?.item(0);
    const finalToken = tokens?.item((tokens?.length ?? 0) - 1);
    const clearButton = wrapper?.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear all"]',
    );
    if (!wrapper || !input || !firstToken || !finalToken || !clearButton) {
      throw new Error('Near-full token-row fixture did not render as expected');
    }
    const isCoarsePointer = matchMedia('(pointer: coarse)').matches;
    const requiresCoarsePointer =
      new URLSearchParams(window.location.search).get('storyPlayPointer') ===
      'coarse';
    if (requiresCoarsePointer && !isCoarsePointer) {
      throw new Error('Near-full token-row guard requires a coarse pointer');
    }

    await document.fonts.ready;
    const reserveDeadline = performance.now() + 2000;
    while (
      wrapper.style.getPropertyValue('--_tokenizer-end-lane-reserve') === ''
    ) {
      if (performance.now() >= reserveDeadline) {
        throw new Error('Clear-all lane reserve was not measured');
      }
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
    }
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const inputRect = input.getBoundingClientRect();
    const firstTokenRect = firstToken.getBoundingClientRect();
    const tokenRect = finalToken.getBoundingClientRect();
    const clearRect = clearButton.getBoundingClientRect();
    let clearHitLeft = 0;
    let clearHitRight = 0;
    if (isCoarsePointer) {
      const clearHitStyle = getComputedStyle(clearButton, '::after');
      clearHitLeft = Number.parseFloat(clearHitStyle.left);
      clearHitRight = Number.parseFloat(clearHitStyle.right);
      if (
        clearHitStyle.content === 'none' ||
        !Number.isFinite(clearHitLeft) ||
        !Number.isFinite(clearHitRight)
      ) {
        throw new Error('Clear all did not expose its coarse-pointer hit area');
      }
    }
    const clearHitRect = {
      left: clearRect.left + clearHitLeft,
      right: clearRect.right - clearHitRight,
    };
    if (Math.abs(firstTokenRect.top - tokenRect.top) > 0.5) {
      throw new Error(
        `Fixture tokens wrapped before the empty combobox check: first token top ${firstTokenRect.top.toFixed(2)}, final token top ${tokenRect.top.toFixed(2)}`,
      );
    }
    // Fail closed if token metrics drift: the row is only "nearly full" while
    // the ordinary in-flow editing input (the typed-query layout) cannot fit
    // beside the final token. Without a placeholder the input never matches
    // :placeholder-shown, so it lays out exactly as it does once typing starts.
    const placeholderAttribute = input.getAttribute('placeholder');
    input.removeAttribute('placeholder');
    const inFlowInputTop = input.getBoundingClientRect().top;
    if (placeholderAttribute !== null) {
      input.setAttribute('placeholder', placeholderAttribute);
    }
    if (inFlowInputTop < tokenRect.bottom) {
      throw new Error(
        `Fixture is no longer a nearly full token row: the in-flow editing input still fits beside the final token (input top ${inFlowInputTop.toFixed(2)}, final token bottom ${tokenRect.bottom.toFixed(2)})`,
      );
    }
    if (inputRect.top >= tokenRect.bottom) {
      throw new Error(
        `Empty combobox wrapped onto a blank row: input top ${inputRect.top.toFixed(2)}, final token bottom ${tokenRect.bottom.toFixed(2)}`,
      );
    }
    if (inputRect.width <= 0) {
      throw new Error('Empty combobox has no pointer hit target');
    }
    const overlap =
      Math.min(inputRect.right, clearHitRect.right) -
      Math.max(inputRect.left, clearHitRect.left);
    if (overlap > 0) {
      throw new Error(
        `Empty combobox overlaps the coarse-pointer Clear all hit area by ${overlap.toFixed(2)}px`,
      );
    }
    const clearHitTarget = document.elementFromPoint(
      clearRect.left + clearRect.width / 2,
      clearRect.top + clearRect.height / 2,
    );
    if (!clearHitTarget || !clearButton.contains(clearHitTarget)) {
      throw new Error(
        `Clear all center is hit-tested as ${clearHitTarget?.tagName ?? 'nothing'}`,
      );
    }
    const tokenHitTarget = document.elementFromPoint(
      tokenRect.left + tokenRect.width / 2,
      tokenRect.top + tokenRect.height / 2,
    );
    if (!tokenHitTarget || !finalToken.contains(tokenHitTarget)) {
      throw new Error(
        `Final token center is hit-tested as ${tokenHitTarget?.tagName ?? 'nothing'}`,
      );
    }

    const hitY = inputRect.top + inputRect.height / 2;
    let inputHitTarget: Element | null = null;
    for (let x = Math.ceil(inputRect.left); x < inputRect.right; x += 1) {
      const candidate = document.elementFromPoint(x + 0.5, hitY);
      if (candidate === input) {
        inputHitTarget = candidate;
        break;
      }
    }
    if (!inputHitTarget) {
      throw new Error('Empty combobox has no exposed pointer hit target');
    }
    inputHitTarget.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    if (document.activeElement !== input) {
      throw new Error('Clicking the empty combobox did not focus it');
    }
  },
};

export const NearFullTokenRowRTL: Story = {
  ...NearFullTokenRow,
  decorators: [
    Story => (
      <div dir="rtl">
        <Story />
      </div>
    ),
  ],
  name: 'Near-full Token Row (RTL)',
};

const tokenRowGuardFilters: PowerSearchFilter[] = [
  {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
  {field: 'priority', operator: 'is', value: {type: 'enum', value: 'p1'}},
  {
    field: 'title',
    operator: 'contains',
    value: {type: 'string', value: 'release notes'},
  },
];

const settleFrames = () =>
  new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

/** Resolves once fonts are ready and the clear-all lane has published its reserve. */
async function waitForTokenRow(wrapper: HTMLElement) {
  await document.fonts.ready;
  const deadline = performance.now() + 2000;
  while (
    wrapper.style.getPropertyValue('--_tokenizer-end-lane-reserve') === ''
  ) {
    if (performance.now() >= deadline) {
      throw new Error('Clear-all lane reserve was not measured');
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  await settleFrames();
}

function tokenRowParts(canvasElement: HTMLElement) {
  const wrapper = canvasElement.querySelector<HTMLElement>('.astryx-tokenizer');
  const input = wrapper?.querySelector<HTMLInputElement>('[role="combobox"]');
  const tokens = [
    ...(wrapper?.querySelectorAll<HTMLElement>('.astryx-token') ?? []),
  ];
  if (!wrapper || !input || tokens.length !== tokenRowGuardFilters.length) {
    throw new Error('Token-row fixture did not render as expected');
  }
  return {wrapper, input, tokens};
}

/**
 * Default filters fill more than half of the field, and the search input
 * stays beside them: no token paints over it, and pressing the input's
 * center reaches the input rather than a token.
 */
export const DefaultFiltersBesideSearch: Story = {
  render: args => {
    const [filters, setFilters] = useState(tokenRowGuardFilters);
    return (
      <div style={{width: 600}}>
        <PowerSearch
          {...args}
          config={basicConfig}
          filters={filters}
          onChange={newFilters => setFilters([...newFilters])}
        />
      </div>
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  name: 'Default filters beside the search input',
  play: async ({canvasElement}) => {
    const {wrapper, input, tokens} = tokenRowParts(canvasElement);
    await waitForTokenRow(wrapper);

    const field = wrapper.getBoundingClientRect();
    const tokenRects = tokens.map(token => token.getBoundingClientRect());
    if (new Set(tokenRects.map(rect => Math.round(rect.top))).size !== 1) {
      throw new Error('Fixture tokens no longer share one row');
    }
    // Fail closed if the fixture stops covering the field's middle, where a
    // test or a person would naturally press the search input.
    const fieldCenter = field.left + field.width / 2;
    const tokenEnd = Math.max(...tokenRects.map(rect => rect.right));
    const tokenStart = Math.min(...tokenRects.map(rect => rect.left));
    if (getComputedStyle(wrapper).direction === 'rtl') {
      if (tokenStart > fieldCenter) {
        throw new Error('Fixture tokens no longer reach the field center');
      }
    } else if (tokenEnd < fieldCenter) {
      throw new Error('Fixture tokens no longer reach the field center');
    }

    const inputRect = input.getBoundingClientRect();
    if (inputRect.width <= 0) {
      throw new Error('The search input has no pointer hit target');
    }
    tokens.forEach((token, index) => {
      const rect = tokenRects[index];
      const overlapX =
        Math.min(rect.right, inputRect.right) -
        Math.max(rect.left, inputRect.left);
      const overlapY =
        Math.min(rect.bottom, inputRect.bottom) -
        Math.max(rect.top, inputRect.top);
      if (overlapX > 0.5 && overlapY > 0.5) {
        throw new Error(
          `Token "${token.textContent ?? ''}" covers ${overlapX.toFixed(2)}px of the search input`,
        );
      }
    });
    const hit = document.elementFromPoint(
      inputRect.left + inputRect.width / 2,
      inputRect.top + inputRect.height / 2,
    );
    if (hit !== input) {
      throw new Error(
        `The search input's center is hit-tested as ${hit?.tagName ?? 'nothing'}${hit?.getAttribute('aria-label') ? ` "${hit.getAttribute('aria-label')}"` : ''}`,
      );
    }
    hit.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    if (document.activeElement !== input) {
      throw new Error('Pressing the search input did not focus it');
    }
    input.blur();
  },
};

export const DefaultFiltersBesideSearchRTL: Story = {
  ...DefaultFiltersBesideSearch,
  decorators: [
    Story => (
      <div dir="rtl">
        <Story />
      </div>
    ),
  ],
  name: 'Default filters beside the search input (RTL)',
};

/**
 * An app that compiles its own StyleX can emit the same atomic class as the
 * search input's resting styles, unlayered, so it outranks the input's
 * layered empty-query styles. Whichever single resting declaration wins that
 * way, the empty input stays on the token row: the field never grows a
 * blank row under its filters.
 */
export const TokenRowWhenRestingStylesWin: Story = {
  render: args => {
    const [filters, setFilters] = useState(tokenRowGuardFilters.slice(0, 2));
    return (
      <div style={{width: 600}}>
        <PowerSearch
          {...args}
          config={basicConfig}
          filters={filters}
          onChange={newFilters => setFilters([...newFilters])}
        />
      </div>
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  name: 'Token row when resting styles win',
  play: async ({canvasElement}) => {
    const wrapper =
      canvasElement.querySelector<HTMLElement>('.astryx-tokenizer');
    const input = wrapper?.querySelector<HTMLInputElement>('[role="combobox"]');
    const tokens = [
      ...(wrapper?.querySelectorAll<HTMLElement>('.astryx-token') ?? []),
    ];
    if (!wrapper || !input || tokens.length !== 2) {
      throw new Error('Token-row fixture did not render as expected');
    }
    await waitForTokenRow(wrapper);
    if (!input.matches(':placeholder-shown')) {
      throw new Error(
        'The empty search input does not match :placeholder-shown',
      );
    }

    // The input's own atomic rules, split into resting and empty-query ones.
    const ownClasses = new Set(input.classList);
    const resting: Array<{className: string; property: string; value: string}> =
      [];
    const emptyQueryProperties = new Set<string>();
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSLayerBlockRule) {
          visit(rule.cssRules);
          continue;
        }
        if (!(rule instanceof CSSStyleRule)) {
          continue;
        }
        for (const selector of rule.selectorText.split(',')) {
          const match = /^\.([\w-]+)((?::[\w-]+(?:\([^)]*\))?)*)$/.exec(
            selector.trim(),
          );
          if (!match || !ownClasses.has(match[1])) {
            continue;
          }
          const pseudo = match[2].replace(/:not\(#\\#\)/g, '');
          for (const property of rule.style) {
            if (pseudo === '') {
              resting.push({
                className: match[1],
                property,
                value: rule.style.getPropertyValue(property),
              });
            } else if (pseudo.includes(':placeholder-shown')) {
              emptyQueryProperties.add(property);
            }
          }
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        // A cross-origin sheet cannot style the input's own classes.
      }
    }
    const contested = resting.filter(({property}) =>
      emptyQueryProperties.has(property),
    );
    // Fail closed: with no resting declaration that an empty-query rule
    // overrides, the loop below would prove nothing.
    if (contested.length === 0) {
      throw new Error(
        'No resting declaration of the search input has an empty-query override',
      );
    }

    const restingHeight = wrapper.getBoundingClientRect().height;
    const override = document.createElement('style');
    document.head.append(override);
    try {
      for (const {className, property, value} of contested) {
        override.textContent = `.${CSS.escape(className)}{${property}:${value} !important}`;
        await settleFrames();
        const height = wrapper.getBoundingClientRect().height;
        const inputRect = input.getBoundingClientRect();
        const row = tokens[tokens.length - 1].getBoundingClientRect();
        const inputMiddle = inputRect.top + inputRect.height / 2;
        if (inputMiddle < row.top || inputMiddle > row.bottom) {
          throw new Error(
            `With the resting "${property}: ${value}" winning, the empty search input left the token row (input middle ${inputMiddle.toFixed(2)}, row ${row.top.toFixed(2)}-${row.bottom.toFixed(2)})`,
          );
        }
        if (height > restingHeight + 0.5) {
          throw new Error(
            `With the resting "${property}: ${value}" winning, the field grew from ${restingHeight.toFixed(2)} to ${height.toFixed(2)}`,
          );
        }
      }
    } finally {
      override.remove();
    }
  },
};

export const FullFeatured: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    return (
      <div>
        <PowerSearch
          {...args}
          config={fullConfig}
          filters={filters}
          onChange={(newFilters, _changeType, _index) => {
            setFilters([...newFilters]);
          }}
        />
        {filters.length > 0 && (
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              fontSize: 12,
              overflow: 'auto',
            }}>
            {JSON.stringify(filters, null, 2)}
          </pre>
        )}
      </div>
    );
  },
  args: {
    placeholder: 'Search...',
  },
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Full Featured (All Field Types)',
};

export const IssueTracker: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    return (
      <PowerSearch
        {...args}
        config={issueTrackerConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Filter issues...',
    hasAutoFocus: true,
    maxSearchResults: 2,
    maxOperatorMenuItems: 2,
    menuWidth: 700,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A realistic issue-tracker field set. Open the empty search to browse ungrouped fields first, followed by optional People, Planning, and Activity sections. Typing switches back to a flat ranked list. Use maxSearchResults to cap the main ranked list; use maxOperatorMenuItems for values after selecting a field, such as Owner.',
      },
    },
  },
  decorators: [
    Story => (
      <div style={{width: 500, minHeight: 420}}>
        <Story />
      </div>
    ),
  ],
  name: 'Issue Tracker (Grouped Fields)',
};

export const WithEnumListFilters: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {
        field: 'status',
        operator: 'any_of',
        value: {type: 'enum_list', value: ['open', 'in_progress']},
      },
      {
        field: 'tags',
        operator: 'include',
        value: {type: 'enum_list', value: ['bug', 'security']},
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={fullConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Multi-value Filters',
};

export const WithEntityFilters: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {
        field: 'assignee',
        operator: 'any_of',
        value: {
          type: 'entity_list',
          value: [
            {id: 'user-1', label: 'Alice Johnson'},
            {id: 'user-3', label: 'Charlie Brown'},
          ],
        },
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={fullConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Entity Filters',
};

export const WithNumericFilters: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {
        field: 'line_count',
        operator: 'gt',
        value: {type: 'integer', value: 100},
      },
      {
        field: 'cost',
        operator: 'lt',
        value: {type: 'float', value: 500.5},
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={fullConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Numeric Filters',
};

export const WithDateFilters: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {
        field: 'created',
        operator: 'between',
        value: {
          type: 'date_range',
          value: {
            start: {
              type: 'ABSOLUTE',
              unixSeconds: Date.parse('2026-01-05T00:00:00Z') / 1000,
            },
            end: {
              type: 'ABSOLUTE',
              unixSeconds: Date.parse('2026-01-07T00:00:00Z') / 1000,
            },
          },
        },
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={fullConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Date Filters',
};

export const WithEmptyFilter: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {field: 'unread', operator: 'yes', value: {type: 'empty'}},
    ]);
    return (
      <PowerSearch
        {...args}
        config={fullConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Boolean / Empty Filters',
};

export const ReadOnly: Story = {
  render: args => {
    const filters: PowerSearchFilter[] = [
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
      {
        field: 'priority',
        operator: 'is',
        value: {type: 'enum', value: 'p0'},
      },
    ];
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={() => {}}
        isReadOnly
      />
    );
  },
  args: {
    placeholder: 'Search...',
  },
  name: 'Read Only',
};

export const Disabled: Story = {
  render: args => {
    const filters: PowerSearchFilter[] = [
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
    ];
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={() => {}}
        isDisabled
      />
    );
  },
  args: {
    placeholder: 'Search...',
  },
};

export const WithError: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        status={{type: 'error', message: 'Invalid filter combination'}}
      />
    );
  },
  args: {
    placeholder: 'Search...',
  },
  name: 'With Error Status',
};

export const WithWarning: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {
        field: 'title',
        operator: 'contains',
        value: {type: 'string', value: 'test'},
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        status={{type: 'warning', message: 'Broad search may be slow'}}
      />
    );
  },
  args: {
    placeholder: 'Search...',
  },
  name: 'With Warning Status',
};

export const ManyFilters: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {
        field: 'status',
        operator: 'any_of',
        value: {type: 'enum_list', value: ['open', 'in_progress']},
      },
      {field: 'priority', operator: 'is', value: {type: 'enum', value: 'p1'}},
      {
        field: 'title',
        operator: 'contains',
        value: {type: 'string', value: 'login'},
      },
      {
        field: 'assignee',
        operator: 'any_of',
        value: {
          type: 'entity_list',
          value: [{id: 'user-1', label: 'Alice Johnson'}],
        },
      },
      {
        field: 'tags',
        operator: 'include',
        value: {type: 'enum_list', value: ['bug']},
      },
      {
        field: 'line_count',
        operator: 'gt',
        value: {type: 'integer', value: 50},
      },
      {
        field: 'created',
        operator: 'after',
        value: {
          type: 'date_absolute',
          unixSeconds: Math.floor(new Date('2025-06-01').getTime() / 1000),
        },
      },
    ]);
    return (
      <PowerSearch
        {...args}
        config={fullConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
      />
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  decorators: [
    Story => (
      <div style={{width: 800}}>
        <Story />
      </div>
    ),
  ],
  name: 'Many Filters',
};

export const WithOnChangeTracking: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    const [log, setLog] = useState<string[]>([]);
    return (
      <div>
        <PowerSearch
          {...args}
          config={basicConfig}
          filters={filters}
          onChange={(newFilters, changeType, index) => {
            setFilters([...newFilters]);
            setLog(prev => [
              ...prev,
              `${changeType} at index ${index} (${newFilters.length} filters total)`,
            ]);
          }}
        />
        {log.length > 0 && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              fontSize: 12,
              maxHeight: 200,
              overflow: 'auto',
            }}>
            <strong>Change log:</strong>
            <ul style={{margin: '4px 0', paddingInlineStart: 20}}>
              {log.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  },
  args: {
    placeholder: 'Try adding, editing, and removing filters...',
  },
  name: 'Change Tracking',
};

const nestedConfig: PowerSearchConfig = {
  name: 'NestedSearch',
  fields: [
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'enum', values: statusValues},
        },
        {
          key: 'is_not',
          label: 'is not',
          value: {type: 'enum', values: statusValues},
        },
      ],
    },
    {
      key: 'title',
      label: 'Title',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
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
      key: 'or_group',
      label: 'Any of (OR)',
      defaultOperator: 'match_any',
      operators: [
        {key: 'match_any', label: 'match any', value: {type: 'nested'}},
      ],
    },
    {
      key: 'and_group',
      label: 'All of (AND)',
      defaultOperator: 'match_all',
      operators: [
        {key: 'match_all', label: 'match all', value: {type: 'nested'}},
      ],
    },
  ],
};

export const WithNestedFilters: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {
        field: 'or_group',
        operator: 'match_any',
        value: {
          type: 'nested',
          value: [
            {
              field: 'status',
              operator: 'is',
              value: {type: 'enum', value: 'open'},
            },
            {
              field: 'status',
              operator: 'is',
              value: {type: 'enum', value: 'in_progress'},
            },
          ],
        },
      },
      {
        field: 'priority',
        operator: 'is',
        value: {type: 'enum', value: 'p0'},
      },
      {
        field: 'and_group',
        operator: 'match_all',
        value: {
          type: 'nested',
          value: [
            {
              field: 'title',
              operator: 'contains',
              value: {type: 'string', value: 'login'},
            },
            {
              field: 'status',
              operator: 'is_not',
              value: {type: 'enum', value: 'closed'},
            },
          ],
        },
      },
    ]);
    return (
      <div>
        <PowerSearch
          {...args}
          config={nestedConfig}
          filters={filters}
          onChange={newFilters => setFilters([...newFilters])}
        />
        {filters.length > 0 && (
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              fontSize: 12,
              overflow: 'auto',
            }}>
            {JSON.stringify(filters, null, 2)}
          </pre>
        )}
      </div>
    );
  },
  args: {
    placeholder: 'Add filters...',
  },
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Nested Filters',
};

const contentSearchConfig: PowerSearchConfig = {
  name: 'ContentSearch',
  contentSearchFieldKey: 'title',
  fields: [
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
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'enum', values: statusValues},
        },
        {
          key: 'is_not',
          label: 'is not',
          value: {type: 'enum', values: statusValues},
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
  ],
};

export const WithContentSearchFieldKey: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    return (
      <div>
        <PowerSearch
          {...args}
          config={contentSearchConfig}
          filters={filters}
          onChange={newFilters => setFilters([...newFilters])}
        />
        {filters.length > 0 && (
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              fontSize: 12,
              overflow: 'auto',
            }}>
            {JSON.stringify(filters, null, 2)}
          </pre>
        )}
      </div>
    );
  },
  args: {
    placeholder: 'Type to search by title, or pick a field...',
  },
  name: 'Content Search Field Key',
};

export const SizeVariants: Story = {
  render: () => {
    const [smFilters, setSmFilters] = useState<PowerSearchFilter[]>([
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
    ]);
    const [mdFilters, setMdFilters] = useState<PowerSearchFilter[]>([
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
    ]);
    const [lgFilters, setLgFilters] = useState<PowerSearchFilter[]>([
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
    ]);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <PowerSearch
          label="Small (28px)"
          config={basicConfig}
          filters={smFilters}
          onChange={newFilters => setSmFilters([...newFilters])}
          placeholder="Small size"
          size="sm"
        />
        <PowerSearch
          label="Medium (32px)"
          config={basicConfig}
          filters={mdFilters}
          onChange={newFilters => setMdFilters([...newFilters])}
          placeholder="Medium size (default)"
          size="md"
        />
        <PowerSearch
          label="Large (36px)"
          config={basicConfig}
          filters={lgFilters}
          onChange={newFilters => setLgFilters([...newFilters])}
          placeholder="Large size"
          size="lg"
        />
      </div>
    );
  },
};

export const WithStartIcon: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        startIcon={MagnifyingGlassIcon}
      />
    );
  },
  args: {
    label: 'Search',
    isLabelHidden: true,
    placeholder: 'Search...',
  },
  name: 'With Start Icon',
};

export const WithResultCount: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
    ]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        resultCount={1234}
        startIcon={MagnifyingGlassIcon}
      />
    );
  },
  args: {
    label: 'Search',
    isLabelHidden: true,
    placeholder: 'Search...',
  },
  name: 'With Result Count',
};

export const WithEndContentPowerSearch: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        resultCount={42}
        endContent={
          <Button
            label="Save"
            variant="primary"
            size="sm"
            style={{height: '20px'}}
          />
        }
      />
    );
  },
  args: {
    label: 'Search',
    isLabelHidden: true,
    placeholder: 'Search...',
    size: 'lg',
  },
  name: 'With End Content and Result Count',
};

const overflowFilters: PowerSearchFilter[] = [
  {
    field: 'status',
    operator: 'any_of',
    value: {type: 'enum_list', value: ['open', 'in_progress']},
  },
  {field: 'priority', operator: 'is', value: {type: 'enum', value: 'p1'}},
  {
    field: 'title',
    operator: 'contains',
    value: {type: 'string', value: 'login'},
  },
  {
    field: 'assignee',
    operator: 'any_of',
    value: {
      type: 'entity_list',
      value: [{id: 'user-1', label: 'Alice Johnson'}],
    },
  },
  {
    field: 'tags',
    operator: 'include',
    value: {type: 'enum_list', value: ['bug']},
  },
];

export const OverflowInline: Story = {
  render: args => {
    const [filters, setFilters] =
      useState<PowerSearchFilter[]>(overflowFilters);
    return (
      <div>
        <PowerSearch
          {...args}
          config={fullConfig}
          filters={filters}
          onChange={newFilters => setFilters([...newFilters])}
          tokenOverflowBehavior="unfocusedInline"
        />
        <p style={{marginTop: 8}}>
          This text will shift down when the search bar expands on focus.
        </p>
      </div>
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  name: 'Overflow Inline',
};

export const OverflowLayer: Story = {
  render: args => {
    const [filters, setFilters] =
      useState<PowerSearchFilter[]>(overflowFilters);
    return (
      <div>
        <PowerSearch
          {...args}
          config={fullConfig}
          filters={filters}
          onChange={newFilters => setFilters([...newFilters])}
          tokenOverflowBehavior="unfocusedLayer"
        />
        <p style={{marginTop: 8}}>
          This text should not shift when the search bar expands on focus.
        </p>
      </div>
    );
  },
  args: {
    placeholder: 'Add more filters...',
  },
  name: 'Overflow Layer',
};

// =============================================================================
// Custom Components Map
// =============================================================================

import type {
  PowerSearchComponents,
  PowerSearchTokenProps,
  PowerSearchEditorProps,
} from '@astryxdesign/core/PowerSearch';
import {Token} from '@astryxdesign/core/Token';
import {HStack} from '@astryxdesign/core/Stack';

function StatusToken({
  filter,
  field,
  operator,
  maxLength: _maxLength,
  onClick,
  onRemove,
  isDisabled,
}: PowerSearchTokenProps) {
  const value = filter.value.type === 'enum' ? filter.value.value : '?';
  const colors: Record<string, string> = {
    open: '#22c55e',
    in_progress: '#3b82f6',
    review: '#a855f7',
    closed: '#6b7280',
    blocked: '#ef4444',
  };
  return (
    <Token
      label={`${field.label}: ${operator.label}`}
      endContent={
        <span style={{fontWeight: 600, color: colors[value] ?? 'inherit'}}>
          {value}
        </span>
      }
      onClick={
        onClick
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      onRemove={onRemove}
      isDisabled={isDisabled}
    />
  );
}

function CustomIntegerEditor({
  config: _config,
  filter,
  mode: _mode,
  onSave,
  onCancel,
  saveButtonLabel: _saveButtonLabel,
  isReadOnly,
}: PowerSearchEditorProps) {
  const current = filter.value?.type === 'integer' ? filter.value.value : 50;
  return (
    <div style={{padding: 16}}>
      <p style={{margin: '0 0 12px', fontSize: 13}}>
        Custom range editor for integer fields:
      </p>
      <HStack gap={2} vAlign="center">
        <input
          type="range"
          min={0}
          max={1000}
          value={current}
          onChange={e => {
            if (filter.operator == null) {
              return;
            }
            onSave({
              field: filter.field,
              operator: filter.operator,
              value: {type: 'integer', value: Number(e.target.value)},
            });
          }}
          style={{flex: 1}}
          disabled={isReadOnly}
        />
        <span style={{fontSize: 12, whiteSpace: 'nowrap'}}>{current}</span>
      </HStack>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const customComponents: PowerSearchComponents = {
  enum: {Token: StatusToken},
  integer: {Editor: CustomIntegerEditor},
};

export const WithCustomComponents: Story = {
  render: args => {
    const [filters, setFilters] = useState<PowerSearchFilter[]>([
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
      {
        field: 'line_count',
        operator: 'gt',
        value: {type: 'integer', value: 200},
      },
    ]);
    return (
      <div>
        <PowerSearch
          {...args}
          config={fullConfig}
          filters={filters}
          onChange={newFilters => setFilters([...newFilters])}
          components={customComponents}
        />
        <p
          style={{
            marginTop: 16,
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}>
          <strong>Custom overrides:</strong> Status tokens show colored text
          (custom Token). Integer fields use a range slider editor (custom
          Editor).
        </p>
      </div>
    );
  },
  args: {placeholder: 'Search with custom components...'},
  decorators: [
    Story => (
      <div style={{width: 700}}>
        <Story />
      </div>
    ),
  ],
  name: 'Custom Components Map',
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the input to see
// why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the input stays focusable (input is still blocked). Use
// disabledMessage instead of wrapping a disabled PowerSearch in Tooltip:
// disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const filters: PowerSearchFilter[] = [
      {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
    ];
    return (
      <PowerSearch
        {...args}
        config={basicConfig}
        filters={filters}
        onChange={() => {}}
        isDisabled
        disabledMessage="You need edit access to search"
      />
    );
  },
  args: {
    placeholder: 'Search...',
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<PowerSearchFilter[]>([]);
    const [b, setB] = useState<PowerSearchFilter[]>([]);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 400}}>
        <PowerSearch
          config={basicConfig}
          filters={a}
          onChange={newFilters => setA([...newFilters])}
          isLabelHidden={false}
          label="Attached (default)"
          status={{type: 'error', message: 'Add at least one filter'}}
        />
        <PowerSearch
          config={basicConfig}
          filters={b}
          onChange={newFilters => setB([...newFilters])}
          isLabelHidden={false}
          label="Detached"
          status={{type: 'error', message: 'Add at least one filter'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};
