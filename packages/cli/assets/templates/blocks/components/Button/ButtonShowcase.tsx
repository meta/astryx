// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {useToast} from '@astryxdesign/core/Toast';

export default function ButtonShowcase() {
  const showToast = useToast();
  return (
    <Stack direction="horizontal" gap={3} vAlign="center">
      <Button
        label="Primary"
        variant="primary"
        onClick={() =>
          showToast({body: 'Demo: the primary action would run here'})
        }
      />
      <Button
        label="Secondary"
        variant="secondary"
        onClick={() =>
          showToast({body: 'Demo: the secondary action would run here'})
        }
      />
      <Button
        label="Ghost"
        variant="ghost"
        onClick={() =>
          showToast({body: 'Demo: the ghost action would run here'})
        }
      />
      <Button
        label="Destructive"
        variant="destructive"
        onClick={() =>
          showToast({body: 'Demo: the destructive action would run here'})
        }
      />
    </Stack>
  );
}
