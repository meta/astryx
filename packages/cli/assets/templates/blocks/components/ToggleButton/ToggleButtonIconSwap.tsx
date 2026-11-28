// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
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

export default function ToggleButtonIconSwap() {
  const [isFavorited, setIsFavorited] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        Outline → solid icon swap on press
      </Text>
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
          label={isMuted ? 'Unmute notifications' : 'Mute notifications'}
          icon={<Icon icon={NotificationIcon} />}
          pressedIcon={<Icon icon={NotificationOffIcon} />}
          isPressed={isMuted}
          onPressedChange={setIsMuted}
          isIconOnly
        />
      </Stack>
    </Stack>
  );
}
