// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PresentedHitTestingLab.tsx
 * @input Touches on a sheet that springs up over a full-page scrim, the
 *   Replay button and the correction switch
 * @output PresentedHitTestingLab: the sheet, its Done button and the scrim,
 *   driven by the gesture host and the motion animator, with readouts of what
 *   the engine hit-tested at each touch-down, Done's clicks, the scrim's taps,
 *   the sheet pan's translation and how far the page scrolled in the last
 *   touch. A checkbox turns the host's presented hit testing off.
 * @position A device-check harness for the gesture host's presented hit
 *   testing. The Storybook story "Core/Gestures/Presented hit testing"
 *   renders it, so a phone can open it on a preview. Not exported.
 */

import {useCallback, useEffect, useRef, useState, type TouchEvent} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '../Button/Button';
import {Heading} from '../Heading/Heading';
import {HStack} from '../HStack/HStack';
import {Text} from '../Text/Text';
import {VStack} from '../VStack/VStack';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {
  createMotionEngine,
  defaultPrefersReducedMotion,
} from '../motion/animator';
import {isIosWebKit} from '../utils/touchQueries';
import {GestureHost} from '../gestures/GestureHost';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';

/**
 * The sheet's spring: critically damped like UIKit's sheet, slowed from
 * about a 0.5 s response to 3 s so a finger can land on it while it moves.
 */
const SPRING = {response: 3, dampingRatio: 1} as const;

/** How many of the latest events the log shows. */
const LOG_LENGTH = 3;

/** Rows behind the scrim, so the page can scroll. */
const ROWS = Array.from({length: 40}, (_, index) => index + 1);

type Animator = ReturnType<typeof createMotionEngine>;

const s = stylex.create({
  page: {
    minHeight: '100vh',
    backgroundColor: colorVars['--color-background-surface'],
  },
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    backgroundColor: colorVars['--color-background-surface'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  rows: {
    padding: spacingVars['--spacing-4'],
  },
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 1,
    backgroundColor: colorVars['--color-overlay'],
  },
  sheet: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 2,
    height: 240,
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
    borderStartStartRadius: radiusVars['--radius-element'],
    borderStartEndRadius: radiusVars['--radius-element'],
    boxShadow: shadowVars['--shadow-high'],
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
  const sheetRef = useRef<HTMLElement | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const animatorRef = useRef<Animator | null>(null);
  const scrollAtTouchRef = useRef<number | null>(null);
  const [correction, setCorrection] = useState(true);
  // Storybook renders this on the client only, so the engine and the
  // motion setting can be read on the first render.
  const [iosWebKit] = useState(() => isIosWebKit());
  const [reducedMotion] = useState(() => defaultPrefersReducedMotion());
  const [log, setLog] = useState<ReadonlyArray<string>>([]);
  const [doneClicks, setDoneClicks] = useState(0);
  const [scrimTaps, setScrimTaps] = useState(0);
  const [panY, setPanY] = useState(0);
  const [scrolled, setScrolled] = useState<number | null>(null);

  const record = useCallback((line: string) => {
    const at = (performance.now() / 1000).toFixed(2);
    setLog(lines => [`${at} s: ${line}`, ...lines].slice(0, LOG_LENGTH));
  }, []);

  // The animator lives as long as the sheet element.
  const attachSheet = useCallback((sheet: HTMLElement | null) => {
    if (sheet == null) {
      return undefined;
    }
    sheetRef.current = sheet;
    const animator = createMotionEngine(sheet);
    animatorRef.current = animator;
    return () => {
      animator.dispose();
      animatorRef.current = null;
      sheetRef.current = null;
    };
  }, []);

  // The page root logs the engine's own target: no host changes it. On iOS
  // WebKit a touch on the moving sheet targets the scrim, so a handler on the
  // sheet would miss it.
  const onTouchStartCapture = (event: TouchEvent<HTMLDivElement>) => {
    const parts = {
      done: doneRef.current,
      sheet: sheetRef.current,
      scrim: scrimRef.current,
    };
    record(`touch-down: the engine hit-tested ${partOf(event.target, parts)}`);
    if (event.touches.length === 1) {
      scrollAtTouchRef.current = window.scrollY;
    }
  };
  const onTouchFinishCapture = (event: TouchEvent<HTMLDivElement>) => {
    const start = scrollAtTouchRef.current;
    if (start == null || event.touches.length > 0) {
      return;
    }
    setScrolled(Math.round(Math.abs(window.scrollY - start)));
    scrollAtTouchRef.current = null;
  };

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

  const replay = () => {
    const animator = animatorRef.current;
    const sheet = sheetRef.current;
    if (animator == null || sheet == null) {
      return;
    }
    animator.set({y: sheet.offsetHeight + 48});
    animator.animate({y: 0}, {spring: SPRING});
    record('Replay: the sheet springs up');
  };

  const engine = iosWebKit
    ? 'engine: iOS WebKit, so the correction applies'
    : 'engine: not iOS WebKit, so the switch changes nothing here';

  return (
    <div
      onTouchStartCapture={onTouchStartCapture}
      onTouchEndCapture={onTouchFinishCapture}
      onTouchCancelCapture={onTouchFinishCapture}
      {...stylex.props(s.page)}>
      <VStack gap={1} xstyle={s.bar}>
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={1}>Presented hit testing</Heading>
          <HStack gap={3} vAlign="center">
            {/* A native checkbox, not Core's Switch: the Switch attaches to
                the document's shared gesture host, which would resolve the
                moving sheet before this page's host and hide the correction. */}
            <label>
              <input
                type="checkbox"
                checked={correction}
                onChange={event => {
                  setCorrection(event.currentTarget.checked);
                }}
              />{' '}
              Correction
            </label>
            <Button
              label="Replay"
              variant="primary"
              size="sm"
              onClick={replay}
            />
          </HStack>
        </HStack>
        {reducedMotion ? (
          <Text type="supporting" color="primary">
            Reduce Motion is on, so the sheet does not move and there is nothing
            to check. Turn Reduce Motion off and reload.
          </Text>
        ) : (
          <Text type="supporting">
            Press Replay, then tap Done or drag the sheet down while it rises (
            {engine}).
          </Text>
        )}
        <Text type="supporting" color="primary">
          Done clicked {doneClicks} · scrim took {scrimTaps} · pan {panY} px ·
          page scrolled {scrolled == null ? '–' : `${scrolled} px`} in the last
          touch
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
      <section ref={attachSheet} aria-label="Sheet" {...stylex.props(s.sheet)}>
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
