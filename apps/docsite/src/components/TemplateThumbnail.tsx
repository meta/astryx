// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Renders a scaled live template preview inside a gallery tile.
 * @input Uses the template slug, theme mode, visibility, and measured tile size.
 * @output Downloads the template when the tile is visible, or in idle time when it is within one viewport of the screen; a fast scroll holds every download. Renders the loaded page in a normalized viewport while the tile is visible, and releases the global queue after each committed render.
 * @position Client-side live preview for template gallery cards.
 */

'use client';

import {
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {useThemeMode} from '../app/providers';
import {
  TEMPLATE_COMPONENTS,
  getLoadedTemplate,
  preloadTemplate,
} from './templateComponents';
import {observeNearViewport, whenScrollIsCalm} from './templatePrefetch';
import {
  scheduleThumbnailPrefetch,
  scheduleThumbnailRender,
} from './thumbnailRenderScheduler';
import previewCss from './TemplatePreviewSurface.module.css';

const FIXED_SCALE = 0.5;

const styles = stylex.create({
  container: {
    width: '100%',
    aspectRatio: '16/10',
    overflow: 'hidden',
    position: 'relative' as const,
    borderRadius: 'var(--radius-container)',
    // Templates render transparent (content-only, no AppShell), so the
    // thumbnail host supplies the page background — use the app surface color.
    backgroundColor: 'var(--color-background-surface)',
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto 300px 187px',
  },
  scaler: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    transformOrigin: 'top left',
    pointerEvents: 'none' as const,
    overflow: 'hidden',
  },
  skeleton: {
    width: '100%',
    height: '100%',
  },
  errorFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-background-muted)',
  },
});

function ThumbnailRenderSettled({onSettled}: {onSettled: () => void}) {
  useEffect(() => {
    onSettled();
  }, [onSettled]);
  return null;
}

export function TemplateThumbnail({
  slug,
  aspectRatio,
  renderWidth: fixedRenderWidth,
  borderRadius,
}: {
  slug: string;
  /** Crop window aspect ratio (CSS aspect-ratio). Defaults to '16/10'. */
  aspectRatio?: string;
  /**
   * Width (px) to render the template at before scaling it to fit the tile.
   * Default (undefined) renders at 2× the tile width (scale 0.5) — a zoomed-in
   * slice. Pass a desktop width (e.g. 1100) to render the FULL page composition
   * and shrink it to fit, so the whole page shows rather than a top-left corner.
   */
  renderWidth?: number;
  /**
   * Override the container's corner radius (CSS border-radius). Pass '0' when the
   * thumbnail is already framed/clipped by a rounded parent, so the default
   * --radius-container doesn't nest a second, mismatched radius inside it.
   */
  borderRadius?: string;
}) {
  const {mode} = useThemeMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileWidth, setTileWidth] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isRenderReady, setIsRenderReady] = useState(false);
  const isVisibleRef = useRef(false);
  const isRenderReadyRef = useRef(false);
  const resolveRenderRef = useRef<(() => void) | null>(null);
  const Component = TEMPLATE_COMPONENTS[slug];

  const settleRender = useCallback(() => {
    const resolve = resolveRenderRef.current;
    resolveRenderRef.current = null;
    resolve?.();
  }, []);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setTileWidth(containerRef.current.offsetWidth);
    }
  }, []);

  // Render width: a fixed desktop width (full-page miniature) when provided,
  // else 2× the tile width (the legacy zoomed-in slice).
  const renderWidth =
    fixedRenderWidth != null ? fixedRenderWidth : tileWidth / FIXED_SCALE;
  // Scale so the rendered width fits the tile width.
  const scale = renderWidth > 0 ? tileWidth / renderWidth : FIXED_SCALE;

  // Syncs visibility and the template chunk download with the page scroll.
  // Only visible tiles join the render queue: the visibility observer has a
  // zero root margin. The shared near-viewport observer has a lead margin, so
  // it reports a tile before the tile is visible. A visible tile starts its
  // import at once, so the downloads of visible tiles run in parallel. A tile
  // that is only near the viewport starts its import in idle time, after the
  // visible tiles render, so it is ready before it scrolls in. During a fast
  // scroll both wait.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || Component == null) {
      return;
    }

    let isNear = false;
    let cancelDownload = () => {};
    const startImport = () => {
      preloadTemplate(slug).catch(() => {});
    };
    const updateDownload = () => {
      cancelDownload();
      cancelDownload = () => {};
      if (isVisibleRef.current) {
        cancelDownload = whenScrollIsCalm(startImport);
      } else if (isNear) {
        let cancelPrefetch = () => {};
        const cancelGate = whenScrollIsCalm(() => {
          cancelPrefetch = scheduleThumbnailPrefetch(startImport);
        });
        cancelDownload = () => {
          cancelGate();
          cancelPrefetch();
        };
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextIsVisible = entry.isIntersecting;
        isVisibleRef.current = nextIsVisible;
        setIsVisible(nextIsVisible);
        if (!nextIsVisible) {
          isRenderReadyRef.current = false;
          setIsRenderReady(false);
        }
        updateDownload();
      },
      {rootMargin: '0px'},
    );
    observer.observe(el);
    const stopNear = observeNearViewport(el, nextIsNear => {
      isNear = nextIsNear;
      updateDownload();
    });
    return () => {
      observer.disconnect();
      stopNear();
      cancelDownload();
    };
  }, [Component, slug]);

  // The queue does not release the next thumbnail until this preview commits,
  // so template renders stay sequential. The job renders the loaded component,
  // not the lazy one: a render that suspends shows the Suspense fallback, and
  // React then holds back each reveal until 300ms after the latest fallback.
  useEffect(() => {
    if (!isVisible || isRenderReadyRef.current || !Component) {
      return;
    }

    let isActive = true;
    let cancelImport = () => {};
    const cancel = scheduleThumbnailRender(
      () =>
        new Promise<void>(resolve => {
          if (!isActive || !isVisibleRef.current) {
            resolve();
            return;
          }
          // Cleanup calls settleRender, so an import that is still in flight
          // never holds the queue.
          resolveRenderRef.current = resolve;
          const show = () => {
            if (!isActive) {
              return;
            }
            startTransition(() => {
              if (isVisibleRef.current) {
                isRenderReadyRef.current = true;
                setIsRenderReady(true);
              } else {
                settleRender();
              }
            });
          };
          if (getLoadedTemplate(slug)) {
            show();
          } else {
            // A fast scroll holds this download too, so a tile that leaves
            // the lead zone before the scroll slows down downloads nothing.
            cancelImport = whenScrollIsCalm(() => {
              preloadTemplate(slug).then(show, settleRender);
            });
          }
        }),
    );

    return () => {
      isActive = false;
      cancel();
      cancelImport();
      settleRender();
    };
  }, [Component, isVisible, settleRender, slug]);

  // Measure container width to compute render width
  useEffect(() => {
    updateWidth();
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateWidth]);

  if (!Component) {
    return null;
  }
  // A ready tile renders its loaded page. The lazy component is the fallback
  // when the slug changes before the next render turn.
  const Template = getLoadedTemplate(slug) ?? Component;

  return (
    <div
      ref={containerRef}
      {...stylex.props(styles.container)}
      style={
        aspectRatio || borderRadius
          ? {
              ...(aspectRatio ? {aspectRatio} : {}),
              ...(borderRadius ? {borderRadius} : {}),
            }
          : undefined
      }
      inert>
      {tileWidth > 0 &&
        isVisible &&
        (isRenderReady ? (
          <div
            {...stylex.props(styles.scaler)}
            style={{
              width: renderWidth,
              height: `${100 / scale}%`,
              transform: `scale(${scale})`,
            }}>
            <Suspense
              fallback={
                <div {...stylex.props(styles.skeleton)}>
                  <Skeleton width="100%" height="100%" />
                </div>
              }>
              <Theme theme={neutralTheme} mode={mode}>
                <div className={previewCss.viewport}>
                  <Template />
                  <ThumbnailRenderSettled onSettled={settleRender} />
                </div>
              </Theme>
            </Suspense>
          </div>
        ) : (
          <div {...stylex.props(styles.skeleton)}>
            <Skeleton width="100%" height="100%" />
          </div>
        ))}
    </div>
  );
}
