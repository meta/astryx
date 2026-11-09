// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Selector, SelectorOption} from '@astryxdesign/core/Selector';
import {UserIcon} from '@heroicons/react/24/outline';

const descriptions: Record<string, string> = {
  admin: 'Full access to all resources',
  editor: 'Can edit and publish content',
  viewer: 'Read-only access',
  billing: 'Manage plans and payments',
};

const roles = [
  {value: 'admin', label: 'Admin'},
  {value: 'editor', label: 'Editor'},
  {value: 'viewer', label: 'Viewer'},
  {value: 'billing', label: 'Billing'},
];

export default function SelectorOptionShowcase() {
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
          icon={UserIcon}
          label={option.label}
          description={descriptions[option.value]}
        />
      )}
    />
  );
}
