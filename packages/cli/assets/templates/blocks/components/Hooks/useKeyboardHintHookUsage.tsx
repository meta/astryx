// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, type KeyboardEvent} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useKeyboardHint, useListFocus} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack} from '@astryxdesign/core/Layout';
import {StarIcon as StarOutline} from '@heroicons/react/24/outline';
import {StarIcon as StarSolid} from '@heroicons/react/24/solid';

const STARS = [1, 2, 3, 4, 5];

export default function UseKeyboardHintHookUsage() {
  const [rating, setRating] = useState(0);
  // Left and Right move the rating, so the hint shows ← →.
  const hint = useKeyboardHint({orientation: 'horizontal'});
  // Moves focus between the stars, right-to-left aware and stopping at the
  // ends; the tab stop stays with the checked star below.
  const list = useListFocus<HTMLElement>({
    itemSelector: '[role="radio"]',
    orientation: 'horizontal',
    wrap: false,
    hasHomeEnd: false,
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Dismisses the hint on the first arrow press; never prevents the key.
    hint.onKeyDown(e);
    list.handleKeyDown(e);
    // The hook prevents the arrows it handled, so the rating follows focus.
    if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      e.defaultPrevented
    ) {
      setRating(
        list.getItems().indexOf(document.activeElement as HTMLElement) + 1,
      );
    }
  };

  return (
    <Card padding={4}>
      <HStack
        ref={list.listRef}
        gap={1}
        role="radiogroup"
        aria-label="Rating"
        onFocus={hint.onFocus}
        onBlur={hint.onBlur}
        onKeyDown={handleKeyDown}>
        {STARS.map(star => (
          <Button
            key={star}
            role="radio"
            aria-checked={star === rating}
            // One Tab stop: the checked star, or the first while unrated.
            tabIndex={star === Math.max(rating, 1) ? 0 : -1}
            label={star === 1 ? '1 star' : `${star} stars`}
            variant="ghost"
            isIconOnly
            icon={<Icon icon={star <= rating ? StarSolid : StarOutline} />}
            onClick={() => setRating(star)}
          />
        ))}
        {hint.hintElement}
      </HStack>
    </Card>
  );
}
