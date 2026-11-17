// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HoverCardSecondDocumentA11y.stories.tsx
 * @input HoverCard portalled into a same-origin iframe and into a Document
 *   Picture-in-Picture window
 * @output A fixture for the Chromium check that Escape and focus work in the
 *   card's own document; excluded from the visual matrix
 * @position Browser fixture for component:HoverCard FR6 in a second document
 */

import {useCallback, useState, type SyntheticEvent} from 'react';
import {createPortal} from 'react-dom';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {HoverCard} from '@astryxdesign/core/HoverCard';

const meta: Meta = {
  title: 'a11y/HoverCard in a second document',
  tags: ['no-visual'],
};

export default meta;

const FRAME_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

/** Copy the page's style sheets into the frame, as an app does. */
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

function Card() {
  return (
    <HoverCard
      label="Profile"
      content={<Button label="Message" />}
      delay={0}
      hideDelay={0}>
      <Button label="Rowan" />
    </HoverCard>
  );
}

interface DocumentPictureInPicture {
  requestWindow(options?: {width?: number; height?: number}): Promise<Window>;
}

/** The card again, portalled into a Document Picture-in-Picture window. */
function PictureInPictureCard() {
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
      height: 260,
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
      {body != null && createPortal(<Card />, body)}
    </>
  );
}

export const SecondDocument: StoryObj = {
  render: function SecondDocumentStory() {
    const [body, setBody] = useState<HTMLElement | null>(null);
    const handleLoad = useCallback(
      (event: SyntheticEvent<HTMLIFrameElement>) => {
        const frameDocument = event.currentTarget.contentDocument;
        if (frameDocument != null) {
          adoptPageStyles(frameDocument);
          setBody(frameDocument.body);
        }
      },
      [],
    );
    return (
      <>
        <iframe
          title="Second document"
          srcDoc={FRAME_DOCUMENT}
          onLoad={handleLoad}
          style={{width: 420, height: 260, border: '1px solid'}}
        />
        {body != null && createPortal(<Card />, body)}
        <PictureInPictureCard />
      </>
    );
  },
};
