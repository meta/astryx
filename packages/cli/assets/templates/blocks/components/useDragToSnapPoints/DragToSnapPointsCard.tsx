// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useLayoutEffect, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useDragToSnapPoints} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';

const PLACES = ['Hand', 'Table', 'Discard pile'];
/** How far along the row each place sits, in px from where the card rests. */
const STEPS = [0, 110, 220];

export default function DragToSnapPointsCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(0);
  // The places run in reading order: leftward in a right-to-left layout,
  // where the snap points are negative and so sort the other way round
  // (design:bidirectionality DR13). The direction is the one the card
  // renders in (architecture:internationalization INV11).
  const [isRtl, setIsRtl] = useState(false);
  useLayoutEffect(() => {
    if (ref.current != null) {
      setIsRtl(getComputedStyle(ref.current).direction === 'rtl');
    }
  }, []);
  const placeAt = (index: number) => (isRtl ? STEPS.length - 1 - index : index);
  const {settleTo} = useDragToSnapPoints(ref, {
    axis: 'x',
    snapPoints: isRtl ? STEPS.map(step => -step) : STEPS,
    onSettle: index => setPlace(placeAt(index)),
  });

  return (
    <VStack gap={4} style={{maxWidth: 380, padding: 16}}>
      <Text type="body">
        Drag the card sideways and let go: it settles on the nearest place, or
        the next one after a quick flick.
      </Text>
      <HStack gap={2} style={{height: 150, alignItems: 'center'}}>
        <Card
          ref={ref}
          width={96}
          minHeight={136}
          style={{touchAction: 'none', cursor: 'grab', userSelect: 'none'}}
          aria-label={`Queen of hearts, on the ${PLACES[place].toLowerCase()}`}>
          <VStack gap={1} hAlign="center" style={{paddingBlock: 32}}>
            <Text type="display-2" weight="bold">
              Q
            </Text>
            <Text type="display-3">{'\u2665'}</Text>
          </VStack>
        </Card>
      </HStack>
      <HStack gap={2}>
        {PLACES.map((name, index) => (
          <Button
            key={name}
            label={name}
            variant={index === place ? 'primary' : 'secondary'}
            onClick={() => settleTo(placeAt(index))}
          />
        ))}
      </HStack>
      <VisuallyHidden as="div" aria-live="polite">
        {`The card is on the ${PLACES[place].toLowerCase()}.`}
      </VisuallyHidden>
    </VStack>
  );
}
