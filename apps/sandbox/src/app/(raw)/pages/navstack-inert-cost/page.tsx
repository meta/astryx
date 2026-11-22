// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?rows=<n>` (the covered list's rows, 2,200 by default),
 *   `?overscan=<n>` (the rows it renders past each edge of the viewport, 60
 *   by default) and `?turns=<n>` (the transcript's turns, 100 by default)
 * @output A full-page NavigationStack with a pushed transcript over a covered
 *   windowed list. "Run" times setting and removing `inert`,
 *   `pointer-events: none` and `aria-hidden` on each screen, and lists the
 *   medians with the browser's user agent
 * @position A raw page for isolating the covered screens during a change,
 *   run on a physical phone. Per round, 20 on/off pairs, with
 *   style and layout forced before and after each toggle; 7 rounds, the first
 *   dropped; the upper median of the other 6
 */

import {Suspense, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {NavigationScreen, NavigationStack} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {ListItem} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {
  cardOf,
  queryNumber,
  Readout,
  Stage,
  WindowedList,
} from '../../navigationStackCells';

const PAGE = '/sandbox/pages/navstack-inert-cost/';
const ROUNDS = 7;
const PAIRS = 20;

type Shape = 'inert' | 'pointerEventsNone' | 'ariaHidden';

const SHAPES: Record<Shape, (target: HTMLElement, on: boolean) => void> = {
  inert: (target, on) => {
    if (on) {
      target.setAttribute('inert', '');
    } else {
      target.removeAttribute('inert');
    }
  },
  pointerEventsNone: (target, on) => {
    target.style.pointerEvents = on ? 'none' : '';
  },
  ariaHidden: (target, on) => {
    if (on) {
      target.setAttribute('aria-hidden', 'true');
    } else {
      target.removeAttribute('aria-hidden');
    }
  },
};

const upperMedian = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Times each shape on `target`; restores the target's own state after. */
function timeToggles(target: HTMLElement) {
  const force = () => {
    target.getBoundingClientRect();
    void document.documentElement.offsetHeight;
  };
  const had = {
    inert: target.hasAttribute('inert'),
    pointerEvents: target.style.pointerEvents,
    ariaHidden: target.getAttribute('aria-hidden'),
  };
  const measure = (apply: (target: HTMLElement, on: boolean) => void) => {
    const on: number[] = [];
    const off: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      let a = 0;
      let b = 0;
      for (let pair = 0; pair < PAIRS; pair += 1) {
        force();
        let start = performance.now();
        apply(target, true);
        force();
        a += performance.now() - start;
        start = performance.now();
        apply(target, false);
        force();
        b += performance.now() - start;
      }
      if (round > 0) {
        on.push(a / PAIRS);
        off.push(b / PAIRS);
      }
    }
    return {
      onMs: Math.round(upperMedian(on) * 100) / 100,
      offMs: Math.round(upperMedian(off) * 100) / 100,
    };
  };
  const shapes: Record<Shape, {onMs: number; offMs: number}> = {
    inert: measure(SHAPES.inert),
    pointerEventsNone: measure(SHAPES.pointerEventsNone),
    ariaHidden: measure(SHAPES.ariaHidden),
  };
  SHAPES.inert(target, had.inert);
  target.style.pointerEvents = had.pointerEvents;
  if (had.ariaHidden == null) {
    target.removeAttribute('aria-hidden');
  } else {
    target.setAttribute('aria-hidden', had.ariaHidden);
  }
  return {elements: target.querySelectorAll('*').length, shapes};
}

function InertCostCell() {
  const [params] = useSearchParams();
  const rows = queryNumber(params, 'rows', 2200);
  const turns = queryNumber(params, 'turns', 100);
  const overscan = queryNumber(params, 'overscan', 60);
  const [path, setPath] = useState<string[]>(['Transcript']);
  const [lines, setLines] = useState<string[]>([]);
  const run = () => {
    const out: string[] = [];
    for (const [label, key] of [
      [`covered list (${rows} rows)`, null],
      [`transcript (${turns} turns)`, 'Transcript'],
    ] as const) {
      const target = cardOf(key);
      if (target == null) {
        out.push(`${label}: no screen`);
        continue;
      }
      const {elements, shapes} = timeToggles(target);
      out.push(
        `${label}, ${elements} elements: inert ${shapes.inert.onMs} / ${shapes.inert.offMs} · pointer-events ${shapes.pointerEventsNone.onMs} / ${shapes.pointerEventsNone.offMs} · aria-hidden ${shapes.ariaHidden.onMs} / ${shapes.ariaHidden.offMs} ms (on / off)`,
      );
    }
    out.push(navigator.userAgent);
    setLines(out);
  };
  return (
    <>
      <Stage>
        <NavigationStack
          label="Inbox"
          root={
            <NavigationScreen title="Inbox" scroll="content">
              <WindowedList
                count={rows}
                overscan={overscan}
                renderRow={index => (
                  <ListItem
                    label={`Thread ${index + 1}`}
                    description="A covered row"
                  />
                )}
              />
            </NavigationScreen>
          }
          path={path}
          onPathChange={setPath}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen title={entry}>
              {Array.from({length: turns}, (_, index) => (
                <Text key={index} type="body">
                  <strong>
                    {index % 2 === 0 ? 'Question' : 'Answer'} {index + 1}:
                  </strong>{' '}
                  a turn of the conversation, long enough to wrap onto a second
                  line.
                </Text>
              ))}
            </NavigationScreen>
          )}
        />
      </Stage>
      <Readout
        links={[
          {label: '2,200 rows, 100 turns', href: PAGE},
          {label: '500 rows', href: `${PAGE}?rows=500`},
        ]}
        lines={[
          `Each figure: ms per toggle, the upper median of ${ROUNDS - 1} rounds of ${PAIRS} pairs`,
          ...lines,
        ]}>
        <Button label="Run" variant="primary" size="sm" onClick={run} />
      </Readout>
    </>
  );
}

export default function NavigationStackInertCostPage() {
  return (
    <Suspense>
      <InertCostCell />
    </Suspense>
  );
}
