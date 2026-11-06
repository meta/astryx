// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DialogSecondDocumentA11y.stories.tsx
 * @input Uses Dialog, DialogHeader, Layout, Button, Text, TextInput and VStack
 *   from core, and React portals
 * @output The fixture the second-document Dialog spec drives in a real
 *   browser: the same dialog in the page, in a same-origin iframe, and in a
 *   Document Picture-in-Picture window.
 * @position The reproduction path for
 *   `packages/core/src/Dialog/__tests__/DialogSecondDocument.a11y.browser.spec.ts`
 *   (`docs/specs/AST-009/spec.md` FR30: a browser claim is checked against a
 *   checked-in story, not a page a test builds and throws away).
 *
 * An app can render part of its UI into a second document through a React
 * portal: a same-origin iframe, or a Document Picture-in-Picture window that
 * floats above the page. A Dialog opened there returns focus, when it closes,
 * to the control that opened it, exactly as it does in the page itself.
 *
 * SYNC: The spec navigates to this story id and finds the frame, the Pop out
 *   button and the dialog's controls by name. Nothing at compile time catches
 *   a rename — the browser spec does, when it finds no story or no control.
 */

import {useCallback, useState, type SyntheticEvent} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {isImeKeyEvent} from '@astryxdesign/core/utils';

const meta: Meta = {
  title: 'a11y/Dialog in a second document',
  // This fixture exists to be DRIVEN by the regression spec, not photographed:
  // what is under test is where focus goes in the iframe and the window it
  // opens, which no frame of the page shows.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'The same dialog in the page, in a same-origin iframe, and in a Picture-in-Picture window (Pop out). In every document, closing the dialog with Escape or its button returns focus to Open dialog, or to Search when Enter there opened it. Open dialog in the frame, a control in the page, opens a dialog in the iframe; closing it returns focus to that control.',
      },
    },
  },
};

export default meta;

const styles = stylex.create({
  frame: {
    width: 480,
    height: 360,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'currentColor',
  },
});

const FRAME_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

interface DocumentPictureInPicture {
  requestWindow(options?: {width?: number; height?: number}): Promise<Window>;
}

/** Copy the page's style sheets into a second document, as an app does. */
function adoptPageStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    // A sheet from another origin cannot be read, so only that one is skipped.
    // Any other error in the copy throws.
    if (
      sheet.href != null &&
      new URL(sheet.href).origin !== window.location.origin
    ) {
      continue;
    }
    const style = target.createElement('style');
    style.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join(
      '\n',
    );
    target.head.append(style);
  }
}

/**
 * A control that opens a dialog, which closes on Escape or its button, and a
 * text field that opens it on Enter.
 */
function DialogDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  return (
    <>
      <Button label="Open dialog" onClick={() => setIsOpen(true)} />
      <TextInput
        label="Search"
        value={query}
        onChange={setQuery}
        onKeyDown={event => {
          if (event.key === 'Enter' && !isImeKeyEvent(event)) {
            setIsOpen(true);
          }
        }}
      />
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
        <Layout
          header={<DialogHeader title="Review changes" />}
          content={
            <LayoutContent>
              <VStack gap={3} align="start">
                <Text type="body">
                  Close this dialog with Escape or the button.
                </Text>
                <Button label="Close dialog" onClick={() => setIsOpen(false)} />
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

/**
 * The dialog again, portalled into a same-origin iframe, and a second dialog in
 * the iframe that a control in the page opens.
 */
function FramedDialog() {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [isOpenFromPage, setIsOpenFromPage] = useState(false);
  const handleLoad = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
    const frameDocument = event.currentTarget.contentDocument;
    if (frameDocument != null) {
      adoptPageStyles(frameDocument);
      setBody(frameDocument.body);
    }
  }, []);
  return (
    <>
      <iframe
        title="Second document"
        srcDoc={FRAME_DOCUMENT}
        onLoad={handleLoad}
        {...stylex.props(styles.frame)}
      />
      <Button
        label="Open dialog in the frame"
        onClick={() => setIsOpenFromPage(true)}
      />
      {body != null &&
        createPortal(
          <>
            <DialogDemo />
            <Dialog isOpen={isOpenFromPage} onOpenChange={setIsOpenFromPage}>
              <Layout
                header={<DialogHeader title="Opened from the page" />}
                content={
                  <LayoutContent>
                    <Text type="body">
                      A control in the page opened this dialog.
                    </Text>
                  </LayoutContent>
                }
              />
            </Dialog>
          </>,
          body,
        )}
    </>
  );
}

/** The dialog again, portalled into a Document Picture-in-Picture window. */
function PictureInPictureDialog() {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const pictureInPicture = (
    window as Window & {documentPictureInPicture?: DocumentPictureInPicture}
  ).documentPictureInPicture;
  const popOut = useCallback(async () => {
    if (pictureInPicture == null) {
      return;
    }
    // Opening the window needs the user gesture of this click.
    const pipWindow = await pictureInPicture.requestWindow({
      width: 480,
      height: 360,
    });
    adoptPageStyles(pipWindow.document);
    pipWindow.addEventListener('pagehide', () => setBody(null));
    setBody(pipWindow.document.body);
  }, [pictureInPicture]);
  return (
    <>
      <Button
        label="Pop out"
        isDisabled={pictureInPicture == null}
        onClick={popOut}
      />
      {body != null && createPortal(<DialogDemo />, body)}
    </>
  );
}

/**
 * One dialog in each of three documents: the page, a same-origin iframe, and a
 * Picture-in-Picture window that Pop out opens.
 */
export const SecondDocuments: StoryObj = {
  name: 'in the page, an iframe and a Picture-in-Picture window',
  render: () => (
    <VStack gap={6} align="start">
      <DialogDemo />
      <FramedDialog />
      <PictureInPictureDialog />
    </VStack>
  ),
};
