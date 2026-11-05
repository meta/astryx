// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {ArrowUpTrayIcon, PlusIcon} from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import {Banner} from '@astryxdesign/core/Banner';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Kbd} from '@astryxdesign/core/Kbd';
import {Slider} from '@astryxdesign/core/Slider';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSubMenu,
} from '@astryxdesign/core/DropdownMenu';
import {DateInput} from '@astryxdesign/core/DateInput';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {ListItem} from '@astryxdesign/core/List';
import {
  Table,
  useTableColumnResize,
  useTableRowExpansion,
  type TableColumn,
} from '@astryxdesign/core/Table';
import {TimeInput, type ISOTimeString} from '@astryxdesign/core/TimeInput';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Typeahead, createStaticSource} from '@astryxdesign/core/Typeahead';
import {Markdown} from '@astryxdesign/core/Markdown';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {
  createMarkdownFenceTransform,
  createMarkdownFrontmatter,
  createMarkdownHeadingLinks,
  createMarkdownPlugin,
  createMarkdownTextTransform,
  markdownSoftBreaksPlugin,
  markdownSourceLinesPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const phoneScaleOptOutTheme = defineTheme({
  name: 'app',
  extends: neutralTheme,
  adaptations: {
    rules: [
      {
        when: {pointer: 'coarse', width: {below: 'lg'}},
        value: {typography: {scale: {base: 14, ratio: 1.2}}},
      },
    ],
  },
});

const styles = stylex.create({
  projectName: {width: '100%'},
  assigneeField: {width: '100%'},
  series: {backgroundColor: dataVars['--color-data-categorical-blue']},
});

const peopleSource = createStaticSource([
  {id: 'ada', label: 'Ada'},
  {id: 'grace', label: 'Grace'},
]);
const reviewerActions = [
  {id: 'ada', label: 'Ada Lovelace'},
  {id: 'grace', label: 'Grace Hopper'},
];

export function Forms() {
  const [name, setName] = useState('');
  const [assignee, setAssignee] = useState<{id: string; label: string} | null>(
    null,
  );
  return (
    <>
      <TextInput
        label="Project name"
        value={name}
        onChange={setName}
        controlXstyle={styles.projectName}
      />
      <Typeahead
        label="Assignee"
        searchSource={peopleSource}
        value={assignee}
        onChange={setAssignee}
        containerXstyle={styles.assigneeField}
        emptySearchText="No people found"
      />
    </>
  );
}

const initialReviewerOptions = [
  {value: 'platform', label: 'Platform'},
  {value: 'accessibility', label: 'Accessibility'},
  {value: 'content', label: 'Content'},
];

export function CreateReviewerOption() {
  const [reviewerOptions, setReviewerOptions] = useState(
    initialReviewerOptions,
  );
  const [reviewers, setReviewers] = useState(['platform']);

  return (
    <MultiSelector
      label="Reviewers"
      options={reviewerOptions}
      value={reviewers}
      onChange={(next, change) => {
        if (change?.type === 'create') {
          setReviewerOptions(current => [
            ...current,
            {value: change.query, label: change.query},
          ]);
        }
        setReviewers(next);
      }}
      hasSearch
      hasCreate
      triggerDisplay="badges"
    />
  );
}

function createTeam() {}
function assign() {}
function snooze() {}
function moveToBacklog() {}
function moveToNext() {}
function CustomEdgeToEdgeFilters() {
  return null;
}
export function Overlays() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <DropdownMenu
        button={{label: 'Assign reviewer'}}
        header={
          <TextInput
            label="Filter reviewers"
            isLabelHidden
            placeholder="Filter reviewers"
            value={query}
            onChange={setQuery}
          />
        }
        footer={
          <Button
            label="Create team"
            variant="secondary"
            icon={<Icon icon={PlusIcon} />}
            onClick={createTeam}
          />
        }
        items={reviewerActions}
      />
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem label="Assign to me" onClick={assign} />
        <DropdownMenuItem label="Snooze" onClick={snooze} />
        <DropdownMenuSubMenu label="Move to">
          <DropdownMenuItem label="Backlog" onClick={moveToBacklog} />
          <DropdownMenuItem label="Next release" onClick={moveToNext} />
        </DropdownMenuSubMenu>
      </DropdownMenu>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Filters"
        padding={0}>
        <CustomEdgeToEdgeFilters />
      </BottomSheet>
    </>
  );
}

function openRow() {}
function archive(_id: string) {}
function remove(_id: string) {}

export function MobileAndTouch() {
  const row = {id: 'item-1', label: 'Release checklist'};
  const [date, setDate] = useState<ISODateString | undefined>('2026-10-14');
  const [time, setTime] = useState<ISOTimeString | undefined>(
    '09:30' as ISOTimeString,
  );
  return (
    <>
      <ListItem
        label={row.label}
        onClick={openRow}
        swipeActions={{
          trailing: [
            {
              label: 'Archive',
              onActivate: () => archive(row.id),
              variant: 'neutral',
              hasRemoval: true,
            },
            {
              label: 'Delete',
              onActivate: () => remove(row.id),
              variant: 'destructive',
              hasRemoval: true,
            },
          ],
        }}
      />
      <DateInput
        label="Release date"
        value={date}
        onChange={setDate}
        presentation="adaptive-bottom-sheet"
      />
      <TimeInput
        label="Release time"
        value={time}
        onChange={setTime}
        presentation="adaptive-bottom-sheet"
      />
    </>
  );
}

type Order = {
  [key: string]: unknown;
  id: string;
  customer: string;
  status: string;
};
const orders: Order[] = [
  {id: 'order-1', customer: 'Ada Lovelace', status: 'Ready'},
];
const columns: TableColumn<Order>[] = [
  {key: 'customer', header: 'Customer'},
  {key: 'status', header: 'Status'},
];
function OrderItems({order}: {order: Order}) {
  return <div>{order.id}</div>;
}
function toggle(previous: ReadonlySet<string>, key: string) {
  const next = new Set(previous);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

export function DataDisplay() {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const expansion = useTableRowExpansion<Order>({
    expandedKeys,
    onToggle: key => setExpandedKeys(previous => toggle(previous, key)),
    getRowKey: order => order.id,
    renderExpanded: order => <OrderItems order={order} />,
    hasRowClickExpansion: true,
  });
  const columnResize = useTableColumnResize<Order>({
    columnWidths,
    columns: columns as TableColumn<Record<string, unknown>>[],
    onColumnResizeEnd: updates =>
      setColumnWidths(previous => ({...previous, ...updates})),
  });
  return (
    <Table
      data={orders}
      columns={columns}
      idKey="id"
      isStriped
      hasHover
      plugins={{expansion, columnResize}}
    />
  );
}

const source = '# Release';

const frontmatter = createMarkdownFrontmatter({
  name: 'release-notes',
  parse: fields => ({
    title: typeof fields.title === 'string' ? fields.title : 'Untitled',
    status: typeof fields.status === 'string' ? fields.status : 'draft',
  }),
});

const specLinks = createMarkdownPlugin({
  name: 'spec-links',
  apiVersion: 1,
  transform: createMarkdownTextTransform({
    pattern: /\bAST-(\d{3})\b/g,
    requiredSubstrings: ['AST-'],
    replace: match => ({
      type: 'link',
      url: `/specs/${match[0]}`,
      children: [{type: 'text', value: match[0]}],
    }),
  }),
});

type CalloutNode = MarkdownExtensionNode<
  'callouts',
  'callout',
  {readonly title: string; readonly body: string},
  'block'
>;

const callouts = createMarkdownPlugin<'callouts', CalloutNode>({
  name: 'callouts',
  apiVersion: 1,
  transform: createMarkdownFenceTransform({
    languages: ['callout'],
    createNode: ({code}) => {
      const [title, ...body] = code.split('\n');
      return {
        type: 'extension',
        plugin: 'callouts',
        name: 'callout',
        display: 'block',
        data: {title, body: body.join(' ')},
      };
    },
  }),
  renderers: {
    callout: {
      render: ({node}) => (
        <Banner
          status="warning"
          title={node.data.title}
          description={node.data.body}
        />
      ),
      toText: node => `${node.data.title}\n${node.data.body}`,
    },
  },
});

const headingLinks = createMarkdownHeadingLinks({
  permalinkBaseUrl: 'https://astryx.atmeta.com/blog/astryx-v0-7-0',
});

function ProductMath({
  source,
  display,
}: {
  source: string;
  display: 'inline' | 'block';
}) {
  return display === 'block' ? <div>{source}</div> : <span>{source}</span>;
}

function MathExpression({
  value,
  display,
}: {
  value: string;
  display: 'inline' | 'block';
}) {
  return <ProductMath source={value} display={display} />;
}

export function Content() {
  const result = frontmatter.parse(source);
  void result;
  return (
    <>
      <Markdown plugins={[markdownSoftBreaksPlugin]}>{source}</Markdown>
      <Markdown plugins={[frontmatter.plugin]}>{source}</Markdown>
      <Markdown plugins={[specLinks]}>{source}</Markdown>
      <Markdown plugins={[callouts]}>{source}</Markdown>
      <Markdown plugins={[headingLinks]}>{source}</Markdown>
      <Markdown plugins={[markdownSourceLinesPlugin]}>{source}</Markdown>
      <Markdown components={{math: MathExpression}}>{source}</Markdown>
    </>
  );
}

export function ThemeVisuals() {
  const [quality, setQuality] = useState(65);
  return (
    <>
      <Kbd keys="mod+k" />
      <Kbd keys="mod+shift+s" />
      <Kbd keys="esc" />
      <Slider
        label="Quality"
        value={quality}
        onChange={setQuality}
        min={0}
        max={100}
        step={5}
        marks={[
          {value: 0, label: '0'},
          {value: 25},
          {value: 50, label: '50'},
          {value: 75},
          {value: 100, label: '100'},
        ]}
      />
      <Button
        label="Upload"
        variant="primary"
        icon={<Icon icon={ArrowUpTrayIcon} />}
      />
      <Button label="Upload" size="lg" icon={<Icon icon={ArrowUpTrayIcon} />} />
    </>
  );
}

async function save() {}
export function Accessibility() {
  const announce = useAnnounce();
  async function saveSettings() {
    await save();
    announce('Settings saved');
  }
  void saveSettings;
  return <Banner status="success" title="Settings saved" />;
}

void styles.series;
