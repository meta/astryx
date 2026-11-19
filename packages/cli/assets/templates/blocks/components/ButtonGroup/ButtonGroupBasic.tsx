// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';

export default function ButtonGroupBasic() {
  const showToast = useToast();
  return (
    <ButtonGroup label="Text editing actions">
      <Button
        label="Copy"
        onClick={() =>
          showToast({body: 'Demo: the selection would be copied here'})
        }
      />
      <Button
        label="Cut"
        onClick={() =>
          showToast({body: 'Demo: the selection would be cut here'})
        }
      />
      <Button
        label="Paste"
        onClick={() =>
          showToast({body: 'Demo: the clipboard would be pasted here'})
        }
      />
    </ButtonGroup>
  );
}
