// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, type KeyboardEvent} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useKeyboardHint} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack} from '@astryxdesign/core/Layout';
import {StarIcon as StarOutline} from '@heroicons/react/24/outline';
import {StarIcon as StarSolid} from '@heroicons/react/24/solid';

const STARS = [1, 2, 3, 4, 5];

export default function UseKeyboardHintHookUsage() {
  const [rating, setRating] = useState(0);
  // Left and Right move the rating, so the hint shows ← →.
  const hint = useKeyboardHint({orientation: 'horizontal'});

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Dismisses the hint on the first arrow press; never prevents the key.
    hint.onKeyDown(e);
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      return;
    }
    e.preventDefault();
    const isRtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = (e.key === 'ArrowRight') !== isRtl ? 1 : -1;
    const stars = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
    );
    const current = stars.indexOf(e.target as HTMLElement);
    const next = Math.min(stars.length - 1, Math.max(0, current + step));
    setRating(next + 1);
    stars[next].focus();
  };

  return (
    <Card padding={4}>
      <HStack
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
