// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  CommandPaletteList,
  CommandPaletteGroup,
  CommandPaletteItem,
} from '@astryxdesign/core/CommandPalette';
import {useToast} from '@astryxdesign/core/Toast';

export default function CommandPaletteGroupBasic() {
  const showToast = useToast();
  return (
    <CommandPaletteList>
      <CommandPaletteGroup heading="Navigation">
        <CommandPaletteItem
          value="home"
          onSelect={() => showToast({body: 'Demo: Home would open here'})}>
          Go to Home
        </CommandPaletteItem>
        <CommandPaletteItem
          value="dashboard"
          onSelect={() =>
            showToast({body: 'Demo: the dashboard would open here'})
          }>
          Go to Dashboard
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
          value="save-all"
          onSelect={() =>
            showToast({body: 'Demo: all files would be saved here'})
          }>
          Save All
        </CommandPaletteItem>
      </CommandPaletteGroup>
    </CommandPaletteList>
  );
}
