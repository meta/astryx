// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PlaygroundClient.tsx
 * @input URL hash or template query, user edits, and knob edits
 * @output Full-page two-panel playground (editor + live preview), with a
 *   production-only notice explaining the ephemeral preview's restrictions and
 *   a retryable terminal error when the isolated preview cannot start
 * @position app/playground — the interactive Astryx code playground.
 *
 * AppShell: side-nav-only shell; desktop nav is controlled collapsed to
 * an icon rail while AppShell owns the mobile top bar and drawer.
 * Left panel: header row (Format code · Themes · Templates) over the Monaco
 *   editor (Code) or knobs (Properties). On mobile the row narrows to just
 *   "Format code" over the Code view — there is no keyboard, so the button is
 *   the only way to reach the formatter.
 *   - Code: Monaco editor (controlled) with real Astryx .d.ts typedefs.
 *     "Format code" runs the repo's Prettier config over the buffer — the button
 *     drives Monaco's own editor.action.formatDocument, so it shares a code path
 *     with the built-in shortcut (Shift+Alt+F, Ctrl+Shift+I on Linux — the
 *     tooltip names whichever one Monaco actually bound; see ./formatCode). If
 *     Prettier fails to LOAD, the action would otherwise be silently dead, so
 *     the failure is surfaced as an error toast.
 *   - Property: component selector + instance picker + knobs that edit the code.
 * Right panel: toolbar (dark mode · target element · viewport
 *   segmented control · share · expand) over a responsive
 *   /playground/preview iframe.
 *
 * The preview iframe is driven via postMessage (preview-code / preview-theme);
 * code lives in React state and is the single source of truth shared by Monaco,
 * the Property knobs, the URL hash, and the preview.
 */

'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import dynamic from 'next/dynamic';
import * as stylex from '@stylexjs/stylex';
import {AppShell} from '@astryxdesign/core/AppShell';
import {DocsBanner} from '../../components/InternalDocsPrompt';
import {compressCode, decompressCode} from '../../lib/compress';
import {createPreviewConnector, previewSrc} from './previewChannel';
import type {PreviewConnector} from './previewChannel';
import {Button} from '@astryxdesign/core/Button';
import {Link} from '@astryxdesign/core/Link';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Popover} from '@astryxdesign/core/Popover';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {Text, Heading} from '@astryxdesign/core/Text';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {useToast} from '@astryxdesign/core/Toast';
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Moon,
  Palette,
  Sun,
  Monitor,
  Smartphone,
  Maximize2,
  RotateCw,
  Crosshair,
  WandSparkles,
} from 'lucide-react';
import githubLight from './codeEditorThemes/github-light.json';
import githubDark from './codeEditorThemes/github-dark.json';
import {useThemeMode} from '../providers';
import {
  DEFAULT_PLAYGROUND_THEME,
  PLAYGROUND_THEME_OPTIONS,
  themeByValue,
} from './previewThemes';
import {templates} from '../../generated/templateRegistry';
import {PreviewStage, type Viewport} from './PreviewStage';
import {ConfirmDialog} from './ConfirmDialog';
import {AstryxIcon} from '../../components/logos';
import {annotateInstanceIds} from './propertyEditor/componentInstances';
import {trackCopy} from '../../lib/analytics';
import {ThemeEditor} from './themeEditor/ThemeEditor';
import {generateThemeCode} from './themeEditor/helpers';
import {DEFAULT_CODE} from './defaultCode';
import {stripCodeExampleCopyrightHeader} from '../../lib/codeExamples';
import {configureMonaco, type MonacoInstance} from './monacoSetup';
import {
  formatButtonTooltip,
  formatShortcutHint,
  runFormatAction,
} from './formatCode';

import type * as MonacoTypes from 'monaco-editor';
import type {DefinedTheme} from '@astryxdesign/core/theme';
import {tokenDefaults} from '@astryxdesign/core/theme';

// Hidden from the generated registry (isHiddenFromOverview), so it's added
// explicitly as the first entry in the Templates dropdown.
const THEME_SHOWCASE_SOURCE =
  templates.find(t => t.slug === 'theme-showcase')?.source ?? '';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <Center height="100%">
      <Spinner label="Loading editor…" />
    </Center>
  ),
});

function getInitialCode(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_CODE;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const compressed = hashParams.get('code');
  if (compressed) {
    try {
      return decompressCode(compressed) || DEFAULT_CODE;
    } catch {
      return DEFAULT_CODE;
    }
  }

  const templateSlug = new URLSearchParams(window.location.search).get(
    'template',
  );
  const templateSource = templates.find(
    template => template.slug === templateSlug,
  )?.source;
  return templateSource
    ? stripCodeExampleCopyrightHeader(templateSource)
    : DEFAULT_CODE;
}

function updateURL(code: string) {
  const compressed = compressCode(code);
  const canonicalURL = new URL(window.location.href);
  canonicalURL.searchParams.delete('template');
  canonicalURL.hash = `code=${compressed}`;
  window.history.replaceState(
    null,
    '',
    `${canonicalURL.pathname}${canonicalURL.search}${canonicalURL.hash}`,
  );
}

type LeftView = 'code' | 'theme';
type MobileTopTab = 'preview' | 'code' | 'theme';
type BuildStatus = 'idle' | 'building' | 'finished' | 'error';
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)';
// A preview that never boots cannot report its own failure. End the indefinite
// "Building…" state and let Rebuild mount a fresh isolated document. Once the
// document attests, restart the deadline for the self-hosted compiler's 9 MB
// download.
const PREVIEW_DOCUMENT_STARTUP_TIMEOUT_MS = 30_000;
const PREVIEW_COMPILER_STARTUP_TIMEOUT_MS = 30_000;

const BUILD_STATUS_META: Record<
  Exclude<BuildStatus, 'idle'>,
  {variant: 'warning' | 'success' | 'error'; label: string}
> = {
  building: {variant: 'warning', label: 'Building…'},
  finished: {variant: 'success', label: 'Build finished'},
  error: {variant: 'error', label: 'Build error'},
};

const s = stylex.create({
  hidden: {
    display: 'none',
  },
  targetingActive: {
    backgroundColor: 'var(--color-background-blue)',
    color: 'var(--color-icon-blue)',
  },
  shareInput: {
    width: 300,
  },
  popoverPadding: {
    padding: 'var(--spacing-4)',
  },
  root: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-surface)',
  },
  leftPanel: {
    flexShrink: {
      default: 0,
      '@media (max-width: 768px)': 1,
    },
    overflow: 'hidden',
    minWidth: 0,
    maxWidth: '100%',
  },
  leftPanelHeader: {
    flexShrink: 0,
    paddingBlock: 'var(--spacing-2)',
    paddingInline: 'var(--spacing-3)',
    minHeight: 48,
  },
  tabBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  pane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  rightPanel: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-muted)',
  },
  previewNotice: {
    flexShrink: 0,
    paddingInline: 'var(--spacing-4)',
    paddingBlockEnd: 'var(--spacing-2)',
  },
  buildStatus: {
    transitionProperty: 'opacity',
    transitionDuration: '0.5s',
    transitionTimingFunction: 'ease',
  },
  buildStatusFaded: {
    opacity: 0,
  },
  sideNavHeading: {
    paddingInline: {
      default: null,
      '@media (min-width: 769px)': 'var(--spacing-1)',
    },
  },
  desktopCollapsedSideNav: {
    width: {
      default: null,
      '@media (min-width: 769px)': 'calc(var(--spacing-12) + var(--spacing-2))',
    },
  },
});

export function PlaygroundClient() {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT_QUERY);
  const toast = useToast();
  // The editor chrome follows the docsite's own light/dark mode, not the OS
  // (operator) color-scheme preference.
  const {mode: siteMode} = useThemeMode();
  const editorTheme = siteMode === 'dark' ? 'github-dark' : 'github-light';
  const [code, setCode] = useState(getInitialCode);
  // Mirror of `code` for event handlers with stable identities (the frame
  // load handler resends the current code after a preview reload).
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  // A ?theme=<value> query param (e.g. from the themes gallery's "Open in
  // Playground") seeds the Theme view and preview. useSearchParams reads it
  // reliably across soft navigation; validated against registered themes.
  const searchParams = useSearchParams();
  const rawThemeParam = searchParams.get('theme');
  const themeParam =
    // Object.hasOwn (not `in`): the param must match a real playground theme,
    // not an inherited Object.prototype key like "constructor".
    rawThemeParam && Object.hasOwn(themeByValue, rawThemeParam)
      ? rawThemeParam
      : null;
  const theme = themeParam ?? DEFAULT_PLAYGROUND_THEME;
  // The theme that seeds the Theme editor: the ?theme= theme on first load, then
  // whichever theme the user picks from "Themes". Changing it remounts the
  // editor (via key) so it re-populates.
  const [selectedTheme, setSelectedTheme] = useState(theme);
  const editorInitialTheme =
    themeByValue[selectedTheme] ?? themeByValue[DEFAULT_PLAYGROUND_THEME];
  const [activeView, setActiveView] = useState<LeftView>('code');
  const [mobileTab, setMobileTab] = useState<MobileTopTab>('code');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [statusFading, setStatusFading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [themeName, setThemeName] = useState('');
  // Snapshot of the theme to export, captured when the Export popover opens, so
  // the download link can be built declaratively from reactive state (the live
  // theme lives in customThemeRef and changes without re-rendering).
  const [exportTheme, setExportTheme] = useState<DefinedTheme | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [isTargeting, setIsTargeting] = useState(false);
  // Pending confirmations: applying an example theme / loading a template both
  // discard the user's current work, so the choice is held until they confirm.
  // The matching dialog is open whenever the value is non-null.
  const [pendingExampleTheme, setPendingExampleTheme] = useState<string | null>(
    null,
  );
  const [pendingTemplateSource, setPendingTemplateSource] = useState<
    string | null
  >(null);

  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const previewStartupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const restartPreviewRef = useRef<() => void>(() => {});
  // The preview frame generation: a fresh iframe element (key) navigated to
  // the preview URL with a fresh nonce (src). Issued on the client only, and
  // re-issued whenever the attested preview document is replaced — see
  // previewChannel.ts for the trust model.
  const [frame, setFrame] = useState<{key: number; src: string} | null>(null);
  const frameGenerationRef = useRef(0);
  // The channel's trust state machine (see previewChannel.ts) and the current
  // port message handler — refs so the connector's port always dispatches
  // into the latest closure.
  const connectorRef = useRef<PreviewConnector | null>(null);
  const portHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(
    null,
  );
  // Points at the hidden theme-export download link (below); the Download button
  // clicks it for native download behavior from a real <a>.
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
  // Mirror activeView in a ref so the stable onMount callback can read it.
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  // Latest theme authored in the Theme view, retained so a mode toggle can
  // re-post it (the iframe clears the custom theme on any string-only push).
  const customThemeRef = useRef<DefinedTheme | null>(null);

  const editorPanel = useResizable({
    defaultSize: 440,
    minSize: 340,
    maxSize: 760,
    autoSaveId: 'astryx-playground-left-width',
  });

  // Seed the preview mode once from the docsite's mode; afterward the toolbar
  // toggle owns it, so siteMode is intentionally read only on mount.
  const initialSiteModeRef = useRef(siteMode);
  useEffect(() => {
    setMode(initialSiteModeRef.current);
  }, []);

  // Re-read code from hash on hashchange (e.g. SPA navigation with new code)
  useEffect(() => {
    const onHashChange = () => {
      const newCode = getInitialCode();
      if (newCode !== DEFAULT_CODE) {
        setCode(newCode);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Re-read the hash once on mount. On soft navigation (e.g. the Themes page's
  // "Open in Playground" <Link>) the App Router commits the URL after first
  // render, so the synchronous seed above can miss the fragment, and no
  // hashchange fires. Adopt the committed hash's code here if present.
  useEffect(() => {
    const seeded = getInitialCode();
    if (seeded !== DEFAULT_CODE) {
      setCode(prev => (prev === seeded ? prev : seeded));
    }
    // Runs once on mount; the hashchange listener above covers later changes.
  }, []);

  // When a ?theme= param seeds the playground, open the Theme view so the
  // populated theme editor is visible (and drives the preview) on arrival.
  // Done in an effect (not the initial activeView state) to avoid an
  // SSR/client hydration mismatch on the panel that renders.
  useEffect(() => {
    if (themeParam) {
      setActiveView('theme');
    }
  }, [themeParam]);

  // Single channel to the preview iframe; no-ops until the handshake lands.
  const postToPreview = useCallback((message: unknown) => {
    connectorRef.current?.post(message);
  }, []);

  const send = useCallback(
    (c: string, source?: string) => {
      postToPreview(
        c ? {type: 'preview-code', code: c, source} : {type: 'preview-clear'},
      );
    },
    [postToPreview],
  );

  // Send the preview an instance-annotated copy of the code (markers let the
  // preview map a selected component to its DOM node for the focus-ring flash),
  // plus the clean source so the in-preview Properties popover can parse + edit
  // against un-annotated offsets.
  const postCode = useCallback(
    (c: string) => send(annotateInstanceIds(c), c),
    [send],
  );

  // Push a theme authored in the Theme view to the preview. Sent as raw tokens
  // + components (see the preview-theme protocol) so it survives postMessage.
  const postCustomTheme = useCallback(
    (customTheme: DefinedTheme) => {
      customThemeRef.current = customTheme;
      postToPreview({
        type: 'preview-theme',
        customTokens: customTheme.tokens,
        customComponents: customTheme.components,
        mode,
      });
    },
    [mode, postToPreview],
  );

  const toggleTargeting = useCallback(
    (pressed?: boolean) => {
      setIsTargeting(prev => {
        const next = pressed ?? !prev;
        postToPreview({type: next ? 'targeting-enable' : 'targeting-disable'});
        return next;
      });
    },
    [postToPreview],
  );

  // Messages from the preview arrive only on the port the handshake below
  // transfers — the window listener hears nothing but the hello.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'preview-ready') {
        readyRef.current = true;
        if (previewStartupTimerRef.current != null) {
          clearTimeout(previewStartupTimerRef.current);
          previewStartupTimerRef.current = null;
        }
        setPreviewReady(true);
        if (pendingRef.current != null) {
          postCode(pendingRef.current);
          pendingRef.current = null;
        }
      }
      if (e.data?.type === 'preview-rendered') {
        setBuildStatus('finished');
      }
      // A prop knob edited in the in-preview Properties popover sends back the
      // new clean code; adopt it as the source of truth (drives Monaco, the
      // URL hash, and the debounced re-render of the preview).
      if (e.data?.type === 'preview-edit-code') {
        setCode(e.data.code);
      }
      if (e.data?.type === 'preview-error') {
        setBuildStatus('error');
      }
      if (e.data?.type === 'targeting-select') {
        // The preview draws the selection badge itself; just exit targeting
        // mode. Properties are edited via the badge's popover now, so the left
        // panel stays on whatever view is currently open.
        setIsTargeting(false);
        postToPreview({type: 'targeting-disable'});
      }
      if (e.data?.type === 'targeting-exit') {
        setIsTargeting(false);
      }
    };
    portHandlerRef.current = handler;
    return () => {
      portHandlerRef.current = null;
    };
  }, [postCode, postToPreview]);

  // Handshake (previewChannel.ts): mount a fresh iframe navigated to the
  // preview URL with a nonce only this page knows; the preview document echoes
  // it from its own URL, and the connector answers that one hello with a port.
  // The window listener goes up BEFORE the frame is issued so the hello cannot
  // arrive unheard.
  useEffect(() => {
    const clearStartupTimer = () => {
      if (previewStartupTimerRef.current != null) {
        clearTimeout(previewStartupTimerRef.current);
        previewStartupTimerRef.current = null;
      }
    };
    const armStartupTimer = (timeout: number) => {
      clearStartupTimer();
      previewStartupTimerRef.current = setTimeout(() => {
        if (!readyRef.current) {
          setBuildStatus('error');
        }
      }, timeout);
    };
    const issueFrame = () => {
      frameGenerationRef.current += 1;
      setFrame({
        key: frameGenerationRef.current,
        src: previewSrc(connector.issue()),
      });
      armStartupTimer(PREVIEW_DOCUMENT_STARTUP_TIMEOUT_MS);
    };
    const connector = createPreviewConnector({
      onMessage: e => portHandlerRef.current?.(e),
      onAttested: () => armStartupTimer(PREVIEW_COMPILER_STARTUP_TIMEOUT_MS),
      // The attested preview document is gone (previewed code navigated or
      // reloaded its frame). Its port and nonce are already discarded; start
      // a new generation and queue the current code so the fresh document
      // picks up exactly where the old one was — the preview-ready handler
      // flushes it and the theme effect re-sends on the previewReady flip.
      onReplaced: () => restartPreviewRef.current(),
    });
    restartPreviewRef.current = () => {
      readyRef.current = false;
      setPreviewReady(false);
      pendingRef.current = codeRef.current;
      issueFrame();
    };
    connectorRef.current = connector;
    const onWindowMessage = (e: MessageEvent) =>
      connector.handleWindowMessage(e);
    window.addEventListener('message', onWindowMessage);
    issueFrame();
    return () => {
      clearStartupTimer();
      restartPreviewRef.current = () => {};
      window.removeEventListener('message', onWindowMessage);
      connector.stop();
      connectorRef.current = null;
    };
  }, []);

  // The iframe element of the current generation, once React has mounted it:
  // only its window can earn a port. React clears the old element's ref before
  // attaching the new one's, and the connector forgets its window on every
  // issue() anyway, so the null on unmount carries nothing it needs.
  const attachFrame = useCallback((element: HTMLIFrameElement | null) => {
    if (element?.contentWindow) {
      connectorRef.current?.attachFrame(element.contentWindow);
    }
  }, []);

  // Every load of the iframe goes to the connector: the first in a generation
  // is the document we navigated to arriving, any later one is a replacement.
  const handleFrameLoad = useCallback(() => {
    connectorRef.current?.handleFrameLoad();
  }, []);

  // Debounced push of code → preview + URL hash
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      if (code) {
        setBuildStatus(status =>
          status === 'error' && !readyRef.current ? status : 'building',
        );
      }
      if (!readyRef.current) {
        pendingRef.current = code;
      } else {
        postCode(code);
      }
      updateURL(code);
    }, 400);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [code, postCode]);

  // Theme + mode → preview. Re-sent on previewReady so a non-default initial
  // theme still applies if this first ran before the iframe was listening. A
  // theme authored in the Theme editor takes precedence and stays the source of
  // truth across all views.
  useEffect(() => {
    if (customThemeRef.current) {
      postCustomTheme(customThemeRef.current);
    } else {
      postToPreview({type: 'preview-theme', theme, mode});
    }
  }, [mode, previewReady, activeView, theme, postCustomTheme, postToPreview]);

  // While the resize handle is dragged, the cursor can pass over the preview
  // iframe — a separate document that swallows pointer events and stalls the
  // drag (the handle listens on window pointermove without pointer capture).
  // Detect the drag (capture phase, since the handle stops propagation) and
  // disable iframe pointer events so events keep reaching window during resize.
  const handleResizeProbe = useCallback((e: React.PointerEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('[role="separator"]')) {
      setIsResizing(true);
    }
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }
    const stop = () => setIsResizing(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [isResizing]);

  // "Build finished" lingers for 5s, then fades out (0.5s) and disappears.
  useEffect(() => {
    if (buildStatus !== 'finished') {
      setStatusFading(false);
      return;
    }
    const fade = setTimeout(() => setStatusFading(true), 5000);
    const hide = setTimeout(() => {
      setBuildStatus('idle');
      setStatusFading(false);
    }, 5500);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, [buildStatus]);

  const handleRebuild = useCallback(() => {
    setBuildStatus('building');
    if (readyRef.current) {
      postCode(code);
    } else {
      pendingRef.current = code;
      restartPreviewRef.current();
    }
  }, [postCode, code]);

  // "Format code" — delegate to Monaco's own format-document action rather than
  // rewriting `code` state directly: the action is what Shift+Alt+F is bound to,
  // it routes through the registered Prettier provider (see ./formatCode), and
  // going through the model keeps the edit on Monaco's undo stack. The resulting
  // model change flows back into `code` via the editor's onChange.
  //
  // Returned, not fired-and-forgotten, so Button's `clickAction` can hold a
  // spinner until the format lands: the first one downloads Prettier's ~1MB
  // TypeScript parser, and Monaco silently cancels a format in flight the moment
  // the cursor moves — so a user with no feedback clicks into the editor to see
  // if it worked and cancels the very thing they are waiting for.
  const handleFormatCode = useCallback(
    () => runFormatAction(editorRef.current),
    [],
  );

  // Prettier failing to LOAD (offline, CSP, a stale chunk hash after a deploy)
  // leaves the button silently dead — the user clicks and nothing happens, with
  // no way to tell that from "my code was already tidy". Say so. A broken-syntax
  // buffer never lands here; Monaco's squiggles already cover that case.
  const handleFormatFailure = useCallback(() => {
    toast({
      body: 'Could not format — the code formatter failed to load. Check your connection and try again.',
      type: 'error',
      uniqueID: 'playground-format-failed',
    });
  }, [toast]);

  // Monaco binds Format Document to Ctrl+Shift+I on Linux and Shift+Alt+F
  // elsewhere. The platform is only knowable from `navigator`, which does not
  // exist during SSR — so start with no chord and fill it in after mount, where
  // an effect cannot cause a hydration mismatch.
  const [formatShortcut, setFormatShortcut] = useState<string | null>(null);
  useEffect(() => {
    setFormatShortcut(formatShortcutHint(navigator.userAgent));
  }, []);
  const formatTooltip = formatButtonTooltip(formatShortcut);

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      trackCopy({page: 'playground', target: 'share_url'});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // Derive the export href (filename + data: URL of the generated defineTheme
  // source) from reactive state, so the download is a real <a> (downloadLinkRef)
  // rather than a fabricated element. Null until a theme name is entered.
  const themeExport = useMemo(() => {
    const name = themeName.trim();
    if (!name) {
      return null;
    }
    const activeTheme = exportTheme ?? editorInitialTheme;
    const source = generateThemeCode(
      name,
      activeTheme.tokens,
      tokenDefaults,
      14,
      1.2,
      [],
      activeTheme.components ?? {},
    );
    return {
      filename: `${name}-theme.ts`,
      href: `data:text/typescript;charset=utf-8,${encodeURIComponent(source)}`,
    };
  }, [themeName, exportTheme, editorInitialTheme]);

  const handleMonacoBeforeMount = useCallback((monaco: MonacoInstance) => {
    monaco.editor.defineTheme('github-light', githubLight);
    monaco.editor.defineTheme('github-dark', githubDark);
  }, []);

  // Mirror the failure handler in a ref so the stable onMount callback below can
  // reach the latest one without taking it as a dependency (same reason as
  // activeViewRef): the formatter is registered once, at mount, for the life of
  // the page.
  const handleFormatFailureRef = useRef(handleFormatFailure);
  handleFormatFailureRef.current = handleFormatFailure;

  const handleMonacoMount = useCallback(
    (
      editor: MonacoTypes.editor.IStandaloneCodeEditor,
      monaco: MonacoInstance,
    ) => {
      editorRef.current = editor;
      configureMonaco(monaco, {
        onFormatFailure: () => handleFormatFailureRef.current(),
      });
      // Focus on initial mount if the Code view is the active one.
      if (activeViewRef.current === 'code') {
        editor.focus();
      }
    },
    [],
  );

  // Focus the editor (blinking cursor) whenever the Code view becomes active.
  useEffect(() => {
    if (activeView !== 'code') {
      return;
    }
    const id = requestAnimationFrame(() => editorRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [activeView]);

  // "Themes" dropdown — every registered playground theme. Selecting one prompts
  // for confirmation before re-seeding the Theme editor (and preview).
  const themeMenuItems = useMemo(
    () =>
      PLAYGROUND_THEME_OPTIONS.map(option => ({
        label: option.label,
        onClick: () => setPendingExampleTheme(option.value),
      })),
    [],
  );

  // "Templates" dropdown — the published, ready templates from the generated
  // registry. Selecting one prompts for confirmation before loading its source.
  const templateMenuItems = useMemo(
    () => [
      {
        label: 'Theme Showcase',
        onClick: () => setPendingTemplateSource(THEME_SHOWCASE_SOURCE),
      },
      ...templates
        .filter(t => !t.isHiddenFromOverview && t.isReady && t.source)
        .map(t => {
          const dash = t.category.indexOf(' - ');
          const group = dash === -1 ? t.category : t.category.slice(0, dash);
          const label =
            t.name.toLowerCase() === group.toLowerCase()
              ? t.name
              : `${group} · ${t.name}`;
          return {label, source: t.source};
        })
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(({label, source}) => ({
          label,
          onClick: () => setPendingTemplateSource(source),
        })),
    ],
    [],
  );

  const editorOptions = useMemo(
    () => ({
      minimap: {enabled: false},
      fontSize: 13,
      lineNumbers: 'on' as const,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on' as const,
      padding: {top: 12},
      accessibilitySupport: 'off' as const,
      // Hide scrollbars and the overview ruler for a cleaner panel.
      scrollbar: {
        vertical: 'hidden' as const,
        horizontal: 'hidden' as const,
        verticalScrollbarSize: 0,
        horizontalScrollbarSize: 0,
        useShadows: false,
      },
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
    }),
    [],
  );

  const handleMobileTabChange = useCallback((tab: MobileTopTab) => {
    setMobileTab(tab);
    if (tab === 'code' || tab === 'theme') {
      setActiveView(tab);
    }
  }, []);

  const togglePreviewMode = useCallback(() => {
    setMode(m => (m === 'light' ? 'dark' : 'light'));
  }, []);

  const expandPreview = useCallback(() => {
    setIsFullscreen(true);
  }, []);

  const mobileTopNav = isMobile ? (
    <TopNav
      label="Playground navigation"
      heading={
        <TopNavHeading
          logo={
            <AstryxIcon
              width={24}
              height={24}
              role="img"
              aria-label="Astryx"
              style={{display: 'block', color: 'var(--color-brand)'}}
            />
          }
          headingHref="/"
        />
      }
      centerContent={
        <TabList
          value={mobileTab}
          onChange={value => handleMobileTabChange(value as MobileTopTab)}
          size="sm">
          <Tab
            value="preview"
            label="Preview"
            icon={<Monitor size={14} />}
            isLabelHidden
          />
          <Tab
            value="code"
            label="Code"
            icon={<Code2 size={14} />}
            isLabelHidden
          />
          <Tab
            value="theme"
            label="Theme"
            icon={<Palette size={14} />}
            isLabelHidden
          />
        </TabList>
      }
      endContent={
        <Button
          label={copied ? '✓ Copied' : 'Share'}
          variant="primary"
          size="md"
          onClick={handleShare}
        />
      }
    />
  ) : undefined;

  const playgroundSideNav = (
    <SideNav
      header={
        <SideNavHeading
          icon={
            <AstryxIcon
              width={24}
              height={24}
              role="img"
              aria-label="Astryx"
              style={{display: 'block', color: 'var(--color-brand)'}}
            />
          }
          heading="Home"
          headingHref="/"
          xstyle={s.sideNavHeading}
        />
      }
      collapsible={{isCollapsed: true, hasButton: false}}
      xstyle={s.desktopCollapsedSideNav}>
      <SideNavSection title="Playground views" isHeaderHidden>
        <SideNavItem
          label="Code Editor"
          icon={Code2}
          isSelected={activeView === 'code'}
          onClick={() => {
            setActiveView('code');
            setMobileTab('code');
          }}
        />
        <SideNavItem
          label="Theme Editor"
          icon={Palette}
          isSelected={activeView === 'theme'}
          onClick={() => {
            setActiveView('theme');
            setMobileTab('theme');
          }}
        />
      </SideNavSection>
    </SideNav>
  );

  const showEditorPanel = !isMobile || mobileTab !== 'preview';
  const showPreviewPanel = !isMobile || mobileTab === 'preview';

  return (
    <AppShell
      variant="section"
      height="fill"
      contentPadding={0}
      banner={<DocsBanner />}
      mobileNav={isMobile ? false : {}}
      topNav={mobileTopNav}
      sideNav={playgroundSideNav}>
      {/* Playground content */}
      <HStack
        data-playground-page="true"
        align="stretch"
        height="100%"
        width="100%"
        xstyle={s.root}
        onPointerDownCapture={handleResizeProbe}>
        {/* Left panel — editor */}
        <VStack
          xstyle={[s.leftPanel, !showEditorPanel && s.hidden]}
          width={isMobile ? '100%' : editorPanel.size || 440}>
          {/* Header row. Desktop gets the full toolbar; mobile gets the format
              action alone, and only over the Code view — TopNav already owns the
              branding and tab switching there, and a phone has no keyboard, so
              the button is the ONLY way a mobile user can reach the formatter.
              (Themes/Templates stay desktop-only, as they were.) */}
          {(!isMobile || activeView === 'code') && (
            <HStack
              justify={isMobile ? 'end' : 'between'}
              align="center"
              xstyle={s.leftPanelHeader}>
              {!isMobile && <Heading level={3}>Playground</Heading>}
              <HStack gap={2} align="center">
                <Button
                  label="Format code"
                  tooltip={formatTooltip}
                  variant="secondary"
                  size="md"
                  isIconOnly
                  icon={<WandSparkles size={16} />}
                  isDisabled={activeView !== 'code'}
                  clickAction={handleFormatCode}
                />
                {!isMobile && (
                  <DropdownMenu
                    button={{
                      label: 'Themes',
                      variant: 'secondary',
                      size: 'md',
                    }}
                    hasChevron
                    items={themeMenuItems}
                  />
                )}
                {!isMobile && (
                  <DropdownMenu
                    button={{
                      label: 'Templates',
                      variant: 'secondary',
                      size: 'md',
                    }}
                    hasChevron
                    items={templateMenuItems}
                  />
                )}
              </HStack>
            </HStack>
          )}
          {/* Both panes stay mounted (hidden when inactive) so Monaco's
              typedefs and the theme editor's state survive tab switches. */}
          <VStack xstyle={s.tabBody}>
            <VStack xstyle={[s.pane, activeView !== 'code' && s.hidden]}>
              <MonacoEditor
                defaultLanguage="typescript"
                value={code}
                path="playground.tsx"
                theme={editorTheme}
                onChange={v => setCode(v ?? '')}
                beforeMount={handleMonacoBeforeMount}
                onMount={handleMonacoMount}
                options={editorOptions}
              />
            </VStack>
            <VStack xstyle={[s.pane, activeView !== 'theme' && s.hidden]}>
              <ThemeEditor
                key={selectedTheme}
                mode={mode}
                initialTheme={editorInitialTheme}
                onThemeChange={postCustomTheme}
              />
            </VStack>
          </VStack>
        </VStack>

        {!isMobile && (
          <ResizeHandle
            label="Resize editor panel"
            resizable={editorPanel.props}
            pillPlacement="center"
            hasDivider
          />
        )}

        {/* Right panel — preview */}
        <VStack xstyle={[s.rightPanel, !showPreviewPanel && s.hidden]}>
          {!isMobile && (
            <Toolbar
              label="Preview controls"
              startContent={
                <ToggleButton
                  label="Target element"
                  tooltip={
                    isTargeting
                      ? 'Exit targeting (Esc)'
                      : 'Click to select an element'
                  }
                  isPressed={isTargeting}
                  onPressedChange={toggleTargeting}
                  size="md"
                  isIconOnly
                  icon={<Crosshair size={20} />}
                  pressedIcon={
                    <Crosshair size={20} color="var(--color-icon-blue)" />
                  }
                  xstyle={isTargeting ? s.targetingActive : undefined}
                />
              }
              centerContent={
                <HStack gap={2} vAlign="center">
                  <Button
                    label={
                      mode === 'light' ? 'Switch to dark' : 'Switch to light'
                    }
                    tooltip={mode === 'light' ? 'Dark mode' : 'Light mode'}
                    variant="ghost"
                    size="md"
                    isIconOnly
                    icon={
                      mode === 'light' ? <Moon size={20} /> : <Sun size={20} />
                    }
                    onClick={togglePreviewMode}
                  />
                  <SegmentedControl
                    label="Viewport size"
                    size="md"
                    value={viewport}
                    onChange={v => setViewport(v as Viewport)}>
                    <SegmentedControlItem
                      value="desktop"
                      label="Desktop"
                      isLabelHidden
                      icon={<Monitor size={20} />}
                    />
                    <SegmentedControlItem
                      value="phone"
                      label="Phone"
                      isLabelHidden
                      icon={<Smartphone size={20} />}
                    />
                  </SegmentedControl>
                  <Button
                    label="Expand"
                    tooltip="Fullscreen preview"
                    variant="ghost"
                    size="md"
                    isIconOnly
                    icon={<Maximize2 size={20} />}
                    onClick={expandPreview}
                  />
                </HStack>
              }
              endContent={
                <HStack gap={4} vAlign="center">
                  {buildStatus !== 'idle' && (
                    <HStack
                      gap={2}
                      vAlign="center"
                      xstyle={[
                        s.buildStatus,
                        statusFading && s.buildStatusFaded,
                      ]}>
                      <StatusDot
                        variant={BUILD_STATUS_META[buildStatus].variant}
                        label={BUILD_STATUS_META[buildStatus].label}
                        isPulsing={buildStatus === 'building'}
                      />
                      <Text type="supporting" color="secondary">
                        {BUILD_STATUS_META[buildStatus].label}
                      </Text>
                      {buildStatus === 'error' && (
                        <Button
                          label="Rebuild"
                          tooltip="Rebuild"
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          icon={<RotateCw size={16} />}
                          onClick={handleRebuild}
                        />
                      )}
                    </HStack>
                  )}
                  <Popover
                    label="Share template"
                    placement="below"
                    alignment="end"
                    xstyle={s.popoverPadding}
                    onOpenChange={open => {
                      if (open) {
                        setShareUrl(window.location.href);
                        setExportTheme(
                          customThemeRef.current ?? editorInitialTheme,
                        );
                      }
                    }}
                    content={
                      <VStack gap={6}>
                        <VStack gap={2}>
                          <Text type="label" weight="semibold">
                            Share Playground
                          </Text>
                          <HStack gap={2} vAlign="center" width="100%">
                            <TextInput
                              label="Share URL"
                              isLabelHidden
                              isDisabled
                              value={shareUrl}
                              onChange={() => {}}
                              controlXstyle={s.shareInput}
                            />
                            <Button
                              label={copied ? 'Copied' : 'Copy URL'}
                              tooltip={copied ? 'Copied' : 'Copy URL'}
                              variant="secondary"
                              size="md"
                              isIconOnly
                              icon={
                                copied ? (
                                  <Check size={16} />
                                ) : (
                                  <Copy size={16} />
                                )
                              }
                              onClick={handleShare}
                            />
                          </HStack>
                        </VStack>
                        <VStack gap={2}>
                          <Text type="label" weight="semibold">
                            Export Theme File
                          </Text>
                          <HStack gap={2} vAlign="center" width="100%">
                            <TextInput
                              label="Theme name"
                              isLabelHidden
                              placeholder="Enter theme name"
                              value={themeName}
                              onChange={v =>
                                setThemeName(v.replace(/[\s-]/g, ''))
                              }
                              controlXstyle={s.shareInput}
                            />
                            <Button
                              label="Download theme"
                              tooltip="Download theme"
                              variant="secondary"
                              size="md"
                              isIconOnly
                              isDisabled={themeExport == null}
                              icon={<Download size={16} />}
                              onClick={() => downloadLinkRef.current?.click()}
                            />
                            {themeExport && (
                              <a
                                ref={downloadLinkRef}
                                href={themeExport.href}
                                download={themeExport.filename}
                                {...stylex.props(s.hidden)}
                                aria-hidden="true"
                                tabIndex={-1}>
                                Download theme file
                              </a>
                            )}
                          </HStack>
                          <Link href="/docs/theme" hasUnderline>
                            Learn about using themes
                          </Link>
                        </VStack>
                      </VStack>
                    }>
                    <Button
                      label="Export"
                      variant="primary"
                      size="md"
                      endContent={<ExternalLink size={16} />}
                    />
                  </Popover>
                </HStack>
              }
            />
          )}
          {process.env.NODE_ENV !== 'development' && (
            <Text type="supporting" color="secondary" xstyle={s.previewNotice}>
              Ephemeral preview: no local storage or parent-page access.
              Reloading or navigating the preview resets runtime state, then
              restores your code and theme.
            </Text>
          )}
          <PreviewStage
            viewport={isMobile ? 'phone' : viewport}
            isFullscreen={isFullscreen}
            onExitFullscreen={() => setIsFullscreen(false)}
            frameRef={attachFrame}
            frame={frame}
            onFrameLoad={handleFrameLoad}
            isInteractionDisabled={isResizing}
            isFullBleed={isMobile}
          />
        </VStack>
      </HStack>

      <ConfirmDialog
        isOpen={pendingExampleTheme != null}
        title="Apply example theme"
        message="Applying an example theme will overwrite your current theme. Any changes you've made in the Theme editor will be lost. Do you want to continue?"
        onCancel={() => setPendingExampleTheme(null)}
        onConfirm={() => {
          if (pendingExampleTheme != null) {
            setSelectedTheme(pendingExampleTheme);
          }
          setPendingExampleTheme(null);
        }}
      />
      <ConfirmDialog
        isOpen={pendingTemplateSource != null}
        title="Load template"
        message="Loading this template will replace the current contents of the code editor. Any changes you've made there will be lost. Do you want to continue?"
        onCancel={() => setPendingTemplateSource(null)}
        onConfirm={() => {
          if (pendingTemplateSource != null) {
            setCode(stripCodeExampleCopyrightHeader(pendingTemplateSource));
            requestAnimationFrame(() => editorRef.current?.focus());
          }
          setPendingTemplateSource(null);
        }}
      />
    </AppShell>
  );
}
