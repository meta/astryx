// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {Typeahead, TypeaheadItem} from '@astryxdesign/core/Typeahead';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';

// Sample data
const fruits: SearchableItem[] = [
  {id: '1', label: 'Apple'},
  {id: '2', label: 'Banana'},
  {id: '3', label: 'Cherry'},
  {id: '4', label: 'Date'},
  {id: '5', label: 'Elderberry'},
  {id: '6', label: 'Fig'},
  {id: '7', label: 'Grape'},
  {id: '8', label: 'Honeydew'},
];

const fruitSource: SearchSource = {
  search: (query: string) =>
    fruits.filter(f => f.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => fruits.slice(0, 5),
};

/**
 * A value longer than the input's own width — the case that used to collapse
 * the field onto its value, and then to run under the clear button.
 */
const longFruit: SearchableItem = {
  id: '9',
  label: 'Elderberry and Blackcurrant Preserve',
};

const longFruitSource: SearchSource = {
  search: (query: string) =>
    [...fruits, longFruit].filter(f =>
      f.label.toLowerCase().includes(query.toLowerCase()),
    ),
  bootstrap: () => [longFruit, ...fruits.slice(0, 4)],
};

/**
 * A remote source, near enough. The busy state only exists between the
 * keystroke and the response, so a synchronous source never shows it — which
 * is why the indicator went unexercised long enough to ship as a clock.
 */
const slowFruitSource: SearchSource = {
  search: (query: string) =>
    new Promise(resolve => {
      setTimeout(
        () =>
          resolve(
            fruits.filter(f =>
              f.label.toLowerCase().includes(query.toLowerCase()),
            ),
          ),
        1200,
      );
    }),
  bootstrap: () =>
    new Promise(resolve => setTimeout(() => resolve(fruits.slice(0, 5)), 1200)),
};

const meta: Meta<typeof Typeahead> = {
  title: 'Core/Typeahead',
  component: Typeahead,
  tags: ['autodocs'],
  argTypes: {
    label: {control: 'text'},
    placeholder: {control: 'text'},
    isDisabled: {control: 'boolean'},
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the field focusable via aria-disabled (activation stays blocked). Use this instead of wrapping a disabled Typeahead in Tooltip.',
    },
    isRequired: {control: 'boolean'},
    isOptional: {control: 'boolean'},
    hasEntriesOnFocus: {control: 'boolean'},
    hasClear: {control: 'boolean'},
    maxMenuItems: {control: 'number'},
    minQueryLength: {
      control: 'number',
      description:
        'Minimum query length before the search source is queried. Below it no search runs and the menu stays closed.',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Input size',
    },
  },
  decorators: [
    Story => (
      <div style={{width: 320}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Typeahead>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <Typeahead
        {...args}
        searchSource={fruitSource}
        value={value}
        onChange={setValue}
      />
    );
  },
  args: {
    label: 'Fruit',
    placeholder: 'Search fruits...',
  },
};

export const WithBootstrap: Story = {
  ...Default,
  args: {
    ...Default.args,
    hasEntriesOnFocus: true,
  },
  name: 'With Bootstrap Results',
};

/**
 * Fixture for the RTL audit: results rendered through TypeaheadItem with a
 * leading icon and a description, so the item's icon-then-content order can
 * be measured in both directions.
 */
export const ItemWithIcon: Story = {
  ...Default,
  args: {
    ...Default.args,
    hasEntriesOnFocus: true,
    renderItem: (item: SearchableItem) => (
      <TypeaheadItem
        item={item}
        description="Fruit"
        icon={<MagnifyingGlassIcon width={16} height={16} aria-hidden="true" />}
      />
    ),
  },
  name: 'Parts / TypeaheadItem with icon',
};

export const Required: Story = {
  ...Default,
  args: {
    ...Default.args,
    isRequired: true,
  },
};

export const Optional: Story = {
  ...Default,
  args: {
    ...Default.args,
    isOptional: true,
  },
};

export const WithDescription: Story = {
  ...Default,
  args: {
    ...Default.args,
    description: 'Pick your favorite fruit from the list',
  },
};

export const WithError: Story = {
  ...Default,
  args: {
    ...Default.args,
    status: {type: 'error', message: 'Please select a fruit'},
  },
};

export const WithWarning: Story = {
  ...Default,
  args: {
    ...Default.args,
    status: {type: 'warning', message: 'This fruit may be out of season'},
  },
};

export const WithSuccess: Story = {
  ...Default,
  args: {
    ...Default.args,
    status: {type: 'success', message: 'Great choice!'},
  },
};

export const Disabled: Story = {
  ...Default,
  args: {
    ...Default.args,
    isDisabled: true,
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the field to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the field stays focusable (activation is still
// blocked). Use disabledMessage instead of wrapping a disabled Typeahead in Tooltip:
// disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  ...Default,
  args: {
    ...Default.args,
    isDisabled: true,
    disabledMessage: 'You need the Editor role to change this',
  },
};

export const NoClear: Story = {
  ...Default,
  args: {
    ...Default.args,
    hasClear: false,
  },
  name: 'Without Clear Button',
};

export const LimitedResults: Story = {
  ...Default,
  args: {
    ...Default.args,
    hasEntriesOnFocus: true,
    maxMenuItems: 3,
  },
  name: 'Max 3 Results',
};

export const MinQueryLength: Story = {
  ...Default,
  args: {
    ...Default.args,
    label: 'Fruit (type 3 characters)',
    placeholder: 'Search fruits...',
    description: 'The search runs once three characters are typed.',
    minQueryLength: 3,
  },
  name: 'Minimum Query Length',
};

export const SizeVariants: Story = {
  render: () => {
    const [sm, setSm] = useState<SearchableItem | null>(null);
    const [md, setMd] = useState<SearchableItem | null>(null);
    const [lg, setLg] = useState<SearchableItem | null>(null);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <Typeahead
          label="Small (28px)"
          searchSource={fruitSource}
          value={sm}
          onChange={setSm}
          placeholder="Small size"
          size="sm"
        />
        <Typeahead
          label="Medium (32px)"
          searchSource={fruitSource}
          value={md}
          onChange={setMd}
          placeholder="Medium size (default)"
          size="md"
        />
        <Typeahead
          label="Large (36px)"
          searchSource={fruitSource}
          value={lg}
          onChange={setLg}
          placeholder="Large size"
          size="lg"
        />
      </div>
    );
  },
};

export const WithStartIcon: Story = {
  ...Default,
  args: {
    ...Default.args,
    startIcon: MagnifyingGlassIcon,
    hasEntriesOnFocus: true,
  },
  name: 'With Start Icon',
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<SearchableItem | null>(null);
    const [b, setB] = useState<SearchableItem | null>(null);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 300}}>
        <Typeahead
          label="Attached (default)"
          searchSource={fruitSource}
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Please make a selection'}}
        />
        <Typeahead
          label="Detached"
          searchSource={fruitSource}
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Please make a selection'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};

export const Loading: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <div style={{width: 320}}>
        <Typeahead
          label="Fruit"
          placeholder="Type to search…"
          searchSource={slowFruitSource}
          value={value}
          onChange={setValue}
          hasClear
          debounceMs={0}
        />
      </div>
    );
  },
  name: 'Loading (async source)',
};

/**
 * People the page already has, and a directory server that answers later.
 * The source shows its local matches through `context.update` at once and
 * returns the server answer with the shown rows first and new rows after
 * them, so the list changes once per keystroke and never moves under the
 * pointer or the highlight (spec:AST-092).
 */
const localPeople: SearchableItem[] = [
  {id: 'u1', label: 'Bea Lin'},
  {id: 'u2', label: 'Ben Ortiz'},
  {id: 'u3', label: 'Benita Ruiz'},
  {id: 'u4', label: 'Bo Park'},
];
const directoryPeople: SearchableItem[] = [
  ...localPeople,
  {id: 'u7', label: 'Ben Shah'},
  {id: 'u8', label: 'Bennett Cole'},
  {id: 'u9', label: 'Bea Novak'},
];

function matchPeople(people: SearchableItem[], query: string) {
  const lower = query.toLowerCase();
  return people.filter(person =>
    person.label
      .toLowerCase()
      .split(' ')
      .some(word => word.startsWith(lower)),
  );
}

let pendingDirectoryRequest: {
  timer: ReturnType<typeof setTimeout>;
  reject: (reason: Error) => void;
} | null = null;
const incrementalPeopleSource: SearchSource = {
  bootstrap: () => localPeople,
  cancel() {
    // Settle the cancelled search so the field stops being busy.
    if (pendingDirectoryRequest != null) {
      clearTimeout(pendingDirectoryRequest.timer);
      pendingDirectoryRequest.reject(new Error('cancelled'));
      pendingDirectoryRequest = null;
    }
  },
  async search(query, context) {
    const local = matchPeople(localPeople, query);
    context?.update(local);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingDirectoryRequest = null;
        const shown = new Set(local.map(person => person.id));
        const added = matchPeople(directoryPeople, query).filter(
          person => !shown.has(person.id),
        );
        resolve([...local, ...added]);
      }, 800);
      pendingDirectoryRequest = {timer, reject};
    });
  },
};

export const IncrementalResults: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <Typeahead
        label="Assign to"
        placeholder="Search people"
        searchSource={incrementalPeopleSource}
        value={value}
        onChange={setValue}
        debounceMs={0}
      />
    );
  },
  name: 'Incremental results (local first, server appended)',
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', {name: 'Assign to'});
    const page = within(document.body);
    const labels = () =>
      page.queryAllByRole('option').map(option => option.textContent);

    await userEvent.type(input, 'ben');
    // One change for the keystroke: the local matches, while still busy.
    await waitFor(() => expect(labels()).toEqual(['Ben Ortiz', 'Benita Ruiz']));
    await expect(input).toHaveAttribute('aria-busy', 'true');

    await userEvent.keyboard('{ArrowDown}');
    const activeId = input.getAttribute('aria-activedescendant');
    await expect(activeId).not.toBeNull();

    // The server answer only appends; the shown rows and highlight stay put.
    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'), {
      timeout: 3000,
    });
    await expect(labels()).toEqual([
      'Ben Ortiz',
      'Benita Ruiz',
      'Ben Shah',
      'Bennett Cole',
    ]);
    await expect(input).toHaveAttribute(
      'aria-activedescendant',
      activeId ?? '',
    );

    await userEvent.keyboard('{Enter}');
    // The selected person shows as the field's value.
    // The field shows the selected person (its value text renders more than
    // once: shown, and measured for sizing).
    await expect(
      (await canvas.findAllByText('Benita Ruiz'))[0],
    ).toBeInTheDocument();
  },
};

/**
 * The same source with the field near the bottom of the viewport, so the
 * popup opens above it. Appended server rows scroll inside the popup; the
 * rows already shown keep their place on screen (spec:AST-092 FR6).
 */
export const IncrementalResultsAboveField: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <div style={{paddingBlockStart: 'calc(100vh - 140px)'}}>
        <Typeahead
          label="Assign to"
          placeholder="Search people"
          searchSource={incrementalPeopleSource}
          value={value}
          onChange={setValue}
          debounceMs={0}
        />
      </div>
    );
  },
  name: 'Incremental results above the field',
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', {name: 'Assign to'});
    const page = within(document.body);

    await userEvent.type(input, 'ben');
    await waitFor(() => expect(page.queryAllByRole('option')).toHaveLength(2));
    const [first] = page.getAllByRole('option');
    const firstTop = first.getBoundingClientRect().top;
    await expect(first.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      input.getBoundingClientRect().top,
    );

    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'), {
      timeout: 3000,
    });
    await expect(page.getAllByRole('option')).toHaveLength(4);
    // The shown rows did not move; the appended ones are reached by scrolling.
    await expect(
      Math.abs(
        page.getAllByRole('option')[0].getBoundingClientRect().top - firstTop,
      ),
    ).toBeLessThan(1);
  },
};

/**
 * A source with many local matches and more from the server, for the cases
 * where the list outgrows its popup (spec:AST-092 FR6).
 */
const manyLocal: SearchableItem[] = Array.from({length: 12}, (_, index) => ({
  id: `local-${index}`,
  label: `Alex ${String.fromCharCode(65 + index)}. Local`,
}));
const manyServer: SearchableItem[] = Array.from({length: 8}, (_, index) => ({
  id: `server-${index}`,
  label: `Alex ${String.fromCharCode(77 + index)}. Server`,
}));
function delayedAppendSource(local: SearchableItem[]): SearchSource {
  let pending: {
    timer: ReturnType<typeof setTimeout>;
    reject: (reason: Error) => void;
  } | null = null;
  return {
    bootstrap: () => [],
    cancel() {
      if (pending != null) {
        clearTimeout(pending.timer);
        pending.reject(new Error('cancelled'));
        pending = null;
      }
    },
    async search(query, context) {
      const shown = matchPeople(local, query);
      context?.update(shown);
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending = null;
          resolve([...shown, ...matchPeople(manyServer, query)]);
        }, 800);
        pending = {timer, reject};
      });
    },
  };
}
const scrolledSource = delayedAppendSource(manyLocal);
const shortListSource = delayedAppendSource(manyLocal.slice(0, 2));

/**
 * The user scrolls a partial list before the server answers: appended rows
 * land below, and the scroll position and the rows shown stay put.
 */
export const IncrementalResultsScrolled: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <Typeahead
        label="Assign to"
        placeholder="Search people"
        searchSource={scrolledSource}
        value={value}
        onChange={setValue}
        debounceMs={0}
        maxMenuItems={30}
      />
    );
  },
  name: 'Incremental results in a scrolled list',
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', {name: 'Assign to'});
    const page = within(document.body);

    await userEvent.type(input, 'alex');
    await waitFor(() => expect(page.queryAllByRole('option')).toHaveLength(12));
    const listbox = page.getByRole('listbox');
    const scroller =
      listbox.scrollHeight > listbox.clientHeight
        ? listbox
        : (listbox.parentElement as HTMLElement);
    scroller.scrollTop = scroller.scrollHeight;
    const scrolledTo = scroller.scrollTop;
    await expect(scrolledTo).toBeGreaterThan(0);
    const lastShown = page.getByRole('option', {name: 'Alex L. Local'});
    const lastShownTop = lastShown.getBoundingClientRect().top;

    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'), {
      timeout: 3000,
    });
    await expect(page.getAllByRole('option')).toHaveLength(20);
    // The scroll offset and the shown rows' place on screen did not move.
    await expect(Math.abs(scroller.scrollTop - scrolledTo)).toBeLessThan(1);
    await expect(
      Math.abs(lastShown.getBoundingClientRect().top - lastShownTop),
    ).toBeLessThan(1);
  },
};

/**
 * The field sits low enough that the first, short list fits below it but the
 * server's answer would not: the popup stays below and grows only within the
 * room there, scrolling the rest (spec:AST-092 FR6).
 */
export const IncrementalResultsBelowFieldOverflow: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <div style={{paddingBlockStart: 'calc(100vh - 280px)'}}>
        <Typeahead
          label="Assign to"
          placeholder="Search people"
          searchSource={shortListSource}
          value={value}
          onChange={setValue}
          debounceMs={0}
        />
      </div>
    );
  },
  name: 'Incremental results below the field, outgrowing the room',
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', {name: 'Assign to'});
    const page = within(document.body);

    await userEvent.type(input, 'alex');
    await waitFor(() => expect(page.queryAllByRole('option')).toHaveLength(2));
    const [first] = page.getAllByRole('option');
    const firstTop = first.getBoundingClientRect().top;
    // The first list opens below the field.
    await expect(firstTop).toBeGreaterThanOrEqual(
      input.getBoundingClientRect().bottom,
    );

    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'), {
      timeout: 3000,
    });
    await expect(page.getAllByRole('option')).toHaveLength(10);
    const popup = page.getByRole('listbox');
    // Still below the field, inside the viewport, with the first row in place.
    await expect(popup.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      input.getBoundingClientRect().bottom - 1,
    );
    await expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    await expect(
      Math.abs(
        page.getAllByRole('option')[0].getBoundingClientRect().top - firstTop,
      ),
    ).toBeLessThan(1);
  },
};

/**
 * A pointer resting where the server's rows land does not take the
 * highlight: the rows arrive under it without the pointer moving, so Enter
 * still picks the row the keyboard highlighted (spec:AST-092 FR6).
 */
export const IncrementalResultsRestingPointer: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <Typeahead
        label="Assign to"
        placeholder="Search people"
        searchSource={incrementalPeopleSource}
        value={value}
        onChange={setValue}
        debounceMs={0}
      />
    );
  },
  name: 'Incremental results under a resting pointer',
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', {name: 'Assign to'});
    const page = within(document.body);

    await userEvent.type(input, 'ben');
    await waitFor(() => expect(page.queryAllByRole('option')).toHaveLength(2));
    await userEvent.keyboard('{ArrowDown}');
    const activeId = input.getAttribute('aria-activedescendant');
    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'), {
      timeout: 3000,
    });
    // A row appearing under a still pointer gets boundary events, not a move.
    const appended = page.getByRole('option', {name: 'Ben Shah'});
    appended.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
    appended.dispatchEvent(new MouseEvent('mouseenter'));
    await expect(input).toHaveAttribute(
      'aria-activedescendant',
      activeId ?? '',
    );
    await userEvent.keyboard('{Enter}');
    // The field shows the selected person (its value text renders more than
    // once: shown, and measured for sizing).
    await expect(
      (await canvas.findAllByText('Benita Ruiz'))[0],
    ).toBeInTheDocument();
  },
};

/**
 * The two cases no Typeahead story covered, which is why a bug this visible
 * survived: a value selected, and a parent that is sized by its content.
 *
 * Every other story renders in a fixed-width container, and a block-level
 * parent fills its container whatever its content is — so both hid a field
 * that sized itself to its value. Here the field is a flex item, so it is
 * shrink-to-fit: a table cell, an inline toolbar, a floated column.
 *
 * Left, a long value: it must not widen the field, and it must ellipsize
 * before the clear button rather than under it. Right, an empty field for
 * comparison — the two must be the same width.
 */
export const SelectedValueInAContentSizedParent: Story = {
  render: () => {
    const [a, setA] = useState<SearchableItem | null>(longFruit);
    const [b, setB] = useState<SearchableItem | null>(null);
    return (
      <div style={{display: 'flex', alignItems: 'flex-start', gap: 16}}>
        <Typeahead
          label="Selected"
          searchSource={longFruitSource}
          value={a}
          onChange={setA}
          hasClear
        />
        <Typeahead
          label="Empty"
          placeholder="Type to search…"
          searchSource={longFruitSource}
          value={b}
          onChange={setB}
          hasClear
        />
      </div>
    );
  },
  name: 'Selected value in a content-sized parent',
};

/**
 * One field with a selected value and a clear button — the two ends of the
 * content lane. The token opens the lane and the clear button closes it, so
 * under RTL they must swap sides: this is the story the RTL audit measures as
 * a D2 layout-order-flip.
 *
 * A single field on purpose. The comparison story next to it renders two, and
 * the audit's selectors would match across both.
 */
export const LogicalOrder: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem | null>(longFruit);
    return (
      <div style={{width: 320}}>
        <Typeahead
          label="Fruit"
          searchSource={longFruitSource}
          value={value}
          onChange={setValue}
          hasClear
        />
      </div>
    );
  },
  name: 'Logical order',
};

/**
 * The inline-end lane, populated at rest, for the RTL audit's D4 pass.
 *
 * The lane holds the busy Spinner, and the busy state only exists between a
 * keystroke and its response — nothing the audit can hold still. A selected
 * value with `hasClear` puts the same lane on screen with no interaction, so
 * the audit measures the geometry the indicator lands in.
 */
export const RtlEndLane: Story = {
  render: () => (
    <div style={{width: 320}}>
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
        hasClear
      />
    </div>
  ),
  name: 'RTL end lane (selected + clear)',
};
