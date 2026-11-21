// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  CommandPaletteList,
  CommandPaletteItem,
} from '@astryxdesign/core/CommandPalette';
import {useToast} from '@astryxdesign/core/Toast';

export default function CommandPaletteListBasic() {
  const showToast = useToast();
  return (
    <CommandPaletteList>
      <CommandPaletteItem
        value="home"
        onSelect={() => showToast({body: 'Demo: Home would open here'})}>
        Go Home
      </CommandPaletteItem>
      <CommandPaletteItem
        value="settings"
        isHighlighted
        onSelect={() => showToast({body: 'Demo: settings would open here'})}>
        Open Settings
      </CommandPaletteItem>
      <CommandPaletteItem
        value="profile"
        isSelected
        onSelect={() =>
          showToast({body: 'Demo: your profile would open here'})
        }>
        View Profile
      </CommandPaletteItem>
      <CommandPaletteItem value="help" isDisabled onSelect={() => {}}>
        Help (unavailable)
      </CommandPaletteItem>
    </CommandPaletteList>
  );
}
