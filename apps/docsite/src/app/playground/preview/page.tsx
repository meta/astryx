// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file page.tsx
 * @input Attested preview channel, editor code, and active theme
 * @output Isolated live preview with native navigation in production, or a
 *   compile error sent to the playground when the compiler bootstrap fails
 * @position Playground runner; platform restrictions never grant parent privileges.
 */

'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import type {ThemeMode, DefinedTheme} from '@astryxdesign/core/theme';
import {themeByValue, DEFAULT_PLAYGROUND_THEME} from '../previewThemes';
import {useThemeMode} from '../../providers';
import {ErrorBoundary, ErrorDisplay} from './ErrorBoundary';
import {
  createTargetingController,
  refreshTargetLabels,
  setActiveSiteMode,
  setCleanSource,
  setPostToParent,
} from '../propertyEditor/targetingOverlay';
import {runCode, setTypeScript, type LocalModules} from './runner';
import {loadPostModules} from './postModules';
import {
  acceptPreviewConnect,
  announcePreview,
  readPreviewNonce,
} from '../previewChannel';
import type * as TS from 'typescript';
import NextLink from 'next/link';
import {LinkProvider} from '@astryxdesign/core/Link';

// Next's client router mutates history, which an opaque-origin document cannot
// do for another path. Native links keep fragment navigation usable and let
// full document navigation reach the existing replacement/recovery boundary.
const PreviewLink = process.env.NODE_ENV === 'development' ? NextLink : 'a';

// How long after the compiler is ready the readiness announcement waits for
// this document's own `load` event before giving up on it. The wait exists so
// no previewed code runs before the frame's first load event (see
// previewChannel.ts, "The handshake", step 4); the cap keeps a stalled
// third-party subresource from stalling the preview. Past the cap only
// recovery from hostile code that navigates away within its first
// milliseconds is at stake, never isolation.
const DOCUMENT_LOAD_WAIT_MS = 5000;

const FALLBACK_THEME =
  themeByValue[DEFAULT_PLAYGROUND_THEME] ?? Object.values(themeByValue)[0];

// useLayoutEffect warns during SSR; the preview measures real DOM only on the
// client, so fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type PreviewMessage =
  | {
      type: 'preview-code';
      code: string;
      source: string;
      // A blog post's live example (spec:AST-033 FR22): the post whose
      // post-local example assets the code may import by relative path.
      post?: string;
    }
  | {type: 'preview-clear'}
  | {
      type: 'preview-theme';
      mode?: string;
      theme?: string;
      // A custom theme authored in the editor. Sent as raw token map +
      // components (not a defineTheme result) so the payload stays reliably
      // structured-clone-safe across postMessage; the iframe rebuilds it.
      customTokens?: Record<string, string>;
      customComponents?: unknown;
    }
  | {type: 'targeting-enable'}
  | {type: 'targeting-disable'};

const styles = stylex.create({
  // The preview stage either fills the frame (full-page templates) or centers a
  // small example.
  stageFill: {
    height: '100%',
    minHeight: '100%',
    display: 'block',
    backgroundColor: 'var(--color-background-surface)',
  },
  stageCenter: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--spacing-4, 16px)',
    boxSizing: 'border-box',
    backgroundColor: 'var(--color-background-surface)',
  },
  contentFill: {height: '100%', width: '100%'},
});

function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as {type: unknown}).type === 'string'
  );
}

export default function PreviewPage() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [themeName, setThemeName] = useState(DEFAULT_PLAYGROUND_THEME);
  // A custom theme authored in the playground theme editor. When set it takes
  // precedence over the registered theme resolved from themeName.
  const [customTheme, setCustomTheme] = useState<DefinedTheme | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [tsReady, setTsReady] = useState(false);
  const [compilerError, setCompilerError] = useState<string | null>(null);
  // Whether this document's own `load` event has fired (or the wait for it
  // ran out); readiness is announced only after it.
  const [documentLoaded, setDocumentLoaded] = useState(false);
  // The channel adopted from the playground's connect handshake.
  const [port, setPort] = useState<MessagePort | null>(null);
  // Whether the rendered output should fill the stage (full-page templates) vs
  // be centered as a small example. Defaults to fill so templates are never
  // shrunk; the layout effect downgrades small content to centered.
  const [fill, setFill] = useState(true);
  // The port readiness was last announced on.
  const readyRef = useRef<MessagePort | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Counts code messages, so a run that waits on a post's example assets
  // never lands after a newer message.
  const codeRunRef = useRef(0);

  // Load the TypeScript compiler from public/vendor — self-hosted because
  // corpnet blocks external CDNs. The UMD sets window.ts in the browser
  // (this iframe has no AMD loader, so there's no define() conflict).
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/vendor/typescript.js';
    const fail = () => setCompilerError('TypeScript compiler failed to load');
    script.onload = () => {
      const w = window as unknown as {ts?: typeof TS};
      if (w.ts) {
        setTypeScript(w.ts);
        setTsReady(true);
      } else {
        fail();
      }
    };
    script.onerror = fail;
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  const theme = customTheme ?? themeByValue[themeName] ?? FALLBACK_THEME;

  // Everything back to the playground travels over the adopted port (see
  // previewChannel.ts); until the handshake lands there is nobody to talk to.
  const portRef = useRef<MessagePort | null>(null);
  const postToParent = useCallback((msg: Record<string, unknown>) => {
    portRef.current?.postMessage(msg);
  }, []);

  const targetingRef = useRef<ReturnType<
    typeof createTargetingController
  > | null>(null);
  if (targetingRef.current == null && typeof window !== 'undefined') {
    setPostToParent(postToParent);
    targetingRef.current = createTargetingController(postToParent);
  }

  const handleCode = useCallback(
    (code: string, localModules?: LocalModules) => {
      const result = runCode(code, localModules);
      if (result.Component) {
        setComponent(() => result.Component);
        setError(null);
        // Intentionally do NOT clear the selection overlay here: a prop edit
        // from the badge popover re-renders the component, and the popover
        // must stay anchored to the (still-present) selection badge. The rAF
        // tracker re-attaches to the same data-pg-id, and updateSelectionPosition
        // hides the overlay on its own if the selected element disappears.
        setFill(true);
        setResetKey(k => k + 1);
        postToParent({type: 'preview-rendered'});
      } else {
        setComponent(null);
        setError(`[${result.phase}] ${result.error}`);
        postToParent({
          type: 'preview-error',
          error: result.error,
          phase: result.phase,
        });
      }
    },
    [postToParent],
  );

  const handleClear = useCallback(() => {
    setComponent(null);
    setError(null);
  }, []);

  const handleTheme = useCallback(
    (msg: {
      mode?: string;
      theme?: string;
      customTokens?: Record<string, string>;
      customComponents?: unknown;
    }) => {
      if (
        msg.mode === 'light' ||
        msg.mode === 'dark' ||
        msg.mode === 'system'
      ) {
        setThemeMode(msg.mode);
      }
      if (msg.customTokens) {
        setCustomTheme(
          defineTheme({
            name: 'custom',
            tokens: msg.customTokens,
            components: msg.customComponents as DefinedTheme['components'],
          }),
        );
      } else {
        // No custom tokens — fall back to the registered theme by key.
        setCustomTheme(null);
        if (msg.theme && msg.theme in themeByValue) {
          setThemeName(msg.theme);
        }
      }
    },
    [],
  );

  // Prove to the playground that this document is the one it navigated the
  // frame to, and adopt the channel it answers with. Attached from mount (not
  // gated on tsReady) so the answer is never missed — the ready reply below
  // waits for tsReady instead.
  useEffect(() => {
    function onWindowMessage(event: MessageEvent) {
      // The port handler below evaluates attacker-controllable source, so a
      // port is adopted only from a connect handshake sent by our own parent
      // window (see previewChannel.ts) — nothing else on the window is heard.
      const next = acceptPreviewConnect(event, window.parent);
      if (next == null) {
        return;
      }
      portRef.current?.close();
      portRef.current = next;
      setPort(next);
    }
    window.addEventListener('message', onWindowMessage);
    // The nonce came in with the navigation the playground issued; echoing it
    // is what earns this document a port. A document that reached the frame
    // any other way holds a nonce the playground has already spent.
    announcePreview(window.parent, readPreviewNonce(window.location.hash));
    return () => window.removeEventListener('message', onWindowMessage);
  }, []);

  // Track this document's own load so readiness — and with it the first run
  // of previewed code — waits for it (see DOCUMENT_LOAD_WAIT_MS).
  useEffect(() => {
    if (document.readyState === 'complete') {
      setDocumentLoaded(true);
      return;
    }
    const onLoad = () => setDocumentLoaded(true);
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    if (!tsReady || documentLoaded) {
      return;
    }
    const timer = setTimeout(
      () => setDocumentLoaded(true),
      DOCUMENT_LOAD_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [tsReady, documentLoaded]);

  useEffect(() => {
    if (
      !documentLoaded ||
      port == null ||
      (!tsReady && compilerError == null)
    ) {
      return;
    }

    if (compilerError != null) {
      postToParent({
        type: 'preview-error',
        error: compilerError,
        phase: 'compile',
      });
      return;
    }

    function onMessage(event: MessageEvent) {
      if (!isPreviewMessage(event.data)) {
        return;
      }

      switch (event.data.type) {
        case 'preview-code':
          // Keep the clean source current for the badge popover, then refresh
          // any live badges so an open popover re-parses against it.
          setCleanSource(event.data.source ?? event.data.code);
          refreshTargetLabels();
          {
            const {code, post} = event.data;
            const run = ++codeRunRef.current;
            if (typeof post === 'string') {
              // Load the post's own example assets first; a newer code
              // message supersedes this run.
              void loadPostModules(post).then(
                modules => {
                  if (run === codeRunRef.current) {
                    handleCode(code, modules);
                  }
                },
                (err: unknown) => {
                  if (run === codeRunRef.current) {
                    const message =
                      err instanceof Error ? err.message : String(err);
                    setComponent(null);
                    setError(`[compile] ${message}`);
                    postToParent({
                      type: 'preview-error',
                      error: message,
                      phase: 'compile',
                    });
                  }
                },
              );
            } else {
              handleCode(code);
            }
          }
          break;
        case 'preview-clear':
          codeRunRef.current += 1;
          handleClear();
          break;
        case 'preview-theme':
          handleTheme(event.data);
          break;
        case 'targeting-enable':
          targetingRef.current?.enable();
          break;
        case 'targeting-disable':
          targetingRef.current?.disable();
          break;
      }
    }

    port.onmessage = onMessage;

    // Announce readiness once per adopted port. The playground flushes the
    // current code on hearing it, so this is the moment previewed code first
    // runs — after this document's own load, by the effect's guard.
    if (readyRef.current !== port) {
      readyRef.current = port;
      postToParent({type: 'preview-ready'});
    }

    return () => {
      if (port.onmessage === onMessage) {
        port.onmessage = null;
      }
    };
  }, [
    tsReady,
    compilerError,
    documentLoaded,
    port,
    postToParent,
    handleCode,
    handleClear,
    handleTheme,
  ]);

  // After each successful render (measured in fill/block layout), decide
  // whether the content is a small example that should be centered. Full-page
  // templates (e.g. AppShell at 100dvh) fill a dimension and stay as-is.
  useIsomorphicLayoutEffect(() => {
    const stage = stageRef.current;
    const root = contentRef.current?.firstElementChild as HTMLElement | null;
    if (!stage || !root) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const fillsWidth = rect.width >= stage.clientWidth - 2;
    const fillsHeight = rect.height >= stage.clientHeight - 2;
    setFill(fillsWidth || fillsHeight);
  }, [resetKey]);

  const handleBoundaryError = useCallback(
    (err: Error) => {
      postToParent({
        type: 'preview-error',
        error: err.message,
        phase: 'runtime',
      });
    },
    [postToParent],
  );

  // Keep the overlay badges (rendered in their own roots, outside this React
  // tree) on the site theme but matching the site's light/dark mode.
  const {mode: siteMode} = useThemeMode();
  useEffect(() => {
    setActiveSiteMode(siteMode);
    refreshTargetLabels();
  }, [siteMode]);

  // fill = full-page template (definite height so `height: 100%` resolves);
  // otherwise center the small example.
  return (
    <Theme theme={theme} mode={themeMode}>
      <div
        ref={stageRef}
        {...stylex.props(fill ? styles.stageFill : styles.stageCenter)}>
        {error && <ErrorDisplay message={error} />}
        {Component && (
          <div ref={contentRef} {...stylex.props(fill && styles.contentFill)}>
            <ErrorBoundary resetKey={resetKey} onError={handleBoundaryError}>
              <LinkProvider component={PreviewLink}>
                <Component />
              </LinkProvider>
            </ErrorBoundary>
          </div>
        )}
      </div>
    </Theme>
  );
}
