// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Kanban.tsx
 * @input Nothing: the demo owns its cards.
 * @output A board whose cards drag between and within columns, flick away to
 *   an archive, and come back from it.
 * @position Post-local example asset for the motion-and-gestures blog post.
 *   It is not an Astryx component and no package exports it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  useAnnounce,
  useEntryAnimation,
  usePressFeedback,
} from '@astryxdesign/core/hooks';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import {
  LayoutGlide,
  attachPan,
  clamp,
  placementAnimator,
  rubberBand,
  springs,
  type PanState,
  type Placement,
  type SpringAnimator,
} from './motion';

type ColumnId = 'todo' | 'doing' | 'done';

interface Task {
  id: string;
  title: string;
  tag: string;
}

interface Archived {
  task: Task;
  column: ColumnId;
}

type Columns = Record<ColumnId, string[]>;

const COLUMNS: Array<{id: ColumnId; title: string}> = [
  {id: 'todo', title: 'To do'},
  {id: 'doing', title: 'Doing'},
  {id: 'done', title: 'Done'},
];

const INITIAL_TASKS: Task[] = [
  {id: 'notes', title: 'Release notes', tag: 'Docs'},
  {id: 'rings', title: 'Focus rings', tag: 'A11y'},
  {id: 'empty', title: 'Empty state', tag: 'Design'},
  {id: 'guide', title: 'Migration guide', tag: 'Docs'},
  {id: 'tooltip', title: 'Tooltip delay', tag: 'Bug'},
  {id: 'contrast', title: 'Contrast check', tag: 'A11y'},
  {id: 'icons', title: 'Icon refresh', tag: 'Design'},
];

const INITIAL_COLUMNS: Columns = {
  todo: ['notes', 'rings', 'empty'],
  doing: ['guide', 'tooltip'],
  done: ['contrast', 'icons'],
};

/** A sideways release faster than this, in px/s, archives the card. */
const ARCHIVE_SPEED = 1100;

interface DragState {
  id: string;
  ghost: HTMLElement;
  ghostPlacement: SpringAnimator<Placement>;
  origin: {x: number; y: number};
  from: {column: ColumnId; index: number};
  target: {column: ColumnId; index: number} | null;
}

interface KeyboardMove {
  id: string;
  from: {column: ColumnId; index: number};
}

function columnOf(columns: Columns, id: string): ColumnId {
  return COLUMNS.find(column => columns[column.id].includes(id))?.id ?? 'todo';
}

function moveTask(
  columns: Columns,
  id: string,
  column: ColumnId,
  index: number,
): Columns {
  const next: Columns = {
    todo: columns.todo.filter(other => other !== id),
    doing: columns.doing.filter(other => other !== id),
    done: columns.done.filter(other => other !== id),
  };
  next[column].splice(clamp(index, 0, next[column].length), 0, id);
  return next;
}

/** Cards that drag between columns, flick to archive, and come back. */
export function KanbanBoard() {
  const [tasks, setTasks] = useState<Record<string, Task>>(() =>
    Object.fromEntries(INITIAL_TASKS.map(task => [task.id, task])),
  );
  const [columns, setColumns] = useState<Columns>(INITIAL_COLUMNS);
  const [archived, setArchived] = useState<Archived[]>([]);
  const [isFanned, setIsFanned] = useState(false);
  const [keyboardMove, setKeyboardMove] = useState<KeyboardMove | null>(null);
  const [status, setStatus] = useState('');
  const announce = useAnnounce({hasReplace: true});
  const helpId = useId();

  const stageRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const cardElements = useRef(new Map<string, HTMLElement>()).current;
  const listElements = useRef(new Map<ColumnId, HTMLElement>()).current;
  const [glide] = useState(() => new LayoutGlide());
  const pendingGlide = useRef<{velocity?: {key: string; x: number; y: number}}>(
    null,
  );
  const pendingFocus = useRef<string | null>(null);
  const columnsRef = useRef(columns);
  const nextTaskNumber = useRef(1);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const say = useCallback(
    (message: string) => {
      setStatus(message);
      announce(message);
    },
    [announce],
  );

  // After a change renders, each card glides from where it was.
  useLayoutEffect(() => {
    const pending = pendingGlide.current;
    if (pending != null) {
      pendingGlide.current = null;
      glide.play(cardElements, pending.velocity);
    }
    const focusId = pendingFocus.current;
    if (focusId != null) {
      pendingFocus.current = null;
      cardElements.get(focusId)?.focus({preventScroll: true});
    }
  });

  const changeColumns = useCallback(
    (
      next: (current: Columns) => Columns,
      options: {
        from?: {key: string; rect: DOMRect};
        velocity?: {key: string; x: number; y: number};
        focus?: string;
      } = {},
    ) => {
      glide.capture(cardElements, options.from);
      pendingGlide.current = {velocity: options.velocity};
      pendingFocus.current = options.focus ?? null;
      setColumns(current => next(current));
    },
    [cardElements, glide],
  );

  const showMarker = useCallback(
    (target: DragState['target'], draggedId: string) => {
      const marker = markerRef.current;
      const stage = stageRef.current;
      if (marker == null || stage == null) {
        return;
      }
      if (target == null) {
        marker.hidden = true;
        return;
      }
      const list = listElements.get(target.column);
      if (list == null) {
        return;
      }
      const stageRect = stage.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const cards = columnsRef.current[target.column]
        .filter(id => id !== draggedId)
        .map(id => cardElements.get(id)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => rect != null);
      let y = listRect.top + 2;
      if (target.index < cards.length) {
        y = cards[target.index].top - 5;
      } else if (cards.length > 0) {
        y = cards[cards.length - 1].bottom + 3;
      }
      marker.hidden = false;
      marker.style.width = `${listRect.width - 8}px`;
      marker.style.transform = `translate(${listRect.left - stageRect.left + 4}px, ${y - stageRect.top}px)`;
    },
    [cardElements, listElements],
  );

  const dropTarget = useCallback(
    (x: number, y: number, draggedId: string): DragState['target'] => {
      for (const {id: column} of COLUMNS) {
        const list = listElements.get(column);
        const rect = list?.parentElement?.getBoundingClientRect();
        if (
          rect == null ||
          x < rect.left ||
          x > rect.right ||
          y < rect.top - 20 ||
          y > rect.bottom + 20
        ) {
          continue;
        }
        const others = columnsRef.current[column].filter(
          id => id !== draggedId,
        );
        let index = others.length;
        for (let i = 0; i < others.length; i++) {
          const card = cardElements.get(others[i])?.getBoundingClientRect();
          if (card != null && y < card.top + card.height / 2) {
            index = i;
            break;
          }
        }
        return {column, index};
      }
      return null;
    },
    [cardElements, listElements],
  );

  const archive = useCallback(
    (
      id: string,
      direction: number,
      drag?: {ghost: HTMLElement; ghostPlacement: SpringAnimator<Placement>},
      velocity = {x: direction * 1500, y: 0},
    ) => {
      const stage = stageRef.current;
      const element = cardElements.get(id);
      if (stage == null || element == null) {
        return;
      }
      const current = columnsRef.current;
      const column = columnOf(current, id);
      const list = current[column];
      const index = list.indexOf(id);
      const neighbor = list[index + 1] ?? list[index - 1];
      let flying = drag;
      if (flying == null) {
        const ghost = makeGhost(element, stage);
        flying = {ghost, ghostPlacement: placeGhost(ghost, element, stage)};
      }
      const {ghost, ghostPlacement} = flying;
      void ghostPlacement
        .to(
          {
            x: ghostPlacement.value.x + direction * stage.clientWidth,
            rotate: direction * 25,
          },
          {spring: springs.toss, velocity: {x: velocity.x, y: velocity.y}},
        )
        .then(() => ghost.remove());
      const task = tasks[id];
      setArchived(previous => [...previous, {task, column}]);
      changeColumns(
        columnsNow => ({
          ...columnsNow,
          [column]: columnsNow[column].filter(other => other !== id),
        }),
        {focus: neighbor},
      );
      say(`Archived “${task.title}”.`);
    },
    [cardElements, changeColumns, say, tasks],
  );

  // Pointer gestures for one card. Kept in a ref so each card wires its
  // listeners once and still reads this render's state.
  const dragHandlers = useRef<(id: string) => Parameters<typeof attachPan>[1]>(
    () => ({}),
  );
  useEffect(() => {
    dragHandlers.current = (id: string) => {
      let drag: DragState | null = null;
      return {
        onDragStart: () => {
          const element = cardElements.get(id);
          const stage = stageRef.current;
          if (element == null || stage == null) {
            return;
          }
          const ghost = makeGhost(element, stage);
          const ghostPlacement = placeGhost(ghost, element, stage);
          void ghostPlacement.to({scale: 1.04}, {spring: springs.lift});
          const column = columnOf(columnsRef.current, id);
          drag = {
            id,
            ghost,
            ghostPlacement,
            origin: {x: ghostPlacement.value.x, y: ghostPlacement.value.y},
            from: {column, index: columnsRef.current[column].indexOf(id)},
            target: null,
          };
          element.setAttribute('data-placeholder', '');
        },
        onDragMove: (state: PanState) => {
          const stage = stageRef.current;
          if (drag == null || stage == null) {
            return;
          }
          const {ghost, ghostPlacement, origin} = drag;
          const velocity = state.tracker.velocity();
          ghostPlacement.set({
            x: rubberBand(
              origin.x + state.dx,
              0,
              stage.clientWidth - ghost.offsetWidth,
            ),
            y: rubberBand(
              origin.y + state.dy,
              0,
              stage.clientHeight - ghost.offsetHeight,
            ),
            rotate: clamp(velocity.x * 0.01, -8, 8),
            scale: 1.04,
          });
          drag.target = dropTarget(state.x, state.y, id);
          showMarker(drag.target, id);
        },
        onDragEnd: (state: PanState) => {
          if (drag == null) {
            return;
          }
          const {ghost, ghostPlacement, from, target} = drag;
          drag = null;
          showMarker(null, id);
          cardElements.get(id)?.removeAttribute('data-placeholder');
          const columnWidth =
            listElements.get('todo')?.getBoundingClientRect().width ?? 200;
          const isFlick =
            !state.isCancelled &&
            Math.abs(state.vx) > ARCHIVE_SPEED &&
            Math.abs(state.vx) > 1.5 * Math.abs(state.vy) &&
            Math.abs(state.dx) < Math.max(180, columnWidth * 0.9);
          if (isFlick) {
            archive(
              id,
              Math.sign(state.vx),
              {ghost, ghostPlacement},
              {
                x: state.vx,
                y: state.vy,
              },
            );
            return;
          }
          const destination =
            !state.isCancelled && target != null ? target : from;
          const rect = ghost.getBoundingClientRect();
          ghost.remove();
          changeColumns(
            current =>
              moveTask(current, id, destination.column, destination.index),
            {
              from: {key: id, rect},
              velocity: {key: id, x: state.vx, y: state.vy},
            },
          );
          const title = tasks[id]?.title ?? 'Card';
          const columnTitle = COLUMNS.find(
            c => c.id === destination.column,
          )?.title;
          say(
            state.isCancelled
              ? 'Move cancelled.'
              : target == null
                ? 'Snapped back.'
                : `Moved “${title}” to ${columnTitle}, position ${destination.index + 1}.`,
          );
        },
      };
    };
  });

  const onCardKeyDown = (
    id: string,
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    const column = columnOf(columns, id);
    const list = columns[column];
    const index = list.indexOf(id);
    const columnIndex = COLUMNS.findIndex(c => c.id === column);
    const moveKeyboard = (toColumn: ColumnId, toIndex: number) => {
      changeColumns(current => moveTask(current, id, toColumn, toIndex), {
        focus: id,
      });
      const title = COLUMNS.find(c => c.id === toColumn)?.title;
      const length =
        toColumn === column ? list.length : columns[toColumn].length + 1;
      say(`${title}, position ${clamp(toIndex, 0, length - 1) + 1}.`);
    };
    if (keyboardMove?.id === id) {
      if (event.key === 'ArrowUp') {
        moveKeyboard(column, Math.max(0, index - 1));
      } else if (event.key === 'ArrowDown') {
        moveKeyboard(column, Math.min(list.length - 1, index + 1));
      } else if (event.key === 'ArrowLeft' && columnIndex > 0) {
        moveKeyboard(COLUMNS[columnIndex - 1].id, index);
      } else if (
        event.key === 'ArrowRight' &&
        columnIndex < COLUMNS.length - 1
      ) {
        moveKeyboard(COLUMNS[columnIndex + 1].id, index);
      } else if (event.key === 'Enter' || event.key === ' ') {
        setKeyboardMove(null);
        say('Dropped.');
      } else if (event.key === 'Escape') {
        const {from} = keyboardMove;
        changeColumns(
          current => moveTask(current, id, from.column, from.index),
          {
            focus: id,
          },
        );
        setKeyboardMove(null);
        say('Move cancelled.');
      } else if (!event.key.startsWith('Arrow')) {
        return;
      }
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      setKeyboardMove({id, from: {column, index}});
      say('Picked up. Arrow keys move it, Enter drops it, Escape cancels.');
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      archive(id, 1);
    } else if (event.key === 'ArrowUp') {
      cardElements.get(list[index - 1])?.focus();
    } else if (event.key === 'ArrowDown') {
      cardElements.get(list[index + 1])?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const next = COLUMNS[columnIndex + (event.key === 'ArrowLeft' ? -1 : 1)];
      const nextList = next == null ? [] : columns[next.id];
      cardElements.get(nextList[Math.min(index, nextList.length - 1)])?.focus();
    } else {
      return;
    }
    event.preventDefault();
  };

  const addCard = () => {
    const number = nextTaskNumber.current++;
    const task = {
      id: `new-${number}`,
      title: `New task ${number}`,
      tag: 'Inbox',
    };
    setTasks(previous => ({...previous, [task.id]: task}));
    changeColumns(current => ({...current, todo: [task.id, ...current.todo]}));
    say('Added a card to To do.');
  };

  const restoreLast = () => {
    const last = archived[archived.length - 1];
    if (last == null) {
      say('Nothing archived.');
      return;
    }
    setArchived(previous => previous.slice(0, -1));
    changeColumns(current => ({
      ...current,
      [last.column]: [last.task.id, ...current[last.column]],
    }));
    say(`Restored “${last.task.title}”.`);
  };

  return (
    <div className="mgk-root">
      <style>{KANBAN_CSS}</style>
      <div ref={stageRef} className="mgk-stage">
        <div className="mgk-board">
          {COLUMNS.map(column => (
            <section
              key={column.id}
              className="mgk-column"
              aria-labelledby={`${helpId}-${column.id}`}>
              <HStack gap={1} justify="between" align="center">
                <Text
                  as="h3"
                  type="label"
                  weight="semibold"
                  id={`${helpId}-${column.id}`}>
                  {column.title}
                </Text>
                <Badge label={String(columns[column.id].length)} />
              </HStack>
              <div
                className="mgk-list"
                role="list"
                aria-labelledby={`${helpId}-${column.id}`}
                ref={element => {
                  if (element == null) {
                    listElements.delete(column.id);
                  } else {
                    listElements.set(column.id, element);
                  }
                }}>
                {columns[column.id].map((id, index) => (
                  <KanbanCard
                    key={id}
                    task={tasks[id]}
                    label={`${tasks[id].title}, ${column.title}, ${index + 1} of ${columns[column.id].length}`}
                    helpId={helpId}
                    isPickedUp={keyboardMove?.id === id}
                    register={element => {
                      if (element == null) {
                        cardElements.delete(id);
                      } else {
                        cardElements.set(id, element);
                      }
                    }}
                    handlers={() => dragHandlers.current(id)}
                    onKeyDown={event => onCardKeyDown(id, event)}
                    onBlur={() => {
                      if (
                        keyboardMove?.id === id &&
                        pendingFocus.current == null
                      ) {
                        setKeyboardMove(null);
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="mgk-marker" ref={markerRef} hidden aria-hidden="true" />
        <HStack gap={2} align="center" wrap="wrap">
          <ArchivePile
            archived={archived}
            isFanned={isFanned}
            onToggle={() => {
              if (archived.length === 0) {
                say('Nothing archived yet. Flick a card sideways.');
                return;
              }
              setIsFanned(open => !open);
              say(isFanned ? 'Archive stacked.' : 'Archive fanned out.');
            }}
          />
          <Button
            label="Add card"
            size="sm"
            variant="primary"
            onClick={addCard}
          />
          <Button
            label="Restore last"
            size="sm"
            variant="secondary"
            onClick={restoreLast}
          />
        </HStack>
      </div>
      <p className="mgk-status">
        <Text type="supporting" color="secondary">
          {status ||
            'Drag cards between columns. Flick one sideways, fast, to archive it.'}
        </Text>
      </p>
      <p id={helpId} className="mgk-help">
        Enter picks a card up. Arrow keys move it, Enter drops it and Escape
        cancels. Delete archives it. Arrow keys alone move between cards.
      </p>
    </div>
  );
}

function KanbanCard({
  task,
  label,
  helpId,
  isPickedUp,
  register,
  handlers,
  onKeyDown,
  onBlur,
}: {
  task: Task;
  label: string;
  helpId: string;
  isPickedUp: boolean;
  register: (element: HTMLElement | null) => void;
  handlers: () => Parameters<typeof attachPan>[1];
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onBlur: () => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const pressable = usePressFeedback();
  const entry = useEntryAnimation('scaleIn');
  const focus = stylex.props(focusOutlineStyles.focusVisible);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const element = elementRef.current;
    if (element == null) {
      return;
    }
    // One recognizer per card; each gesture asks for this render's handlers.
    let active: Parameters<typeof attachPan>[1] = {};
    return attachPan(element, {
      onPress: () => {
        active = handlersRef.current();
      },
      onDragStart: state => active.onDragStart?.(state),
      onDragMove: state => active.onDragMove?.(state),
      onDragEnd: state => active.onDragEnd?.(state),
    });
  }, []);

  return (
    <div
      ref={element => {
        elementRef.current = element;
        register(element);
      }}
      {...pressable}
      className={`mgk-card ${focus.className ?? ''}`}
      role="listitem"
      tabIndex={0}
      aria-label={label}
      aria-describedby={helpId}
      data-picked-up={isPickedUp || undefined}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onContextMenu={event => event.preventDefault()}>
      <div {...stylex.props(entry)}>
        <Card padding={2} elevation="low">
          <VStack gap={0.5}>
            <Text type="body" weight="medium">
              {task.title}
            </Text>
            <Text type="supporting" color="secondary">
              {task.tag}
            </Text>
          </VStack>
        </Card>
      </div>
    </div>
  );
}

/** The archive: a small stack of the last cards, which fans out on press. */
function ArchivePile({
  archived,
  isFanned,
  onToggle,
}: {
  archived: Archived[];
  isFanned: boolean;
  onToggle: () => void;
}) {
  const minis = useRef(new Map<string, SpringAnimator<Placement>>()).current;
  const focus = stylex.props(focusOutlineStyles.focusVisible);
  const shown = archived.slice(-4);

  // A new target retargets each mini card from wherever it is now.
  useLayoutEffect(() => {
    shown.forEach((item, index) => {
      const fromTop = shown.length - 1 - index;
      const animator = minis.get(item.task.id);
      const target = isFanned
        ? {x: 70 + fromTop * 64, y: -54, rotate: -8 + fromTop * 5, scale: 1}
        : {
            x: fromTop * 2,
            y: -fromTop * 2,
            rotate: index % 2 ? 4 : -3,
            scale: 1,
          };
      void animator?.to(target, {spring: springs.glide});
    });
  });

  return (
    <button
      type="button"
      className={`mgk-pile ${focus.className ?? ''}`}
      aria-expanded={isFanned}
      aria-label={`Archive, ${archived.length} ${archived.length === 1 ? 'card' : 'cards'}`}
      onClick={onToggle}>
      <Badge label={String(archived.length)} variant="neutral" />
      {shown.map(item => (
        <div
          key={item.task.id}
          className="mgk-mini"
          aria-hidden="true"
          ref={element => {
            if (element == null) {
              minis.delete(item.task.id);
            } else if (!minis.has(item.task.id)) {
              minis.set(item.task.id, placementAnimator(element));
            }
          }}>
          {item.task.title}
        </div>
      ))}
    </button>
  );
}

function makeGhost(element: HTMLElement, stage: HTMLElement): HTMLElement {
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('tabindex');
  ghost.removeAttribute('role');
  ghost.removeAttribute('aria-label');
  ghost.removeAttribute('aria-describedby');
  ghost.removeAttribute('data-astryx-press');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('mgk-ghost');
  ghost.style.width = `${element.getBoundingClientRect().width}px`;
  stage.appendChild(ghost);
  return ghost;
}

function placeGhost(
  ghost: HTMLElement,
  element: HTMLElement,
  stage: HTMLElement,
): SpringAnimator<Placement> {
  const rect = element.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  return placementAnimator(ghost, {
    x: rect.left - stageRect.left,
    y: rect.top - stageRect.top,
  });
}

const KANBAN_CSS = `
.mgk-root{display:flex;flex-direction:column;gap:var(--spacing-1);height:100dvh;box-sizing:border-box;padding:var(--spacing-2);background:var(--color-background-surface);color:var(--color-text-primary);font-family:var(--font-family-body)}
.mgk-stage{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;gap:var(--spacing-2);padding:var(--spacing-2);border:1px solid var(--color-border);border-radius:var(--radius-container);background:var(--color-background-muted);user-select:none;-webkit-user-select:none;overflow:hidden}
.mgk-board{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--spacing-2)}
.mgk-column{display:flex;flex-direction:column;gap:var(--spacing-2);min-height:0;padding:var(--spacing-2);border:1px solid var(--color-border);border-radius:var(--radius-container);background:var(--color-background-surface)}
.mgk-column h3{margin:0}
.mgk-list{display:flex;flex-direction:column;gap:var(--spacing-1-5);flex:1;min-height:40px}
.mgk-card{position:relative;border-radius:var(--radius-container);cursor:grab;touch-action:none;-webkit-touch-callout:none}
.mgk-card::after{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--color-overlay-pressed);opacity:0;transition:opacity var(--duration-fast-min) linear;pointer-events:none}
.mgk-card[data-astryx-press="on"]::after,.mgk-card:active::after{opacity:1}
.mgk-card[data-placeholder]{opacity:.35}
.mgk-card[data-picked-up]{outline:3px solid var(--color-accent);outline-offset:2px}
.mgk-ghost{position:absolute;left:0;top:0;z-index:800;pointer-events:none;cursor:grabbing}
.mgk-ghost > div{box-shadow:var(--shadow-high);border-radius:var(--radius-container)}
.mgk-marker{position:absolute;left:0;top:0;height:3px;border-radius:2px;background:var(--color-accent);pointer-events:none;z-index:850}
.mgk-pile{position:relative;z-index:5;width:96px;height:48px;flex:none;appearance:none;border:1px dashed var(--color-border-emphasized);border-radius:var(--radius-element);background:transparent;cursor:pointer;display:flex;align-items:flex-start;justify-content:flex-start;padding:var(--spacing-1)}
.mgk-mini{position:absolute;left:28px;top:6px;width:56px;height:34px;box-sizing:border-box;border-radius:var(--radius-inner);background:var(--color-background-card);border:1px solid var(--color-border);box-shadow:var(--shadow-low);font-size:var(--font-size-2xs);line-height:1.2;overflow:hidden;padding:2px 4px;text-align:start;color:var(--color-text-primary);pointer-events:none}
.mgk-status{margin:0;min-height:1.6em}
.mgk-help{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (max-width:520px){.mgk-board,.mgk-stage{gap:var(--spacing-1)}.mgk-column{padding:var(--spacing-1)}}
@media (forced-colors: active){.mgk-marker{background:Highlight}.mgk-card[data-picked-up]{outline-color:Highlight}}
`;
