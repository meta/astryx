// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, useRef, useState, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import {createPanGesture} from '@astryxdesign/core';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {HStack} from '@astryxdesign/core/HStack';
import {usePanGesture, type PanGestureEvent} from '@astryxdesign/core/hooks';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  // A wash under the stage, so the box on top reads in light and dark themes.
  stage: {
    backgroundColor: colorVars['--color-neutral'],
    borderRadius: radiusVars['--radius-container'],
  },
  box: {cursor: 'grab', userSelect: 'none'},
  // Let go, the box springs back, unless the person reduces motion.
  springBack: {
    transition: {
      default: `translate ${durationVars['--duration-medium']} ${easeVars['--ease-move']}`,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  drag: (x: number, y: number) => ({translate: `${x}px ${y}px`}),
});

type Drag = {x: number; y: number; held: boolean};
const REST: Drag = {x: 0, y: 0, held: false};

/** The box follows a held drag and goes back to rest when it ends. */
function nextDrag({state, translation}: PanGestureEvent): Drag {
  const held = state === 'began' || state === 'changed';
  return held ? {...translation, held} : REST;
}

/** The same stage and card for both forms; the card names its API. */
function DraggableBox(props: {
  name: string;
  ref: Ref<HTMLDivElement>;
  drag: Drag;
}) {
  const {name, ref, drag} = props;
  return (
    <Center width="min(280px, 80vw)" height={180} xstyle={styles.stage}>
      <Card
        ref={ref}
        padding={6}
        elevation="med"
        xstyle={[
          styles.box,
          styles.drag(drag.x, drag.y),
          !drag.held && styles.springBack,
        ]}>
        {name}
      </Card>
    </Center>
  );
}

function WithHook() {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(REST);
  usePanGesture(box, {onPan: event => setDrag(nextDrag(event))});
  return <DraggableBox name="usePanGesture" ref={box} drag={drag} />;
}

function WithFactory() {
  const [drag, setDrag] = useState(REST);
  // A callback ref: its cleanup takes the pan down with the box.
  const draggable = useCallback((box: HTMLDivElement | null) => {
    if (box == null) {
      return undefined;
    }
    const pan = createPanGesture(box, {
      onPan: event => setDrag(nextDrag(event)),
    });
    return () => pan.destroy();
  }, []);
  return <DraggableBox name="createPanGesture" ref={draggable} drag={drag} />;
}

export default function PanDraggableBox() {
  return (
    <HStack gap={6} wrap="wrap" justify="center">
      <WithHook />
      <WithFactory />
    </HStack>
  );
}
