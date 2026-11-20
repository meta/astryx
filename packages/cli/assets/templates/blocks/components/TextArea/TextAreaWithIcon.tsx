// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TextArea} from '@astryxdesign/core/TextArea';
import {ComposeIcon} from '@astryxdesign/template-icons';

export default function TextAreaWithIcon() {
  const [value, setValue] = useState('');

  return (
    <div style={{width: 400, maxWidth: '100%'}}>
      <TextArea
        label="Meeting notes"
        description="Capture key decisions and action items."
        value={value}
        onChange={setValue}
        placeholder="What was discussed?"
        startIcon={ComposeIcon}
      />
    </div>
  );
}
