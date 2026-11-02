// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LiveExampleFrame.tsx
 * @input One `tsx live` block from a blog post: its source and the post slug.
 * @output The example running in its own playground preview frame
 *   (`/playground/preview`), sandboxed with an opaque origin.
 * @position Blog post body (spec:AST-033 FR22, DEC-9). The post shares the
 *   playground's renderer, its frame element and its channel lifecycle
 *   (usePreviewFrame.tsx), so the FR16 sandbox boundary and its recovery live
 *   in one place. The frame compiles the source, resolves its imports against
 *   the preview scope plus this post's own example assets, and shows a
 *   compile or runtime error inside itself, so a broken example never breaks
 *   the post around it.
 */

import {useEffect, useEffectEvent, useRef} from 'react';
import {
  PreviewFrame,
  usePreviewFrame,
} from '../../app/playground/usePreviewFrame';
import {useThemeMode} from '../../app/providers';
import css from './LiveExampleFrame.module.css';

export interface LiveExampleFrameProps {
  /** The block's TSX source, with a default-exported component. */
  code: string;
  /** The post's slug: the only post whose example assets this frame resolves. */
  post: string;
}

export function LiveExampleFrame({code, post}: LiveExampleFrameProps) {
  const {mode} = useThemeMode();
  // Whether the current frame's document has said it is ready for code.
  const readyRef = useRef(false);

  const {
    frame,
    attachFrame,
    handleFrameLoad,
    post: postToFrame,
  } = usePreviewFrame({
    onMessage: event => {
      if ((event.data as {type?: unknown} | null)?.type === 'preview-ready') {
        readyRef.current = true;
        sendExample();
      }
    },
    // A new frame is coming (the first, or after the example navigated or
    // reloaded its own frame): wait for its ready signal again.
    onIssue: () => {
      readyRef.current = false;
    },
  });

  // Sends this render's theme and source; a no-op until the frame is ready.
  const sendExample = useEffectEvent(() => {
    if (!readyRef.current) {
      return;
    }
    postToFrame({type: 'preview-theme', mode});
    postToFrame({type: 'preview-code', code, source: code, post});
  });

  // A new source, post or site color mode re-sends once the frame is ready;
  // any other render leaves the running example alone.
  useEffect(() => {
    sendExample();
  }, [code, post, mode]);

  return (
    <figure className={css.frame} data-live-example="">
      {frame == null ? null : (
        <PreviewFrame
          frame={frame}
          frameRef={attachFrame}
          onLoad={handleFrameLoad}
          title="Live example"
          className={css.iframe}
        />
      )}
    </figure>
  );
}
