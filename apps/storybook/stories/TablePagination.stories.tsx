// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTablePagination,
  paginateData,
  useTableSelection,
  useTableSelectionState,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';

// =============================================================================
// Sample Data
// =============================================================================

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
}

const users: User[] = Array.from({length: 50}, (_, i) => ({
  id: String(i + 1),
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: ['Engineer', 'Designer', 'Manager', 'Admin', 'Analyst'][i % 5],
}));

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name'},
  {key: 'email', header: 'Email'},
  {key: 'role', header: 'Role'},
];

// =============================================================================
// Types
// =============================================================================

type Variant = 'pages' | 'count' | 'compact' | 'dots' | 'none';
type Position = 'below' | 'above' | 'both' | 'none';
type Align = 'start' | 'center' | 'end';

// =============================================================================
// Shared render helper
// =============================================================================

function PaginatedDemo({
  variant = 'pages',
  position = 'below',
  align = 'start',
  label,
}: {
  variant?: Variant;
  position?: Position;
  align?: Align;
  label?: string;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const plugin = useTablePagination<User>({
    page,
    onPageChange: setPage,
    totalItems: users.length,
    pageSize,
    variant,
    position,
    align,
    label,
  });

  return (
    <Table
      data={paginateData(users, page, pageSize)}
      columns={columns}
      idKey="id"
      plugins={{pagination: plugin}}
    />
  );
}

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/TablePagination',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const plugin = useTablePagination<User>({
      page,
      onPageChange: setPage,
      totalItems: users.length,
      pageSize,
    });

    return (
      <div style={{maxWidth: 600}}>
        <Table
          data={paginateData(users, page, pageSize)}
          columns={columns}
          idKey="id"
          plugins={{pagination: plugin}}
        />
      </div>
    );
  },
};

export const ServerSide: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const serverData = users.slice((page - 1) * pageSize, page * pageSize);

    const plugin = useTablePagination<User>({
      page,
      onPageChange: setPage,
      totalItems: users.length,
      pageSize,
    });

    return (
      <div style={{maxWidth: 600}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Server-side: data is pre-sliced, no paginatedData() needed.
        </p>
        <Table
          data={serverData}
          columns={columns}
          idKey="id"
          plugins={{pagination: plugin}}
        />
      </div>
    );
  },
};

export const PageSizeSelector: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const plugin = useTablePagination<User>({
      page,
      onPageChange: setPage,
      totalItems: users.length,
      pageSize,
      onPageSizeChange: setPageSize,
      pageSizeOptions: [5, 10, 25, 50],
    });

    return (
      <div style={{maxWidth: 600}}>
        <Table
          data={paginateData(users, page, pageSize)}
          columns={columns}
          idKey="id"
          plugins={{pagination: plugin}}
        />
      </div>
    );
  },
};

export const CursorBased: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const hasMore = page * pageSize < users.length;

    const plugin = useTablePagination<User>({
      page,
      onPageChange: setPage,
      hasMore,
      pageSize,
    });

    return (
      <div style={{maxWidth: 600}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Cursor-based: total unknown, only hasMore={String(hasMore)}.
        </p>
        <Table
          data={paginateData(users, page, pageSize)}
          columns={columns}
          idKey="id"
          plugins={{pagination: plugin}}
        />
      </div>
    );
  },
};

export const PositionAbove: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const plugin = useTablePagination<User>({
      page,
      onPageChange: setPage,
      totalItems: users.length,
      pageSize,
      position: 'above',
    });

    return (
      <div style={{maxWidth: 600}}>
        <Table
          data={paginateData(users, page, pageSize)}
          columns={columns}
          idKey="id"
          plugins={{pagination: plugin}}
        />
      </div>
    );
  },
};

export const PositionBoth: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const plugin = useTablePagination<User>({
      page,
      onPageChange: setPage,
      totalItems: users.length,
      pageSize,
      position: 'both',
    });

    return (
      <div style={{maxWidth: 600}}>
        <Table
          data={paginateData(users, page, pageSize)}
          columns={columns}
          idKey="id"
          plugins={{pagination: plugin}}
        />
      </div>
    );
  },
};

export const WithSelection: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const pageSize = 10;

    const plugin = useTablePagination<User>({
      page,
      onPageChange: setPage,
      totalItems: users.length,
      pageSize,
    });

    const pageData = paginateData(users, page, pageSize);

    const {selectionConfig} = useTableSelectionState<User>({
      data: pageData,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Pagination + Selection composed. Selected: {selectedKeys.size}
        </p>
        <Table
          data={pageData}
          columns={columns}
          idKey="id"
          plugins={{
            selection: selectionPlugin,
            pagination: plugin,
          }}
        />
      </div>
    );
  },
};

/**
 * Interactive playground — use the controls panel to explore every combination
 * of variant, position, and align.
 */
export const Playground: StoryObj<{
  variant: Variant;
  position: Position;
  align: Align;
}> = {
  argTypes: {
    variant: {
      control: 'select',
      options: ['pages', 'count', 'compact', 'dots', 'none'],
      description: 'What appears between prev/next buttons',
    },
    position: {
      control: 'select',
      options: ['below', 'above', 'both', 'none'],
      description: 'Where pagination renders relative to the table',
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end'],
      description: 'Horizontal alignment of the pagination controls',
    },
  },
  args: {
    variant: 'pages',
    position: 'below',
    align: 'center',
  },
  render: args => (
    <div style={{maxWidth: 700}}>
      <PaginatedDemo
        variant={args.variant}
        position={args.position}
        align={args.align}
      />
    </div>
  ),
};

// =============================================================================
// Options Matrix
// =============================================================================

const VARIANTS: Variant[] = ['pages', 'count', 'compact', 'dots'];
const POSITIONS: Position[] = ['below', 'above', 'both'];
const ALIGNS: Align[] = ['start', 'center', 'end'];

/**
 * All variant × position × align combinations in one scrollable view.
 * One row per combination, labelled clearly. The `none` values are omitted.
 */
export const OptionsMatrix: Story = {
  render: () => (
    <div style={{fontFamily: 'sans-serif', maxWidth: 700}}>
      {VARIANTS.flatMap(variant =>
        POSITIONS.flatMap(position =>
          ALIGNS.map(align => (
            <div
              key={`${variant}-${position}-${align}`}
              style={{
                marginBottom: 48,
                paddingBottom: 48,
                borderBottom: '1px solid #e5e5e5',
              }}>
              <div
                style={{
                  display: 'inline-flex',
                  gap: 8,
                  marginBottom: 12,
                  flexWrap: 'wrap',
                }}>
                {[
                  {label: 'variant', value: variant},
                  {label: 'position', value: position},
                  {label: 'align', value: align},
                ].map(({label, value}) => (
                  <span
                    key={label}
                    style={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      background: '#f0f0f0',
                      borderRadius: 4,
                      padding: '2px 6px',
                      color: '#555',
                    }}>
                    {label}=&quot;{value}&quot;
                  </span>
                ))}
              </div>
              <PaginatedDemo
                variant={variant}
                position={position}
                align={align}
                label={`Table pagination (${variant}, ${position}, ${align})`}
              />
            </div>
          )),
        ),
      )}
    </div>
  ),
};
