// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Stack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {
  StarIcon as StarOutline,
  BookmarkIcon as BookmarkOutline,
  NotificationIcon,
  NotificationOffIcon,
} from '@astryxdesign/template-icons';
import {
  StarIcon as StarSolid,
  BookmarkIcon as BookmarkSolid,
} from '@astryxdesign/template-icons/24/solid';

export default function ToggleButtonShowcase() {
  const [isFavorited, setIsFavorited] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  return (
    <Stack direction="horizontal" gap={3} vAlign="center">
      <ToggleButton
        label="Favorite"
        icon={<Icon icon={StarOutline} />}
        pressedIcon={<Icon icon={StarSolid} />}
        isPressed={isFavorited}
        onPressedChange={setIsFavorited}
        isIconOnly
      />
      <ToggleButton
        label="Bookmark"
        icon={<Icon icon={BookmarkOutline} />}
        pressedIcon={<Icon icon={BookmarkSolid} />}
        isPressed={isBookmarked}
        onPressedChange={setIsBookmarked}
        isIconOnly
      />
      <ToggleButton
        label="Notifications"
        icon={<Icon icon={NotificationIcon} />}
        pressedIcon={<Icon icon={NotificationOffIcon} />}
        isPressed={isMuted}
        onPressedChange={setIsMuted}>
        Notifications
      </ToggleButton>
    </Stack>
  );
}
