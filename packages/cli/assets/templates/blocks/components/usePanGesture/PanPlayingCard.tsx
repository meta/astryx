// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {useAnnounce, usePanGesture} from '@astryxdesign/core/hooks';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const DECK = [
  {face: 'A\u2660', name: 'Ace of spades'},
  {face: 'K\u2665', name: 'King of hearts'},
  {face: 'Q\u2663', name: 'Queen of clubs'},
  {face: 'J\u2666', name: 'Jack of diamonds'},
];
/** A release faster than this (px/s) throws the card away. */
const THROW_SPEED = 1000;
/** How far a thrown card travels while it fades, px. */
const THROW_DISTANCE = 160;
const EXIT = `${durationVars['--duration-exit']} ${easeVars['--ease-exit']}`;

const styles = stylex.create({
  // A wash under the stage, so the card on top reads in light and dark themes.
  stage: {
    backgroundColor: colorVars['--color-neutral'],
    borderRadius: radiusVars['--radius-container'],
    overflow: 'hidden',
  },
  card: {cursor: 'grab', userSelect: 'none'},
  // A gentle release settles the card back, unless the person reduces motion.
  settle: {
    transition: {
      default: `translate ${durationVars['--duration-medium']} ${easeVars['--ease-move']}`,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  // A flick throws it off to one side as it fades.
  thrown: {
    opacity: 0,
    transition: {
      default: `translate ${EXIT}, opacity ${EXIT}`,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  drag: (x: number, y: number) => ({translate: `${x}px ${y}px`}),
});

type Pose = {x: number; y: number; motion: 'rest' | 'settle' | 'thrown'};

export default function PanPlayingCard() {
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [pose, setPose] = useState<Pose>({x: 0, y: 0, motion: 'rest'});
  const announce = useAnnounce();
  /** A throw is in flight: the next card is dealt when it ends. */
  const throwing = useRef(false);
  /** The drag in progress met a throw: the rest of it moves nothing. */
  const ignoringDrag = useRef(false);
  const shown = DECK[top % DECK.length];

  function discard(direction: number) {
    const element = card.current;
    // One throw at a time: a second Discard during it would deal twice.
    if (element == null || throwing.current) {
      return;
    }
    throwing.current = true;
    ignoringDrag.current = true;
    setPose({x: direction * THROW_DISTANCE, y: 0, motion: 'thrown'});
    // The next card's face and its place at the center commit together.
    const dealNext = () => {
      throwing.current = false;
      announce(`${shown.name} discarded`);
      setTop(value => value + 1);
      setPose({x: 0, y: 0, motion: 'rest'});
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dealNext();
      return;
    }
    // Once the throw's style applies, deal when its transitions settle: at
    // the theme's duration, or at once when a stylesheet stops them.
    requestAnimationFrame(() => {
      const ends = element.getAnimations().map(animation => animation.finished);
      void Promise.allSettled(ends).then(dealNext);
    });
  }

  usePanGesture(card, {
    onPan: ({state, translation, velocity}) => {
      // A drag that meets a throw is ignored to its end, or the next card
      // would jump to it.
      if (state === 'began') {
        ignoringDrag.current = throwing.current;
      }
      if (ignoringDrag.current) {
        return;
      }
      if (state === 'began' || state === 'changed') {
        setPose({...translation, motion: 'rest'});
      } else if (state === 'ended' && Math.abs(velocity.x) > THROW_SPEED) {
        discard(Math.sign(velocity.x));
      } else {
        setPose({x: 0, y: 0, motion: 'settle'});
      }
    },
  });

  return (
    <VStack gap={4} padding={4} width="min(360px, 80vw)">
      <Center height={280} xstyle={styles.stage}>
        <Card
          ref={card}
          // An image's name is all a screen reader announces, so it names the
          // card.
          role="img"
          aria-label={shown.name}
          width={80}
          height={112}
          elevation="med"
          xstyle={[
            styles.card,
            styles.drag(pose.x, pose.y),
            pose.motion !== 'rest' && styles[pose.motion],
          ]}>
          <Center height="100%">
            <Text size="3xl" weight="bold">
              {shown.face}
            </Text>
          </Center>
        </Card>
      </Center>
      {/* The drag's keyboard and assistive-technology path (WCAG 2.5.7). */}
      <Button label="Discard the top card" onClick={() => discard(1)} />
    </VStack>
  );
}
