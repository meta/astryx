// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListInput.stories.tsx
 * @input Uses ListInput with controlled data, Astryx field controls, column width helpers, the Theme provider, React, and StyleX
 * @output Storybook examples spanning realistic use cases, validation scopes, density, responsiveness, tokenized collection motion, reordering, the disabled and loading states, row volume, and a pinned light/dark theme matrix
 * @position Lab component stories; documents the consumer-facing ListInput API
 */

import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {createReorderable} from '@astryxdesign/core';
import {pixel, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Theme} from '@astryxdesign/core';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {neutralTheme} from '@astryxdesign/theme-neutral';
import {ListInput, type ListInputColumn} from '@astryxdesign/lab';
const storyStyles = stylex.create({
  canvas: {
    width: 680,
    maxWidth: '100%',
  },
  responsiveCanvas: {
    width: 600,
    maxWidth: '100%',
  },
  narrowCanvas: {
    width: 360,
    maxWidth: '100%',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  themePane: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 20,
    borderRadius: 8,
    // Must be a token, not a literal: the pane's whole job is to render the
    // surface each nested Theme resolves to, so a hardcoded colour would sit
    // under text that follows the theme and fail contrast in one of the modes.
    backgroundColor: colorVars['--color-background-body'],
  },
});

const meta: Meta<typeof ListInput> = {
  title: 'Lab/ListInput',
  component: ListInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div {...stylex.props(storyStyles.canvas)}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ListInput>;

type TagOption = {
  id: string;
  color: string;
  label: string;
};

const COLOR_OPTIONS = [
  {value: 'blue', label: 'Blue'},
  {value: 'green', label: 'Green'},
  {value: 'amber', label: 'Amber'},
  {value: 'red', label: 'Red'},
  {value: 'purple', label: 'Purple'},
];

const INITIAL_TAGS: TagOption[] = [
  {id: 'tag-new', color: 'blue', label: 'New'},
  {id: 'tag-blocked', color: 'green', label: 'Blocked'},
  {id: 'tag-empty', color: 'amber', label: ''},
  {id: 'tag-review', color: 'purple', label: 'In review'},
];

function hasInvalidCombination(tag: TagOption): boolean {
  const label = tag.label.trim().toLowerCase();
  return (
    (tag.color === 'green' && label === 'blocked') ||
    (tag.color === 'red' && label === 'success')
  );
}
function useTouchedFields() {
  const [touchedFields, setTouchedFields] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const markFieldTouched = useCallback((itemID: string, columnKey: string) => {
    const touchedFieldKey = fieldKey(itemID, columnKey);
    setTouchedFields(current => {
      if (current.has(touchedFieldKey)) {
        return current;
      }
      const next = new Set(current);
      next.add(touchedFieldKey);
      return next;
    });
  }, []);
  const isFieldTouched = useCallback(
    (itemID: string, columnKey: string) =>
      touchedFields.has(fieldKey(itemID, columnKey)),
    [touchedFields],
  );

  return {isFieldTouched, markFieldTouched};
}

function fieldKey(itemID: string, columnKey: string): string {
  return JSON.stringify([itemID, columnKey]);
}

function createTagColumns(
  onFieldBlur: (itemID: string, columnKey: string) => void,
): ListInputColumn<TagOption>[] {
  return [
    {
      key: 'color',
      header: 'Color',
      width: proportional(1, {minWidth: 120}),
      renderInput: ({
        item,
        label,
        isLabelHidden,
        status,
        statusVariant,
        isDisabled,
        updateItem,
      }) => (
        <Selector
          label={label}
          isLabelHidden={isLabelHidden}
          options={COLOR_OPTIONS}
          value={item.color}
          onChange={color => updateItem({...item, color}, 'color')}
          status={status}
          statusVariant={statusVariant}
          isDisabled={isDisabled}
          onBlur={() => onFieldBlur(item.id, 'color')}
        />
      ),
    },
    {
      key: 'label',
      header: 'Label',
      width: proportional(2, {minWidth: 200}),
      renderInput: ({
        item,
        label,
        isLabelHidden,
        status,
        statusVariant,
        isDisabled,
        isLoading,
        updateItem,
      }) => (
        <TextInput
          label={label}
          isLabelHidden={isLabelHidden}
          value={item.label}
          onChange={nextLabel =>
            updateItem({...item, label: nextLabel}, 'label')
          }
          status={status}
          statusVariant={statusVariant}
          isDisabled={isDisabled}
          isLoading={isLoading}
          onBlur={() => onFieldBlur(item.id, 'label')}
        />
      ),
    },
  ];
}

/**
 * The owner's reorder: each move ListInput reports lands in the records,
 * found by `getItemKey`'s key.
 */
function useRecordReorder<T extends {id: string}>(
  setRecords: Dispatch<SetStateAction<T[]>>,
) {
  return useMemo(
    () =>
      createReorderable({
        onReorder: ({key, to}: {key: string | number; to: number}) =>
          setRecords(current => {
            const moved = current.find(record => record.id === key);
            if (moved == null) {
              return current;
            }
            const rest = current.filter(record => record !== moved);
            return [...rest.slice(0, to), moved, ...rest.slice(to)];
          }),
      }),
    [setRecords],
  );
}

function TagOptionsExample({isReorderable}: {isReorderable?: boolean}) {
  const [tags, setTags] = useState(INITIAL_TAGS);
  const reorderable = useRecordReorder(setTags);
  const {isFieldTouched, markFieldTouched} = useTouchedFields();
  const columns = useMemo(
    () => createTagColumns(markFieldTouched),
    [markFieldTouched],
  );

  return (
    <ListInput<TagOption>
      label="Tag options"
      description={
        isReorderable
          ? 'Add at least five tags and drag rows to set their order. Field errors appear after the first blur.'
          : 'Add at least five tags. Items remain in the order they were added; field errors appear after the first blur.'
      }
      value={tags}
      onChange={setTags}
      getItemKey={tag => tag.id}
      createItem={() => ({
        id: crypto.randomUUID(),
        color: 'blue',
        label: '',
      })}
      columns={columns}
      itemName="tag"
      status={
        tags.length < 5
          ? {type: 'error', message: 'Add at least five tag options.'}
          : undefined
      }
      getItemStatus={tag =>
        hasInvalidCombination(tag)
          ? {
              type: 'error',
              message: `“${tag.label}” cannot use ${tag.color}.`,
            }
          : undefined
      }
      getFieldStatus={(tag, columnKey) =>
        isFieldTouched(tag.id, columnKey) &&
        columnKey === 'label' &&
        tag.label.trim() === ''
          ? {type: 'error', message: 'Enter a label.'}
          : undefined
      }
      reorderable={isReorderable ? reorderable : undefined}
    />
  );
}

/** Controlled tag options with validation at list, item, and field scope. */
export const TagOptions: Story = {
  render: () => <TagOptionsExample isReorderable />,
  parameters: {
    docs: {
      description: {
        story:
          'Pointer-activate Add near the bottom of the viewport to keep the action under the pointer while available scroll containers absorb the inserted row from nearest to outermost. The new row receives focus and uses a live translate entrance. Remove one to see stable-size survivors close the gap; reduced-motion preferences use an instant change.',
      },
    },
  },
};

/** Editable tag options using the default fixed insertion order. */
export const NonReorderable: Story = {
  name: 'Non-reorderable',
  render: () => <TagOptionsExample />,
};

type Subscriber = {
  id: string;
  email: string;
};

function isValidEmail(email: string): boolean {
  const normalizedEmail = email.trim();
  const atIndex = normalizedEmail.indexOf('@');
  const dotIndex = normalizedEmail.lastIndexOf('.');
  return (
    atIndex > 0 &&
    dotIndex > atIndex + 1 &&
    dotIndex < normalizedEmail.length - 1
  );
}

function MailingListExample() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [hasChanged, setHasChanged] = useState(false);
  const {isFieldTouched, markFieldTouched} = useTouchedFields();
  const columns = useMemo<ListInputColumn<Subscriber>[]>(
    () => [
      {
        key: 'email',
        header: 'Email address',
        width: proportional(1, {minWidth: 240}),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <TextInput
            type="email"
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.email}
            placeholder="name@example.com"
            onChange={email => updateItem({...item, email}, 'email')}
            onBlur={() => markFieldTouched(item.id, 'email')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
            isLoading={isLoading}
          />
        ),
      },
    ],
    [markFieldTouched],
  );

  const handleChange = useCallback((nextSubscribers: Subscriber[]) => {
    setSubscribers(nextSubscribers);
    setHasChanged(true);
  }, []);

  return (
    <ListInput<Subscriber>
      label="Mailing list"
      description="Start empty, add up to six addresses, and remove the final row to exercise focus restoration and required-list validation."
      value={subscribers}
      onChange={handleChange}
      getItemKey={subscriber => subscriber.id}
      createItem={() => ({id: crypto.randomUUID(), email: ''})}
      columns={columns}
      itemName="subscriber"
      status={
        hasChanged && subscribers.length === 0
          ? {type: 'error', message: 'Add at least one subscriber.'}
          : undefined
      }
      getItemStatus={subscriber => {
        const email = subscriber.email.trim().toLowerCase();
        const isDuplicate =
          email !== '' &&
          subscribers.some(
            candidate =>
              candidate.id !== subscriber.id &&
              candidate.email.trim().toLowerCase() === email,
          );
        return isDuplicate
          ? {type: 'error', message: 'This address is already in the list.'}
          : undefined;
      }}
      getFieldStatus={(subscriber, columnKey) => {
        if (
          columnKey !== 'email' ||
          !isFieldTouched(subscriber.id, columnKey)
        ) {
          return undefined;
        }
        if (subscriber.email.trim() === '') {
          return {type: 'error', message: 'Enter an email address.'};
        }
        return isValidEmail(subscriber.email)
          ? undefined
          : {type: 'error', message: 'Enter a valid email address.'};
      }}
      isRequired
      maxItems={6}
    />
  );
}

/** A one-column collection that starts empty and validates fields after blur. */
export const EmptyMailingList: Story = {
  render: () => <MailingListExample />,
  parameters: {
    docs: {
      description: {
        story:
          'Exercises the empty state, add autofocus, one-column layout, duplicate records, blur validation, removing the last item, and the six-item boundary.',
      },
    },
  },
};

type Allocation = {
  id: string;
  team: string;
  percent: number | null;
};

const TEAM_OPTIONS = [
  {value: 'design', label: 'Design'},
  {value: 'engineering', label: 'Engineering'},
  {value: 'marketing', label: 'Marketing'},
  {value: 'operations', label: 'Operations'},
];

const INITIAL_ALLOCATIONS: Allocation[] = [
  {id: 'allocation-design', team: 'design', percent: 35},
  {id: 'allocation-engineering', team: 'engineering', percent: 40},
  {id: 'allocation-marketing', team: 'marketing', percent: 15},
];

function ExpenseAllocationsExample() {
  const [allocations, setAllocations] = useState(INITIAL_ALLOCATIONS);
  const {isFieldTouched, markFieldTouched} = useTouchedFields();
  const total = allocations.reduce(
    (sum, allocation) => sum + (allocation.percent ?? 0),
    0,
  );
  const columns = useMemo<ListInputColumn<Allocation>[]>(
    () => [
      {
        key: 'team',
        header: 'Team',
        width: proportional(2, {minWidth: 180}),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <Selector
            label={label}
            isLabelHidden={isLabelHidden}
            options={TEAM_OPTIONS}
            value={item.team}
            placeholder="Choose a team"
            onChange={team => updateItem({...item, team}, 'team')}
            onBlur={() => markFieldTouched(item.id, 'team')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled || isLoading}
          />
        ),
      },
      {
        key: 'percent',
        header: 'Allocation',
        width: pixel(132),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <NumberInput
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.percent}
            onChange={percent => updateItem({...item, percent}, 'percent')}
            onBlur={() => markFieldTouched(item.id, 'percent')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled || isLoading}
            min={0}
            max={100}
            units="%"
            isIntegerOnly
          />
        ),
      },
    ],
    [markFieldTouched],
  );

  return (
    <ListInput<Allocation>
      label="Quarterly budget allocation"
      description="Assign each team once. The percentages across every row must total 100%."
      value={allocations}
      onChange={setAllocations}
      getItemKey={allocation => allocation.id}
      createItem={() => ({
        id: crypto.randomUUID(),
        team: '',
        percent: null,
      })}
      columns={columns}
      itemName="allocation"
      status={
        total === 100
          ? undefined
          : {
              type: 'error',
              message: `Allocations must total 100%. Current total: ${total}%.`,
            }
      }
      getItemStatus={allocation => {
        const isDuplicate =
          allocation.team !== '' &&
          allocations.some(
            candidate =>
              candidate.id !== allocation.id &&
              candidate.team === allocation.team,
          );
        return isDuplicate
          ? {type: 'error', message: 'Each team can only appear once.'}
          : undefined;
      }}
      getFieldStatus={(allocation, columnKey) => {
        if (!isFieldTouched(allocation.id, columnKey)) {
          return undefined;
        }
        if (columnKey === 'team' && allocation.team === '') {
          return {type: 'error', message: 'Choose a team.'};
        }
        if (columnKey === 'percent' && allocation.percent == null) {
          return {type: 'error', message: 'Enter an allocation.'};
        }
        if (
          columnKey === 'percent' &&
          allocation.percent != null &&
          (allocation.percent < 0 || allocation.percent > 100)
        ) {
          return {type: 'error', message: 'Use a value from 0 to 100.'};
        }
        return undefined;
      }}
      isRequired
      maxItems={4}
    />
  );
}

/** Mixed control types with item-level uniqueness and cross-list totals. */
export const ExpenseAllocations: Story = {
  render: () => <ExpenseAllocationsExample />,
  parameters: {
    docs: {
      description: {
        story:
          'Exercises Selector and NumberInput alignment, fixed and proportional column widths, duplicate-item errors, field tooltips, and a collection-wide total.',
      },
    },
  },
};

type FamilyMember = {
  id: string;
  fullName: string;
  relationship: string;
  dateOfBirth: ISODateString | undefined;
};

const RELATIONSHIP_OPTIONS = [
  {value: 'spouse-or-partner', label: 'Spouse or partner'},
  {value: 'child', label: 'Child'},
  {value: 'parent', label: 'Parent'},
  {value: 'sibling', label: 'Sibling'},
  {value: 'other-dependent', label: 'Other dependent'},
];

const DECLARATION_DATE: ISODateString = '2026-08-05';

const INITIAL_FAMILY_MEMBERS: FamilyMember[] = [
  {
    id: 'member-jordan',
    fullName: 'Jordan Lee',
    relationship: 'spouse-or-partner',
    dateOfBirth: '1988-11-02',
  },
  {
    id: 'member-alexandria',
    fullName: 'Alexandria María de la Cruz',
    relationship: 'child',
    dateOfBirth: '2012-06-24',
  },
  {
    id: 'member-noah',
    fullName: 'Noah Lee',
    relationship: 'child',
    dateOfBirth: '2018-09-08',
  },
  {
    id: 'member-grace',
    fullName: 'Grace Lee',
    relationship: 'parent',
    dateOfBirth: '1958-04-17',
  },
];

function FamilyMemberDeclarationExample() {
  const [members, setMembers] = useState(INITIAL_FAMILY_MEMBERS);
  const {isFieldTouched, markFieldTouched} = useTouchedFields();
  const columns = useMemo<ListInputColumn<FamilyMember>[]>(
    () => [
      {
        key: 'fullName',
        header: 'Full legal name',
        width: proportional(2, {minWidth: 200}),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <TextInput
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.fullName}
            onChange={fullName => updateItem({...item, fullName}, 'fullName')}
            onBlur={() => markFieldTouched(item.id, 'fullName')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
            isLoading={isLoading}
          />
        ),
      },
      {
        key: 'relationship',
        header: 'Relationship',
        width: proportional(1.25, {minWidth: 160}),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <Selector
            label={label}
            isLabelHidden={isLabelHidden}
            options={RELATIONSHIP_OPTIONS}
            value={item.relationship}
            placeholder="Choose relationship"
            onChange={relationship =>
              updateItem({...item, relationship}, 'relationship')
            }
            onBlur={() => markFieldTouched(item.id, 'relationship')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled || isLoading}
          />
        ),
      },
      {
        key: 'dateOfBirth',
        header: 'Date of birth',
        width: pixel(176),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <DateInput
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.dateOfBirth}
            onChange={dateOfBirth =>
              updateItem({...item, dateOfBirth}, 'dateOfBirth')
            }
            onBlur={() => markFieldTouched(item.id, 'dateOfBirth')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
            isLoading={isLoading}
            max={DECLARATION_DATE}
          />
        ),
      },
    ],
    [markFieldTouched],
  );

  return (
    <ListInput<FamilyMember>
      label="Family member declaration"
      description="Declare each immediate family member, their relationship to you, and their date of birth."
      value={members}
      onChange={setMembers}
      getItemKey={member => member.id}
      createItem={() => ({
        id: crypto.randomUUID(),
        fullName: '',
        relationship: '',
        dateOfBirth: undefined,
      })}
      columns={columns}
      itemName="family member"
      getItemStatus={(member, index) => {
        if (member.fullName.trim() === '' || member.dateOfBirth == null) {
          return undefined;
        }
        const normalizedName = member.fullName.trim().toLowerCase();
        const firstMatchingIndex = members.findIndex(
          candidate =>
            candidate.fullName.trim().toLowerCase() === normalizedName &&
            candidate.dateOfBirth === member.dateOfBirth,
        );
        return firstMatchingIndex !== index
          ? {
              type: 'error',
              message: 'This family member appears more than once.',
            }
          : undefined;
      }}
      getFieldStatus={(member, columnKey) => {
        if (!isFieldTouched(member.id, columnKey)) {
          return undefined;
        }
        if (columnKey === 'fullName' && member.fullName.trim() === '') {
          return {type: 'error', message: 'Enter a full legal name.'};
        }
        if (columnKey === 'relationship' && member.relationship === '') {
          return {type: 'error', message: 'Choose a relationship.'};
        }
        if (columnKey === 'dateOfBirth' && member.dateOfBirth == null) {
          return {type: 'error', message: 'Choose a date of birth.'};
        }
        if (
          columnKey === 'dateOfBirth' &&
          member.dateOfBirth != null &&
          member.dateOfBirth > DECLARATION_DATE
        ) {
          return {
            type: 'error',
            message: 'Date of birth cannot be in the future.',
          };
        }
        return undefined;
      }}
      isRequired
    />
  );
}

/** Three simple fields per record in a declaration where order is immaterial. */
export const FamilyMemberDeclaration: Story = {
  render: () => <FamilyMemberDeclarationExample />,
  parameters: {
    docs: {
      description: {
        story:
          'Exercises the intended three-field ceiling, TextInput, Selector, and DateInput alignment, a long international name, blur validation, duplicate-record validation, and non-reorderable semantics.',
      },
    },
  },
};

/** Three fields at an intermediate width that must stack without overflow. */
export const ResponsiveFamilyMemberDeclaration: Story = {
  render: () => (
    <div {...stylex.props(storyStyles.responsiveCanvas)}>
      <FamilyMemberDeclarationExample />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Exercises the 640px stacking breakpoint at a 600px container with all three field types, repeated labels, and non-reorderable top-aligned remove actions.',
      },
    },
  },
};

type TripLeg = {
  id: string;
  destination: string;
  departureDate: ISODateString | undefined;
};

const INITIAL_TRIP_LEGS: TripLeg[] = [
  {
    id: 'leg-montreal',
    destination: 'Montréal–Pierre Elliott Trudeau International Airport',
    departureDate: '2026-09-12',
  },
  {
    id: 'leg-reykjavik',
    destination: 'Reykjavík',
    departureDate: '2026-09-16',
  },
  {
    id: 'leg-copenhagen',
    destination: 'Copenhagen',
    departureDate: '2026-09-20',
  },
];

function ResponsiveItineraryExample() {
  const [legs, setLegs] = useState(INITIAL_TRIP_LEGS);
  const reorderable = useRecordReorder(setLegs);
  const {isFieldTouched, markFieldTouched} = useTouchedFields();
  const columns = useMemo<ListInputColumn<TripLeg>[]>(
    () => [
      {
        key: 'destination',
        header: 'Destination',
        width: proportional(3, {minWidth: 200}),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <TextInput
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.destination}
            onChange={destination =>
              updateItem({...item, destination}, 'destination')
            }
            onBlur={() => markFieldTouched(item.id, 'destination')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
            isLoading={isLoading}
          />
        ),
      },
      {
        key: 'departureDate',
        header: 'Departure',
        width: proportional(2, {minWidth: 180}),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          isLoading,
          updateItem,
        }) => (
          <DateInput
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.departureDate}
            onChange={departureDate =>
              updateItem({...item, departureDate}, 'departureDate')
            }
            onBlur={() => markFieldTouched(item.id, 'departureDate')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
            isLoading={isLoading}
            min="2026-09-01"
            max="2026-12-31"
          />
        ),
      },
    ],
    [markFieldTouched],
  );

  return (
    <div {...stylex.props(storyStyles.narrowCanvas)}>
      <ListInput<TripLeg>
        label="Multi-city itinerary"
        description="At this width, each leg stacks its two fields while keeping reorder and remove controls available."
        value={legs}
        onChange={setLegs}
        getItemKey={leg => leg.id}
        createItem={() => ({
          id: crypto.randomUUID(),
          destination: '',
          departureDate: undefined,
        })}
        columns={columns}
        itemName="leg"
        getItemStatus={(leg, index) => {
          const previousDate = legs[index - 1]?.departureDate;
          return index > 0 &&
            previousDate != null &&
            leg.departureDate != null &&
            leg.departureDate < previousDate
            ? {
                type: 'error',
                message: 'Departure dates must follow the itinerary order.',
              }
            : undefined;
        }}
        getFieldStatus={(leg, columnKey) => {
          if (!isFieldTouched(leg.id, columnKey)) {
            return undefined;
          }
          if (columnKey === 'destination' && leg.destination.trim() === '') {
            return {type: 'error', message: 'Enter a destination.'};
          }
          if (columnKey === 'departureDate' && leg.departureDate == null) {
            return {type: 'error', message: 'Choose a departure date.'};
          }
          return undefined;
        }}
        reorderable={reorderable}
        isRequired
      />
    </div>
  );
}

/** The two-column editor at the component's narrow stacking breakpoint. */
export const ResponsiveItinerary: Story = {
  render: () => <ResponsiveItineraryExample />,
  parameters: {
    docs: {
      description: {
        story:
          'Exercises the 640px container breakpoint, 32px separation between stacked record groups, repeated labels, a long value, DateInput popovers, item-order validation, and reorder/remove controls aligned beside each record’s first field.',
      },
    },
  },
};

/**
 * A read-only rendering of the tag editor, used by the disabled, loading, and
 * theme stories so each one differs by exactly the prop it demonstrates.
 */
function StaticTagsExample({
  isDisabled,
  isLoading,
  status,
}: {
  isDisabled?: boolean;
  isLoading?: boolean;
  status?: React.ComponentProps<typeof ListInput<TagOption>>['status'];
}) {
  const [tags, setTags] = useState(INITIAL_TAGS.slice(0, 3));
  const reorderable = useRecordReorder(setTags);
  const columns = useMemo(() => createTagColumns(() => {}), []);

  return (
    <ListInput<TagOption>
      label="Tag options"
      description="Each row keeps its colour and label."
      value={tags}
      onChange={setTags}
      getItemKey={tag => tag.id}
      createItem={() => ({id: crypto.randomUUID(), color: 'blue', label: ''})}
      columns={columns}
      itemName="tag"
      isDisabled={isDisabled}
      isLoading={isLoading}
      status={status}
      reorderable={reorderable}
    />
  );
}

/** Every field and mutation control locked while the list stays readable. */
export const Disabled: Story = {
  render: () => <StaticTagsExample isDisabled />,
  parameters: {
    docs: {
      description: {
        story:
          'Sets `aria-disabled` on the group and disables each field, the reorder handle, the remove action, and Add. The values stay legible rather than being hidden, so a disabled list still communicates its contents.',
      },
    },
  },
};

/** The list marked busy while an async operation settles. */
export const Loading: Story = {
  render: () => <StaticTagsExample isLoading />,
  parameters: {
    docs: {
      description: {
        story:
          'Sets `aria-busy` on the group and locks the same controls `isDisabled` does. Loading is distinct from disabled: it means the current values may still change, so an in-flight keyboard reorder is cancelled rather than committed.',
      },
    },
  },
};

/** The three list-level status types side by side. */
export const ValidationStatuses: Story = {
  render: () => (
    <div {...stylex.props(storyStyles.stack)}>
      <StaticTagsExample
        status={{type: 'error', message: 'Add at least five tag options.'}}
      />
      <StaticTagsExample
        status={{
          type: 'warning',
          message: 'Two tags share a colour, which may be hard to tell apart.',
        }}
      />
      <StaticTagsExample
        status={{type: 'success', message: 'All tag options are valid.'}}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The other stories only exercise `error`. `warning` and `success` use the same list-level slot and are described by the group, so a screen reader reaches them from any field inside the list.',
      },
    },
  },
};

const STRESS_TAGS: TagOption[] = Array.from({length: 25}, (_, index) => ({
  id: `stress-${index}`,
  color: COLOR_OPTIONS[index % COLOR_OPTIONS.length].value,
  label:
    index % 5 === 0
      ? `Extremely long tag label ${index} that has to wrap or truncate rather than widen the row past its container`
      : `Tag ${index}`,
}));

function StressExample() {
  const [tags, setTags] = useState(STRESS_TAGS);
  const reorderable = useRecordReorder(setTags);
  const columns = useMemo(() => createTagColumns(() => {}), []);

  return (
    <ListInput<TagOption>
      label="Tag options at volume"
      description="Twenty-five records, every fifth one carrying an over-long label."
      value={tags}
      onChange={setTags}
      getItemKey={tag => tag.id}
      createItem={() => ({id: crypto.randomUUID(), color: 'blue', label: ''})}
      columns={columns}
      itemName="tag"
      reorderable={reorderable}
    />
  );
}

/** Row volume and over-long values in one place. */
export const Stress: Story = {
  render: () => <StressExample />,
  parameters: {
    docs: {
      description: {
        story:
          'Checks that column tracks stay stable as row count grows, that an over-long label cannot widen the row past its container, and that reorder stays usable when the list is taller than the viewport.',
      },
    },
  },
};

/** The same list pinned to light and dark, including a nested override. */
export const ThemeMatrix: Story = {
  render: () => (
    <div {...stylex.props(storyStyles.stack)}>
      <Theme theme={neutralTheme} mode="light">
        <div {...stylex.props(storyStyles.themePane)}>
          <Text weight="bold">Light</Text>
          <StaticTagsExample />
        </div>
      </Theme>
      <Theme theme={neutralTheme} mode="dark">
        <div {...stylex.props(storyStyles.themePane)}>
          <Text weight="bold">Dark</Text>
          <StaticTagsExample />
          <Theme theme={neutralTheme} mode="light">
            <div {...stylex.props(storyStyles.themePane)}>
              <Text weight="bold">Light nested inside dark</Text>
              <StaticTagsExample
                status={{type: 'error', message: 'Add at least five tags.'}}
              />
            </div>
          </Theme>
        </div>
      </Theme>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Pins both modes into one frame so a theme regression is visible without toggling the toolbar, and nests a light theme inside a dark one to confirm the component reads its colours from the nearest provider rather than the document root.',
      },
    },
  },
};
