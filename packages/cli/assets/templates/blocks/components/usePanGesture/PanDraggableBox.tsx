// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {usePanGesture} from '@astryxdesign/core/hooks';
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
  box: {cursor: 'grab'},
  // Let go, the box springs back, unless the person reduces motion.
  springBack: {
    transition: {
      default: `translate ${durationVars['--duration-medium']} ${easeVars['--ease-move']}`,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  drag: (x: number, y: number) => ({translate: `${x}px ${y}px`}),
});

export default function PanDraggableBox() {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState({x: 0, y: 0, held: false});
  usePanGesture(box, {
    onPan: ({state, translation}) => {
      const held = state === 'began' || state === 'changed';
      setDrag(held ? {...translation, held} : {x: 0, y: 0, held});
    },
  });
  return (
    <Center width="min(320px, 80vw)" height={200} xstyle={styles.stage}>
      <Card
        ref={box}
        padding={6}
        elevation="med"
        xstyle={[
          styles.box,
          styles.drag(drag.x, drag.y),
          !drag.held && styles.springBack,
        ]}>
        Drag me
      </Card>
    </Center>
  );
}
