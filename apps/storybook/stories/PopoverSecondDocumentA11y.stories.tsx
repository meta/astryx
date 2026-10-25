// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverSecondDocumentA11y.stories.tsx
 * @input Uses Popover, Button, VStack and HStack from core, and React portals
 * @output The fixture the second-document Popover spec drives in a real
 *   browser: the same two popovers in the page, in a same-origin iframe, and in
 *   a Document Picture-in-Picture window.
 * @position The reproduction path for
 *   `packages/core/src/Popover/__tests__/PopoverSecondDocument.a11y.chromium.spec.ts`
 *   (`docs/specs/AST-009/spec.md` FR30: a browser claim is checked against a
 *   checked-in story, not a page a test builds and throws away).
 *
 * An app can render part of its UI into a second document through a React
 * portal: a same-origin iframe, or a Document Picture-in-Picture window that
 * floats above the page. A Popover there opens, traps Tab, closes on Escape and
 * hands focus back exactly as it does in the page itself.
 *
 * SYNC: The spec navigates to this story id and finds the frame, the Pop out
 *   button and the popover controls by name. Nothing at compile time catches a
 *   rename — the Chromium spec does, when it finds no story or no control.
 */

import {useCallback, useState, type SyntheticEvent} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';

const meta: Meta = {
  title: 'a11y/Popover in a second document',
  // This fixture exists to be DRIVEN by the regression spec, not photographed:
  // what is under test is focus and key handling inside the iframe and the
  // window it opens, which no frame of the page shows.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'The same two popovers in the page, in a same-origin iframe, and in a Picture-in-Picture window (Pop out). In every document, opening focuses First, Tab stays inside, Escape closes either popover, and closing hands focus back to its trigger.',
      },
    },
  },
};

export default meta;

const styles = stylex.create({
  frame: {
    width: 420,
    height: 300,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'currentColor',
  },
  // Clear of either open popover, so a press on it is a press outside.
  outside: {
    marginBlockStart: 96,
  },
});

const FRAME_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

interface DocumentPictureInPicture {
  requestWindow(options?: {width?: number; height?: number}): Promise<Window>;
}

/** Copy the page's style sheets into a second document, as an app does. */
function adoptPageStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join(
        '\n',
      );
      target.head.append(style);
    } catch {
      // A cross-origin sheet cannot be read; the page's own sheets can.
    }
  }
}

/** The default popover, and one that closes only on request. */
function Popovers() {
  const controls = (
    <HStack gap={2}>
      <Button label="First" />
      <Button label="Last" />
    </HStack>
  );
  return (
    <VStack gap={4} align="start">
      <Popover label="Settings" content={controls}>
        <Button label="Settings" />
      </Popover>
      <Popover
        label="Pinned settings"
        hasLightDismiss={false}
        content={controls}>
        <Button label="Pinned settings" />
      </Popover>
      <p {...stylex.props(styles.outside)}>Outside</p>
    </VStack>
  );
}

/** The popovers again, portalled into a same-origin iframe. */
function FramedPopovers() {
  const [body, setBody] = useState<HTMLElement | null>(null);
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
      {body != null && createPortal(<Popovers />, body)}
    </>
  );
}

/** The popovers again, portalled into a Document Picture-in-Picture window. */
function PictureInPicturePopovers() {
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
      width: 420,
      height: 300,
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
      {body != null && createPortal(<Popovers />, body)}
    </>
  );
}

/**
 * Two popovers in each of three documents: the page, a same-origin iframe, and
 * a Picture-in-Picture window that Pop out opens.
 */
export const SecondDocuments: StoryObj = {
  name: 'in the page, an iframe and a Picture-in-Picture window',
  render: () => (
    <VStack gap={6} align="start">
      <Popovers />
      <FramedPopovers />
      <PictureInPicturePopovers />
    </VStack>
  ),
};
