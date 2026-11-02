// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LiveExampleFrame.tsx
 * @input One `tsx live` block from a blog post: its source and the post slug.
 * @output The example running in its own playground preview frame
 *   (`/playground/preview`), sandboxed with an opaque origin.
 * @position Blog post body (spec:AST-033 FR22, DEC-9). The post shares the
 *   playground's renderer and its FR16 isolation: the frame compiles the
 *   source, resolves its imports against the preview scope plus this post's
 *   own example assets, and shows a compile or runtime error inside itself, so
 *   a broken example never breaks the post around it. The handshake is the
 *   playground's (previewChannel.ts): a fresh frame per generation, a nonce
 *   in its URL, and a MessagePort only for the document this frame navigated
 *   to.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {
  createPreviewConnector,
  previewSrc,
} from '../../app/playground/previewChannel';
import {useThemeMode} from '../../app/providers';
import css from './LiveExampleFrame.module.css';

// Local development keeps the site origin so Next's dev overlay can reach the
// frame, exactly as the playground stage does (PreviewStage.tsx).
const PREVIEW_KEEPS_SITE_ORIGIN = process.env.NODE_ENV === 'development';

export interface LiveExampleFrameProps {
  /** The block's TSX source, with a default-exported component. */
  code: string;
  /** The post's slug: the only post whose example assets this frame resolves. */
  post: string;
}

export function LiveExampleFrame({code, post}: LiveExampleFrameProps) {
  const {mode} = useThemeMode();
  const [frame, setFrame] = useState<{key: number; src: string} | null>(null);
  const connectorRef = useRef<ReturnType<typeof createPreviewConnector> | null>(
    null,
  );
  const readyRef = useRef(false);
  // The latest values the ready handler sends, read at send time.
  const latest = useRef({code, post, mode});
  latest.current = {code, post, mode};

  const sendAll = useCallback(() => {
    const connector = connectorRef.current;
    if (connector == null || !readyRef.current) {
      return;
    }
    const {code: source, post: slug, mode: themeMode} = latest.current;
    connector.post({type: 'preview-theme', mode: themeMode});
    connector.post({type: 'preview-code', code: source, source, post: slug});
  }, []);

  useEffect(() => {
    let generation = 0;
    const connector = createPreviewConnector({
      onMessage: event => {
        if ((event.data as {type?: unknown} | null)?.type === 'preview-ready') {
          readyRef.current = true;
          sendAll();
        }
      },
      // The example navigated or reloaded its own frame: start over in a
      // fresh one, exactly as the playground does.
      onReplaced: () => issue(),
    });
    function issue() {
      readyRef.current = false;
      generation += 1;
      setFrame({key: generation, src: previewSrc(connector.issue())});
    }
    connectorRef.current = connector;
    const onWindowMessage = (event: MessageEvent) =>
      connector.handleWindowMessage(event);
    window.addEventListener('message', onWindowMessage);
    issue();
    return () => {
      window.removeEventListener('message', onWindowMessage);
      connector.stop();
      connectorRef.current = null;
    };
  }, [sendAll]);

  // A new source, post or site color mode re-sends once the frame is ready.
  useEffect(() => {
    sendAll();
  }, [code, post, mode, sendAll]);

  const attachFrame = useCallback((element: HTMLIFrameElement | null) => {
    if (element?.contentWindow) {
      connectorRef.current?.attachFrame(element.contentWindow);
    }
  }, []);
  const handleLoad = useCallback(() => {
    connectorRef.current?.handleFrameLoad();
  }, []);

  return (
    <figure className={css.frame} data-live-example="">
      {frame == null ? null : PREVIEW_KEEPS_SITE_ORIGIN ? (
        <iframe
          key={frame.key}
          ref={attachFrame}
          onLoad={handleLoad}
          src={frame.src}
          sandbox="allow-scripts allow-same-origin"
          title="Live example"
          className={css.iframe}
        />
      ) : (
        // No allow-same-origin: the example runs with an opaque origin, so it
        // holds no cookies or storage and cannot reach this page.
        <iframe
          key={frame.key}
          ref={attachFrame}
          onLoad={handleLoad}
          src={frame.src}
          sandbox="allow-scripts"
          title="Live example"
          className={css.iframe}
        />
      )}
    </figure>
  );
}
