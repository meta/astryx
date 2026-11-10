// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A preview page with the ContextMenu touch long-press trigger and
 *   menu, and an on-page log of the input events and popover calls
 * @position A raw page for a device check. It reads what a phone sends around
 *   a held finger's lift, and which call hides the menu. It never merges.
 */

import {useEffect, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
import {
  ArrowDownTrayIcon,
  ClipboardIcon,
  ShareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

const LOGGED = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'pointerover',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'mouseover',
  'mousemove',
  'mousedown',
  'mouseup',
  'click',
  'contextmenu',
  'focusin',
  'focusout',
  'keydown',
  'selectionchange',
  'scroll',
] as const;

const lines: string[] = [];
let output: HTMLElement | null = null;
let lastKey = '';
let repeats = 0;

function now(): string {
  return performance.now().toFixed(1);
}

function describe(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return target === window ? 'window' : String(target);
  }
  const role = target.getAttribute('role');
  const id = target.getAttribute('data-testid');
  const text = (target.textContent ?? '').trim().slice(0, 18);
  return `${target.tagName.toLowerCase()}${role ? `[${role}]` : ''}${
    id ? `#${id}` : ''
  }"${text}"`;
}

function write(line: string): void {
  // Moves and scrolls come in runs: a run counts as one line.
  const key = line.replace(/^[\d.]+ /, '').replace(/@\S+/g, '');
  if (key === lastKey && /move|scroll/.test(key)) {
    repeats += 1;
    lines[lines.length - 1] = `${line} (x${repeats + 1})`;
  } else {
    lastKey = key;
    repeats = 0;
    lines.push(line);
  }
  scheduleFlush();
}

let isFlushScheduled = false;

// One DOM write per frame, so the log costs the gesture as little as it can.
function scheduleFlush(): void {
  if (isFlushScheduled) {
    return;
  }
  isFlushScheduled = true;
  requestAnimationFrame(() => {
    isFlushScheduled = false;
    if (output != null) {
      output.textContent = lines.join('\n');
    }
  });
}

function eventLine(event: Event, phase: string): string {
  const parts = [now(), phase, event.type];
  parts.push(`trusted=${event.isTrusted}`);
  parts.push(`cancelable=${event.cancelable}`);
  parts.push(`prevented=${event.defaultPrevented}`);
  if (event instanceof PointerEvent) {
    parts.push(
      `pointer=${event.pointerType}#${event.pointerId}${
        event.isPrimary ? '*' : ''
      }`,
    );
  }
  if (event instanceof MouseEvent) {
    parts.push(`detail=${event.detail}`);
    parts.push(`@${Math.round(event.clientX)},${Math.round(event.clientY)}`);
  }
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const touch = event.changedTouches[0];
    if (touch != null) {
      parts.push(`@${Math.round(touch.clientX)},${Math.round(touch.clientY)}`);
    }
  }
  if (event instanceof KeyboardEvent) {
    parts.push(`key=${event.key}`);
  }
  parts.push(`on ${describe(event.target)}`);
  return parts.join(' ');
}

function stackTop(): string {
  return (new Error().stack ?? '')
    .split('\n')
    .slice(2, 10)
    .map(frame => frame.trim().replace(/https?:\/\/[^\s)]*\//g, ''))
    .join(' < ');
}

let isInstalled = false;

function install(): void {
  if (isInstalled || typeof window === 'undefined') {
    return;
  }
  isInstalled = true;
  // Window capture listeners added before the page's own, so each event is
  // logged before any handler can stop it. A timer reads the outcome after
  // every handler has run.
  for (const type of LOGGED) {
    const target = type === 'selectionchange' ? document : window;
    target.addEventListener(
      type,
      event => {
        write(eventLine(event, 'in '));
        if (
          type === 'touchend' ||
          type === 'mousedown' ||
          type === 'mouseup' ||
          type === 'click' ||
          type === 'touchstart'
        ) {
          setTimeout(() => {
            write(
              `${now()} out ${event.type} prevented=${event.defaultPrevented} cancelable=${event.cancelable}`,
            );
          }, 0);
        }
      },
      {capture: true, passive: true},
    );
  }
  for (const type of ['blur', 'focus', 'resize', 'pagehide'] as const) {
    window.addEventListener(type, event => {
      if (event.target === window) {
        write(`${now()} in  window ${type}`);
      }
    });
  }
  window.visualViewport?.addEventListener('resize', () => {
    write(`${now()} in  visualViewport resize`);
  });
  document.addEventListener('visibilitychange', () => {
    write(`${now()} in  visibilitychange ${document.visibilityState}`);
  });
  const proto = HTMLElement.prototype;
  const hide = proto.hidePopover;
  const show = proto.showPopover;
  if (typeof hide === 'function') {
    proto.hidePopover = function hidePopover(this: HTMLElement) {
      const isMenu = this.querySelector('[role="menu"]') != null;
      write(
        `${now()} CALL hidePopover menu=${isMenu} open=${this.matches(
          ':popover-open',
        )} stack: ${stackTop()}`,
      );
      return hide.call(this);
    };
  }
  if (typeof show === 'function') {
    proto.showPopover = function showPopover(
      this: HTMLElement,
      ...args: unknown[]
    ) {
      const isMenu = this.querySelector('[role="menu"]') != null;
      write(`${now()} CALL showPopover menu=${isMenu}`);
      return (show as (...a: unknown[]) => void).apply(this, args);
    };
  }
  document.addEventListener(
    'toggle',
    event => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const state = (event as ToggleEvent).newState;
        write(
          `${now()} toggle ${state} menu=${
            target.querySelector('[role="menu"]') != null
          }`,
        );
      }
    },
    {capture: true},
  );
}

// At module evaluation, ahead of the components' own listeners.
install();

const styles = stylex.create({
  page: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    width: '200px',
    height: '120px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '12px',
    backgroundColor: '#e5e7eb',
    color: '#374151',
    userSelect: 'none',
  },
  log: {
    margin: 0,
    fontFamily: 'ui-monospace, monospace',
    fontSize: '10px',
    lineHeight: 1.35,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
});

export default function ContextMenuTouchLogPage() {
  const outputRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    output = outputRef.current;
    if (output != null) {
      output.textContent = lines.join('\n');
    }
    return () => {
      output = null;
    };
  }, []);
  return (
    <main {...stylex.props(styles.page)}>
      <ContextMenu
        label="Photo actions"
        items={[
          {label: 'Copy', icon: ClipboardIcon, onClick: () => {}},
          {label: 'Share', icon: ShareIcon, onClick: () => {}},
          {label: 'Save to Files', icon: ArrowDownTrayIcon, onClick: () => {}},
          {type: 'divider'},
          {
            label: 'Delete',
            icon: TrashIcon,
            variant: 'destructive',
            onClick: () => {},
          },
        ]}>
        <div {...stylex.props(styles.card)}>Hold for actions</div>
      </ContextMenu>
      <Button
        label="Clear log"
        onClick={() => {
          lines.length = 0;
          lastKey = '';
          repeats = 0;
          if (output != null) {
            output.textContent = '';
          }
        }}
      />
      <pre
        ref={outputRef}
        aria-label="Event log"
        {...stylex.props(styles.log)}
      />
    </main>
  );
}
