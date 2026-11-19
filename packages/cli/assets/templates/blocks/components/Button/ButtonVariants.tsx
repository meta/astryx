// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';

const VARIANTS = [
  {variant: 'primary' as const, label: 'Primary'},
  {variant: 'secondary' as const, label: 'Secondary'},
  {variant: 'ghost' as const, label: 'Ghost'},
  {variant: 'destructive' as const, label: 'Destructive'},
];

export default function ButtonVariants() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  return (
    <Stack direction="vertical" gap={4}>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Default
        </Text>
        <Stack direction="horizontal" gap={3} vAlign="center">
          {VARIANTS.map(({variant, label}) => (
            <Button
              key={variant}
              label={label}
              variant={variant}
              onClick={() =>
                variant === 'destructive'
                  ? confirm.show({
                      title: 'Run the destructive action?',
                      description: "This demo won't change anything.",
                      actionLabel: 'Continue',
                      onAction: () => {
                        confirm.hide();
                        // Demo only: replace this toast with the call that performs the action.
                        showToast({
                          body: 'Demo: the destructive action would run here',
                        });
                      },
                    })
                  : showToast({
                      body: `Demo: the ${label.toLowerCase()} action would run here`,
                    })
              }
            />
          ))}
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Disabled
        </Text>
        <Stack direction="horizontal" gap={3} vAlign="center">
          {VARIANTS.map(({variant, label}) => (
            <Button key={variant} label={label} variant={variant} isDisabled />
          ))}
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Loading
        </Text>
        <Stack direction="horizontal" gap={3} vAlign="center">
          {VARIANTS.map(({variant, label}) => (
            <Button key={variant} label={label} variant={variant} isLoading />
          ))}
        </Stack>
      </Stack>
      {confirm.element}
    </Stack>
  );
}
