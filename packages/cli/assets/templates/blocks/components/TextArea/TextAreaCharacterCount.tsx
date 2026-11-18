// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TextArea} from '@astryxdesign/core/TextArea';

export default function TextAreaCharacterCount() {
  const [value, setValue] = useState(
    'Excited to announce that our team just shipped the new dashboard! Check it out and let us know what you think.',
  );

  return (
    <div style={{width: 400, maxWidth: '100%'}}>
      <TextArea
        label="Status update"
        value={value}
        onChange={setValue}
        placeholder="What's on your mind?"
        maxLength={280}
        rows={3}
      />
    </div>
  );
}
