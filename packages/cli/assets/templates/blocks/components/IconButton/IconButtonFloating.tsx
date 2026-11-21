// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {AddIcon} from '@astryxdesign/template-icons';

const VARIANTS = [
  {variant: 'primary' as const, label: 'Primary'},
  {variant: 'secondary' as const, label: 'Secondary'},
  {variant: 'ghost' as const, label: 'Ghost'},
  {variant: 'destructive' as const, label: 'Destructive'},
];

export default function IconButtonFloating() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        FABs are usually icon-only — raise one with `elevation="high"`
      </Text>
      <Stack direction="horizontal" gap={3} vAlign="center">
        {VARIANTS.map(({variant, label}) => (
          <IconButton
            key={variant}
            label={label}
            variant={variant}
            icon={<Icon icon={AddIcon} />}
            elevation="high"
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
      {confirm.element}
    </Stack>
  );
}
