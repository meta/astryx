// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PresentedHitTestingLab.tsx
 * @input Touches on a sheet that springs up over a full-page scrim, the
 *   Replay button and the correction switch
 * @output The sheet, its Done button and the scrim, driven by Core's gesture
 *   host and animator, with readouts of what the engine hit-tested at each
 *   touch-down, Done's clicks, the scrim's taps, the sheet pan's translation
 *   and how far the page scrolled during the last touch on the sheet. The
 *   switch turns the host's presented hit testing off, as the control.
 * @position app/lab/presented-hit-testing: the one docsite module that
 *   imports `@astryxdesign/core/internal/touch` (eslint.config.js names it)
 *
 * iOS WebKit hit-tests an element a compositor animation moves where the
 * motion started, so mid-motion a finger on the drawn Done reaches the scrim
 * under it. With the correction on, the host sends the touch to what is drawn
 * under the finger (FR11: Done clicks once, the scrim takes nothing) and keeps
 * a drag on the moving sheet from scrolling the page (FR19). Other engines
 * already hit-test the drawn sheet, so the switch changes nothing there.
 */

'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  createAnimator,
  GestureHost,
  isIosWebKit,
  PanGestureRecognizer,
  TapGestureRecognizer,
} from '@astryxdesign/core/internal/touch';

/**
 * The sheet's spring: critically damped like UIKit's sheet, slowed from
 * about a 0.5 s response to 3 s so a finger can land on it while it moves.
 */
const SPRING = {response: 3, dampingRatio: 1} as const;

/** How many of the latest events the log shows. */
const LOG_LENGTH = 3;

/** Rows behind the scrim, so the page can scroll. */
const ROWS = Array.from({length: 40}, (_, index) => index + 1);

type Animator = ReturnType<typeof createAnimator>;

const s = stylex.create({
  page: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-background-surface)',
  },
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    paddingBlock: 'var(--spacing-2)',
    paddingInline: 'var(--spacing-3)',
    backgroundColor: 'var(--color-background-surface)',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  rows: {
    padding: 'var(--spacing-4)',
  },
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 1,
    backgroundColor: 'var(--color-overlay)',
  },
  sheet: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 2,
    height: 240,
    padding: 'var(--spacing-4)',
    backgroundColor: 'var(--color-background-surface)',
    borderTopLeftRadius: 'var(--radius-element)',
    borderTopRightRadius: 'var(--radius-element)',
    boxShadow: 'var(--shadow-high)',
  },
});

/** Which part of the lab `target` is in, for the log. */
function partOf(
  target: EventTarget | null,
  parts: {
    done: HTMLElement | null;
    sheet: HTMLElement | null;
    scrim: HTMLElement | null;
  },
): string {
  if (!(target instanceof Node)) {
    return 'nothing';
  }
  if (parts.done?.contains(target) === true) {
    return 'Done';
  }
  if (parts.sheet?.contains(target) === true) {
    return 'the sheet';
  }
  if (parts.scrim?.contains(target) === true) {
    return 'the scrim';
  }
  return 'the page';
}

export function PresentedHitTestingLab() {
  const scrimRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const animatorRef = useRef<Animator | null>(null);
  const scrollAtTouchRef = useRef<number | null>(null);
  const [correction, setCorrection] = useState(true);
  const [iosWebKit, setIosWebKit] = useState<boolean | null>(null);
  const [log, setLog] = useState<ReadonlyArray<string>>([]);
  const [doneClicks, setDoneClicks] = useState(0);
  const [scrimTaps, setScrimTaps] = useState(0);
  const [panY, setPanY] = useState(0);
  const [scrolled, setScrolled] = useState<number | null>(null);

  const record = useCallback((line: string) => {
    const at = (performance.now() / 1000).toFixed(2);
    setLog(lines => [`${at} s: ${line}`, ...lines].slice(0, LOG_LENGTH));
  }, []);

  // Reads the engine once mounted: the check needs the browser's CSS.
  useEffect(() => {
    setIosWebKit(isIosWebKit());
  }, []);

  // Owns the sheet's animator for the page's life.
  useEffect(() => {
    const animator = createAnimator(sheetRef.current);
    animatorRef.current = animator;
    return () => {
      animator.dispose();
      animatorRef.current = null;
    };
  }, []);

  // Logs what the engine hit-tested at each touch-down, before the host
  // corrects anything.
  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      const parts = {
        done: doneRef.current,
        sheet: sheetRef.current,
        scrim: scrimRef.current,
      };
      record(
        `touch-down: the engine hit-tested ${partOf(event.target, parts)}`,
      );
    };
    document.addEventListener('touchstart', onTouchStart, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, {capture: true});
    };
  }, [record]);

  // Drives the scrim's tap and the sheet's pan through a gesture host with
  // the correction on (`auto`: iOS WebKit only) or off, rebuilt on a switch.
  useEffect(() => {
    const scrim = scrimRef.current;
    const sheet = sheetRef.current;
    if (scrim == null || sheet == null) {
      return;
    }
    const host = new GestureHost(document, {
      presentedHitTesting: correction ? 'auto' : 'never',
    });
    const scrimTap = new TapGestureRecognizer({name: 'scrim'});
    const sheetPan = new PanGestureRecognizer({
      name: 'sheet',
      direction: 'down',
    });
    let caughtAt: number | null = null;
    const stopTap = scrimTap.addTransitionListener((_recognizer, _from, to) => {
      if (to === 'ended') {
        setScrimTaps(count => count + 1);
        record('the scrim took a tap');
      }
    });
    const stopPan = sheetPan.addListener(recognizer => {
      const animator = animatorRef.current;
      if (animator == null) {
        return;
      }
      if (recognizer.state === 'began') {
        // The pan catches the sheet where it is drawn and holds it there.
        caughtAt = animator.get('y');
        animator.set({y: caughtAt});
        record('the sheet’s pan began');
      } else if (recognizer.state === 'changed' && caughtAt != null) {
        const translation = recognizer.translation().y;
        animator.set({y: Math.max(0, caughtAt + translation)});
        setPanY(Math.round(translation));
      } else if (
        (recognizer.state === 'ended' || recognizer.state === 'cancelled') &&
        caughtAt != null
      ) {
        caughtAt = null;
        record(`the sheet’s pan ${recognizer.state}`);
        animator.animate({y: 0}, {spring: SPRING});
      }
    });
    const detachScrim = host.attach(scrim, scrimTap);
    const detachSheet = host.attach(sheet, sheetPan);
    return () => {
      detachScrim();
      detachSheet();
      stopTap();
      stopPan();
    };
  }, [correction, record]);

  const replay = useCallback(() => {
    const animator = animatorRef.current;
    const sheet = sheetRef.current;
    if (animator == null || sheet == null) {
      return;
    }
    animator.set({y: sheet.offsetHeight + 48});
    animator.animate({y: 0}, {spring: SPRING});
    record('Replay: the sheet springs up');
  }, [record]);

  const engine =
    iosWebKit == null
      ? 'engine: reading…'
      : iosWebKit
        ? 'engine: iOS WebKit, so the correction applies'
        : 'engine: not iOS WebKit, so the switch changes nothing here';

  return (
    <div {...stylex.props(s.page)}>
      <VStack gap={1} xstyle={s.bar}>
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={1}>Presented hit testing</Heading>
          <HStack gap={3} vAlign="center">
            <Switch
              label="Correction"
              value={correction}
              onChange={setCorrection}
              size="sm"
            />
            <Button
              label="Replay"
              variant="primary"
              size="sm"
              onClick={replay}
            />
          </HStack>
        </HStack>
        <Text type="supporting">
          Press Replay, then tap Done or drag the sheet down while it rises (
          {engine}).
        </Text>
        <Text type="supporting" color="primary">
          Done clicked {doneClicks} · scrim took {scrimTaps} · pan {panY} px ·
          page scrolled {scrolled == null ? '–' : `${scrolled} px`} in the last
          touch on the sheet
        </Text>
        <VStack gap={0}>
          {log.map(line => (
            <Text key={line} type="code" size="xsm">
              {line}
            </Text>
          ))}
        </VStack>
      </VStack>
      <VStack gap={2} xstyle={s.rows}>
        {ROWS.map(row => (
          <Text key={row} color="secondary">
            Row {row} of the page behind the sheet
          </Text>
        ))}
      </VStack>
      <div ref={scrimRef} aria-hidden={true} {...stylex.props(s.scrim)} />
      <section
        ref={sheetRef}
        aria-label="Sheet"
        onTouchStart={() => {
          scrollAtTouchRef.current = window.scrollY;
        }}
        onTouchEnd={() => {
          const start = scrollAtTouchRef.current;
          if (start != null) {
            setScrolled(Math.round(Math.abs(window.scrollY - start)));
          }
          scrollAtTouchRef.current = null;
        }}
        {...stylex.props(s.sheet)}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" hAlign="between">
            <Heading level={2}>Sheet</Heading>
            <div ref={doneRef}>
              <Button
                label="Done"
                onClick={() => {
                  setDoneClicks(count => count + 1);
                  record('Done clicked');
                }}
              />
            </div>
          </HStack>
          <Text type="supporting">
            Drag me down while I move: the pan catches me where I am drawn.
          </Text>
        </VStack>
      </section>
    </div>
  );
}
