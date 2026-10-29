// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {Button} from '@astryxdesign/core/Button';
import {Token} from '@astryxdesign/core/Token';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';

// Sample data
const users: SearchableItem[] = [
  {id: '1', label: 'Alice Johnson'},
  {id: '2', label: 'Bob Smith'},
  {id: '3', label: 'Charlie Brown'},
  {id: '4', label: 'Diana Prince'},
  {id: '5', label: 'Eve Williams'},
  {id: '6', label: 'Frank Miller'},
  {id: '7', label: 'Grace Lee'},
  {id: '8', label: 'Henry Davis'},
];

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users.slice(0, 5),
};

/**
 * A remote source, near enough — the busy state only exists between the
 * keystroke and the response, so a synchronous source never shows it.
 */
const slowUserSource: SearchSource = {
  search: (query: string) =>
    new Promise(resolve => {
      setTimeout(
        () =>
          resolve(
            users.filter(u =>
              u.label.toLowerCase().includes(query.toLowerCase()),
            ),
          ),
        1200,
      );
    }),
  bootstrap: () =>
    new Promise(resolve => setTimeout(() => resolve(users.slice(0, 5)), 1200)),
};

const meta: Meta<typeof Tokenizer> = {
  title: 'Core/Tokenizer',
  component: Tokenizer,
  tags: ['autodocs'],
  argTypes: {
    label: {control: 'text'},
    placeholder: {control: 'text'},
    isDisabled: {control: 'boolean'},
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the tokenizer is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (input stays blocked). Use this instead of wrapping a disabled Tokenizer in Tooltip.',
    },
    isRequired: {control: 'boolean'},
    isOptional: {control: 'boolean'},
    hasClear: {control: 'boolean'},
    maxEntries: {control: 'number'},
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Input size',
    },
  },
  decorators: [
    // A 400px column where there is room that shrinks with the viewport, so
    // the stories read the same on a phone-sized canvas.
    Story => (
      <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 400px)'}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tokenizer>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={items => setValue(items)}
      />
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Search people...',
  },
};

export const WithPreselected: Story = {
  render: args => {
    const [value, setValue] = useState([users[0], users[2]]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={items => setValue(items)}
      />
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Add more...',
  },
  name: 'Pre-selected Items',
};

export const WithClear: Story = {
  ...Default,
  args: {
    ...Default.args,
    hasClear: true,
  },
  name: 'With Clear All Button',
};

export const MaxEntries: Story = {
  ...Default,
  args: {
    ...Default.args,
    maxEntries: 3,
  },
  name: 'Max 3 Entries',
};

export const Required: Story = {
  ...Default,
  args: {
    ...Default.args,
    isRequired: true,
  },
};

export const WithDescription: Story = {
  ...Default,
  args: {
    ...Default.args,
    description: 'Select up to 5 team members for this project',
  },
};

export const WithError: Story = {
  ...Default,
  args: {
    ...Default.args,
    status: {type: 'error', message: 'At least one member is required'},
  },
};

export const WithWarning: Story = {
  ...Default,
  args: {
    ...Default.args,
    status: {type: 'warning', message: 'Some members may not have access'},
  },
};

export const WithSuccess: Story = {
  ...Default,
  args: {
    ...Default.args,
    status: {type: 'success', message: 'Team is ready!'},
  },
};

export const Disabled: Story = {
  render: args => {
    const [value] = useState([users[0], users[1]]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={() => {}}
      />
    );
  },
  args: {
    label: 'Team Members',
    isDisabled: true,
  },
};

export const WithStartIcon: Story = {
  ...Default,
  args: {
    ...Default.args,
    startIcon: MagnifyingGlassIcon,
  },
  name: 'With Start Icon',
};

export const WithStartIconAndTokens: Story = {
  render: args => {
    const [value, setValue] = useState([users[0], users[2]]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={items => setValue(items)}
      />
    );
  },
  args: {
    label: 'Team Members',
    startIcon: MagnifyingGlassIcon,
  },
  name: 'With Start Icon and Tokens',
};

export const WithEntriesOnFocus: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={items => setValue(items)}
        hasEntriesOnFocus
      />
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Click to see suggestions...',
  },
  name: 'With Entries On Focus',
};

export const OverflowInline: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([
      users[0],
      users[1],
      users[2],
      users[3],
      users[4],
      users[5],
    ]);
    return (
      <div>
        <Tokenizer
          {...args}
          searchSource={userSource}
          value={value}
          onChange={items => setValue(items)}
          tokenOverflowBehavior="unfocusedInline"
        />
        <p style={{marginTop: 8}}>
          This text will shift down when the tokenizer expands on focus.
        </p>
      </div>
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Add more...',
  },
  name: 'Overflow Inline',
};

export const OverflowLayer: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([
      users[0],
      users[1],
      users[2],
      users[3],
      users[4],
      users[5],
    ]);
    return (
      <div>
        <Tokenizer
          {...args}
          searchSource={userSource}
          value={value}
          onChange={items => setValue(items)}
          tokenOverflowBehavior="unfocusedLayer"
        />
        <p style={{marginTop: 8}}>
          This text should not shift when the tokenizer expands on focus.
        </p>
      </div>
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Add more...',
  },
  name: 'Overflow Layer',
};

export const WithEndContent: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([users[0], users[2]]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={items => setValue(items)}
        endContent={<Button label="Apply" variant="primary" size="sm" />}
      />
    );
  },
  args: {
    label: 'Team Members',
  },
  name: 'With End Content',
};

// Empty source for free-text-only tokenizers
const emptySource: SearchSource = {
  search: () => [],
  bootstrap: () => [],
};

export const Creatable: Story = {
  render: args => {
    const [tags, setTags] = useState<SearchableItem[]>([]);
    return (
      <div>
        <Tokenizer
          {...args}
          searchSource={emptySource}
          value={tags}
          onChange={(items, _change) => {
            setTags(items);
          }}
          hasCreate
          placeholder="Type a tag and press Enter..."
        />
        <p
          style={{
            marginTop: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          {tags.length} tag{tags.length !== 1 ? 's' : ''} added
        </p>
      </div>
    );
  },
  args: {
    label: 'Tags',
  },
  name: 'Creatable (Free Text)',
};

export const SizeVariants: Story = {
  render: () => {
    const [sm, setSm] = useState<SearchableItem[]>([]);
    const [md, setMd] = useState<SearchableItem[]>([users[0], users[2]]);
    const [lg, setLg] = useState<SearchableItem[]>([]);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <Tokenizer
          label="Small (28px)"
          searchSource={userSource}
          value={sm}
          onChange={items => setSm(items)}
          placeholder="Small size"
          size="sm"
          hasClear
        />
        <Tokenizer
          label="Medium (32px)"
          searchSource={userSource}
          value={md}
          onChange={items => setMd(items)}
          placeholder="Medium size (default)"
          size="md"
          hasClear
        />
        <Tokenizer
          label="Large (36px)"
          searchSource={userSource}
          value={lg}
          onChange={items => setLg(items)}
          placeholder="Large size"
          size="lg"
          hasClear
        />
      </div>
    );
  },
};

export const CreatableWithSearch: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={(items, _change) => {
          setValue(items);
        }}
        hasCreate
        hasEntriesOnFocus
        placeholder="Search or type a new name..."
      />
    );
  },
  args: {
    label: 'Team Members',
  },
  name: 'Creatable + Search',
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the input to see
// why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the input stays focusable (input is still blocked). Use
// disabledMessage instead of wrapping a disabled Tokenizer in Tooltip: disabled
// controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value] = useState([users[0], users[1]]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={() => {}}
      />
    );
  },
  args: {
    label: 'Team Members',
    isDisabled: true,
    disabledMessage: 'You need edit access to change members',
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<SearchableItem[]>([]);
    const [b, setB] = useState<SearchableItem[]>([]);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
        <Tokenizer
          label="Attached (default)"
          searchSource={userSource}
          value={a}
          onChange={items => setA(items)}
          status={{type: 'error', message: 'Select at least one member'}}
        />
        <Tokenizer
          label="Detached"
          searchSource={userSource}
          value={b}
          onChange={items => setB(items)}
          status={{type: 'error', message: 'Select at least one member'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};

export const Loading: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([users[0]]);
    return (
      <Tokenizer
        {...args}
        searchSource={slowUserSource}
        value={value}
        onChange={items => setValue(items)}
        hasClear
        endContent={<span>{value.length} selected</span>}
      />
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Search people...',
  },
  name: 'Loading (async source, with clear and end content)',
};

/**
 * Tokens plus a clear-all button — the two ends of the field. Under RTL they
 * must swap sides; this is the story the RTL audit measures as a D2
 * layout-order-flip.
 */
export const LogicalOrder: Story = {
  render: args => {
    const [value, setValue] = useState([users[0], users[2]]);
    return (
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={value}
        onChange={items => setValue(items)}
      />
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Add more...',
    hasClear: true,
  },
  name: 'Logical order',
};

/**
 * The inline-end lane, populated at rest, for the RTL audit's D4 pass.
 *
 * Tokenizer's lane is absolutely positioned — it has to be, so it stays on the
 * field's first row while tokens wrap below it — which makes its side entirely
 * a matter of the writing mode. The busy Spinner shares that lane, and busy
 * only exists mid-search, so a selected token with `hasClear` is what puts the
 * lane on screen for a measurement that can be held still.
 */
export const RtlEndLane: Story = {
  render: args => (
    <Tokenizer
      {...args}
      searchSource={userSource}
      value={[users[0]]}
      onChange={() => {}}
      hasClear
    />
  ),
  args: {
    label: 'Team Members',
    placeholder: 'Search people...',
  },
  name: 'RTL end lane (token + clear)',
};

const longToken: SearchableItem = {
  id: 'long',
  label: 'Status: is In Progress, Blocked, or Waiting for Review',
};

/**
 * One token wider than the row, beside the clear-all lane, as the default pill
 * and through `renderToken`. Both must truncate short of the lane rather than
 * run underneath it.
 */
export const LongTokenEndLane: Story = {
  render: args => (
    <div style={{display: 'grid', gap: 16}}>
      <Tokenizer
        {...args}
        searchSource={userSource}
        value={[longToken]}
        onChange={() => {}}
        hasClear
      />
      <Tokenizer
        {...args}
        label="Custom token"
        searchSource={userSource}
        value={[longToken]}
        onChange={() => {}}
        hasClear
        renderToken={(item, onRemove) => (
          <Token label={item.label} onRemove={onRemove} />
        )}
      />
    </div>
  ),
  args: {
    label: 'Filters',
    placeholder: 'Add a filter...',
  },
  name: 'Long token beside the end lane',
};

/**
 * Where the caret goes once the field has tokens. Focused with an empty query,
 * it sits right after the last token, on the last row, where typed text will
 * start (top). A row with no room left for it (bottom, narrowed by the play
 * function) keeps its height at rest; focusing moves the caret to the start of
 * a new row, as wrapped text would, unless the field is read-only.
 */
export const CaretPlacement: Story = {
  render: args => {
    const [wrapped, setWrapped] = useState(users.slice(0, 5));
    const [oneRow, setOneRow] = useState(users.slice(0, 2));
    return (
      <div style={{display: 'grid', gap: 16}}>
        <Tokenizer
          {...args}
          searchSource={userSource}
          value={wrapped}
          onChange={items => setWrapped(items)}
        />
        <div data-full-row-host="">
          <Tokenizer
            {...args}
            label="Reviewers"
            searchSource={userSource}
            value={oneRow}
            onChange={items => setOneRow(items)}
          />
        </div>
      </div>
    );
  },
  args: {
    label: 'Team Members',
    placeholder: 'Add more...',
    hasClear: true,
  },
  name: 'Caret placement',
  play: async ({canvasElement}) => {
    const [wrappedField, fullRowField] =
      canvasElement.querySelectorAll<HTMLElement>('.astryx-tokenizer');
    const host = canvasElement.querySelector<HTMLElement>(
      '[data-full-row-host]',
    );
    if (!wrappedField || !fullRowField || !host) {
      throw new Error('Caret fixtures did not render as expected');
    }
    const settle = () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    const parts = (field: HTMLElement) => {
      const input = field.querySelector<HTMLInputElement>('[role="combobox"]');
      const tokens = [...field.querySelectorAll<HTMLElement>('.astryx-token')];
      const lastToken = tokens.at(-1);
      if (!input || !lastToken) {
        throw new Error('A caret fixture is missing its input or tokens');
      }
      return {input, firstToken: tokens[0], lastToken, tokens};
    };
    // Room left between the last token and the field's inline-end content
    // edge, which already stops short of the end lane.
    const roomAfter = (field: HTMLElement, token: HTMLElement) => {
      const style = getComputedStyle(field);
      const fieldRect = field.getBoundingClientRect();
      const tokenRect = token.getBoundingClientRect();
      return style.direction === 'rtl'
        ? tokenRect.left -
            (fieldRect.left +
              Number.parseFloat(style.borderLeftWidth) +
              Number.parseFloat(style.paddingLeft))
        : fieldRect.right -
            Number.parseFloat(style.borderRightWidth) -
            Number.parseFloat(style.paddingRight) -
            tokenRect.right;
    };
    // An empty input paints its caret at the edge of its content box that its
    // text alignment starts from.
    const caretOf = (input: HTMLInputElement) => {
      const style = getComputedStyle(input);
      const isRtl = style.direction === 'rtl';
      const rect = input.getBoundingClientRect();
      const {textAlign} = style;
      const alignsRight =
        textAlign === 'right' ||
        (textAlign === 'start' && isRtl) ||
        (textAlign === 'end' && !isRtl);
      return {
        isRtl,
        x: alignsRight
          ? rect.right - Number.parseFloat(style.paddingRight)
          : rect.left + Number.parseFloat(style.paddingLeft),
        y: rect.top + rect.height / 2,
      };
    };
    const heightOf = (field: HTMLElement) =>
      field.getBoundingClientRect().height;

    await document.fonts.ready;
    const reserveDeadline = performance.now() + 2000;
    while (
      [wrappedField, fullRowField].some(
        field =>
          field.style.getPropertyValue('--_tokenizer-end-lane-reserve') === '',
      )
    ) {
      if (performance.now() >= reserveDeadline) {
        throw new Error('Clear-all lane reserve was not measured');
      }
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
    }
    await settle();

    // Wrapped tokens: the caret follows the last token, on its row.
    {
      const {input, lastToken, tokens} = parts(wrappedField);
      const rows = new Set(
        tokens.map(token => Math.round(token.getBoundingClientRect().top)),
      );
      if (rows.size < 2 || roomAfter(wrappedField, lastToken) < 20) {
        throw new Error(
          'Fixture no longer wraps with room after the last token',
        );
      }
      const restingHeight = heightOf(wrappedField);
      const restingToken = lastToken.getBoundingClientRect();
      input.focus();
      await settle();
      if (document.activeElement !== input) {
        throw new Error('The combobox did not take focus');
      }
      if (Math.abs(heightOf(wrappedField) - restingHeight) > 0.5) {
        throw new Error(
          `Focusing changed the field height from ${restingHeight.toFixed(2)} to ${heightOf(wrappedField).toFixed(2)}`,
        );
      }
      const token = lastToken.getBoundingClientRect();
      if (
        Math.abs(token.left - restingToken.left) > 0.5 ||
        Math.abs(token.top - restingToken.top) > 0.5
      ) {
        throw new Error('Focusing moved the last token');
      }
      const caret = caretOf(input);
      if (caret.y < token.top || caret.y > token.bottom) {
        throw new Error(
          `The caret is not on the last token's row: caret y ${caret.y.toFixed(2)}, last token ${token.top.toFixed(2)}–${token.bottom.toFixed(2)}`,
        );
      }
      const offset = caret.isRtl ? token.left - caret.x : caret.x - token.right;
      if (offset < 0 || offset > 12) {
        throw new Error(
          `The caret is ${offset.toFixed(2)}px from the last token's inline end; expected it right after the token`,
        );
      }
      input.blur();
    }

    // A row with less room than the caret's text inset: no blank row at rest,
    // and focusing starts a new row.
    {
      const {input, firstToken, lastToken} = parts(fullRowField);
      const restingHeight = heightOf(fullRowField);
      const room = roomAfter(fullRowField, lastToken);
      host.style.width = `${host.getBoundingClientRect().width - (room - 3)}px`;
      await settle();
      if (Math.abs(roomAfter(fullRowField, lastToken) - 3) > 0.5) {
        throw new Error('Could not leave 3px after the last token');
      }
      if (Math.abs(heightOf(fullRowField) - restingHeight) > 0.5) {
        throw new Error(
          `With 3px left on the row, the resting field grew from ${restingHeight.toFixed(2)} to ${heightOf(fullRowField).toFixed(2)}`,
        );
      }
      input.focus();
      await settle();
      const caret = caretOf(input);
      const token = lastToken.getBoundingClientRect();
      const rowStart = firstToken.getBoundingClientRect();
      const startOffset = caret.isRtl
        ? rowStart.right - caret.x
        : caret.x - rowStart.left;
      if (caret.y <= token.bottom || startOffset < 0 || startOffset > 8) {
        throw new Error(
          'With no room after the last token, the focused caret did not start a new row',
        );
      }
      input.blur();
      await settle();

      // A disabled field with a disabledMessage stays focusable, but read-only.
      // Nothing can be typed there, so focusing it must not start a new row.
      input.readOnly = true;
      input.focus();
      await settle();
      const readOnlyHeight = heightOf(fullRowField);
      input.blur();
      input.readOnly = false;
      host.style.width = '';
      if (Math.abs(readOnlyHeight - restingHeight) > 0.5) {
        throw new Error(
          `With 3px left on the row, focusing a read-only field grew it from ${restingHeight.toFixed(2)} to ${readOnlyHeight.toFixed(2)}`,
        );
      }
    }
  },
};
