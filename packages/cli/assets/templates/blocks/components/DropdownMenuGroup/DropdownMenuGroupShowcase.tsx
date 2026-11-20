// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu';
import {useToast} from '@astryxdesign/core/Toast';

export default function DropdownMenuGroupShowcase() {
  const showToast = useToast();
  return (
    <DropdownMenu button={{label: 'Version'}}>
      <DropdownMenuGroup title="Version history">
        <DropdownMenuItem
          icon="arrowDown"
          label="Restore this version"
          onClick={() =>
            showToast({body: 'Demo: this version would be restored here'})
          }
        />
        <DropdownMenuItem
          icon="copy"
          label="Compare with current"
          onClick={() =>
            showToast({
              body: 'Demo: a comparison with the current version would open here',
            })
          }
        />
      </DropdownMenuGroup>
      <DropdownMenuDivider />
      <DropdownMenuGroup title="Add to message">
        <DropdownMenuItem
          icon="externalLink"
          label="As a link"
          onClick={() =>
            showToast({
              body: 'Demo: a link would be added to your message here',
            })
          }
        />
        <DropdownMenuItem
          label="As a snippet"
          onClick={() =>
            showToast({
              body: 'Demo: a snippet would be added to your message here',
            })
          }
        />
      </DropdownMenuGroup>
    </DropdownMenu>
  );
}
