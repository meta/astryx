// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {
  ArrowDownTrayIcon,
  ShareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {SpeakerWaveIcon} from '@heroicons/react/24/solid';

const actions = [
  {label: 'Download', icon: ArrowDownTrayIcon},
  {label: 'Share', icon: ShareIcon},
  {label: 'Delete', icon: TrashIcon},
] as const;

/**
 * VisuallyHidden is invisible by design, so this hero teaches the concept by
 * contrast: the icon-only buttons are all a sighted user sees, while the
 * caption spells out the accessible name each one exposes. A live
 * <VisuallyHidden> region below announces the same names to assistive tech,
 * so the demo genuinely exercises the component it documents.
 */
export default function VisuallyHiddenShowcase() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  return (
    <VStack gap={5} hAlign="center">
      <HStack gap={6} vAlign="stretch" wrap="wrap" hAlign="center">
        <Card variant="muted">
          <VStack gap={4} hAlign="center">
            <Text type="supporting" color="secondary">
              What you see
            </Text>
            <HStack gap={2}>
              {actions.map(({label, icon}) => (
                <IconButton
                  key={label}
                  label={label}
                  icon={<Icon icon={icon} />}
                  variant="ghost"
                  onClick={() =>
                    label === 'Delete'
                      ? confirm.show({
                          title: 'Delete this item?',
                          description: "This demo won't delete anything.",
                          actionLabel: 'Delete',
                          onAction: () => {
                            confirm.hide();
                            // Demo only: replace this toast with the call that performs the action.
                            showToast({
                              body: 'Demo: the item would be deleted here',
                            });
                          },
                        })
                      : showToast({
                          body: `Demo: the ${label.toLowerCase()} action would run here`,
                        })
                  }
                />
              ))}
            </HStack>
          </VStack>
        </Card>

        <Card variant="muted">
          <VStack gap={4} hAlign="start">
            <HStack gap={2} vAlign="center">
              <Icon icon={SpeakerWaveIcon} size="sm" />
              <Text type="supporting" color="secondary">
                What a screen reader hears
              </Text>
            </HStack>
            <VStack gap={2}>
              {actions.map(({label}) => (
                <Text key={label} type="body">
                  {label}, button
                </Text>
              ))}
            </VStack>
          </VStack>
        </Card>
      </HStack>

      {/* A real live region: silent to sighted users, announced by AT. */}
      <VisuallyHidden as="div" aria-live="polite">
        Actions available: Download, Share, Delete.
      </VisuallyHidden>
      {confirm.element}
    </VStack>
  );
}
