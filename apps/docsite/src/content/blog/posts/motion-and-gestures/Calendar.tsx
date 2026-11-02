// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Calendar.tsx
 * @input Nothing: the demo owns its events.
 * @output A week view whose events drag to 15-minute slots and days, and
 *   whose bottom edges resize their length in 15-minute steps.
 * @position Post-local example asset for the motion-and-gestures blog post.
 *   It is not an Astryx component and no package exports it.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {Text} from '@astryxdesign/core/Text';
import {useAnnounce, usePressFeedback} from '@astryxdesign/core/hooks';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import {
  attachPan,
  clamp,
  placementAnimator,
  rubberBand,
  springs,
  type Placement,
  type SpringAnimator,
} from './motion';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const START_HOUR = 9;
const END_HOUR = 16;
/** Pixels for one 15-minute slot. */
const SLOT = 10;
const SLOT_COUNT = (END_HOUR - START_HOUR) * 4;
const BODY_HEIGHT = SLOT_COUNT * SLOT;
const GUTTER = 40;
/** Releases slower than this, in px/s, land on the slot the outline shows. */
const PROJECTION_SPEED = 400;

interface CalendarEventData {
  id: string;
  title: string;
  day: number;
  /** Minutes after midnight. */
  start: number;
  /** Minutes. */
  duration: number;
  color: string;
}

interface Geometry {
  columnWidth: number;
  dayCount: number;
}

interface Slot {
  day: number;
  start: number;
}

const INITIAL_EVENTS: CalendarEventData[] = [
  {
    id: 'review',
    title: 'Design review',
    day: 0,
    start: 9 * 60 + 30,
    duration: 60,
    color: 'blue',
  },
  {
    id: 'one-on-one',
    title: '1:1',
    day: 0,
    start: 13 * 60 + 30,
    duration: 45,
    color: 'green',
  },
  {
    id: 'planning',
    title: 'Sprint planning',
    day: 1,
    start: 10 * 60,
    duration: 90,
    color: 'purple',
  },
  {
    id: 'coffee',
    title: 'Coffee chat',
    day: 2,
    start: 14 * 60,
    duration: 30,
    color: 'orange',
  },
  {
    id: 'pairing',
    title: 'Docs pairing',
    day: 3,
    start: 11 * 60,
    duration: 60,
    color: 'teal',
  },
];

let eventLayer = 1;

function formatTime(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function slotPosition(slot: Slot, {columnWidth}: Geometry) {
  return {
    x: GUTTER + slot.day * columnWidth + 2,
    y: ((slot.start - START_HOUR * 60) / 15) * SLOT,
  };
}

/** The nearest 15-minute slot and day for a point in the grid. */
function nearestSlot(
  x: number,
  y: number,
  duration: number,
  {columnWidth, dayCount}: Geometry,
): Slot {
  return {
    day: clamp(Math.round((x - GUTTER - 2) / columnWidth), 0, dayCount - 1),
    start:
      START_HOUR * 60 +
      clamp(Math.round(y / SLOT), 0, SLOT_COUNT - duration / 15) * 15,
  };
}

/** A week whose events drag to 15-minute slots and resize in 15-minute steps. */
export function WeekCalendar() {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [status, setStatus] = useState('');
  const announce = useAnnounce({hasReplace: true});
  const helpId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const snapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body == null) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const dayCount = width < 520 ? 3 : 5;
      setGeometry({columnWidth: (width - GUTTER) / dayCount, dayCount});
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  const say = (message: string) => {
    setStatus(message);
    announce(message);
  };

  const showSnap = (slot: Slot | null, duration = 0) => {
    const outline = snapRef.current;
    if (outline == null || geometry == null) {
      return;
    }
    outline.hidden = slot == null;
    if (slot != null) {
      const {x, y} = slotPosition(slot, geometry);
      outline.style.width = `${geometry.columnWidth - 4}px`;
      outline.style.height = `${(duration / 15) * SLOT}px`;
      outline.style.transform = `translate(${x}px, ${y}px)`;
    }
  };

  const update = (id: string, change: Partial<CalendarEventData>) =>
    setEvents(current =>
      current.map(event => (event.id === id ? {...event, ...change} : event)),
    );

  const dayCount = geometry?.dayCount ?? 5;
  return (
    <div className="mgc-root">
      <style>{CALENDAR_CSS}</style>
      <div className="mgc-week">
        <div
          className="mgc-head"
          style={{gridTemplateColumns: `${GUTTER}px repeat(${dayCount}, 1fr)`}}>
          <span />
          {DAY_NAMES.slice(0, dayCount).map(day => (
            <Text
              key={day}
              type="supporting"
              weight="semibold"
              color="secondary">
              {day}
            </Text>
          ))}
        </div>
        <div ref={bodyRef} className="mgc-body" style={{height: BODY_HEIGHT}}>
          <div className="mgc-grid" aria-hidden="true">
            {Array.from({length: END_HOUR - START_HOUR}, (_, hour) => (
              <div
                key={hour}
                className="mgc-hour"
                style={{top: hour * 4 * SLOT}}>
                <span>{START_HOUR + hour}:00</span>
              </div>
            ))}
            {geometry != null &&
              Array.from({length: dayCount}, (_, day) => (
                <div
                  key={day}
                  className="mgc-day"
                  style={{
                    left: GUTTER + day * geometry.columnWidth,
                    width: geometry.columnWidth,
                  }}
                />
              ))}
          </div>
          <div ref={snapRef} className="mgc-snap" hidden aria-hidden="true" />
          {geometry != null &&
            events
              .filter(event => event.day < dayCount)
              .map(event => (
                <CalendarEvent
                  key={event.id}
                  event={event}
                  geometry={geometry}
                  helpId={helpId}
                  onPreview={showSnap}
                  onMove={(slot, how) => {
                    update(event.id, slot);
                    say(
                      how === 'cancelled'
                        ? 'Move cancelled.'
                        : `${event.title}: ${DAY_NAMES[slot.day]} ${formatTime(slot.start)}.`,
                    );
                  }}
                  onResize={duration => update(event.id, {duration})}
                  onResizeEnd={duration =>
                    say(`${event.title} is ${duration} minutes.`)
                  }
                  say={say}
                />
              ))}
        </div>
      </div>
      <p className="mgc-status">
        <Text type="supporting" color="secondary">
          {status ||
            'Drag an event to a new time or day. Drag its bottom edge to change its length.'}
        </Text>
      </p>
      <p id={helpId} className="mgc-help">
        Enter picks an event up. Up and Down move it 15 minutes, Left and Right
        change the day, Enter drops it and Escape cancels. Tab to its bottom
        edge, then Up and Down change its length by 15 minutes.
      </p>
    </div>
  );
}

function CalendarEvent({
  event,
  geometry,
  helpId,
  onPreview,
  onMove,
  onResize,
  onResizeEnd,
  say,
}: {
  event: CalendarEventData;
  geometry: Geometry;
  helpId: string;
  onPreview: (slot: Slot | null, duration?: number) => void;
  onMove: (slot: Slot, how: 'dropped' | 'cancelled') => void;
  onResize: (duration: number) => void;
  onResizeEnd: (duration: number) => void;
  say: (message: string) => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLButtonElement>(null);
  const placementRef = useRef<SpringAnimator<Placement> | null>(null);
  const isDraggingRef = useRef(false);
  const [preview, setPreview] = useState<Slot | null>(null);
  const [keyboardOrigin, setKeyboardOrigin] = useState<Slot | null>(null);
  const pressable = usePressFeedback();
  const focus = stylex.props(focusOutlineStyles.focusVisible);

  const maxSlots = SLOT_COUNT - (event.start - START_HOUR * 60) / 15;
  const length = useResizable({
    direction: 'vertical',
    defaultSize: (event.duration / 15) * SLOT,
    minSize: SLOT,
    maxSize: maxSlots * SLOT,
    snaps: Array.from({length: maxSlots}, (_, i) => (i + 1) * SLOT),
    onSizeChange: size => onResize(Math.round(size / SLOT) * 15),
  });
  const duration = Math.round(length.size / SLOT) * 15;

  // The latest props, for gesture handlers wired once.
  const latest = useRef({event, geometry, duration, onPreview, onMove});
  useEffect(() => {
    latest.current = {event, geometry, duration, onPreview, onMove};
  });

  // Rest at the event's slot. A geometry change moves it there at once.
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (element == null || isDraggingRef.current) {
      return;
    }
    placementRef.current ??= placementAnimator(element);
    const target = slotPosition(event, geometry);
    const placement = placementRef.current;
    if (placement.value.x === 0 && placement.value.y === 0) {
      placement.set(target);
    } else {
      void placement.to({...target, scale: 1}, {spring: springs.snappy});
    }
  }, [event, geometry]);

  useEffect(() => {
    const body = bodyRef.current;
    const element = elementRef.current;
    if (body == null || element == null) {
      return;
    }
    let origin = {x: 0, y: 0};
    return attachPan(body, {
      onPress: () => {
        // The event last touched paints above the events it overlaps.
        element.style.zIndex = String(++eventLayer);
        element.setAttribute('data-lifted', '');
        void placementRef.current?.to({scale: 1.03}, {spring: springs.lift});
      },
      onRelease: () => {
        element.removeAttribute('data-lifted');
      },
      onTap: () => {
        void placementRef.current?.to({scale: 1}, {spring: springs.lift});
      },
      onDragStart: () => {
        const placement = placementRef.current;
        if (placement == null) {
          return;
        }
        isDraggingRef.current = true;
        origin = {x: placement.value.x, y: placement.value.y};
        placement.stop();
      },
      onDragMove: state => {
        const placement = placementRef.current;
        if (placement == null) {
          return;
        }
        const {geometry: g, duration: d, onPreview: preview} = latest.current;
        const x = rubberBand(
          origin.x + state.dx,
          GUTTER + 2,
          GUTTER + (g.dayCount - 1) * g.columnWidth + 2,
          60,
        );
        const y = rubberBand(
          origin.y + state.dy,
          0,
          BODY_HEIGHT - (d / 15) * SLOT,
          60,
        );
        placement.set({x, y, rotate: 0, scale: 1.03});
        const slot = nearestSlot(x, y, d, g);
        preview(slot, d);
        setPreview(slot);
      },
      onDragEnd: state => {
        const placement = placementRef.current;
        isDraggingRef.current = false;
        setPreview(null);
        const {
          event: e,
          geometry: g,
          duration: d,
          onPreview: preview,
          onMove: move,
        } = latest.current;
        preview(null);
        if (placement == null) {
          return;
        }
        // A flick lands a step further. A slow release lands where the
        // outline showed.
        const isFlick = Math.hypot(state.vx, state.vy) > PROJECTION_SPEED;
        const projection = isFlick ? 0.1 : 0;
        const slot = state.isCancelled
          ? {day: e.day, start: e.start}
          : nearestSlot(
              placement.value.x + state.vx * projection,
              placement.value.y + state.vy * projection,
              d,
              g,
            );
        void placement.to(
          {...slotPosition(slot, g), scale: 1},
          {spring: springs.snappy, velocity: {x: state.vx, y: state.vy}},
        );
        move(slot, state.isCancelled ? 'cancelled' : 'dropped');
      },
    });
  }, []);

  const onKeyDown = (keyEvent: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (keyboardOrigin != null) {
      const step = {
        ArrowUp: [0, -15],
        ArrowDown: [0, 15],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }[keyEvent.key];
      if (step != null) {
        onMove(
          {
            day: clamp(event.day + step[0], 0, geometry.dayCount - 1),
            start: clamp(
              event.start + step[1],
              START_HOUR * 60,
              END_HOUR * 60 - duration,
            ),
          },
          'dropped',
        );
      } else if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        setKeyboardOrigin(null);
        say('Dropped.');
      } else if (keyEvent.key === 'Escape') {
        onMove(keyboardOrigin, 'cancelled');
        setKeyboardOrigin(null);
      } else {
        return;
      }
      keyEvent.preventDefault();
      return;
    }
    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      if (elementRef.current != null) {
        elementRef.current.style.zIndex = String(++eventLayer);
      }
      setKeyboardOrigin({day: event.day, start: event.start});
      say('Picked up. Arrow keys move it, Enter drops it, Escape cancels.');
    }
  };

  const eventStyle: CSSProperties & Record<`--${string}`, string> = {
    width: geometry.columnWidth - 4,
    height: length.size,
    '--event-border': `var(--color-border-${event.color})`,
    '--event-background': `var(--color-background-${event.color})`,
  };
  const shown = preview ?? event;
  const timeRange = `${formatTime(shown.start)}–${formatTime(shown.start + duration)}`;
  return (
    <div
      ref={elementRef}
      className="mgc-event"
      data-picked-up={keyboardOrigin != null || undefined}
      style={eventStyle}>
      <button
        ref={bodyRef}
        type="button"
        {...pressable}
        className={`mgc-event-body ${focus.className ?? ''}`}
        aria-label={`${event.title}, ${DAY_NAMES[shown.day]} ${timeRange}`}
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
        onBlur={() => setKeyboardOrigin(null)}
        onContextMenu={e => e.preventDefault()}>
        <Text type="supporting" weight="semibold" maxLines={1}>
          {event.title}
        </Text>
        {duration >= 60 && (
          <Text type="supporting" color="secondary" maxLines={1}>
            {timeRange}
          </Text>
        )}
      </button>
      {/* The grab zone sits on the bottom edge and below it, so the event
          body keeps its own drag. */}
      <ResizeHandle
        direction="vertical"
        position="overlay"
        pillPlacement="end"
        resizable={length.props}
        label={`Length of ${event.title}`}
        aria-valuetext={`${duration} minutes`}
        onPointerUp={() => onResizeEnd(duration)}
        onKeyUp={keyEvent => {
          if (keyEvent.key === 'ArrowUp' || keyEvent.key === 'ArrowDown') {
            onResizeEnd(duration);
          }
        }}>
        <span className="mgc-grip" aria-hidden="true" />
      </ResizeHandle>
    </div>
  );
}

const CALENDAR_CSS = `
.mgc-root{display:flex;flex-direction:column;gap:var(--spacing-1);height:100dvh;box-sizing:border-box;padding:var(--spacing-2);background:var(--color-background-surface);color:var(--color-text-primary);font-family:var(--font-family-body)}
.mgc-week{border:1px solid var(--color-border);border-radius:var(--radius-container);overflow:hidden;user-select:none;-webkit-user-select:none}
.mgc-head{display:grid;align-items:center;height:22px;padding-inline-start:0;border-bottom:1px solid var(--color-border)}
.mgc-head > *{padding-inline:var(--spacing-2)}
.mgc-body{position:relative;touch-action:none}
.mgc-grid{position:absolute;inset:0;pointer-events:none}
.mgc-hour{position:absolute;left:0;right:0;border-top:1px solid var(--color-border);font-size:var(--font-size-xs);color:var(--color-text-secondary)}
.mgc-hour:first-child{border-top:0}
.mgc-hour span{position:absolute;left:var(--spacing-1);top:1px}
.mgc-day{position:absolute;top:0;bottom:0;border-inline-start:1px solid var(--color-border)}
.mgc-snap{position:absolute;left:0;top:0;box-sizing:border-box;border:2px dashed var(--color-accent);border-radius:var(--radius-inner);pointer-events:none}
.mgc-event{position:absolute;left:0;top:0;box-sizing:border-box;border-radius:var(--radius-inner);border-inline-start:3px solid var(--event-border);background:var(--event-background);--resize-handle-hit-area:8px}
.mgc-event[data-lifted]{box-shadow:var(--shadow-high);z-index:50}
.mgc-event[data-picked-up]{outline:3px solid var(--color-accent);outline-offset:2px;z-index:40}
.mgc-event-body{appearance:none;position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;overflow:hidden;border:0;border-radius:inherit;background:none;padding:2px var(--spacing-1);text-align:start;color:inherit;font:inherit;cursor:grab;touch-action:none;-webkit-touch-callout:none}
.mgc-event-body::after{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--color-overlay-pressed);opacity:0;transition:opacity var(--duration-fast-min) linear;pointer-events:none}
.mgc-event-body[data-astryx-press="on"]::after,.mgc-event-body:active::after{opacity:1}
.mgc-grip{position:absolute;left:50%;bottom:2px;width:22px;height:3px;margin-left:-11px;border-radius:2px;background:var(--event-border);opacity:.7;pointer-events:none}
.mgc-status{margin:0;min-height:1.6em}
.mgc-help{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (forced-colors: active){.mgc-snap{border-color:Highlight}.mgc-event[data-picked-up]{outline-color:Highlight}}
`;
