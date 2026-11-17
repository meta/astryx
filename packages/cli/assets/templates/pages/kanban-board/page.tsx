// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  Layout,
  LayoutHeader,
  LayoutContent,
  HStack,
  VStack,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Selector} from '@astryxdesign/core/Selector';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Divider} from '@astryxdesign/core/Divider';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {useToast} from '@astryxdesign/core/Toast';
import {Section} from '@astryxdesign/core/Section';

import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowsUpDownIcon,
  FunnelIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  InboxIcon,
  InformationCircleIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';

// ============= TYPES =============

type ColumnId = 'todo' | 'in-progress' | 'in-review' | 'done';
type Priority = 'high' | 'medium' | 'low';

interface WorkItem {
  id: string;
  column: ColumnId;
  ref: string;
  priority: Priority;
  title: string;
  description: string;
  lastEdited: string;
  dueDate: string;
}

interface ColumnMeta {
  id: ColumnId;
  title: string;
  variant: 'neutral' | 'accent' | 'warning' | 'success';
  tooltip: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: typeof InboxIcon;
}

// Where a dragged card will land: a column and an insertion index within it
// (measured against the cards remaining after the dragged card is removed).
interface DropTarget {
  column: ColumnId;
  index: number;
}

// Live state of an in-progress pointer drag. Coordinates are in viewport space.
interface DragState {
  id: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  pointerX: number;
  pointerY: number;
  target: DropTarget | null;
}

// ============= DATA =============

const COLUMNS: ColumnMeta[] = [
  {
    id: 'todo',
    title: 'To-do',
    variant: 'neutral',
    tooltip: 'Items assigned to this sprint, waiting to be picked up.',
    emptyTitle: 'To-do is empty',
    emptyDescription: 'Items pulled into this sprint appear here.',
    emptyIcon: InboxIcon,
  },
  {
    id: 'in-progress',
    title: 'In progress',
    variant: 'accent',
    tooltip: 'Items currently in progress.',
    emptyTitle: 'Nothing in progress',
    emptyDescription: 'Items being worked on appear here.',
    emptyIcon: ArrowPathIcon,
  },
  {
    id: 'in-review',
    title: 'In review',
    variant: 'warning',
    tooltip: 'Items waiting for your review.',
    emptyTitle: 'Nothing in review',
    emptyDescription: 'Items awaiting your review appear here.',
    emptyIcon: ClipboardDocumentCheckIcon,
  },
  {
    id: 'done',
    title: 'Done',
    variant: 'success',
    tooltip: 'Items that have been handled.',
    emptyTitle: 'Nothing done yet',
    emptyDescription: 'Completed items appear here.',
    emptyIcon: CheckCircleIcon,
  },
];

const PRIORITY_META: Record<
  Priority,
  {label: string; variant: 'error' | 'warning' | 'teal'}
> = {
  high: {label: 'High', variant: 'error'},
  medium: {label: 'Medium', variant: 'warning'},
  low: {label: 'Low', variant: 'teal'},
};

const INITIAL_ITEMS: WorkItem[] = [
  {
    id: 't1',
    column: 'todo',
    ref: 'Task 4821',
    priority: 'low',
    title: 'Draft project kickoff brief',
    description:
      'Write a short brief outlining goals, scope, and success criteria for the upcoming project.',
    lastEdited: '2h ago',
    dueDate: 'Jul 8',
  },
  {
    id: 't2',
    column: 'todo',
    ref: 'Task 4842',
    priority: 'low',
    title: 'Collect feedback from stakeholders',
    description:
      'Gather input from key stakeholders and summarize the main themes for the next review.',
    lastEdited: '1d ago',
    dueDate: 'Jul 11',
  },
  {
    id: 'p1',
    column: 'in-progress',
    ref: 'Task 4825',
    priority: 'high',
    title: 'Design the landing page layout',
    description:
      'Create a first-pass layout for the landing page and share it for early feedback.',
    lastEdited: '18m ago',
    dueDate: 'Jul 3',
  },
  {
    id: 'p2',
    column: 'in-progress',
    ref: 'Task 4833',
    priority: 'medium',
    title: 'Set up the project workspace',
    description:
      'Configure the shared workspace and invite the team so everyone has access.',
    lastEdited: '5m ago',
    dueDate: 'Jul 4',
  },
  {
    id: 'r1',
    column: 'done',
    ref: 'Task 4788',
    priority: 'low',
    title: 'Write the weekly status update',
    description:
      'Summarize progress, blockers, and next steps in a short update for the team.',
    lastEdited: 'Yesterday',
    dueDate: 'Jul 1',
  },
  {
    id: 'r2',
    column: 'done',
    ref: 'Task 4789',
    priority: 'high',
    title: 'Prepare the demo walkthrough',
    description:
      'Put together a short walkthrough covering the main features for the demo.',
    lastEdited: '3d ago',
    dueDate: 'Jun 30',
  },
  {
    id: 'r3',
    column: 'done',
    ref: 'Task 4790',
    priority: 'medium',
    title: 'Review and merge open changes',
    description:
      'Go through the pending changes, leave comments, and merge the ones that are ready.',
    lastEdited: '4d ago',
    dueDate: 'Jun 28',
  },
];

// Pointer travel (px) before a press is promoted to a drag, so taps and clicks
// on card controls still register normally.
const DRAG_THRESHOLD = 5;

// Shared width for every board column, so they stay visually aligned.
const COLUMN_WIDTH = 300;

// ============= STYLES =============

const styles = stylex.create({
  boardColumns: {
    overflowX: 'auto',
    overflowY: 'hidden',
    height: '100%',
    padding: 'var(--spacing-4)',
  },
  columnShell: {
    flexShrink: 0,
    flexBasis: COLUMN_WIDTH,
    height: '100%',
  },
  card: {
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
    transition: 'box-shadow 120ms ease',
    ':hover': {
      boxShadow: 'var(--shadow-med)',
    },
  },
  // The dragged card is lifted out of flow and follows the pointer. It ignores
  // pointer events so hit-testing reads the columns underneath it.
  floating: {
    position: 'fixed',
    insetBlockStart: 0,
    insetInlineStart: 0,
    pointerEvents: 'none',
    cursor: 'grabbing',
    boxShadow: 'var(--shadow-high)',
    zIndex: 1000,
  },
  floatingAt: (x: number, y: number, width: number) => ({
    width,
    transform: `translate(${x}px, ${y}px)`,
  }),
  // Placeholder marking the landing slot; matches the dragged card's height.
  ghost: (height: number) => ({
    height,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
  }),
  toolbarDivider: {
    height: 'auto',
    marginBlock: 'var(--spacing-1)',
    alignSelf: 'stretch',
  },
  columnEmptyState: {
    paddingBlock: 'var(--spacing-10)',
  },
});

// ============= CARD BODY =============

// Shared card contents, rendered both in the column list and inside the
// floating drag clone so the two stay pixel-identical.
function BoardCardBody({
  item,
  onMove,
}: {
  item: WorkItem;
  onMove: (id: string, to: ColumnId) => void;
}) {
  const showToast = useToast();
  const priority = PRIORITY_META[item.priority];
  const moveTargets = COLUMNS.filter(c => c.id !== item.column).map(c => ({
    label: `Move to ${c.title}`,
    onClick: () => onMove(item.id, c.id),
  }));

  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="start">
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Badge label={item.ref} variant="neutral" />
          <Badge label={priority.label} variant={priority.variant} />
        </HStack>
        <MoreMenu
          label="Work item actions"
          size="sm"
          items={[
            {
              label: 'Open',
              onClick: () =>
                // Demo only: replace this toast with the call that performs the action.
                showToast({
                  body: `Demo: ${item.ref} would open here`,
                  uniqueID: `open-${item.ref}`,
                }),
            },
            {
              label: 'Assign to me',
              onClick: () =>
                // Demo only: replace this toast with the call that performs the action.
                showToast({
                  body: `Demo: ${item.ref} would be assigned to you here`,
                  uniqueID: `assign-${item.id}`,
                }),
            },
            {type: 'divider'},
            ...moveTargets,
          ]}
        />
      </HStack>

      <VStack gap={1}>
        <Heading level={4}>{item.title}</Heading>
        <Text type="supporting" color="secondary" maxLines={2}>
          {item.description}
        </Text>
      </VStack>

      <Text type="supporting" color="secondary">
        Edited {item.lastEdited} · Due {item.dueDate}
      </Text>
    </VStack>
  );
}

// ============= BOARD CARD =============

function BoardCard({
  item,
  cardRef,
  onPointerDown,
  onMove,
}: {
  item: WorkItem;
  cardRef: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: ReactPointerEvent, id: string) => void;
  onMove: (id: string, to: ColumnId) => void;
}) {
  return (
    <Card
      ref={cardRef}
      padding={3}
      xstyle={styles.card}
      onPointerDown={e => onPointerDown(e, item.id)}>
      <BoardCardBody item={item} onMove={onMove} />
    </Card>
  );
}

// ============= BOARD COLUMN =============

function BoardColumn({
  meta,
  count,
  contentRef,
  children,
}: {
  meta: ColumnMeta;
  count: number;
  contentRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  return (
    <Card variant="muted" padding={0} xstyle={styles.columnShell}>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={3}>
            <HStack hAlign="between" vAlign="center">
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={meta.variant}
                  label={`${meta.title} status`}
                />
                <Heading level={4}>{meta.title}</Heading>
                <Tooltip content={meta.tooltip}>
                  <Icon
                    icon={InformationCircleIcon}
                    size="sm"
                    color="secondary"
                  />
                </Tooltip>
              </HStack>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {count}
              </Text>
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent ref={contentRef} padding={2}>
            {children ?? (
              <EmptyState
                isCompact
                xstyle={styles.columnEmptyState}
                icon={
                  <Icon icon={meta.emptyIcon} size="lg" color="secondary" />
                }
                title={meta.emptyTitle}
                description={meta.emptyDescription}
              />
            )}
          </LayoutContent>
        }
      />
    </Card>
  );
}

// ============= MAIN =============

export default function KanbanBoardTemplate() {
  const showToast = useToast();
  const [items, setItems] = useState<WorkItem[]>(INITIAL_ITEMS);
  const [sprint, setSprint] = useState('003');
  const [drag, setDrag] = useState<DragState | null>(null);

  // Live element registries for pointer hit-testing (kept out of render state).
  const columnEls = useRef(new Map<ColumnId, HTMLElement>());
  const cardEls = useRef(new Map<string, HTMLElement>());
  const columnRefCbs = useRef(
    new Map<ColumnId, (el: HTMLDivElement | null) => void>(),
  );
  const cardRefCbs = useRef(
    new Map<string, (el: HTMLDivElement | null) => void>(),
  );
  const teardownRef = useRef<(() => void) | null>(null);

  // Stable ref callbacks so registering an element never churns across renders.
  const getColumnRef = (id: ColumnId) => {
    let cb = columnRefCbs.current.get(id);
    if (!cb) {
      cb = el => {
        if (el) {
          columnEls.current.set(id, el);
        } else {
          columnEls.current.delete(id);
        }
      };
      columnRefCbs.current.set(id, cb);
    }
    return cb;
  };

  const getCardRef = (id: string) => {
    let cb = cardRefCbs.current.get(id);
    if (!cb) {
      cb = el => {
        if (el) {
          cardEls.current.set(id, el);
        } else {
          cardEls.current.delete(id);
        }
      };
      cardRefCbs.current.set(id, cb);
    }
    return cb;
  };

  const itemsByColumn = useMemo(() => {
    const map: Record<ColumnId, WorkItem[]> = {
      todo: [],
      'in-progress': [],
      'in-review': [],
      done: [],
    };
    for (const item of items) {
      map[item.column].push(item);
    }
    return map;
  }, [items]);

  const moveItem = (id: string, to: ColumnId) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? {...item, column: to} : item)),
    );
  };

  // Resolve the pointer position to a column + insertion index, ignoring the
  // card being dragged so the math is against the cards that stay in place.
  const computeTarget = (
    px: number,
    py: number,
    draggedId: string,
  ): DropTarget | null => {
    for (const [colId, el] of Array.from(columnEls.current.entries())) {
      const r = el.getBoundingClientRect();
      if (px < r.left || px > r.right || py < r.top || py > r.bottom) {
        continue;
      }

      const ids = itemsByColumn[colId]
        .filter(it => it.id !== draggedId)
        .map(it => it.id);

      let index = ids.length;
      for (let i = 0; i < ids.length; i++) {
        const cardEl = cardEls.current.get(ids[i]);
        if (!cardEl) {
          continue;
        }
        const cr = cardEl.getBoundingClientRect();
        if (py < cr.top + cr.height / 2) {
          index = i;
          break;
        }
      }
      return {column: colId, index};
    }
    return null;
  };

  // Rebuild the flat item list so the dragged card lands at the resolved slot
  // while every other card keeps its relative order.
  const commitDrag = (id: string, target: DropTarget) => {
    setItems(prev => {
      const moved = prev.find(it => it.id === id);
      if (!moved) {
        return prev;
      }

      const rest = prev.filter(it => it.id !== id);
      const updated: WorkItem = {...moved, column: target.column};
      const colItems = rest.filter(it => it.column === target.column);
      const anchor = colItems[target.index];

      if (!anchor) {
        return [...rest, updated];
      }
      const at = rest.indexOf(anchor);
      return [...rest.slice(0, at), updated, ...rest.slice(at)];
    });
  };

  const onCardPointerDown = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0) {
      return;
    }
    // Let the card's own controls (the actions menu) handle the press.
    if (
      (e.target as HTMLElement).closest(
        'button, [role="menuitem"], [role="menu"]',
      )
    ) {
      return;
    }

    const el = cardEls.current.get(id);
    if (!el) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;
    const {width, height} = rect;

    let started = false;
    let target: DropTarget | null = null;

    const onMove = (ev: PointerEvent) => {
      if (
        !started &&
        Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) <
          DRAG_THRESHOLD
      ) {
        return;
      }
      started = true;
      target = computeTarget(ev.clientX, ev.clientY, id);
      setDrag({
        id,
        width,
        height,
        offsetX,
        offsetY,
        pointerX: ev.clientX,
        pointerY: ev.clientY,
        target,
      });
    };

    const onUp = () => {
      teardownRef.current?.();
      if (started && target) {
        commitDrag(id, target);
      }
      setDrag(null);
    };

    const teardown = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      teardownRef.current = null;
    };
    teardownRef.current = teardown;

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const draggedItem = drag ? items.find(it => it.id === drag.id) : undefined;
  const isDragging = drag !== null;

  // Suppress selection while dragging and detach listeners on unmount.
  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [isDragging]);

  useEffect(() => () => teardownRef.current?.(), []);

  // Card nodes for a column, or null when the column should show its empty
  // state. A dashed ghost box marks the landing slot during a drag.
  const renderColumnCards = (colId: ColumnId): ReactNode => {
    const colItems = itemsByColumn[colId];
    const visible = drag ? colItems.filter(it => it.id !== drag.id) : colItems;
    const ghostTarget =
      drag && drag.target && drag.target.column === colId ? drag : null;

    if (visible.length === 0 && !ghostTarget) {
      return null;
    }

    const nodes: ReactNode[] = visible.map(it => (
      <BoardCard
        key={it.id}
        item={it}
        cardRef={getCardRef(it.id)}
        onPointerDown={onCardPointerDown}
        onMove={moveItem}
      />
    ));

    if (ghostTarget && ghostTarget.target) {
      const index = Math.min(ghostTarget.target.index, nodes.length);
      nodes.splice(
        index,
        0,
        <VStack key="drag-ghost" xstyle={styles.ghost(ghostTarget.height)} />,
      );
    }

    return <VStack gap={2}>{nodes}</VStack>;
  };

  return (
    <Section height="100dvh">
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <Toolbar
              label="Board actions"
              gap={2}
              startContent={
                <>
                  <Heading level={3}>Sprint Board</Heading>
                  <Badge label={items.length} variant="neutral" />
                </>
              }
              endContent={
                <HStack gap={2} wrap="wrap">
                  <Selector
                    label="Sprint"
                    width={200}
                    isLabelHidden
                    value={sprint}
                    onChange={setSprint}
                    options={[
                      {value: '003', label: 'Sprint 003'},
                      {value: '002', label: 'Sprint 002'},
                      {value: '001', label: 'Sprint 001'},
                    ]}
                  />
                  <Divider
                    variant="strong"
                    orientation="vertical"
                    xstyle={styles.toolbarDivider}
                  />
                  <HStack gap={1} vAlign="center">
                    <IconButton
                      icon={<Icon icon={ArrowsUpDownIcon} size="sm" />}
                      label="Sort"
                      onClick={() =>
                        // Demo only: replace this toast with the call that performs the action.
                        showToast({
                          body: 'Demo: sort options would open here',
                          uniqueID: 'sort',
                        })
                      }
                    />
                    <IconButton
                      icon={<Icon icon={FunnelIcon} size="sm" />}
                      label="Filter"
                      onClick={() =>
                        // Demo only: replace this toast with the call that performs the action.
                        showToast({
                          body: 'Demo: filters would open here',
                          uniqueID: 'filter',
                        })
                      }
                    />
                    <IconButton
                      icon={<Icon icon={MagnifyingGlassIcon} size="sm" />}
                      label="Search"
                      onClick={() =>
                        // Demo only: replace this toast with the call that performs the action.
                        showToast({
                          body: 'Demo: search across the board would open here',
                          uniqueID: 'search',
                        })
                      }
                    />
                  </HStack>
                  <Button
                    label="Add task"
                    variant="primary"
                    icon={<Icon icon={PlusIcon} size="sm" />}
                    onClick={() =>
                      // Demo only: replace this toast with the call that performs the action.
                      showToast({
                        body: 'Demo: a new task form would open here',
                        uniqueID: 'add-task',
                      })
                    }
                  />
                </HStack>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <HStack gap={4} xstyle={styles.boardColumns}>
              {COLUMNS.map(meta => (
                <BoardColumn
                  key={meta.id}
                  meta={meta}
                  count={itemsByColumn[meta.id].length}
                  contentRef={getColumnRef(meta.id)}>
                  {renderColumnCards(meta.id)}
                </BoardColumn>
              ))}
            </HStack>
          </LayoutContent>
        }
      />
      {drag && draggedItem ? (
        <Card
          padding={3}
          xstyle={[
            styles.floating,
            styles.floatingAt(
              drag.pointerX - drag.offsetX,
              drag.pointerY - drag.offsetY,
              drag.width,
            ),
          ]}>
          <BoardCardBody item={draggedItem} onMove={() => {}} />
        </Card>
      ) : null}
    </Section>
  );
}
