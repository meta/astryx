// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cases.tsx
 * @input A case id from caseIds.ts
 * @output The case: an alert over a toast, or a dialog closed after a save
 *   that raised a toast
 * @position The AlertDialog cases page's content. Each case is its Storybook
 *   story, on a sandbox page.
 */

import {useEffect, useRef, useState} from 'react';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {ToastViewport, useToast} from '@astryxdesign/core/Toast';
import type {ToastDismissFn} from '@astryxdesign/core/Toast';
import type {AlertDialogCaseId} from './caseIds';

function AlertOverAToast() {
  const [isOpen, setIsOpen] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const toast = useToast();
  // The case's one toast. A new delete replaces it.
  const dismissRef = useRef<ToastDismissFn | null>(null);
  // Synchronizes the toast system with the case: leaving the case dismisses
  // its toast.
  useEffect(() => () => dismissRef.current?.(), []);
  return (
    <Stack gap={2}>
      <Button
        label="Delete item"
        variant="destructive"
        onClick={() => setIsOpen(true)}
      />
      <Text>{`Undo taps: ${undoCount}`}</Text>
      <AlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Delete item?"
        description="This action cannot be undone. The item and all its data will be permanently removed."
        actionLabel="Delete"
        onAction={() => {
          dismissRef.current = toast({
            body: 'Item deleted.',
            uniqueID: 'alert-over-a-toast',
            isAutoHide: false,
            endContent: (
              <Button
                label="Undo"
                variant="secondary"
                onClick={() => setUndoCount(count => count + 1)}
              />
            ),
          });
          setIsOpen(false);
        }}
      />
    </Stack>
  );
}

/** Stands in for a request that the app waits for before it closes. */
async function saveItem(): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, 300);
  });
}

function SaveToastContent({onSaved}: {onSaved: () => void}) {
  const toast = useToast();
  const save = async () => {
    toast({body: 'Saving the item.'});
    await saveItem();
    onSaved();
  };
  return (
    <Stack gap={3}>
      <Text>
        Save shows a toast, then closes this dialog when the save is done.
      </Text>
      <Button
        label="Save"
        onClick={() => {
          void save();
        }}
      />
    </Stack>
  );
}

function DialogClosedAfterSave() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ToastViewport>
      <Stack gap={2}>
        <Button label="Open dialog" onClick={() => setIsOpen(true)} />
        <Dialog
          isOpen={isOpen}
          onOpenChange={() => setIsOpen(false)}
          aria-label="Edit item">
          <SaveToastContent onSaved={() => setIsOpen(false)} />
        </Dialog>
      </Stack>
    </ToastViewport>
  );
}

export function AlertDialogCase({id}: {id: AlertDialogCaseId}) {
  return id === 'alert-over-a-toast' ? (
    <AlertOverAToast />
  ) : (
    <DialogClosedAfterSave />
  );
}
