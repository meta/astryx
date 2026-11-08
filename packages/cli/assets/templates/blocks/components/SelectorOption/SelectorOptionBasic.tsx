// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Selector, SelectorOption} from '@astryxdesign/core/Selector';

const descriptions: Record<string, string> = {
  admin: 'Full access to all resources',
  editor: 'Can edit and publish content',
  viewer: 'Read-only access',
};

const roles = [
  {value: 'admin', label: 'Admin'},
  {value: 'editor', label: 'Editor'},
  {value: 'viewer', label: 'Viewer'},
];

export default function SelectorOptionBasic() {
  const [value, setValue] = useState<string | undefined>('editor');

  return (
    <Selector
      controlStyle={{width: 300}}
      label="Role"
      options={roles}
      value={value}
      onChange={setValue}
      placeholder="Assign a role..."
      renderOption={option => (
        <SelectorOption
          label={option.label}
          description={descriptions[option.value]}
        />
      )}
    />
  );
}
