// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {usePressFeedback} from '@astryxdesign/core/hooks';
import {
  focusOutlineStyles,
  interactionOverlayStyles,
} from '@astryxdesign/core/utils';
import {PlayingCardContents} from '@astryx-docs/demo-content';

export default function UsePressFeedbackHookUsage() {
  const pressable = usePressFeedback();
  const [isFaceUp, setIsFaceUp] = useState(true);
  const flip = () => setIsFaceUp(faceUp => !faceUp);

  return (
    <Card
      {...pressable}
      xstyle={[
        interactionOverlayStyles.backgroundImage,
        focusOutlineStyles.focusVisible,
      ]}
      width={160}
      role="button"
      tabIndex={0}
      aria-label="Flip card"
      aria-pressed={!isFaceUp}
      onClick={flip}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          flip();
        }
      }}>
      <PlayingCardContents rank="Q" suit="hearts" faceDown={!isFaceUp} />
    </Card>
  );
}
