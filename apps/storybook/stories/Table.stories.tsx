// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {expect, waitFor} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {
  Table,
  TableRow,
  TableCell,
  TableHeaderCell,
  TableHeader,
  TableBody,
  proportional,
  pixel,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
  VStack,
  HStack,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {
  colorDefaults,
  spacingDefaults,
  radiusDefaults,
  textSizeDefaults,
} from '@astryxdesign/core/theme';
import {
  colorVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

// =============================================================================
// Sample Data
// =============================================================================

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
  age: number;
}

const users: User[] = [
  {
    id: '1',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    role: 'Engineer',
    age: 30,
  },
  {
    id: '2',
    name: 'Bob Smith',
    email: 'bob@example.com',
    role: 'Designer',
    age: 25,
  },
  {
    id: '3',
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    role: 'PM',
    age: 35,
  },
  {
    id: '4',
    name: 'Diana Prince',
    email: 'diana@example.com',
    role: 'Engineer',
    age: 28,
  },
  {
    id: '5',
    name: 'Eve Davis',
    email: 'eve@example.com',
    role: 'Designer',
    age: 32,
  },
];

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name', width: proportional(1)},
  {key: 'email', header: 'Email', width: proportional(2)},
  {key: 'role', header: 'Role', width: proportional(1)},
  {key: 'age', header: 'Age', width: pixel(80)},
];

// =============================================================================
// Meta
// =============================================================================

const meta: Meta = {
  title: 'Core/Table',
  component: Table,
  tags: ['autodocs'],
  argTypes: {
    density: {
      control: 'select',
      options: ['compact', 'balanced', 'spacious'],
      description: 'Row density controlling padding and font size',
    },
    dividers: {
      control: 'select',
      options: ['rows', 'columns', 'grid', 'none'],
      description: 'Divider style between cells',
    },
    isStriped: {
      control: 'boolean',
      description: 'Alternate row background color',
    },
    hasHover: {
      control: 'boolean',
      description: 'Highlight rows on hover',
    },
    verticalAlign: {
      control: 'select',
      options: ['middle', 'top', 'bottom'],
      description: 'Vertical alignment for body row cells',
    },
  },
};

export default meta;
type Story = StoryObj;

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
  },
};

export const Compact: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
    density: 'compact',
  },
};

export const Spacious: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
    density: 'spacious',
  },
};

export const StripedWithHover: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
    isStriped: true,
    hasHover: true,
  },
};

export const GridDividers: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
    dividers: 'grid',
  },
};

export const ColumnDividers: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
    dividers: 'columns',
  },
};

export const NoDividers: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
    dividers: 'none',
  },
};

export const AutoColumns: Story = {
  render: () => (
    <Table
      data={[
        {name: 'Alice', role: 'Engineer', status: 'Active'},
        {name: 'Bob', role: 'Designer', status: 'Away'},
      ]}
      hasHover
    />
  ),
};

export const CustomCellRenderer: Story = {
  render: () => {
    const cols: TableColumn<User>[] = [
      {key: 'name', header: 'Name'},
      {
        key: 'email',
        header: 'Email',
        width: proportional(2),
        renderCell: item => (
          <a href={`mailto:${item.email}`} style={{color: 'inherit'}}>
            {item.email}
          </a>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        renderCell: item => (
          <span
            style={{
              padding: `${spacingDefaults['--spacing-0-5']} ${spacingDefaults['--spacing-2']}`,
              borderRadius: radiusDefaults['--radius-inner'],
              fontSize: textSizeDefaults['--font-size-xs'],
              backgroundColor:
                item.role === 'Engineer'
                  ? colorDefaults['--color-background-blue']
                  : colorDefaults['--color-background-purple'],
              color:
                item.role === 'Engineer'
                  ? colorDefaults['--color-text-blue']
                  : colorDefaults['--color-text-purple'],
            }}>
            {item.role}
          </span>
        ),
      },
      {key: 'age', header: 'Age', width: pixel(80)},
    ];

    return <Table data={users} columns={cols} idKey="id" hasHover />;
  },
};

export const ChildrenMode: Story = {
  render: () => (
    <Table density="balanced" dividers="rows" isStriped hasHover>
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Email</TableHeaderCell>
          <TableHeaderCell>Role</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Alice</TableCell>
          <TableCell>alice@example.com</TableCell>
          <TableCell>Engineer</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Bob</TableCell>
          <TableCell>bob@example.com</TableCell>
          <TableCell>Designer</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Charlie</TableCell>
          <TableCell>charlie@example.com</TableCell>
          <TableCell>PM</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Diana</TableCell>
          <TableCell>diana@example.com</TableCell>
          <TableCell>Engineer</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const AllDensities: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
      <div>
        <p style={{margin: '0 0 8px', fontWeight: 600}}>Compact</p>
        <Table
          data={users.slice(0, 3)}
          columns={columns}
          idKey="id"
          density="compact"
        />
      </div>
      <div>
        <p style={{margin: '0 0 8px', fontWeight: 600}}>Balanced (default)</p>
        <Table
          data={users.slice(0, 3)}
          columns={columns}
          idKey="id"
          density="balanced"
        />
      </div>
      <div>
        <p style={{margin: '0 0 8px', fontWeight: 600}}>Spacious</p>
        <Table
          data={users.slice(0, 3)}
          columns={columns}
          idKey="id"
          density="spacious"
        />
      </div>
    </div>
  ),
};

export const KitchenSink: Story = {
  args: {
    data: users,
    columns,
    idKey: 'id',
    density: 'compact',
    dividers: 'grid',
    isStriped: true,
    hasHover: true,
  },
};

// =============================================================================
// Overflow & Text Wrapping
// =============================================================================

interface OverflowRow extends Record<string, unknown> {
  scenario: string;
  content: string;
}

const overflowData: OverflowRow[] = [
  {
    scenario: 'Long unbroken string',
    content:
      'a_very_long_string_like_this_that_overflows_the_column_without_any_spaces_or_hyphens',
  },
  {
    scenario: 'Normal prose',
    content:
      'This is a longer sentence that might wrap or truncate depending on the textOverflow setting of the table.',
  },
  {
    scenario: 'Short text',
    content: 'Fits fine.',
  },
];

/**
 * Text wraps by default — rows grow taller and no content is hidden.
 * Set `textOverflow="truncate"` for dense data tables where fixed row
 * height matters. In truncate mode, default-rendered cells show a
 * tooltip on hover when text is actually overflowing.
 */
export const OverflowBehavior: Story = {
  render: () => {
    const cols: TableColumn<OverflowRow>[] = [
      {key: 'scenario', header: 'Scenario', width: pixel(160)},
      {key: 'content', header: 'Content', width: proportional(1)},
    ];

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          width: '480px',
        }}>
        <div>
          <h4 style={{margin: '0 0 8px'}}>Wrap (default)</h4>
          <Table
            data={overflowData}
            columns={cols}
            dividers="grid"
            density="balanced"
          />
        </div>
        <div>
          <h4 style={{margin: '0 0 8px'}}>Truncate (with tooltip on hover)</h4>
          <Table
            data={overflowData}
            columns={cols}
            dividers="grid"
            density="balanced"
            textOverflow="truncate"
          />
        </div>
      </div>
    );
  },
};

// =============================================================================
// Container Bleed — Table inside Card, Section, and Layout
// =============================================================================

const containerStoryStyles = stylex.create({
  pageWrapper: {
    backgroundColor: colorVars['--color-background-body'],
    padding: spacingVars['--spacing-6'],
  },
  storyWrapper: {
    display: 'flex',
    gap: spacingVars['--spacing-6'],
    flexWrap: 'wrap',
    alignItems: 'start',
  },
  text: {
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-secondary'],
    fontSize: 14,
    margin: 0,
  },
  heading: {
    margin: `0 0 ${spacingVars['--spacing-2']} 0`,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 14,
    color: colorVars['--color-text-secondary'],
  },
});

const simpleColumns: TableColumn<User>[] = [
  {key: 'name', header: 'Name', width: proportional(1)},
  {key: 'role', header: 'Role', width: proportional(1)},
  {key: 'email', header: 'Email', width: proportional(2)},
];

/**
 * Table inside a Card automatically bleeds to the card edges.
 * The first column's start padding and last column's end padding
 * align with the card's content padding, so text lines up with
 * other content in the card.
 */
export const InCard: Story = {
  decorators: [
    Story => (
      <div {...stylex.props(containerStoryStyles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div {...stylex.props(containerStoryStyles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(containerStoryStyles.heading)}>
          Table in Card (auto bleed)
        </h4>
        <Card width={480}>
          <Table data={users.slice(0, 4)} columns={simpleColumns} />
        </Card>
      </div>
      <div>
        <h4 {...stylex.props(containerStoryStyles.heading)}>
          Before: Card padding={0} (old pattern)
        </h4>
        <Card width={480} padding={0}>
          <Table data={users.slice(0, 4)} columns={simpleColumns} />
        </Card>
      </div>
    </div>
  ),
};

/**
 * Card with a heading above the table. The table bleeds edge-to-edge
 * while the heading respects the card's content padding — text in the
 * first column aligns with the heading.
 */
export const InCardWithHeading: Story = {
  decorators: [
    Story => (
      <div {...stylex.props(containerStoryStyles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <Card width={520}>
      <VStack gap={3}>
        <Heading level={3}>Team Members</Heading>
        <Table data={users.slice(0, 4)} columns={simpleColumns} hasHover />
      </VStack>
    </Card>
  ),
};

/**
 * Table inside a Card with Layout — header, content with table, footer.
 * The table bleeds within the layout content area while header/footer
 * retain their own padding.
 */
export const InCardWithLayout: Story = {
  decorators: [
    Story => (
      <div {...stylex.props(containerStoryStyles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <Card width={560}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Heading level={3}>User Directory</Heading>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <Table data={users} columns={simpleColumns} hasHover isStriped />
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button label="Export" variant="secondary">
                Export
              </Button>
              <Button label="Add User" variant="primary">
                Add User
              </Button>
            </HStack>
          </LayoutFooter>
        }
      />
    </Card>
  ),
};

/**
 * Table inside a Section with wash background. The section escapes
 * the card padding, and the table bleeds within the section.
 */
export const InCardWithSection: Story = {
  decorators: [
    Story => (
      <div {...stylex.props(containerStoryStyles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <Card width={520}>
      <VStack gap={3}>
        <Heading level={3}>Dashboard</Heading>
        <p {...stylex.props(containerStoryStyles.text)}>
          The table below is in a wash section for visual separation.
        </p>
      </VStack>
      <Section variant="muted">
        <Table
          data={users.slice(0, 3)}
          columns={simpleColumns}
          density="compact"
        />
      </Section>
    </Card>
  ),
};

/**
 * Compares all three density levels inside cards to show how
 * the edge padding adapts — it always matches the container padding,
 * with a minimum of 8px even for compact tables.
 */
export const InCardDensities: Story = {
  decorators: [
    Story => (
      <div {...stylex.props(containerStoryStyles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div {...stylex.props(containerStoryStyles.storyWrapper)}>
      {(['compact', 'balanced', 'spacious'] as const).map(density => (
        <div key={density}>
          <h4 {...stylex.props(containerStoryStyles.heading)}>{density}</h4>
          <Card width={400}>
            <VStack gap={2}>
              <Heading level={4}>Team</Heading>
              <Table
                data={users.slice(0, 3)}
                columns={simpleColumns}
                density={density}
              />
            </VStack>
          </Card>
        </div>
      ))}
    </div>
  ),
};

/**
 * Standalone table (no container) — behaves normally with
 * density-based cell padding. No bleed, no edge compensation.
 */
export const StandaloneVsContainer: Story = {
  decorators: [
    Story => (
      <div {...stylex.props(containerStoryStyles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div {...stylex.props(containerStoryStyles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(containerStoryStyles.heading)}>
          Standalone (no container)
        </h4>
        <div style={{width: 400}}>
          <Table data={users.slice(0, 3)} columns={simpleColumns} />
        </div>
      </div>
      <div>
        <h4 {...stylex.props(containerStoryStyles.heading)}>Inside Card</h4>
        <Card width={400}>
          <Table data={users.slice(0, 3)} columns={simpleColumns} />
        </Card>
      </div>
    </div>
  ),
};

// =============================================================================
// Column Alignment
// =============================================================================

interface Transaction extends Record<string, unknown> {
  id: string;
  description: string;
  category: string;
  quantity: number;
  amount: string;
}

const transactions: Transaction[] = [
  {
    id: '1',
    description: 'Cloud hosting (monthly)',
    category: 'Infrastructure',
    quantity: 1,
    amount: '$2,400.00',
  },
  {
    id: '2',
    description: 'Design software licenses',
    category: 'Tools',
    quantity: 12,
    amount: '$1,188.00',
  },
  {
    id: '3',
    description: 'Team offsite catering',
    category: 'Events',
    quantity: 45,
    amount: '$3,150.00',
  },
  {
    id: '4',
    description: 'Ergonomic keyboards',
    category: 'Hardware',
    quantity: 8,
    amount: '$1,592.00',
  },
  {
    id: '5',
    description: 'Annual conference tickets',
    category: 'Travel',
    quantity: 3,
    amount: '$4,500.00',
  },
];

const alignedColumns: TableColumn<Transaction>[] = [
  {key: 'description', header: 'Description', width: proportional(2)},
  {key: 'category', header: 'Category'},
  {key: 'quantity', header: 'Qty', align: 'center', width: pixel(80)},
  {key: 'amount', header: 'Amount', align: 'end', width: pixel(120)},
];

/**
 * Per-column horizontal alignment via the `align` prop.
 *
 * - `'start'` (default) — left in LTR, right in RTL
 * - `'center'` — centered text
 * - `'end'` — right in LTR, left in RTL
 *
 * Alignment applies to both the header `<th>` and body `<td>` cells.
 * Numeric columns typically use `align: 'end'`, while status or icon
 * columns work well with `align: 'center'`.
 */
export const ColumnAlignment: Story = {
  render: () => (
    <Table
      data={transactions}
      columns={alignedColumns}
      idKey="id"
      hasHover
      dividers="rows"
    />
  ),
};

// =============================================================================
// Vertical Alignment
// =============================================================================

interface TeamMember extends Record<string, unknown> {
  id: string;
  name: string;
  bio: string;
  role: string;
}

const teamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'Alice Johnson',
    bio: 'Full-stack engineer with 8 years of experience. Specializes in distributed systems and performance optimization. Previously at Stripe and Google.',
    role: 'Staff Engineer',
  },
  {
    id: '2',
    name: 'Bob Smith',
    bio: 'Product designer focused on design systems and accessibility.',
    role: 'Senior Designer',
  },
  {
    id: '3',
    name: 'Charlie Brown',
    bio: 'Engineering manager leading the platform team. Passionate about developer experience, tooling, and building inclusive teams that ship with confidence.',
    role: 'EM',
  },
];

const verticalAlignColumns: TableColumn<TeamMember>[] = [
  {key: 'name', header: 'Name', width: pixel(140)},
  {
    key: 'bio',
    header: 'Bio',
    width: proportional(3),
    renderCell: item => (
      <span
        style={{
          whiteSpace: 'normal',
          overflow: 'visible',
          display: 'block',
        }}>
        {item.bio}
      </span>
    ),
  },
  {key: 'role', header: 'Role', align: 'end', width: pixel(140)},
];

/**
 * Compares all three `verticalAlign` options side by side.
 *
 * - `'middle'` (default) — vertically centers cell content
 * - `'top'` — aligns to the top, useful for multi-line cells
 * - `'bottom'` — aligns to the bottom
 *
 * Uses a multi-line "Bio" column with wrapping text to make
 * the vertical alignment difference visible.
 */
export const VerticalAlignment: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
      {(['middle', 'top', 'bottom'] as const).map(vAlign => (
        <div key={vAlign}>
          <p style={{margin: '0 0 8px', fontWeight: 600}}>
            verticalAlign=&quot;{vAlign}&quot;
          </p>
          <Table
            data={teamMembers}
            columns={verticalAlignColumns}
            idKey="id"
            verticalAlign={vAlign}
            dividers="rows"
          />
        </div>
      ))}
    </div>
  ),
};

interface Employee extends Record<string, unknown> {
  id: string;
  name: string;
  department: string;
  title: string;
  location: string;
  email: string;
  status: string;
}

const mobileData: Employee[] = [
  {
    id: '1',
    name: 'Alice Johnson',
    department: 'Engineering',
    title: 'Senior Software Engineer',
    location: 'San Francisco',
    email: 'alice.johnson@example.com',
    status: 'Active',
  },
  {
    id: '2',
    name: 'Bob Martinez',
    department: 'Product Design',
    title: 'Lead Product Designer',
    location: 'New York',
    email: 'bob.martinez@example.com',
    status: 'Active',
  },
  {
    id: '3',
    name: 'Carol Williams',
    department: 'Data Science',
    title: 'Staff Data Scientist',
    location: 'Seattle',
    email: 'carol.williams@example.com',
    status: 'On Leave',
  },
];

const mobileColumns: TableColumn<Employee>[] = [
  {key: 'name', header: 'Name'},
  {key: 'department', header: 'Department'},
  {key: 'title', header: 'Title'},
  {key: 'location', header: 'Location'},
  {key: 'email', header: 'Email'},
  {key: 'status', header: 'Status'},
];

/**
 * Demonstrates table behavior in narrow containers (mobile viewports).
 *
 * With many columns, the table's minimum width (driven by per-column
 * minimums) exceeds the container width. Instead of squishing columns
 * to illegible widths, the table scrolls horizontally.
 *
 * Each column without an explicit `width` keeps an equal flexible share and a
 * compact 60px readability floor. Six columns therefore require at least 360px:
 * the 320px container scrolls, while the 480px container fits without needless
 * overflow.
 */
export const ResponsiveScroll: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
      <div>
        <p style={{margin: '0 0 8px', fontWeight: 600}}>
          320px container — 6 columns, horizontal scroll
        </p>
        <div
          style={{
            width: '320px',
            border: '1px dashed #ccc',
            borderRadius: '8px',
          }}>
          <Table
            data={mobileData}
            columns={mobileColumns}
            idKey="id"
            dividers="rows"
            density="compact"
            textOverflow="truncate"
          />
        </div>
      </div>
      <div>
        <p style={{margin: '0 0 8px', fontWeight: 600}}>
          480px container — same table, no unnecessary scroll
        </p>
        <div
          style={{
            width: '480px',
            border: '1px dashed #ccc',
            borderRadius: '8px',
          }}>
          <Table
            data={mobileData}
            columns={mobileColumns}
            idKey="id"
            dividers="rows"
            density="compact"
            textOverflow="truncate"
          />
        </div>
      </div>
      <div>
        <p style={{margin: '0 0 8px', fontWeight: 600}}>
          Full width — no scroll needed
        </p>
        <Table
          data={mobileData}
          columns={mobileColumns}
          idKey="id"
          dividers="rows"
          density="compact"
          textOverflow="truncate"
        />
      </div>
    </div>
  ),
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const wrappers = canvasElement.querySelectorAll<HTMLElement>(
      '.astryx-table-scroll-wrapper',
    );
    expect(wrappers).toHaveLength(3);
    const [narrow, medium, wide] = Array.from(wrappers);

    await waitFor(() => {
      expect(narrow).toHaveAttribute('data-scrollable-inline', 'true');
    });
    expect(narrow.scrollWidth).toBeGreaterThan(narrow.clientWidth);
    expect(narrow.querySelector('table')?.style.minWidth).toBe('360px');
    for (const header of narrow.querySelectorAll('th')) {
      expect(header.getBoundingClientRect().width).toBeGreaterThanOrEqual(59);
    }

    for (const fitting of [medium, wide]) {
      await waitFor(() => {
        expect(fitting).not.toHaveAttribute('data-scrollable-inline');
      });
      expect(fitting.scrollWidth).toBeLessThanOrEqual(fitting.clientWidth + 1);
    }
  },
};

/**
 * Shows horizontal scroll behavior when a table with many columns
 * is placed inside a Card in a narrow container, verifying that
 * container bleed and scroll compose correctly.
 */
export const ResponsiveScrollInCard: Story = {
  render: () => (
    <div
      style={{
        width: '360px',
        border: '1px dashed #ccc',
        borderRadius: '8px',
      }}>
      <Card>
        <Table
          data={mobileData}
          columns={mobileColumns}
          idKey="id"
          dividers="rows"
          density="compact"
          textOverflow="truncate"
        />
      </Card>
    </div>
  ),
};

interface PropEntry extends Record<string, unknown> {
  name: string;
  type: string;
  description: string;
}

const propData: PropEntry[] = [
  {
    name: 'label',
    type: 'string',
    description: 'The visible text label for the button.',
  },
  {
    name: 'variant',
    type: "'primary' | 'secondary' | 'ghost' | 'danger'",
    description:
      'Visual style variant. Primary for main actions, secondary for supporting actions, ghost for minimal emphasis, danger for destructive operations.',
  },
  {
    name: 'size',
    type: "'sm' | 'md' | 'lg'",
    description: 'Controls button height, padding, and font size.',
  },
  {
    name: 'isDisabled',
    type: 'boolean',
    description:
      'Disables the button, preventing interactions and applying disabled styling.',
  },
  {
    name: 'onClick',
    type: '(event: MouseEvent) => void',
    description: 'Callback fired when the button is clicked.',
  },
  {
    name: 'startIcon',
    type: 'ReactNode',
    description: 'Icon rendered before the label text.',
  },
];

/**
 * Mirrors the docsite props-table pattern: two fixed pixel columns
 * (Prop name + Type) and a flexible Description column.
 *
 * On mobile (320px), the fixed columns consume most of the space,
 * leaving description unreadable. With horizontal scroll, all three
 * columns maintain usable widths.
 */
export const PropsTablePattern: Story = {
  render: () => {
    const cols: TableColumn<PropEntry>[] = [
      {
        key: 'name',
        header: 'Prop',
        width: pixel(140),
        renderCell: (item: PropEntry) => (
          <Text type="code" weight="bold">
            {item.name}
          </Text>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        width: pixel(240),
        renderCell: (item: PropEntry) => (
          <Text type="code" color="secondary">
            {item.type}
          </Text>
        ),
      },
      {key: 'description', header: 'Description'},
    ];

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
        <div>
          <p style={{margin: '0 0 8px', fontWeight: 600}}>
            360px — docsite props table on mobile
          </p>
          <div
            style={{
              width: '360px',
              border: '1px dashed #ccc',
              borderRadius: '8px',
            }}>
            <Table
              data={propData}
              columns={cols}
              density="spacious"
              dividers="rows"
            />
          </div>
        </div>
        <div>
          <p style={{margin: '0 0 8px', fontWeight: 600}}>
            Full width — normal desktop experience
          </p>
          <Table
            data={propData}
            columns={cols}
            density="spacious"
            dividers="rows"
          />
        </div>
      </div>
    );
  },
};
