// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Renders a scaled live template preview inside a gallery tile.
 * @input Uses the template slug, theme mode, visibility, and measured tile size.
 * @output Starts the template import when the tile becomes visible, renders the loaded page in a normalized viewport, and releases the global queue after each committed render.
 * @position Client-side live preview for template gallery cards.
 */

'use client';

import {
  type ComponentType,
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
import {scheduleThumbnailRender} from './thumbnailRenderScheduler';
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
  const [LoadedTemplate, setLoadedTemplate] = useState<ComponentType | null>(
    null,
  );
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

  // Only visible tiles join the activation queue. A zero root margin avoids
  // importing heavy template dependencies before their tiles enter the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextIsVisible = entry.isIntersecting;
        isVisibleRef.current = nextIsVisible;
        setIsVisible(nextIsVisible);
        if (!nextIsVisible) {
          isRenderReadyRef.current = false;
          setIsRenderReady(false);
        }
      },
      {rootMargin: '0px'},
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Syncs the template chunk download with visibility: every visible tile
  // starts its import at once, so downloads run in parallel. Only the render
  // waits for the queue.
  useEffect(() => {
    if (isVisible && Component != null) {
      preloadTemplate(slug).catch(() => {});
    }
  }, [Component, isVisible, slug]);

  // The queue does not release the next thumbnail until this preview commits,
  // so template renders stay sequential. The job renders the loaded component,
  // not the lazy one: a render that suspends shows the Suspense fallback, and
  // React then holds back each reveal until 300ms after the latest fallback.
  useEffect(() => {
    if (!isVisible || isRenderReadyRef.current || !Component) {
      return;
    }

    let isActive = true;
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
          const show = (template: ComponentType) => {
            if (!isActive) {
              return;
            }
            startTransition(() => {
              if (isVisibleRef.current) {
                isRenderReadyRef.current = true;
                setLoadedTemplate(() => template);
                setIsRenderReady(true);
              } else {
                settleRender();
              }
            });
          };
          const loaded = getLoadedTemplate(slug);
          if (loaded) {
            show(loaded);
          } else {
            preloadTemplate(slug).then(show, settleRender);
          }
        }),
    );

    return () => {
      isActive = false;
      cancel();
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
                  {LoadedTemplate ? <LoadedTemplate /> : <Component />}
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
