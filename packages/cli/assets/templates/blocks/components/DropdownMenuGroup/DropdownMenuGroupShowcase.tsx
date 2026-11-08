// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu';

export default function DropdownMenuGroupShowcase() {
  return (
    <DropdownMenu button={{label: 'Version'}}>
      <DropdownMenuGroup title="Version history">
        <DropdownMenuItem
          icon="arrowDown"
          label="Restore this version"
          onClick={() => {}}
        />
        <DropdownMenuItem
          icon="copy"
          label="Compare with current"
          onClick={() => {}}
        />
      </DropdownMenuGroup>
      <DropdownMenuDivider />
      <DropdownMenuGroup title="Add to message">
        <DropdownMenuItem
          icon="externalLink"
          label="As a link"
          onClick={() => {}}
        />
        <DropdownMenuItem label="As a snippet" onClick={() => {}} />
      </DropdownMenuGroup>
    </DropdownMenu>
  );
}
