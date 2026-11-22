// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?work=commit|frame` (where the extra work runs: in the change's
 *   commit, or from its first frame; commit by default) and `?ms=<n>` (how
 *   long, 300 by default)
 * @output A full-page NavigationStack with a ruler of travel marks over it.
 *   A row pushes, and "Back with work" pops, each with the extra work. The
 *   readout gives the first moved frame's travel on the page clock
 * @position A raw page for a change from rest that starts at its first
 *   frame, filmed on a physical phone: the first frame that shows the change
 *   must show it at its start
 */

import {Suspense, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationStack,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  busyFor,
  queryNumber,
  Readout,
  Ruler,
  Stage,
  useReadoutLines,
  watchFirstMove,
} from '../../navigationStackCells';

const PAGE = '/sandbox/pages/navstack-heavy-commit/';
const ITEMS = Array.from({length: 16}, (_, index) => `Item ${index + 1}`);
/** Runs the extra work in the commit that mounts the screen. */
function WorkInCommit({ms}: {ms: number}) {
  useLayoutEffect(() => {
    busyFor(ms);
  }, [ms]);
  return null;
}

function BackWithWork({
  work,
  ms,
  onPop,
}: {
  work: 'commit' | 'frame';
  ms: number;
  onPop: () => void;
}) {
  const nav = useNavigationStack<string>();
  return (
    <Button
      label="Back with work"
      variant="secondary"
      size="sm"
      onClick={() => {
        onPop();
        nav.pop();
        if (work === 'commit') {
          // In the tap's task, before the pop's commit is presented.
          busyFor(ms);
        } else {
          requestAnimationFrame(() => busyFor(ms));
        }
      }}
    />
  );
}

function HeavyCommitCell() {
  const [params] = useSearchParams();
  const work = params.get('work') === 'frame' ? 'frame' : 'commit';
  const ms = queryNumber(params, 'ms', 300);
  const [path, setPath] = useState<string[]>([]);
  const [lines, addLine] = useReadoutLines();
  const pending = useRef<{entry: string; push: boolean; at: number} | null>(
    null,
  );

  useEffect(() => {
    const change = pending.current;
    if (change == null) {
      return undefined;
    }
    pending.current = null;
    if (change.push && work === 'frame') {
      requestAnimationFrame(() => busyFor(ms));
    }
    return watchFirstMove(
      change.entry,
      change.at,
      width => (change.push ? width : 0),
      width => (change.push ? 0 : width),
      move =>
        addLine(
          `${change.push ? 'push' : 'pop'} ${change.entry}: first moved frame at ${Math.round(move.travel * 100)}% of its travel, ${move.ms} ms after the tap (page clock)`,
        ),
    );
  }, [path, addLine, work, ms]);

  return (
    <>
      <Ruler />
      <Stage>
        <NavigationStack
          label="Items"
          root={
            <NavigationScreen title="Items">
              <List>
                {ITEMS.map(entry => (
                  <ListItem
                    key={entry}
                    label={entry}
                    description={`Push with ${ms} ms of work ${work === 'commit' ? 'in its commit' : 'from its first frame'}`}
                    onClick={() => {
                      pending.current = {
                        entry,
                        push: true,
                        at: performance.now(),
                      };
                      setPath([entry]);
                    }}
                  />
                ))}
              </List>
            </NavigationScreen>
          }
          path={path}
          onPathChange={setPath}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen
              title={entry}
              endContent={
                <BackWithWork
                  work={work}
                  ms={ms}
                  onPop={() => {
                    pending.current = {
                      entry,
                      push: false,
                      at: performance.now(),
                    };
                  }}
                />
              }>
              {work === 'commit' ? <WorkInCommit ms={ms} /> : null}
              <List>
                {ITEMS.map(item => (
                  <ListItem key={item} label={`${entry}, ${item}`} />
                ))}
              </List>
            </NavigationScreen>
          )}
        />
      </Stage>
      <Readout
        links={[
          {label: 'work in the commit', href: `${PAGE}?work=commit`},
          {label: 'work from the first frame', href: `${PAGE}?work=frame`},
          {label: 'no work', href: `${PAGE}?ms=0`},
        ]}
        lines={[
          `${ms} ms of work ${work === 'commit' ? 'in the commit' : 'from the first frame'} · the first frame must show 0% of the travel`,
          ...lines,
        ]}
      />
    </>
  );
}

export default function NavigationStackHeavyCommitPage() {
  return (
    <Suspense>
      <HeavyCommitCell />
    </Suspense>
  );
}
