// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TextArea} from '@astryxdesign/core/TextArea';

export default function TextAreaShowcase() {
  const [value, setValue] = useState('');
  return (
    <div style={{width: 400, maxWidth: '100%'}}>
      <TextArea
        label="Description"
        value={value}
        onChange={setValue}
        placeholder="Enter a description..."
      />
    </div>
  );
}
