// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePreviewFrame.tsx
 * @input A message handler for the attested preview document, plus optional
 *   lifecycle callbacks (a frame issued, a document attested, a document
 *   replaced).
 * @output `usePreviewFrame`, the playground preview channel's lifecycle for
 *   one frame, and `PreviewFrame`, the sandboxed iframe it drives.
 * @position The one embedding of the preview frame: the playground stage and
 *   a blog post's live examples (spec:AST-033 FR16, FR22) both use it, so the
 *   sandbox boundary and its recovery live in one place. The trust model is
 *   previewChannel.ts: a fresh frame per generation, a nonce in its URL, and
 *   a MessagePort only for the document the frame navigated to.
 */

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type Ref,
} from 'react';
import {createPreviewConnector, previewSrc} from './previewChannel';
import type {PreviewConnector} from './previewChannel';

// Under `next dev` the preview frame keeps the site origin (the sandbox the
// preview always had before isolation): the dev server serves its /_next
// assets only to requests that name an allowlisted host in Origin or Referer,
// and a document with an opaque origin sends neither, so an isolated preview
// cannot load its own scripts there. Production builds, which is where
// untrusted code meets real users, get the opaque origin — see the iframe
// below. `process.env.NODE_ENV` is inlined at build time.
const PREVIEW_KEEPS_SITE_ORIGIN = process.env.NODE_ENV === 'development';

/** One frame generation: a fresh iframe element (key) and its URL (src). */
export interface PreviewFrameGeneration {
  key: number;
  src: string;
}

export interface UsePreviewFrameOptions {
  /** Receives every message the attested document sends on its port. */
  onMessage: (event: MessageEvent) => void;
  /** A new frame generation was issued (the first one, or a restart). */
  onIssue?: () => void;
  /** The current frame proved it loaded the issued preview URL. */
  onAttested?: () => void;
  /**
   * The attested document is gone (previewed code navigated or reloaded its
   * frame). Its port and nonce are already discarded, and a fresh frame is
   * issued right after this returns.
   */
  onReplaced?: () => void;
}

export interface PreviewFrameHandle {
  /** The current generation; null until issued on the client. */
  frame: PreviewFrameGeneration | null;
  /** The iframe ref: only the current element's window can earn a port. */
  attachFrame: (element: HTMLIFrameElement | null) => void;
  /** The iframe's `load` handler. */
  handleFrameLoad: () => void;
  /** Send to the attested document; a no-op while there is none. */
  post: (message: unknown) => void;
  /** Start a new generation in a fresh frame. */
  restart: () => void;
}

/**
 * The preview channel's lifecycle for one frame. The window listener goes up
 * before the first frame is issued, so the hello cannot arrive unheard; the
 * nonce exists only on the client, never in server-rendered HTML.
 */
export function usePreviewFrame(
  options: UsePreviewFrameOptions,
): PreviewFrameHandle {
  // The connector fires these long after the Effect that wires it ran, so
  // each reads the latest callbacks.
  const onMessage = useEffectEvent((event: MessageEvent) =>
    options.onMessage(event),
  );
  const onIssue = useEffectEvent(() => options.onIssue?.());
  const onAttested = useEffectEvent(() => options.onAttested?.());
  const onReplaced = useEffectEvent(() => options.onReplaced?.());
  const [frame, setFrame] = useState<PreviewFrameGeneration | null>(null);
  const connectorRef = useRef<PreviewConnector | null>(null);
  const restartRef = useRef<() => void>(() => {});

  useEffect(() => {
    let generation = 0;
    const issue = () => {
      generation += 1;
      setFrame({key: generation, src: previewSrc(connector.issue())});
      onIssue();
    };
    const connector = createPreviewConnector({
      onMessage,
      onAttested,
      onReplaced: () => {
        onReplaced();
        issue();
      },
    });
    connectorRef.current = connector;
    restartRef.current = issue;
    const onWindowMessage = (event: MessageEvent) =>
      connector.handleWindowMessage(event);
    window.addEventListener('message', onWindowMessage);
    issue();
    return () => {
      restartRef.current = () => {};
      window.removeEventListener('message', onWindowMessage);
      connector.stop();
      connectorRef.current = null;
    };
  }, []);

  // React clears the old element's ref before attaching the new one's, and
  // the connector forgets its window on every issue() anyway, so the null on
  // unmount carries nothing it needs.
  const attachFrame = useCallback((element: HTMLIFrameElement | null) => {
    if (element?.contentWindow) {
      connectorRef.current?.attachFrame(element.contentWindow);
    }
  }, []);
  // The first load in a generation is the document we navigated to arriving;
  // any later one is a replacement.
  const handleFrameLoad = useCallback(() => {
    connectorRef.current?.handleFrameLoad();
  }, []);
  const post = useCallback((message: unknown) => {
    connectorRef.current?.post(message);
  }, []);
  const restart = useCallback(() => restartRef.current(), []);

  return {frame, attachFrame, handleFrameLoad, post, restart};
}

export interface PreviewFrameProps extends Omit<
  ComponentPropsWithoutRef<'iframe'>,
  'src' | 'sandbox' | 'onLoad' | 'ref'
> {
  frame: PreviewFrameGeneration;
  frameRef: Ref<HTMLIFrameElement>;
  onLoad: () => void;
  title: string;
}

/** The sandboxed preview iframe of one generation. */
export function PreviewFrame({
  frame,
  frameRef,
  onLoad,
  title,
  ...rest
}: PreviewFrameProps) {
  // Two elements rather than one with a computed `sandbox`: the lint rule
  // guarding iframes wants the attribute spelled out, and so does a reader
  // auditing the boundary.
  return PREVIEW_KEEPS_SITE_ORIGIN ? (
    <iframe
      {...rest}
      key={frame.key}
      ref={frameRef}
      onLoad={onLoad}
      src={frame.src}
      sandbox="allow-scripts allow-same-origin"
      title={title}
    />
  ) : (
    // No allow-same-origin: the preview document gets an opaque origin, so
    // the code it compiles and runs holds no cookies, no storage, and no
    // reach into this page — see previewChannel.ts for how the two ends talk
    // without a nameable origin.
    <iframe
      {...rest}
      key={frame.key}
      ref={frameRef}
      onLoad={onLoad}
      src={frame.src}
      sandbox="allow-scripts"
      title={title}
    />
  );
}
