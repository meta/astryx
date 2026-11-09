// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useId, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {
  BaseTypeahead,
  Typeahead,
  createStaticSource,
  type BaseTypeaheadProps,
  type SearchableItem,
  type SearchSource,
} from '@astryxdesign/core/Typeahead';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import {
  borderVars,
  colorVars,
  focusVars,
  fontWeightVars,
  radiusVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const items: SearchableItem[] = [
  {id: 'react', label: 'React', auxiliaryData: {group: 'Libraries'}},
  {id: 'vue', label: 'Vue', auxiliaryData: {group: 'Libraries'}},
  {id: 'angular', label: 'Angular', auxiliaryData: {group: 'Frameworks'}},
  {id: 'svelte', label: 'Svelte', auxiliaryData: {group: 'Frameworks'}},
  {
    id: 'long',
    label:
      'A deliberately long framework result that must stay inside the menu',
    auxiliaryData: {group: 'Frameworks'},
  },
];

const source = createStaticSource(items);
const emptySource = createStaticSource([]);
const pendingSource: SearchSource = {
  search: () => new Promise(() => {}),
  bootstrap: () => new Promise(() => {}),
};
// A single-answer remote source with a reproducible pending interval (#8903).
const delayedSource: SearchSource = {
  search: async query => {
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
    return source.search(query);
  },
  bootstrap: () => [],
};

const styles = stylex.create({
  stage: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-5'],
    maxWidth: '32rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  label: {
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  field: {
    alignItems: 'center',
    backgroundColor: colorVars['--color-background-surface'],
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
    borderStyle: 'solid',
    borderWidth: borderVars['--border-width'],
    display: 'flex',
    minHeight: sizeVars['--size-element-md'],
    paddingInline: spacingVars['--spacing-2'],
    outlineColor: {
      default: 'transparent',
      ':has(input:focus-visible)': focusVars['--focus-outline-color'],
    },
    outlineOffset: focusVars['--focus-outline-offset'],
    outlineStyle: 'solid',
    outlineWidth: {
      default: '0',
      ':has(input:focus-visible)': focusVars['--focus-outline-width'],
    },
    width: '20rem',
  },
  narrowField: {
    maxWidth: '100%',
    width: '16rem',
  },
  customItem: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  customItemLabel: {
    color: colorVars['--color-text-primary'],
    fontWeight: 500,
  },
  customItemGroup: {
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-supporting-size'],
  },
});

type DemoProps = Omit<
  BaseTypeaheadProps<SearchableItem>,
  'searchSource' | 'value' | 'onChange'
> & {
  label?: string;
  source?: SearchSource<SearchableItem>;
  isNarrow?: boolean;
};

function Demo({
  label = 'Framework',
  source: searchSource = source,
  isNarrow = false,
  inputId: inputIdProp,
  ariaLabelledBy: ariaLabelledByProp,
  ...props
}: DemoProps) {
  const [value, setValue] = useState<SearchableItem | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const generatedId = useId().replaceAll(':', '');
  const generatedInputId = `base-typeahead-${generatedId}`;
  const inputId = inputIdProp ?? generatedInputId;
  const labelId = `${inputId}-label`;

  return (
    <div {...stylex.props(styles.fieldGroup)}>
      <label id={labelId} htmlFor={inputId} {...stylex.props(styles.label)}>
        {label}
      </label>
      <div
        ref={anchorRef}
        data-base-typeahead-anchor="true"
        {...stylex.props(styles.field, isNarrow && styles.narrowField)}>
        <BaseTypeahead
          {...props}
          inputId={inputId}
          ariaLabelledBy={ariaLabelledByProp ?? labelId}
          anchorRef={anchorRef}
          searchSource={searchSource}
          value={value}
          onChange={setValue}
        />
      </div>
    </div>
  );
}

const meta: Meta<DemoProps> = {
  title: 'Core/BaseTypeahead',
  component: Demo,
  tags: ['autodocs'],
  parameters: {layout: 'centered'},
} satisfies Meta<DemoProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Demo placeholder="Search frameworks…" />,
};

export const LogicalDropdownPlacement: Story = {
  render: () => (
    <Demo
      hasEntriesOnFocus
      isNarrow
      menuWidth={320}
      placeholder="Focus to open results…"
    />
  ),
  play: async ({canvasElement}) => {
    const input = within(canvasElement).getByRole('combobox');
    await userEvent.click(input);
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
  },
};

export const Loading: Story = {
  render: () => (
    <Demo
      source={pendingSource}
      debounceMs={0}
      placeholder="Type to start a pending search…"
    />
  ),
  play: async ({canvasElement}) => {
    const input = within(canvasElement).getByRole('combobox');
    await userEvent.type(input, 're');
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));
  },
};

export const EmptyResults: Story = {
  render: () => (
    <Demo
      source={emptySource}
      debounceMs={0}
      emptySearchText="No matching frameworks"
    />
  ),
  play: async ({canvasElement}) => {
    const input = within(canvasElement).getByRole('combobox');
    await userEvent.type(input, 'none');
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
  },
};

function EmptyThenPendingDemo() {
  const [value, setValue] = useState<SearchableItem | null>(null);
  const [tokens, setTokens] = useState<SearchableItem[]>([]);
  return (
    <div {...stylex.props(styles.stage)}>
      <Demo source={delayedSource} label="Bare framework" />
      <Typeahead
        label="Single framework"
        searchSource={delayedSource}
        value={value}
        onChange={setValue}
      />
      <Tokenizer
        label="Framework tokens"
        searchSource={delayedSource}
        value={tokens}
        onChange={setTokens}
      />
    </div>
  );
}

export const EmptyThenPending: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Search for zzz, wait for the empty result, then type react or xxx. Each request takes one second; the previous empty result must not remain during debounce or loading.',
      },
    },
  },
  render: () => <EmptyThenPendingDemo />,
};

export const CustomRenderer: Story = {
  render: () => (
    <Demo
      hasEntriesOnFocus
      renderItem={item => (
        <span {...stylex.props(styles.customItem)}>
          <span {...stylex.props(styles.customItemLabel)}>{item.label}</span>
          <span {...stylex.props(styles.customItemGroup)}>
            {(item.auxiliaryData as {group?: string} | undefined)?.group}
          </span>
        </span>
      )}
    />
  ),
  play: async ({canvasElement}) => {
    const input = within(canvasElement).getByRole('combobox');
    await userEvent.click(input);
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
  },
};

export const DisabledStates: Story = {
  render: () => (
    <div {...stylex.props(styles.stage)}>
      <Demo label="Native disabled" isDisabled />
      <Demo label="Focusable disabled" isDisabled isFocusableDisabled />
    </div>
  ),
};

export const SizeVariants: Story = {
  render: () => (
    <div {...stylex.props(styles.stage)}>
      <Demo label="Small" size="sm" hasEntriesOnFocus />
      <Demo label="Medium" size="md" hasEntriesOnFocus />
      <Demo label="Large" size="lg" hasEntriesOnFocus />
    </div>
  ),
};

export const NarrowLongResult: Story = {
  render: () => (
    <Demo isNarrow hasEntriesOnFocus label="Framework in a narrow container" />
  ),
  play: async ({canvasElement}) => {
    const input = within(canvasElement).getByRole('combobox');
    await userEvent.click(input);
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    await waitFor(() => {
      const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
      if (listbox == null) {
        throw new Error('Expected the BaseTypeahead listbox to be open');
      }
      const box = listbox.getBoundingClientRect();
      expect(
        box.left >= 16 &&
          box.right <= window.innerWidth - 16 &&
          listbox.scrollWidth <= listbox.clientWidth,
      ).toBe(true);
      expect(
        Array.from(
          listbox.querySelectorAll<HTMLElement>('[role="option"]'),
        ).every(option => option.scrollWidth <= option.clientWidth),
      ).toBe(true);
    });
  },
};
