// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SheetConfirmation.tsx
 * @input Dialog, Layout, Heading, Text, Button; caller-owned copy
 * @output SheetConfirmation — the confirmation a touch sheet opens over
 *   itself for Clear all and for discarding a changed draft
 * @position Core-internal, shared by the Tokenizer sheet and the PowerSearch
 *   sheets; not a public export
 *
 * AlertDialog fixes its purpose to form and its safe action to ghost. A touch
 * sheet's confirmation allows scrim dismissal. Its two full-width large
 * actions are stacked and separated: the destructive action first in reading
 * order, the safe action focused first. The alert-dialog theme target stays.
 */

import {useId} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '../Button/Button';
import {Dialog} from '../Dialog/Dialog';
import {Heading} from '../Heading/Heading';
import {Layout} from '../Layout/Layout';
import {LayoutContent} from '../Layout/LayoutContent';
import {LayoutFooter} from '../Layout/LayoutFooter';
import {Stack} from '../Stack/Stack';
import {Text} from '../Text/Text';
import {themeProps} from '../utils/themeProps';

export interface SheetConfirmationProps {
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

export function SheetConfirmation({
  isOpen,
  onOpenChange,
  title,
  description,
  cancelLabel,
  actionLabel,
  onAction,
}: SheetConfirmationProps) {
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
