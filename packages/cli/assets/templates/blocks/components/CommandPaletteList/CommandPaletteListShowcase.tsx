// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  CommandPaletteList,
  CommandPaletteGroup,
  CommandPaletteItem,
} from '@astryxdesign/core/CommandPalette';
import {useToast} from '@astryxdesign/core/Toast';

export default function CommandPaletteListShowcase() {
  const showToast = useToast();
  return (
    <CommandPaletteList>
      <CommandPaletteGroup heading="Navigation">
        <CommandPaletteItem
          value="home"
          onSelect={() => showToast({body: 'Demo: Home would open here'})}>
          Go Home
        </CommandPaletteItem>
        <CommandPaletteItem
          value="settings"
          onSelect={() => showToast({body: 'Demo: settings would open here'})}>
          Open Settings
        </CommandPaletteItem>
        <CommandPaletteItem
          value="profile"
          onSelect={() =>
            showToast({body: 'Demo: your profile would open here'})
          }>
          View Profile
        </CommandPaletteItem>
      </CommandPaletteGroup>
      <CommandPaletteGroup heading="Actions">
        <CommandPaletteItem
          value="new-file"
          onSelect={() =>
            showToast({body: 'Demo: a new file would be created here'})
          }>
          New File
        </CommandPaletteItem>
        <CommandPaletteItem
          value="search"
          isHighlighted
          onSelect={() =>
            showToast({body: 'Demo: file search would open here'})
          }>
          Search Files
        </CommandPaletteItem>
        <CommandPaletteItem
          value="save"
          onSelect={() =>
            showToast({body: 'Demo: all files would be saved here'})
          }>
          Save All
        </CommandPaletteItem>
      </CommandPaletteGroup>
    </CommandPaletteList>
  );
}
