// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';

export default function DropdownMenuGroupWithSelectable() {
  const [model, setModel] = useState('balanced');
  const [notify, setNotify] = useState(true);
  const [retry, setRetry] = useState(false);

  return (
    <DropdownMenu button={{label: 'Run settings'}}>
      <DropdownMenuGroup title="Model">
        <DropdownMenuRadioGroup
          label="Model"
          value={model}
          onChange={setModel}
          hasCloseOnSelect={false}>
          <DropdownMenuRadioItem value="fast" label="Fast" />
          <DropdownMenuRadioItem value="balanced" label="Balanced" />
          <DropdownMenuRadioItem value="thorough" label="Thorough" />
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuDivider />
      <DropdownMenuGroup title="On completion">
        <DropdownMenuCheckboxItem
          label="Notify me"
          value={notify}
          onChange={setNotify}
        />
        <DropdownMenuCheckboxItem
          label="Retry on failure"
          value={retry}
          onChange={setRetry}
        />
      </DropdownMenuGroup>
    </DropdownMenu>
  );
}
