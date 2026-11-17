// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSecondDocumentA11y.stories.tsx
 * @input Uses DropdownMenu, DropdownMenuItem, Button and VStack from core, and
 *   React portals
 * @output The fixture the second-document DropdownMenu spec drives in a real
 *   browser: the same menu in a same-origin iframe, in a Document
 *   Picture-in-Picture window, and in a window that `window.open` opens.
 * @position The reproduction path for
 *   `packages/core/src/DropdownMenu/__tests__/DropdownMenuSecondDocument.a11y.chromium.spec.ts`.
 *
 * A mouse opens a DropdownMenu on its press. The menu stays open through
 * that press's release, also when the trigger sits in a second document.
 *
 * SYNC: The spec navigates to this story id and finds the frame, the Pop out
 *   and Open window buttons, and the menu controls by name.
 */

import {useCallback, useState, type SyntheticEvent} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {VStack} from '@astryxdesign/core/Layout';

const meta: Meta = {
  title: 'a11y/DropdownMenu in a second document',
  // Driven by the regression spec, not photographed: what is under test is
  // the press in the iframe and the windows it opens.
  tags: ['no-visual'],
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
});

const FRAME_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

interface DocumentPictureInPicture {
  requestWindow(options?: {width?: number; height?: number}): Promise<Window>;
}

/** Copy the page's style sheets into a second document, as an app does. */
function adoptPageStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
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

/** The menu and a count of its trigger's clicks. */
function Menu() {
  const [clicks, setClicks] = useState(0);
  return (
    <VStack gap={2} align="start">
      <DropdownMenu
        button={{label: 'Actions'}}
        onClick={() => setClicks(count => count + 1)}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>
      <output data-testid="clicks">{clicks}</output>
    </VStack>
  );
}

/** The menu, portalled into a same-origin iframe. */
function FramedMenu() {
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
      {body != null && createPortal(<Menu />, body)}
    </>
  );
}

/** The menu, portalled into a Document Picture-in-Picture window. */
function PictureInPictureMenu() {
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
      height: 320,
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
      {body != null && createPortal(<Menu />, body)}
    </>
  );
}

/** The menu, portalled into a window that `window.open` opens. */
function OpenedWindowMenu() {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const openWindow = useCallback(() => {
    const opened = window.open('', 'dropdown-menu-window', 'popup');
    if (opened == null) {
      return;
    }
    adoptPageStyles(opened.document);
    opened.addEventListener('pagehide', () => setBody(null));
    setBody(opened.document.body);
  }, []);
  return (
    <>
      <Button label="Open window" onClick={openWindow} />
      {body != null && createPortal(<Menu />, body)}
    </>
  );
}

/**
 * The menu in three second documents: a same-origin iframe, a
 * Picture-in-Picture window that Pop out opens, and a window that Open window
 * opens.
 */
export const SecondDocuments: StoryObj = {
  name: 'in an iframe, a Picture-in-Picture window and an opened window',
  render: () => (
    <VStack gap={6} align="start">
      <FramedMenu />
      <PictureInPictureMenu />
      <OpenedWindowMenu />
    </VStack>
  ),
};
