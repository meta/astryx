// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ListInput',
  displayName: 'List Input',
  group: 'ListInput',
  category: 'Form Controls',
  keywords: [
    'listinput',
    'list input',
    'editable list',
    'repeatable fields',
    'field array',
    'collection input',
    'reorder',
    'guest list',
    'traveler details',
  ],
  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Visible label that names the collection. It also provides the accessible name for the complete input.',
      required: true,
    },
    {
      name: 'value',
      type: 'T[]',
      description:
        'Current ordered records. ListInput is controlled and never mutates this array or its records.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(next: T[], change: ListInputChange<T>) => void',
      description:
        'Called with the next array after an add, update, or remove action. The change argument identifies the action and affected record. Moves go to the reorderable object instead.',
      required: true,
    },
    {
      name: 'getItemKey',
      type: '(item: T) => React.Key',
      description:
        'Returns a stable, unique key for each record. Stable identity preserves focus and announcements when records move.',
      required: true,
    },
    {
      name: 'createItem',
      type: '() => T',
      description:
        'Creates the initial record inserted by the built-in add action. Return a new record with its stable key already assigned.',
      required: true,
    },
    {
      name: 'columns',
      type: 'ListInputColumn<T>[]',
      description:
        'Consistent simple fields shown for every record. Use each column width with proportional() or pixel() from @astryxdesign/core/Table to tune the width spread. ListInput owns the visible primary-tone column labels while renderer labels remain semantically available to assistive technology. At 640px or narrower, fields stack, every record shows its field labels, record groups use 32px vertical separation, and row actions align beside the first field. Renderers receive isLabelHidden, complete scoped validation status, statusVariant, and updateItem.',
      required: true,
    },
    {
      name: 'itemName',
      type: 'string',
      description:
        'Singular noun used in built-in action labels and live announcements, such as "guest" in "Add guest".',
    },
    {
      name: 'description',
      type: 'string',
      description:
        'Supporting text displayed between the collection label and its records.',
    },
    {
      name: 'status',
      type: 'InputStatus',
      description:
        'List-level validation status displayed for the complete collection. An error marks the collection invalid and associates its message with the input.',
    },
    {
      name: 'getItemStatus',
      type: '(item: T, index: number) => InputStatus | undefined',
      description:
        'Returns validation status for a complete record, such as an invalid combination of otherwise valid fields.',
    },
    {
      name: 'getFieldStatus',
      type: '(item: T, columnKey: string, index: number) => InputStatus | undefined',
      description:
        'Returns validation status for one field. The renderer receives the complete status plus statusVariant="tooltip" and should forward both to its Astryx input so the native status affordance owns styling, description, keyboard access, and tooltip behavior without changing row height.',
    },
    {
      name: 'reorderable',
      type: 'Reorderable',
      description:
        "Makes the records reorderable: pass the object createReorderable makes, keyed by getItemKey. Each record ends with core List's reorder handle, after Remove, as UIKit's reorder control ends an editing row. The handle appears while the record is hovered or holds keyboard focus and stays visible on touch screens. On a touch screen, hold the handle for a moment, then drag: the record stays in its place, dimmed, while a copy of it follows the finger and an accent line marks where it would land; the other records stay still, the list autoscrolls near its edges, and on release the records rearrange. A flick on the handle scrolls and a pinch zooms the page. A mouse drags at once the same way, and the records take their places without motion. Activating the handle (a tap, a click, Space or Enter) turns on reorder mode for its record: the line marks the record's place, each Arrow Up or Arrow Down moves it a place, a hint shows the moves and Done as buttons, and Escape or Done ends the mode, keeping the moves. The object's isReorderable(key) says which records move: one it rejects has no handle. Each move goes to the object's onReorder({key, to}), to being the record's index in value after the move. In a disabled or loading list the handles stay focusable but move nothing. Without it, the records keep their order.",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables the collection and all built-in actions. The disabled state is also passed to each column renderer.',
      default: 'false',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Marks the collection busy and prevents changes while work is pending. The loading state is also passed to each column renderer.',
      default: 'false',
    },
    {
      name: 'maxItems',
      type: 'number',
      description:
        'Maximum number of records that can be added. Once the value reaches this limit, the built-in add action is unavailable.',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Visually hides the collection label while keeping it available to assistive technology.',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description:
        'Displays an optional indicator beside the collection label. Mutually exclusive with isRequired.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        'Displays a required indicator beside the collection label and exposes the requirement to assistive technology. Mutually exclusive with isOptional.',
      default: 'false',
    },
  ],
  usage: {
    description:
      'ListInput edits a compact, ordered collection of records with consistent fields, built-in add and remove actions, and optional reordering. Standard Astryx controls rendered in its columns inherit the medium control size so inputs align with the Add, remove, reorder, and validation affordances; an explicit field size still takes precedence. Pointer activation measures Add before pointer-down blur or validation can change layout, then keeps it at that viewport position by adjusting available vertical scroll containers from nearest to outermost. The correction is interaction-scoped and rechecked for one animation frame without persistent scroll or resize observation. Added rows enter with tokenized translate motion; after removal, surviving rows animate into their new positions when their geometry stays stable. Motion never delays onChange, focus handoff, or the announcement, while reduced-motion preferences and unsupported browsers use an instant change. Use it for lists with fewer than seven records and up to three simple fields per record, such as guests, travelers, or tag options. Use a Table for larger collections and a card or step-based form when records need many, complex, or inconsistent fields.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use stable record keys and consistent columns so focus, validation, and reorder announcements remain attached to the correct record.',
      },
      {
        guidance: true,
        description:
          'Keep validation timing application-owned. Track touched fields by stable item and column keys when errors should appear after blur, while allowing submit or server errors to display immediately.',
      },
      {
        guidance: true,
        description:
          'Place validation at the narrowest useful level: field status for one value, item status for a record-wide problem, and list status for collection-wide requirements.',
      },
      {
        guidance: true,
        description:
          "Forward both status and statusVariant from every column renderer to the rendered Astryx input so field messages use the control's native accessible tooltip pattern.",
      },
      {
        guidance: true,
        description:
          'Let records reorder through the handle: a drag reports one move on release, each key move in reorder mode reports one at once, and focus stays on the handle.',
      },
      {
        guidance: true,
        description:
          'Keep collection motion informational and non-blocking. Added live rows translate into place; removed rows disappear immediately while stable-size survivors close the gap. onChange, focus, and announcements run without waiting, and reduced-motion preferences remain instant.',
      },
      {
        guidance: true,
        description:
          'Keep repeated pointer adding spatially stable by measuring Add before pointer-down blur or validation changes layout, then preserving that viewport position from the nearest vertical scroll container outward. Slight field clipping should not move Add away from the pointer; a meaningfully hidden focused field still takes priority. Keyboard activation follows the normal focus flow.',
      },
      {
        guidance: false,
        description:
          'Use for seven or more records or more than three simple fields per record; use a Table or a dedicated editing flow instead.',
      },
      {
        guidance: false,
        description:
          'Prevent removal solely to enforce a minimum count; allow the action and explain the resulting requirement with list-level validation.',
      },
    ],
    anatomy: [
      {
        name: 'Label and description',
        required: true,
        description:
          'Names the complete collection and optionally explains what records to add.',
      },
      {
        name: 'First-record field labels',
        required: true,
        description:
          "ListInput renders primary-tone column labels without separate table chrome and keeps each rendered control's own label visually hidden but semantically associated. At wider widths, repeated labels are visually hidden; when fields stack at 640px or narrower, every record shows its field labels.",
      },
      {
        name: 'Record fields',
        required: true,
        description:
          'Consumer-rendered inputs that receive scoped record state, complete validation status, the native tooltip status variant, and update behavior. When stacked responsively, label-to-input spacing is smallest, field spacing is larger, and record groups use 32px separation so each object remains visually distinct.',
      },
      {
        name: 'Remove action',
        required: true,
        description:
          'Removes its record immediately, moves focus to a predictable neighboring control, and animates surviving rows into their new positions when supported. It is revealed while the record is hovered or contains keyboard focus and stays visible on touch screens; at rest it is transparent but keeps its column and its place in the tab order, so the fields never shift. In the stacked layout, it aligns beside the first field at the top of the record.',
      },
      {
        name: 'Reorder handle',
        required: false,
        description:
          "Core List's reorder handle, three lines at the end of the record after Remove, in Remove's cell, with an accessible label naming the record and its position and no hover tooltip. Where the primary pointer is coarse, its target grows to at least 44 by 44 px. It is revealed while the record is hovered or contains keyboard focus and stays visible on touch screens; at rest it is transparent but stays in the tab order. In the stacked layout it sits at the top of the record beside Remove. A finger holds it a moment, then drags; a mouse drags at once; activating it (Space or Enter) turns on reorder mode, where Arrow Up and Arrow Down move the record a place and Escape ends the mode.",
      },
      {
        name: 'Reorder-mode hint',
        required: false,
        description:
          "While a record is in reorder mode, core List's hint anchored to its handle shows the moves and Done as buttons, so taps alone can reorder. Each does what its key does and leaves the focus on the handle.",
      },
      {
        name: 'Empty state',
        required: false,
        description:
          'When no records exist, a centered compact EmptyState names the empty collection and directs users to the Add action.',
      },
      {
        name: 'Add action',
        required: true,
        description:
          'Fills the record-fields width, uses the inherited medium control size shared by ListInput fields and actions, and immediately appends a new record created by createItem unless maxItems has been reached. On pointer activation, available vertical scroll containers offset the inserted height from nearest to outermost so the action remains under the pointer; keyboard activation keeps the normal focus behavior, and newly focused field visibility always wins. The live row uses tokenized translate entrance motion when supported, and focus moves to its first field without waiting for the animation.',
      },
      {
        name: 'Validation messages',
        required: false,
        description:
          "Explain field-, item-, or list-level errors, warnings, and success states. Field messages use each input's native tooltip status affordance and do not change row height. Item messages align to the record fields without extending under the remove control.",
      },
    ],
  },
  theming: {
    targets: [
      {
        className: 'astryx-list-input',
        visualProps: ['state', 'reorderable'],
      },
    ],
  },
  examples: [
    {
      label: 'Tag options',
      code: `import {createReorderable} from '@astryxdesign/core';
import {Selector} from '@astryxdesign/core/Selector';
import {proportional} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';

type TagOption = {id: string; color: string; label: string};

const columns = [
  {
    key: 'color',
    header: 'Color',
    width: proportional(1, {minWidth: 120}),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
      <Selector
        label={label}
        isLabelHidden={isLabelHidden}
        options={colorOptions}
        value={item.color}
        onChange={color => updateItem({...item, color}, 'color')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
      />
    ),
  },
  {
    key: 'label',
    header: 'Label',
    width: proportional(2, {minWidth: 200}),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
      <TextInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.label}
        onChange={nextLabel => updateItem({...item, label: nextLabel}, 'label')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
      />
    ),
  },
] satisfies ListInputColumn<TagOption>[];

// Each move lands where ListInput reports it: the record's key and index.
const reorderable = useMemo(
  () =>
    createReorderable({
      onReorder: ({key, to}) =>
        setTags(tags => {
          const rest = tags.filter(tag => tag.id !== key);
          return [...rest.slice(0, to), ...tags.filter(tag => tag.id === key), ...rest.slice(to)];
        }),
    }),
  [],
);

<ListInput
  label="Tag options"
  itemName="tag"
  value={tags}
  onChange={setTags}
  getItemKey={tag => tag.id}
  createItem={() => ({id: crypto.randomUUID(), color: 'blue', label: ''})}
  columns={columns}
  reorderable={reorderable}
  status={
    tags.length < 5
      ? {type: 'error', message: 'Add at least five tag options.'}
      : undefined
  }
  getItemStatus={tag =>
    tag.color === 'green' && tag.label === 'Blocked'
      ? {type: 'error', message: '"Blocked" cannot use green.'}
      : undefined
  }
/>`,
    },
    {
      label: 'Controlled guest list',
      code: `import {createReorderable} from '@astryxdesign/core';
import {proportional} from '@astryxdesign/core/Table';

type Guest = {id: string; name: string; email: string};

const columns = [
  {
    key: 'name',
    header: 'Name',
    width: proportional(1),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, isLoading, updateItem}) => (
      <TextInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.name}
        onChange={name => updateItem({...item, name}, 'name')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
        isLoading={isLoading}
      />
    ),
  },
  {
    key: 'email',
    header: 'Email',
    width: proportional(2),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, isLoading, updateItem}) => (
      <TextInput
        type="email"
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.email}
        onChange={email => updateItem({...item, email}, 'email')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
        isLoading={isLoading}
      />
    ),
  },
] satisfies ListInputColumn<Guest>[];

// Each move lands where ListInput reports it: the record's key and index.
const reorderable = useMemo(
  () =>
    createReorderable({
      onReorder: ({key, to}) =>
        setGuests(guests => {
          const rest = guests.filter(guest => guest.id !== key);
          return [...rest.slice(0, to), ...guests.filter(guest => guest.id === key), ...rest.slice(to)];
        }),
    }),
  [],
);

<ListInput
  label="Guests"
  itemName="guest"
  value={guests}
  onChange={setGuests}
  getItemKey={guest => guest.id}
  createItem={() => ({id: crypto.randomUUID(), name: '', email: ''})}
  columns={columns}
  reorderable={reorderable}
  maxItems={6}
  getFieldStatus={(guest, key) =>
    key === 'email' && guest.email === ''
      ? {type: 'error', message: 'Enter an email address'}
      : undefined
  }
  status={
    guests.length === 0
      ? {type: 'error', message: 'Add at least one guest'}
      : undefined
  }
/>`,
    },
    {
      label: 'Mailing list',
      code: `import {TextInput} from '@astryxdesign/core/TextInput';

type Subscriber = {id: string; email: string};

<ListInput
  label="Mailing list"
  itemName="subscriber"
  value={subscribers}
  onChange={setSubscribers}
  getItemKey={subscriber => subscriber.id}
  createItem={() => ({id: crypto.randomUUID(), email: ''})}
  columns={[
    {
      key: 'email',
      header: 'Email address',
      renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
        <TextInput
          type="email"
          label={label}
          isLabelHidden={isLabelHidden}
          value={item.email}
          onChange={email => updateItem({...item, email}, 'email')}
          status={status}
          statusVariant={statusVariant}
          isDisabled={isDisabled}
        />
      ),
    },
  ] satisfies ListInputColumn<Subscriber>[]}
  isRequired
  maxItems={6}
  getItemStatus={subscriber =>
    isDuplicateAddress(subscriber)
      ? {type: 'error', message: 'This address is already in the list.'}
      : undefined
  }
/>`,
    },
    {
      label: 'Budget allocation',
      code: `import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {pixel, proportional} from '@astryxdesign/core/Table';

type Allocation = {id: string; team: string; percent: number | null};

const columns = [
  {
    key: 'team',
    header: 'Team',
    width: proportional(2, {minWidth: 180}),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
      <Selector
        label={label}
        isLabelHidden={isLabelHidden}
        options={teamOptions}
        value={item.team}
        placeholder="Choose a team"
        onChange={team => updateItem({...item, team}, 'team')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
      />
    ),
  },
  {
    key: 'percent',
    header: 'Allocation',
    width: pixel(132),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
      <NumberInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.percent}
        onChange={percent => updateItem({...item, percent}, 'percent')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
        min={0}
        max={100}
        units="%"
        isIntegerOnly
      />
    ),
  },
] satisfies ListInputColumn<Allocation>[];

<ListInput
  label="Quarterly budget allocation"
  itemName="allocation"
  value={allocations}
  onChange={setAllocations}
  getItemKey={allocation => allocation.id}
  createItem={() => ({id: crypto.randomUUID(), team: '', percent: null})}
  columns={columns}
  maxItems={4}
  status={
    total === 100
      ? undefined
      : {type: 'error', message: 'Allocations must total 100%.'}
  }
/>`,
    },
    {
      label: 'Family member declaration',
      code: `import {DateInput} from '@astryxdesign/core/DateInput';
import {Selector} from '@astryxdesign/core/Selector';
import {pixel, proportional} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';

const columns = [
  {
    key: 'fullName',
    header: 'Full legal name',
    width: proportional(2, {minWidth: 200}),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
      <TextInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.fullName}
        onChange={fullName => updateItem({...item, fullName}, 'fullName')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
      />
    ),
  },
  {
    key: 'relationship',
    header: 'Relationship',
    width: proportional(1.25, {minWidth: 160}),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
      <Selector
        label={label}
        isLabelHidden={isLabelHidden}
        options={relationshipOptions}
        value={item.relationship}
        onChange={relationship => updateItem({...item, relationship}, 'relationship')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
      />
    ),
  },
  {
    key: 'dateOfBirth',
    header: 'Date of birth',
    width: pixel(176),
    renderInput: ({item, label, isLabelHidden, status, statusVariant, isDisabled, updateItem}) => (
      <DateInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.dateOfBirth}
        onChange={dateOfBirth => updateItem({...item, dateOfBirth}, 'dateOfBirth')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
      />
    ),
  },
] satisfies ListInputColumn<FamilyMember>[];

<ListInput
  label="Family member declaration"
  itemName="family member"
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
  isRequired
/>`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Controlled compact-record input with typed columns, tokenized non-blocking add/remove motion, optional reorder, and field/item/list validation.',
  propDescriptions: {
    label: 'Collection label and accessible name.',
    value: 'Controlled ordered records.',
    onChange: 'Emits next records plus add/update/remove metadata.',
    getItemKey: 'Required stable unique record identity.',
    createItem: 'Creates a new keyed record for Add.',
    columns:
      'Typed simple fields: key, header, optional proportional/pixel width, and renderInput. ListInput owns visible column labels; narrow records stack with repeated labels, stronger separation, and top-aligned row actions. Renderers forward status and statusVariant.',
    itemName: 'Singular noun for actions and announcements.',
    description: 'Supporting text below the label.',
    status: 'List-level InputStatus.',
    getItemStatus: 'Per-record InputStatus resolver.',
    getFieldStatus:
      'Per-field resolver; complete status plus tooltip variant are forwarded to the rendered input.',
    reorderable:
      "createReorderable object keyed by getItemKey: core List's reorder handle at each record's end (after Remove), revealed on hover/focus, shown on touch: hold then drag (touch), drag (mouse), activate for reorder mode then arrows (keys), with a hint showing the moves and Done; the record dims while a copy follows and a line marks the drop, the other records stay still; each move goes to the object's onReorder({key, to}); its isReorderable keeps a record in place; handles stay focusable but inert while disabled or loading.",
    isDisabled: 'Disables collection, actions, and rendered inputs.',
    isLoading: 'Marks busy and prevents changes.',
    maxItems: 'Makes Add unavailable at the limit.',
    isLabelHidden: 'Visually hides label only.',
    isOptional: 'Shows Optional; exclusive with isRequired.',
    isRequired:
      'Shows Required + accessible requirement; exclusive with isOptional.',
  },
  usage: {
    description:
      'Use for compact ordered records: fewer than 7 items and up to 3 simple consistent fields. Add/remove motion does not delay onChange or focus and becomes instant under reduced motion. Use Table or a dedicated flow for larger or complex data.',
    bestPractices: [
      {
        guidance: true,
        description: 'Use stable keys and consistent columns.',
      },
      {
        guidance: true,
        description: 'Validate at field, item, or list scope as appropriate.',
      },
      {
        guidance: true,
        description:
          'Reorder through the handle; one onReorder call per drop or key move, and no onChange; focus stays on the handle.',
      },
      {
        guidance: true,
        description:
          'Keep add/remove motion non-blocking and instant under reduced motion.',
      },
      {
        guidance: false,
        description: 'Use for long datasets or complex/inconsistent records.',
      },
      {
        guidance: false,
        description:
          'Block removal to enforce a minimum; report a list error instead.',
      },
    ],
  },
};
