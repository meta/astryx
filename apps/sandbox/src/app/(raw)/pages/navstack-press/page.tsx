// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?prepare=on|off` (on by default), `?layout=<ms>` (layout-effect
 *   work when the pushed screen mounts, 80 by default), `?rows=<n>` (the
 *   root list's rows, 2,200 by default)
 * @output A full-page NavigationStack whose root is a long windowed list. A
 *   row's press pushes a heavy screen. With `prepare` on, each row uses
 *   `useNavigationLink`, so the press renders that screen ahead. The readout
 *   gives each tap's press and lift times and its first moved frame
 * @position A raw page for a prepared push, filmed on a physical phone: the
 *   touch to the pressed row's paint, and the lift to the push's first moved
 *   frame
 */

import {Suspense, useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationLink,
  useNavigationStack,
} from '@astryxdesign/lab';
import {ListItem} from '@astryxdesign/core/List';
import {
  HeavyScreen,
  queryNumber,
  Readout,
  Stage,
  useReadoutLines,
  watchFirstMove,
  WindowedList,
} from '../../navigationStackCells';

const PAGE = '/sandbox/pages/navstack-press/';

function PreparedRow({entry}: {entry: string}) {
  const link = useNavigationLink(entry);
  return (
    <ListItem
      ref={link.ref}
      label={entry}
      description="Press, then lift: the push starts"
      onClick={link.onClick}
    />
  );
}

function PlainRow({entry}: {entry: string}) {
  const nav = useNavigationStack<string>();
  return (
    <ListItem
      label={entry}
      description="Press, then lift: the push starts"
      onClick={() => nav.push(entry)}
    />
  );
}

function PressCell() {
  const [params] = useSearchParams();
  const prepare = params.get('prepare') !== 'off';
  const layoutMs = queryNumber(params, 'layout', 80);
  const rows = queryNumber(params, 'rows', 2200);
  const [path, setPath] = useState<string[]>([]);
  const [lines, addLine] = useReadoutLines();
  const press = useRef<{down: number; up: number | null}>({down: 0, up: null});
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      press.current = {down: event.timeStamp, up: null};
    };
    const onUp = (event: PointerEvent) => {
      press.current.up = event.timeStamp;
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
    };
  }, []);

  useEffect(() => {
    const entry = pending.current;
    if (entry == null) {
      return undefined;
    }
    pending.current = null;
    const {down, up} = press.current;
    const lift = up ?? performance.now();
    return watchFirstMove(
      entry,
      lift,
      width => width,
      () => 0,
      move =>
        addLine(
          `${entry}: press ${Math.round(lift - down)} ms; lift → first moved frame ${move.ms} ms, at ${Math.round(move.travel * 100)}% (page clock)`,
        ),
    );
  }, [path, addLine]);

  return (
    <>
      <Stage>
        <NavigationStack
          label="Inbox"
          root={
            <NavigationScreen title="Inbox" scroll="content">
              <WindowedList
                count={rows}
                renderRow={index => {
                  const entry = `Thread ${index + 1}`;
                  return prepare ? (
                    <PreparedRow entry={entry} />
                  ) : (
                    <PlainRow entry={entry} />
                  );
                }}
              />
            </NavigationScreen>
          }
          path={path}
          onPathChange={next => {
            if (next.length > path.length) {
              pending.current = next[next.length - 1] ?? null;
            }
            setPath(next);
          }}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen title={entry}>
              <HeavyScreen name={entry} rows={120} layoutMs={layoutMs} />
            </NavigationScreen>
          )}
        />
      </Stage>
      <Readout
        links={[
          {label: 'prepare on', href: `${PAGE}?prepare=on`},
          {label: 'prepare off', href: `${PAGE}?prepare=off`},
          {label: 'no mount work', href: `${PAGE}?prepare=on&layout=0`},
        ]}
        lines={[
          `prepare ${prepare ? 'on' : 'off'} · mount work ${layoutMs} ms · ${rows} rows`,
          ...lines,
        ]}
      />
    </>
  );
}

export default function NavigationStackPressPage() {
  return (
    <Suspense>
      <PressCell />
    </Suspense>
  );
}
