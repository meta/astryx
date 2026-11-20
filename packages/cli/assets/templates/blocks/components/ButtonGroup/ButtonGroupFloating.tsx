// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';
import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function ButtonGroupFloating() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={3} hAlign="start">
      <Text type="supporting" color="secondary">
        The whole group shares one raised surface — a floating action bar
      </Text>
      <ButtonGroup label="Zoom controls" elevation="med">
        <Button
          label="Zoom out"
          onClick={() =>
            showToast({body: 'Demo: the view would zoom out here'})
          }
        />
        <Button
          label="Reset"
          onClick={() => showToast({body: 'Demo: the zoom would reset here'})}
        />
        <Button
          label="Zoom in"
          onClick={() => showToast({body: 'Demo: the view would zoom in here'})}
        />
      </ButtonGroup>
    </Stack>
  );
}
