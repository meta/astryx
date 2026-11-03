// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobileSheetConfirmation.tsx
 * @input Public Core Dialog, layout, text and action primitives; caller-owned copy
 * @output Private confirmation shared by MobileTokenizer and MobilePowerSearch
 * @position Lab-only mobile sheet confirmation owner; not a public export
 *
 * Core AlertDialog fixes its purpose to form and its safe action to ghost.
 * These Lab flows instead allow scrim dismissal and use separated, full-width
 * large actions with the secondary safe action focused first. Keep that
 * difference here, while preserving the existing alert-dialog theme target.
 */

import {useId} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {themeProps} from '@astryxdesign/core/utils';

interface MobileSheetConfirmationProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  actionLabel: string;
  onAction: () => void;
}

const styles = stylex.create({
  action: {width: '100%'},
});

export function MobileSheetConfirmation({
  isOpen,
  onOpenChange,
  title,
  description,
  cancelLabel,
  actionLabel,
  onAction,
}: MobileSheetConfirmationProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Dialog
      {...themeProps('alert-dialog')}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="info"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      width={400}>
      <Layout
        content={
          <LayoutContent>
            <Heading level={2} id={titleId}>
              {title}
            </Heading>
            <Text type="body" color="secondary" id={descriptionId}>
              {description}
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <Stack direction="vertical" gap={4} hAlign="stretch">
              <Button
                label={actionLabel}
                variant="destructive"
                size="lg"
                onClick={onAction}
                xstyle={styles.action}
              />
              <Button
                label={cancelLabel}
                variant="secondary"
                size="lg"
                onClick={() => onOpenChange(false)}
                data-autofocus
                xstyle={styles.action}
              />
            </Stack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
