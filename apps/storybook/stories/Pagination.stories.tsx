// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {Pagination} from '@astryxdesign/core/Pagination';
import {InternationalizationProvider} from '@astryxdesign/core';

const meta: Meta<typeof Pagination> = {
  title: 'Core/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  argTypes: {
    page: {
      control: 'number',
      description: 'Current page (1-based)',
    },
    variant: {
      control: 'select',
      options: ['pages', 'count', 'compact', 'dots', 'input', 'none'],
      description: 'Visual variant',
    },
    pageLabel: {
      control: 'text',
      description:
        "input variant: noun before the editable box (e.g. 'Page' or 'Row')",
    },
    hasFirstLast: {
      control: 'boolean',
      description:
        'input (default on) and compact (default off) variants: show first/last («/») buttons',
    },
    step: {
      control: 'number',
      description: 'pages the prev/next buttons advance per click',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Size variant',
    },
    siblingCount: {
      control: 'number',
      description: 'Pages shown around current page',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Pagination>;

// Interactive wrapper for controlled state
function PaginationDemo(
  props: Omit<React.ComponentProps<typeof Pagination>, 'onChange'>,
) {
  const [page, setPage] = useState(props.page ?? 1);
  const [pageSize, setPageSize] = useState(props.pageSize ?? 10);
  return (
    <Pagination
      {...props}
      page={page}
      onChange={setPage}
      pageSize={pageSize}
      onPageSizeChange={props.pageSizeOptions ? setPageSize : undefined}
    />
  );
}

export const Default: Story = {
  render: () => <PaginationDemo page={1} totalItems={100} pageSize={10} />,
};

export const RightToLeft: Story = {
  name: 'Right to Left (RTL)',
  render: () => (
    <InternationalizationProvider locale="en" dir="rtl">
      <div dir="rtl">
        <PaginationDemo page={1} totalItems={100} pageSize={10} />
      </div>
    </InternationalizationProvider>
  ),
};

export const PagesVariant: Story = {
  name: 'Variant: Pages',
  render: () => (
    <PaginationDemo page={1} totalItems={200} pageSize={10} variant="pages" />
  ),
};

export const CountVariant: Story = {
  name: 'Variant: Count',
  render: () => (
    <PaginationDemo page={1} totalItems={200} pageSize={20} variant="count" />
  ),
};

export const CompactVariant: Story = {
  name: 'Variant: Compact',
  render: () => <PaginationDemo page={1} totalPages={10} variant="compact" />,
};

export const CompactVariantFirstLast: Story = {
  name: 'Variant: Compact (first/last)',
  render: () => (
    // « ‹ Page X of Y › » — first/last are opt-in for compact.
    <PaginationDemo page={5} totalPages={10} variant="compact" hasFirstLast />
  ),
};

export const DotsVariant: Story = {
  name: 'Variant: Dots',
  render: () => <PaginationDemo page={1} totalPages={8} variant="dots" />,
};

export const NoneVariant: Story = {
  name: 'Variant: None',
  render: () => <PaginationDemo page={1} totalPages={5} variant="none" />,
};

export const InputVariant: Story = {
  name: 'Variant: Input',
  render: () => (
    // The editable box: « ‹ Page [ n ] / N › »
    <PaginationDemo page={3} totalItems={200} pageSize={20} variant="input" />
  ),
};

export const InputVariantCustomLabel: Story = {
  name: 'Variant: Input (custom pageLabel)',
  render: () => (
    // A "Row" label relabels the same page-navigated box: « ‹ Row [ n ] / N › »
    <PaginationDemo
      page={3}
      totalItems={200}
      pageSize={10}
      variant="input"
      pageLabel="Row"
    />
  ),
};

export const InputVariantNoFirstLast: Story = {
  name: 'Variant: Input (no first/last)',
  render: () => (
    // Just ‹ Page [ n ] / N › — first/last buttons hidden.
    <PaginationDemo
      page={3}
      totalItems={200}
      pageSize={10}
      variant="input"
      hasFirstLast={false}
    />
  ),
};

export const InputVariantStep: Story = {
  name: 'Variant: Input (step by 5)',
  render: () => (
    // ‹/› advance 5 pages per click (clamped to 1..N). 500 items at 25/page =
    // 20 pages, so from page 6 next jumps to 11, prev back to 1.
    <PaginationDemo
      page={6}
      totalItems={500}
      pageSize={25}
      variant="input"
      step={5}
    />
  ),
};

export const WithPageSizeSelector: Story = {
  name: 'With Page Size Selector',
  render: () => (
    <PaginationDemo
      page={1}
      totalItems={200}
      pageSize={10}
      pageSizeOptions={[10, 20, 50]}
      variant="count"
    />
  ),
};

export const CursorBased: Story = {
  name: 'Cursor-Based (hasMore)',
  render: () => <PaginationDemo page={1} hasMore={true} />,
};

export const SmallSize: Story = {
  name: 'Small Size',
  render: () => (
    <PaginationDemo page={1} totalItems={100} pageSize={10} size="sm" />
  ),
};

export const ManyPages: Story = {
  name: 'Many Pages (Ellipsis)',
  render: () => <PaginationDemo page={5} totalItems={500} pageSize={10} />,
};

export const ManyPagesLargeSiblings: Story = {
  name: 'Many Pages (siblingCount=2)',
  render: () => (
    <PaginationDemo page={10} totalItems={500} pageSize={10} siblingCount={2} />
  ),
};

export const SinglePage: Story = {
  name: 'Single Page',
  render: () => <PaginationDemo page={1} totalPages={1} />,
};

export const Disabled: Story = {
  render: () => <PaginationDemo page={3} totalPages={10} isDisabled />,
};

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      <div>
        <p style={{marginBottom: 8, fontWeight: 500}}>pages (default)</p>
        <PaginationDemo
          page={3}
          totalItems={100}
          pageSize={10}
          variant="pages"
          label="Pages variant"
        />
      </div>
      <div>
        <p style={{marginBottom: 8, fontWeight: 500}}>count</p>
        <PaginationDemo
          page={3}
          totalItems={100}
          pageSize={10}
          variant="count"
          label="Count variant"
        />
      </div>
      <div>
        <p style={{marginBottom: 8, fontWeight: 500}}>compact</p>
        <PaginationDemo
          page={3}
          totalPages={10}
          variant="compact"
          label="Compact variant"
        />
      </div>
      <div>
        <p style={{marginBottom: 8, fontWeight: 500}}>dots</p>
        <PaginationDemo
          page={3}
          totalPages={8}
          variant="dots"
          label="Dots variant"
        />
      </div>
      <div>
        <p style={{marginBottom: 8, fontWeight: 500}}>input</p>
        <PaginationDemo
          page={3}
          totalItems={100}
          pageSize={10}
          variant="input"
          label="Input variant"
        />
      </div>
      <div>
        <p style={{marginBottom: 8, fontWeight: 500}}>none</p>
        <PaginationDemo
          page={3}
          totalPages={10}
          variant="none"
          label="None variant"
        />
      </div>
    </div>
  ),
};
