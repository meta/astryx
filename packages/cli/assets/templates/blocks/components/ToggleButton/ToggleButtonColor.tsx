// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  LinkIcon,
  StarIcon,
  BookmarkIcon,
  HeartIcon,
  NotificationIcon,
} from '@astryxdesign/template-icons';
import {
  BoldIcon as BoldSolid,
  ItalicIcon as ItalicSolid,
  UnderlineIcon as UnderlineSolid,
  StarIcon as StarSolid,
  BookmarkIcon as BookmarkSolid,
  HeartIcon as HeartSolid,
} from '@astryxdesign/template-icons/24/solid';

export default function ToggleButtonColor() {
  const [toolbar, setToolbar] = useState<Record<string, boolean>>({
    bold: true,
    italic: false,
    underline: true,
    strikethrough: false,
    link: false,
  });
  const toggleToolbar = (key: string) =>
    setToolbar(prev => ({...prev, [key]: !prev[key]}));

  const [reactions, setReactions] = useState<Record<string, boolean>>({
    star: false,
    heart: false,
    bookmark: true,
    bell: false,
  });
  const toggleReaction = (key: string) =>
    setReactions(prev => ({...prev, [key]: !prev[key]}));

  return (
    <Stack direction="vertical" gap={4}>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Toolbar
        </Text>
        <Stack direction="horizontal" gap={1}>
          <ToggleButton
            label="Bold"
            icon={<Icon icon={BoldIcon} color="secondary" />}
            pressedIcon={<Icon icon={BoldSolid} color="accent" />}
            isPressed={toolbar.bold}
            onPressedChange={() => toggleToolbar('bold')}
            isIconOnly
          />
          <ToggleButton
            label="Italic"
            icon={<Icon icon={ItalicIcon} color="secondary" />}
            pressedIcon={<Icon icon={ItalicSolid} color="accent" />}
            isPressed={toolbar.italic}
            onPressedChange={() => toggleToolbar('italic')}
            isIconOnly
          />
          <ToggleButton
            label="Underline"
            icon={<Icon icon={UnderlineIcon} color="secondary" />}
            pressedIcon={<Icon icon={UnderlineSolid} color="accent" />}
            isPressed={toolbar.underline}
            onPressedChange={() => toggleToolbar('underline')}
            isIconOnly
          />
          <ToggleButton
            label="Strikethrough"
            icon={<Icon icon={StrikethroughIcon} color="secondary" />}
            pressedIcon={<Icon icon={StrikethroughIcon} color="accent" />}
            isPressed={toolbar.strikethrough}
            onPressedChange={() => toggleToolbar('strikethrough')}
            isIconOnly
          />
          <ToggleButton
            label="Link"
            icon={<Icon icon={LinkIcon} color="secondary" />}
            pressedIcon={<Icon icon={LinkIcon} color="accent" />}
            isPressed={toolbar.link}
            onPressedChange={() => toggleToolbar('link')}
            isIconOnly
          />
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Reactions
        </Text>
        <Stack direction="horizontal" gap={2}>
          <ToggleButton
            label="Star"
            icon={<Icon icon={StarIcon} color="secondary" />}
            pressedIcon={<Icon icon={StarSolid} color="yellow" />}
            isPressed={reactions.star}
            onPressedChange={() => toggleReaction('star')}
            isIconOnly
          />
          <ToggleButton
            label="Like"
            icon={<Icon icon={HeartIcon} color="secondary" />}
            pressedIcon={<Icon icon={HeartSolid} color="red" />}
            isPressed={reactions.heart}
            onPressedChange={() => toggleReaction('heart')}
            isIconOnly
          />
          <ToggleButton
            label="Save"
            icon={<Icon icon={BookmarkIcon} color="secondary" />}
            pressedIcon={<Icon icon={BookmarkSolid} color="blue" />}
            isPressed={reactions.bookmark}
            onPressedChange={() => toggleReaction('bookmark')}
            isIconOnly
          />
          <ToggleButton
            label="Follow"
            icon={<Icon icon={NotificationIcon} color="secondary" />}
            pressedIcon={<Icon icon={NotificationIcon} color="accent" />}
            isPressed={reactions.bell}
            onPressedChange={() => toggleReaction('bell')}
            isIconOnly
          />
        </Stack>
      </Stack>
    </Stack>
  );
}
