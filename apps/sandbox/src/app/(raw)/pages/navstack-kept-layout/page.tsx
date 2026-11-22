// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?retain=<n>` (popped screens kept, 2 by default), `?prepare=on`
 *   (rows prepare at the press; off by default), `?layout=<ms>` (layout-effect
 *   work when a chat mounts, 80 by default)
 * @output A full-page NavigationStack of chats with long transcripts. The
 *   readout names each push fresh (a mount), retained (a popped screen kept
 *   laid out) or prepared, with lift to its first moved frame
 * @position A raw page for retained and prepared screens staying laid out,
 *   filmed on a physical phone: lift to the first moved frame of a fresh
 *   push, of a retained screen's re-push and of a prepared push
 */

import {Suspense, useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationLink,
  useNavigationStack,
} from '@astryxdesign/lab';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  cardOf,
  HeavyScreen,
  queryNumber,
  Readout,
  Stage,
  useReadoutLines,
  watchFirstMove,
} from '../../navigationStackCells';

const PAGE = '/sandbox/pages/navstack-kept-layout/';
const CHATS = Array.from({length: 12}, (_, index) => `Chat ${index + 1}`);

function PreparedRow({entry}: {entry: string}) {
  const link = useNavigationLink(entry);
  return <ListItem ref={link.ref} label={entry} onClick={link.onClick} />;
}

function PlainRow({entry}: {entry: string}) {
  const nav = useNavigationStack<string>();
  return <ListItem label={entry} onClick={() => nav.push(entry)} />;
}

function KeptLayoutCell() {
  const [params] = useSearchParams();
  const retain = queryNumber(params, 'retain', 2);
  const prepare = params.get('prepare') === 'on';
  const layoutMs = queryNumber(params, 'layout', 80);
  const [path, setPath] = useState<string[]>([]);
  const [lines, addLine] = useReadoutLines();
  const lift = useRef(0);
  const mounted = useRef(new Set<string>());
  const pending = useRef<{entry: string; kind: string} | null>(null);

  useEffect(() => {
    const onUp = (event: PointerEvent) => {
      lift.current = event.timeStamp;
    };
    document.addEventListener('pointerup', onUp, true);
    return () => document.removeEventListener('pointerup', onUp, true);
  }, []);

  useEffect(() => {
    const push = pending.current;
    if (push == null) {
      return undefined;
    }
    pending.current = null;
    return watchFirstMove(
      push.entry,
      lift.current,
      width => width,
      () => 0,
      move =>
        addLine(
          `${push.entry} (${push.kind}): lift → first moved frame ${move.ms} ms, at ${Math.round(move.travel * 100)}% (page clock)`,
        ),
    );
  }, [path, addLine]);

  return (
    <>
      <Stage>
        <NavigationStack
          label="Chats"
          retainPopped={retain}
          root={
            <NavigationScreen title="Chats">
              <List>
                {CHATS.map(entry =>
                  prepare ? (
                    <PreparedRow key={entry} entry={entry} />
                  ) : (
                    <PlainRow key={entry} entry={entry} />
                  ),
                )}
              </List>
            </NavigationScreen>
          }
          path={path}
          onPathChange={next => {
            const entry = next.length > path.length ? next.at(-1) : null;
            if (entry != null) {
              const state = cardOf(entry)?.getAttribute(
                'data-navigation-screen-state',
              );
              pending.current = {
                entry,
                kind:
                  state === 'prepared'
                    ? 'prepared'
                    : mounted.current.has(entry) && state != null
                      ? 'retained'
                      : 'fresh',
              };
              mounted.current.add(entry);
            }
            setPath(next);
          }}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen title={entry}>
              <HeavyScreen name={entry} rows={300} layoutMs={layoutMs} />
            </NavigationScreen>
          )}
        />
      </Stage>
      <Readout
        links={[
          {label: 'retained, press pushes', href: PAGE},
          {label: 'rows prepare', href: `${PAGE}?prepare=on`},
          {label: 'nothing kept', href: `${PAGE}?retain=0`},
        ]}
        lines={[
          `retainPopped ${retain} · prepare ${prepare ? 'on' : 'off'} · mount work ${layoutMs} ms · open a chat, go back, open it again`,
          ...lines,
        ]}
      />
    </>
  );
}

export default function NavigationStackKeptLayoutPage() {
  return (
    <Suspense>
      <KeptLayoutCell />
    </Suspense>
  );
}
