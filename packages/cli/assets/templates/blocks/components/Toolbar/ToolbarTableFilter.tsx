// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Selector} from '@astryxdesign/core/Selector';
import {TextInput} from '@astryxdesign/core/TextInput';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import {Popover} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Text, Heading} from '@astryxdesign/core/Text';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {Stack, StackItem, HStack, VStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Table, pixel, proportional} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Columns3Cog, Search} from 'lucide-react';

interface Job extends Record<string, unknown> {
  id: string;
  job: string;
  customer: string;
  status: string;
  priority: string;
}

const JOBS: Job[] = [
  {
    id: 'SJ-2136',
    job: 'VAV zones not cooling',
    customer: 'Northgate Dental',
    status: 'In progress',
    priority: 'High',
  },
  {
    id: 'SJ-2135',
    job: 'Exhaust fan noise',
    customer: 'Riverside Club',
    status: 'On hold',
    priority: 'Normal',
  },
  {
    id: 'SJ-2134',
    job: 'Humidifier board fault',
    customer: 'Summit Medical',
    status: 'Overdue',
    priority: 'High',
  },
  {
    id: 'SJ-2133',
    job: 'Economizer stuck shut',
    customer: 'Northgate Dental',
    status: 'Scheduled',
    priority: 'Normal',
  },
  {
    id: 'SJ-2101',
    job: 'Contactor replacement',
    customer: 'Harborview Hotel',
    status: 'Completed',
    priority: 'Low',
  },
];

// One entry per filterable field. The closed trigger reads as the bare field
// name unset, and renderValue expands a set one to the whole clause, so each
// Selector doubles as its own filter chip.
const FIELDS = [
  {
    key: 'status',
    label: 'Status',
    options: ['Scheduled', 'In progress', 'On hold', 'Overdue', 'Completed'],
  },
  {key: 'priority', label: 'Priority', options: ['High', 'Normal', 'Low']},
  {
    key: 'customer',
    label: 'Customer',
    options: [
      'Northgate Dental',
      'Riverside Club',
      'Summit Medical',
      'Harborview Hotel',
    ],
  },
];

const COLUMNS: TableColumn<Job>[] = [
  {key: 'job', header: 'Job', width: proportional(2)},
  {key: 'customer', header: 'Customer', width: proportional(2)},
  {key: 'status', header: 'Status', width: pixel(110)},
  {key: 'priority', header: 'Priority', width: pixel(90)},
];

/**
 * Width held back inside the clause slot for the readout that sits in it.
 *
 * The readout lives in the slot the overflow list measures, so without this
 * the list would count its width as room for another clause and push it off
 * the end. The slot pays for it as padding — the one part of the box the
 * measurement already subtracts — and the readout takes it back with a
 * matching negative margin, so it draws over the reserve and still lands
 * against the last clause rather than at the row's far edge.
 */
const READOUT_RESERVE = 116;

const styles = stylex.create({
  toolbarRow: {
    // Grow so the row spans the toolbar: the clause slot inside it can only
    // measure the width it is actually given.
    flexGrow: 1,
    minWidth: 0,
  },
  // Containment, not just a min-width reset: the reset lets flex squeeze this
  // slot, but the toolbar's own slot still floors at the width this one
  // reports it needs — the clauses at full length. Containment makes that
  // report independent of the clauses, so the row settles inside the toolbar
  // and the list finally reads a width that narrows. The popover it opens is
  // portalled, so nothing the reader needs is inside the clip.
  clauseSlot: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    overflow: 'hidden',
    containerType: 'inline-size',
    // The held-back width, as padding (see READOUT_RESERVE).
    paddingInlineEnd: READOUT_RESERVE,
  },
  // Fixed: the field is the row's anchor, so it keeps one width in every
  // state. It still gives before the readout does, but only once the clauses
  // have folded away and there is nothing else left to take.
  searchSlot: {
    flexShrink: 1,
    minWidth: 120,
    width: 120,
  },
  // The fill a control switches to once it carries a value, so a set clause is
  // legible as engaged at a glance rather than only by reading it. This is the
  // token ToggleButton paints for its own pressed state, so a set selector and
  // a pressed control land on the same value over the same backdrop instead of
  // two neighbouring shades of engaged.
  filterFill: {
    backgroundColor: colorVars['--color-overlay-pressed'],
  },
  // A ghost Button has no chrome at all, so the border is what puts the count
  // in the same family as the unset selectors it stands in for. Left unfilled
  // deliberately: the fill means "this control carries a value", and the count
  // carries none of its own — it stands in for clauses that may or may not be
  // set.
  overflowChip: {
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  // Shrink-wrapped to the clauses actually on the row. As a flex item the
  // list's basis is its unfolded content, which is wider than the slot, so it
  // would otherwise settle at the slot's full width and strand the readout at
  // the far edge with a gap where the folded clauses used to be. The list
  // measures the slot, not itself, so sizing it to its visible children costs
  // the fold nothing.
  clauseList: {
    flexGrow: 0,
    flexShrink: 0,
    width: 'max-content',
    maxWidth: '100%',
  },
  // Takes back the width the slot held back for it, so the readout draws over
  // the reserve and lands against the last clause. The gap to that clause is a
  // margin rather than the row's `gap`, because a gap would fall on the
  // measured side of the reserve and cost the clauses those pixels.
  readout: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    marginInlineStart: 8,
    marginInlineEnd: -READOUT_RESERVE,
  },
  viewPanel: {
    width: 320,
  },
});

export default function ToolbarTableFilter() {
  const [search, setSearch] = useState('');
  const [clauses, setClauses] = useState<Record<string, string | null>>({});
  const [columnKeys, setColumnKeys] = useState(COLUMNS.map(c => c.key));

  const hasFilters =
    search !== '' || Object.values(clauses).some(value => value != null);

  const clearAll = () => {
    setSearch('');
    setClauses({});
  };

  // Search and every clause narrow one pass, so the table answers the whole
  // bar rather than whichever control moved last.
  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return JOBS.filter(
      row =>
        (query === '' ||
          `${row.job} ${row.customer}`.toLowerCase().includes(query)) &&
        FIELDS.every(
          field =>
            clauses[field.key] == null || row[field.key] === clauses[field.key],
        ),
    );
  }, [search, clauses]);

  // One flat array rather than inline JSX: OverflowList hands its renderer the
  // indices of the clauses it had to hide, so the row and the folded panel have
  // to read from the same list for those indices to mean anything.
  const clauseControls = FIELDS.map(field => (
    <Selector
      key={field.key}
      label={`${field.label} filter`}
      isLabelHidden
      placeholder={field.label}
      size="sm"
      hasClear
      options={field.options}
      value={clauses[field.key] ?? null}
      controlXstyle={clauses[field.key] != null ? styles.filterFill : undefined}
      onChange={value => setClauses(prev => ({...prev, [field.key]: value}))}
      renderValue={option =>
        `${field.label} is ${option.label ?? option.value}`
      }
    />
  ));

  const viewOptions = (
    <VStack gap={3} xstyle={styles.viewPanel}>
      <Heading level={3}>Columns</Heading>
      <CheckboxList
        label="Displayed columns"
        isLabelHidden
        density="compact"
        value={columnKeys}
        onChange={setColumnKeys}>
        {COLUMNS.map(column => (
          <CheckboxListItem
            key={column.key}
            value={column.key}
            label={String(column.header)}
          />
        ))}
      </CheckboxList>
    </VStack>
  );

  return (
    // Section, not a bare stack: the toolbar row and the table's first column
    // have to start on the same line, and the container publishes the padding
    // both read — the toolbar pads to it, and the table bleeds edge to edge
    // and compensates its outer cells back to it. Transparent and borderless,
    // because whatever hosts this block already paints its own frame.
    <Section variant="transparent" padding={2} width="100%" height="100%">
      <Toolbar
        label="Job filters"
        size="sm"
        dividers={['bottom']}
        startContent={
          // One full-width row rather than the toolbar's own two slots: the
          // overflow list has to measure the width it actually has, and a slot
          // sized by its own contents would feed the list its own output —
          // fold a clause, the slot narrows, the list folds again.
          <HStack
            gap={2}
            vAlign="center"
            wrap="nowrap"
            xstyle={styles.toolbarRow}>
            {/* Search leads the row as the broadest filter, and sits outside
                the overflow list so it is never the clause that folds — a
                hidden search box reads as a missing feature, not a folded
                one. */}
            <StackItem xstyle={styles.searchSlot}>
              <TextInput
                label="Search jobs"
                isLabelHidden
                placeholder="Search"
                size="sm"
                width="100%"
                value={search}
                onChange={setSearch}
                startIcon={Search}
                hasClear
              />
            </StackItem>
            {/* The slot, not the list, carries the sizing: as the row's only
                grower it settles at whatever the search box and the trailing
                controls leave, and the list reads that. */}
            <StackItem size="fill" xstyle={styles.clauseSlot}>
              <OverflowList
                behavior="observeParent"
                gap={2}
                xstyle={styles.clauseList}
                // No floor on how many stay out: at this width a set clause
                // reads as a whole sentence ("Status is Overdue"), and pinning
                // one to the row would push the readout off the end. The count
                // is what stays, and it opens onto every clause.
                minVisibleItems={0}
                overflowRenderer={overflowItems => (
                  <Popover
                    placement="below"
                    alignment="start"
                    width={240}
                    label={`${overflowItems.length} more filters`}
                    content={
                      <VStack gap={2}>
                        {overflowItems.map(({child, index}) => (
                          <Stack key={index} direction="vertical">
                            {child}
                          </Stack>
                        ))}
                      </VStack>
                    }>
                    <Button
                      label={`+${overflowItems.length}`}
                      tooltip={`${overflowItems.length} more filters`}
                      variant="ghost"
                      size="sm"
                      xstyle={styles.overflowChip}
                    />
                  </Popover>
                )}>
                {clauseControls}
              </OverflowList>

              {/* Inside the slot rather than beside it: a sibling would sit
                  after the slot, and the slot spans the row's leftover, so the
                  readout would land at the trailing edge however few clauses
                  were showing. In here it follows the clauses, and the reserve
                  is what stops the list from spending the width it needs. */}
              <HStack
                gap={2}
                vAlign="center"
                wrap="nowrap"
                xstyle={styles.readout}>
                <Text type="supporting" color="secondary">
                  {results.length} of {JOBS.length}
                </Text>
                {hasFilters && (
                  <>
                    <Text type="supporting" color="secondary">
                      •
                    </Text>
                    {/* Href-less, so Link renders a button: this resets the
                        filters, it does not navigate. */}
                    <Link type="supporting" onClick={clearAll}>
                      Clear all
                    </Link>
                  </>
                )}
              </HStack>
            </StackItem>
            {/* View options closes the row: it acts on the table, not on the
                filter set, so it stands apart from the clauses. */}
            <Popover
              placement="below"
              alignment="end"
              label="View options"
              content={viewOptions}>
              <Button
                label="View options"
                tooltip="View options"
                isIconOnly
                variant="ghost"
                size="sm"
                icon={<Icon icon={Columns3Cog} size="sm" color="secondary" />}
              />
            </Popover>
          </HStack>
        }
      />
      {results.length === 0 ? (
        <EmptyState
          isCompact
          title="No jobs match these filters"
          actions={<Button label="Clear all" size="sm" onClick={clearAll} />}
        />
      ) : (
        <Table
          idKey="id"
          density="compact"
          textOverflow="truncate"
          columns={COLUMNS.filter(column => columnKeys.includes(column.key))}
          data={results}
        />
      )}
    </Section>
  );
}
