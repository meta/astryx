// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, type ReactNode} from 'react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {
  Dialog,
  DialogHeader,
  type DialogPurpose,
} from '@astryxdesign/core/Dialog';
import {Heading} from '@astryxdesign/core/Heading';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useMediaQuery} from '@astryxdesign/core/hooks';

const TOUCH_ORIENTED_LG_QUERY =
  '(max-width: 1024px) and (pointer: coarse) and (hover: none)';

type AdaptivePresentation = 'dialog' | 'fullscreen' | 'bottom-sheet';

type AdaptiveDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  purpose?: DialogPurpose;
  width?: number | string;
  maxHeight?: number | string;
  touchPresentation?: AdaptivePresentation;
  presentation?: AdaptivePresentation;
  bottomSheetHeight?: 'hug' | 'capped' | 'tall' | number | string;
};

function AdaptiveDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  footer,
  purpose = 'info',
  width = 480,
  maxHeight = '75dvh',
  touchPresentation = 'dialog',
  presentation,
  bottomSheetHeight = 'capped',
}: AdaptiveDialogProps) {
  const isTouchOrientedLargeOrBelow = useMediaQuery(TOUCH_ORIENTED_LG_QUERY);
  const resolvedPresentation =
    presentation ??
    (isTouchOrientedLargeOrBelow ? touchPresentation : 'dialog');

  if (resolvedPresentation === 'bottom-sheet') {
    return (
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        label={title}
        purpose={purpose}
        height={bottomSheetHeight}>
        <VStack gap={4}>
          <Heading level={3}>{title}</Heading>
          {children}
          {footer}
        </VStack>
      </BottomSheet>
    );
  }

  const dialogContent = (
    <Layout
      header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
      content={<LayoutContent>{children}</LayoutContent>}
      footer={footer ? <LayoutFooter>{footer}</LayoutFooter> : undefined}
    />
  );

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose={purpose}
      width={width}
      maxHeight={maxHeight}
      variant={
        resolvedPresentation === 'fullscreen' ? 'fullscreen' : 'standard'
      }>
      {dialogContent}
    </Dialog>
  );
}

export default function DialogAdaptivePresentation() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('Ruby Cheung');
  const [email, setEmail] = useState('ruby@example.com');
  const [notes, setNotes] = useState('');

  return (
    <>
      <Button label="Edit profile" onClick={() => setIsOpen(true)} />
      {/*
        touchPresentation examples:
        - "dialog" keeps Dialog even in touch-oriented <=lg contexts.
        - "fullscreen" uses fullscreen Dialog there.
        - "bottom-sheet" uses BottomSheet there.
        presentation="dialog" | "fullscreen" | "bottom-sheet" overrides
        the media query for tests and unusual environments.
      */}
      <AdaptiveDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Edit profile"
        purpose="form"
        touchPresentation="bottom-sheet"
        bottomSheetHeight="tall"
        footer={
          <HStack gap={2} hAlign="end" wrap="wrap">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setIsOpen(false)}
            />
            <Button
              label="Save profile"
              variant="primary"
              onClick={() => setIsOpen(false)}
            />
          </HStack>
        }>
        <VStack gap={4}>
          <Text type="supporting" color="secondary">
            Dialog remains the default presentation. This example explicitly
            opts into a Bottom Sheet only at lg and below when the device has a
            coarse pointer and no hover. Pass the presentation prop to make
            tests or unusual environments deterministic.
          </Text>
          <Text type="supporting" color="secondary">
            In Bottom Sheet presentation, purpose="form" blocks scrim clicks and
            swipe dismissal while preserving Escape. Use this opt-in only when
            that contract is acceptable; keep AlertDialog/destructive
            confirmations on Dialog unless a product deliberately chooses
            otherwise.
          </Text>
          <TextInput label="Name" value={name} onChange={setName} />
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <TextArea label="Notes" rows={6} value={notes} onChange={setNotes} />
        </VStack>
      </AdaptiveDialog>
    </>
  );
}
