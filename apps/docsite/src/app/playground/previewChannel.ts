// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file previewChannel.ts
 * @input Playground side: the preview iframe's window plus its `load` and the
 *   page's `message` events. Preview side: the document's own URL and the
 *   incoming `message` events.
 * @output A dedicated MessagePort pair that only the playground and a preview
 *   document the playground itself navigated to can hold, plus lifecycle
 *   callbacks for attestation and replacement.
 * @position Playground <-> preview iframe — the postMessage trust boundary.
 *
 * ## Why there is a boundary at all
 *
 * The preview iframe compiles and evaluates whatever source arrives on this
 * channel. It runs in a sandbox without `allow-same-origin`, so its document
 * has an opaque origin: no cookies, no storage, no reach into the parent
 * document — and no origin string that could identify either end. Origin
 * checks are therefore unavailable, and the trust anchor is a MessagePort
 * handshake instead: all traffic flows over a port pair, which no third window
 * can reach because ports are transferable capabilities, not broadcasts.
 *
 * ## Who is who
 *
 * - The PLAYGROUND (this site's origin) owns the iframe element and decides
 *   what URL it navigates to.
 * - The PREVIEW DOCUMENT is the site's own preview page, loaded at that URL.
 *   It is trusted code, but it hosts the previewed code with full authority
 *   over its own window: everything the document knows, previewed code knows,
 *   and previewed code can navigate the frame anywhere.
 * - A REPLACEMENT DOCUMENT is whatever the frame shows after previewed code
 *   navigated it (another origin, a data: URL, or a reload of the preview
 *   page itself). Only the playground can tell the two apart, and only by
 *   whether it navigated the frame there.
 *
 * ## The handshake
 *
 * 1. The playground navigates a FRESH iframe element to the preview URL with
 *    a random nonce in the fragment ({@link previewSrc}). The nonce exists
 *    only in the playground's memory and in that navigation's URL; a document
 *    already in the frame cannot read either (the iframe element lives in the
 *    parent's DOM, across the origin boundary).
 * 2. The preview document reads the nonce from its own URL and posts a hello
 *    carrying it to its parent window ({@link announcePreview}).
 * 3. The playground accepts a hello only from the current iframe's window,
 *    only while a nonce is outstanding, only when the nonce matches, and only
 *    once ({@link createPreviewConnector}). It answers by transferring one end
 *    of a fresh MessageChannel in a connect message; the preview adopts a port
 *    only from a connect sent by its own parent ({@link acceptPreviewConnect}),
 *    and `frame-ancestors 'self'` on the route pins who that parent can be.
 * 4. The preview document sends `preview-ready` over the port once its
 *    compiler is loaded AND its own document has finished loading. Nothing
 *    previewed runs before that, so the frame's first `load` event in a
 *    generation always belongs to the attested document.
 * 5. Every later `load` event means the attested document was replaced. The
 *    playground closes the port, discards the nonce (a hello replaying it is
 *    now worthless), and REMOUNTS the iframe with a new nonce. A new element
 *    is a new browsing context: the replacement document is destroyed along
 *    with any navigation it had in flight, so it cannot race the restore,
 *    and a same-path reload cannot degrade into a fragment navigation. Until
 *    the new element has mounted and handed over its window, the playground
 *    holds no frame window at all, so a hello landing in that gap — from the
 *    old frame, still alive until React commits — is rejected before the
 *    nonce is even compared.
 *
 * A replacement document can post any message it likes to the parent, but the
 * only message the playground acts on is a hello with the outstanding nonce,
 * which it never saw. Code, theme, and targeting commands travel only over the
 * port, and the port is only ever transferred to the window of a fresh frame
 * that just proved it loaded the URL the playground chose.
 */

/** Playground -> preview, on the window: the port transfer. */
export const PREVIEW_CONNECT = 'astryx-preview-connect';
/** Preview -> playground, on the window: "I am the document you navigated to". */
export const PREVIEW_HELLO = 'astryx-preview-hello';

const PREVIEW_PATH = '/playground/preview';
const NONCE_PARAM = 'nonce';

/** A fresh, unguessable nonce for one preview document generation. */
export function createPreviewNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The URL a fresh preview iframe navigates to. The nonce rides in the
 * fragment: it never reaches the server or a CDN cache key, and the preview
 * page reads it from its own `location`.
 */
export function previewSrc(nonce: string): string {
  return `${PREVIEW_PATH}#${NONCE_PARAM}=${encodeURIComponent(nonce)}`;
}

/** Preview side: the nonce the playground put in this document's URL, if any. */
export function readPreviewNonce(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get(NONCE_PARAM);
}

/**
 * Preview side: tell the parent which navigation this document came from.
 * The target is `'*'` because an opaque-origin document cannot name its
 * embedder either; `frame-ancestors 'self'` guarantees the embedder is this
 * site, and the nonce is useless to anything that is not also the frame's
 * parent.
 */
export function announcePreview(
  parent: Pick<Window, 'postMessage'>,
  nonce: string | null,
): void {
  parent.postMessage({type: PREVIEW_HELLO, nonce}, '*');
}

/**
 * Playground side: open a fresh channel to the preview frame and return the
 * local port. The remote port travels inside the connect message. The
 * wildcard target is required — an opaque origin cannot be named in
 * `targetOrigin` — and the message carries no data beyond the port itself.
 */
export function connectToPreview(
  frame: Pick<Window, 'postMessage'>,
): MessagePort {
  const channel = new MessageChannel();
  frame.postMessage({type: PREVIEW_CONNECT}, '*', [channel.port2]);
  return channel.port1;
}

/**
 * Preview side: the port from a connect handshake sent by this frame's own
 * parent, or null for anything else — other windows, self-sends, connects
 * without a port, unrelated messages. A nullish `parentWindow` means there is
 * no embedder, so nothing can be trusted.
 */
export function acceptPreviewConnect(
  event: Pick<MessageEvent, 'data' | 'source' | 'ports'>,
  parentWindow: MessageEventSource | null | undefined,
): MessagePort | null {
  const type = (event.data as {type?: unknown} | null)?.type;
  if (type !== PREVIEW_CONNECT) {
    return null;
  }
  if (parentWindow == null || event.source == null) {
    return null;
  }
  if (event.source !== parentWindow) {
    return null;
  }
  return event.ports[0] ?? null;
}

export interface PreviewConnector {
  /**
   * Start a new frame generation: forget the previous document, its port,
   * its nonce and its window, and return the nonce the next iframe must be
   * navigated with (see {@link previewSrc}). The caller mounts a fresh iframe
   * element for it and hands over its window with {@link attachFrame}.
   */
  issue: () => string;
  /**
   * The window of the iframe element mounted for the current generation.
   * Nothing is accepted from any window until this has been called.
   */
  attachFrame: (frame: MessageEventSource) => void;
  /**
   * Window `message` listener for the playground page. Acts on exactly one
   * thing: a hello from the current frame's window carrying the outstanding
   * nonce, which is answered with a port transfer.
   */
  handleWindowMessage: (event: MessageEvent) => void;
  /**
   * The iframe's `load` event. The first load of a generation is the attested
   * document arriving; any later one means it was replaced, and `onReplaced`
   * fires after the port and nonce have been discarded.
   */
  handleFrameLoad: () => void;
  /** Send to the attested document; a no-op while there is none. */
  post: (message: unknown) => void;
  /** Whether a document has attested in the current generation. */
  isAttested: () => boolean;
  /** Close the port and forget everything. */
  stop: () => void;
}

/**
 * Playground side: the trust state machine described in the file header.
 */
export function createPreviewConnector({
  onMessage,
  onAttested,
  onReplaced,
  nonce = createPreviewNonce,
}: {
  /** Receives every message that arrives on the adopted port. */
  onMessage: (event: MessageEvent) => void;
  /** The current frame proved it loaded the issued preview URL. */
  onAttested?: () => void;
  /**
   * The attested document is gone. The caller must `issue()` a new
   * generation and mount a fresh iframe for it.
   */
  onReplaced: () => void;
  /** Nonce source; injectable for tests. */
  nonce?: () => string;
}): PreviewConnector {
  let outstanding: string | null = null;
  let frame: MessageEventSource | null = null;
  let attested = false;
  let loads = 0;
  let port: MessagePort | null = null;

  function discard() {
    port?.close();
    port = null;
    outstanding = null;
    frame = null;
    attested = false;
    loads = 0;
  }

  return {
    issue() {
      discard();
      outstanding = nonce();
      return outstanding;
    },

    attachFrame(next) {
      frame = next;
    },

    handleWindowMessage(event) {
      const data = event.data as {type?: unknown; nonce?: unknown} | null;
      if (data?.type !== PREVIEW_HELLO) {
        return;
      }
      // One nonce, one document, one answer. A replacement document that
      // learned the nonce from the document it displaced finds it spent.
      if (outstanding == null || attested) {
        return;
      }
      if (typeof data.nonce !== 'string' || data.nonce !== outstanding) {
        return;
      }
      if (frame == null || event.source == null || event.source !== frame) {
        return;
      }
      attested = true;
      port = connectToPreview(frame as Pick<Window, 'postMessage'>);
      port.onmessage = onMessage;
      onAttested?.();
    },

    handleFrameLoad() {
      loads += 1;
      if (loads === 1) {
        // The document this generation was navigated to. Its hello may have
        // arrived already (scripts run before subresources finish) or may
        // still be coming; either way nothing previewed has run yet.
        return;
      }
      discard();
      onReplaced();
    },

    post(message) {
      port?.postMessage(message);
    },

    isAttested: () => attested,

    stop: discard,
  };
}
