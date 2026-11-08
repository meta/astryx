// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ShowcaseThumbnail.tsx
 *
 * A component's showcase block, cropped and scaled down to a gallery tile.
 *
 * @input  name — component name; keys into the generated showcase registries
 * @output a 16:10 tile rendering the showcase at 2x, scaled to 0.5
 * @position rendered by the /components gallery, one per component card
 *
 * The first EAGER_SHOWCASE_COUNT tiles (see scripts/generate-data.mjs) are
 * statically imported, so they are part of the page chunk and server-render
 * into the prerendered HTML — a visitor sees them at first paint rather than
 * after hydration plus a chunk fetch. Everything below the fold still loads
 * on approach.
 */

'use client';

import React, {lazy, Suspense, useRef, useState, useEffect} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Text} from '@astryxdesign/core/Text';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {useThemeMode} from '../app/providers';
import {showcaseRegistry} from '../generated/showcaseRegistry';

import {eagerShowcases} from './eagerShowcases';

/** Distance from the viewport at which a lazy tile starts loading. */
const LAZY_ROOT_MARGIN = '400px';

const styles = stylex.create({
  container: {
    width: '100%',
    aspectRatio: '16/10',
    overflow: 'hidden',
    position: 'relative' as const,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto 300px 187px',
  },
  // The showcase renders at 2x the tile's width and is scaled back by half,
  // so a 300px tile shows a 600px-wide composition. Expressing that as
  // `200%` + `scale(0.5)` keeps it pure CSS: no measured width, so no
  // ResizeObserver, so the tile can render on the server.
  scaler: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '200%',
    height: '200%',
    transform: 'scale(0.5)',
    transformOrigin: 'top left',
    pointerEvents: 'none' as const,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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

class ShowcaseErrorBoundary extends React.Component<
  {children: React.ReactNode},
  {hasError: boolean}
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div {...stylex.props(styles.errorFallback)}>
          <Text type="supporting" color="secondary">
            Preview unavailable
          </Text>
        </div>
      );
    }
    return this.props.children;
  }
}

const lazyComponentCache = new Map<
  string,
  React.LazyExoticComponent<React.ComponentType>
>();

function getLazyShowcase(
  name: string,
): React.LazyExoticComponent<React.ComponentType> | undefined {
  const cached = lazyComponentCache.get(name);
  if (cached != null) {
    return cached;
  }
  const loader = showcaseRegistry[name];
  if (loader == null) {
    return undefined;
  }
  const component = lazy(loader);
  lazyComponentCache.set(name, component);
  return component;
}

/**
 * The tile itself: crops and scales whatever preview is placed inside it.
 */
function ThumbnailFrame({
  children,
  containerRef,
}: {
  children: React.ReactNode;
  containerRef?: React.Ref<HTMLDivElement>;
}) {
  // `themeMode`, not `mode`: it stays 'system' until the OS-preference effect
  // resolves, so a server-rendered tile follows the OS scheme through
  // light-dark() rather than flashing light for dark-mode visitors — the same
  // reasoning as the site-level <Theme> in providers.tsx (#2713).
  const {themeMode} = useThemeMode();
  return (
    <div ref={containerRef} {...stylex.props(styles.container)} inert>
      <div {...stylex.props(styles.scaler)}>
        <ShowcaseErrorBoundary>
          <Theme theme={neutralTheme} mode={themeMode}>
            {children}
          </Theme>
        </ShowcaseErrorBoundary>
      </div>
    </div>
  );
}

/** Above the fold: statically imported, rendered on the server, no skeleton. */
function EagerThumbnail({Component}: {Component: React.ComponentType}) {
  return (
    <ThumbnailFrame>
      <Component />
    </ThumbnailFrame>
  );
}

/** Below the fold: the showcase chunk is fetched as the tile nears the viewport. */
function LazyThumbnail({name}: {name: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      {rootMargin: LAZY_ROOT_MARGIN},
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Component = getLazyShowcase(name);

  return (
    <ThumbnailFrame containerRef={containerRef}>
      {isVisible && Component != null ? (
        <Suspense
          fallback={
            <div {...stylex.props(styles.skeleton)}>
              <Skeleton width="100%" height="100%" />
            </div>
          }>
          <Component />
        </Suspense>
      ) : null}
    </ThumbnailFrame>
  );
}

export function ShowcaseThumbnail({name}: {name: string}) {
  const Eager = eagerShowcases[name];
  return Eager != null ? (
    <EagerThumbnail Component={Eager} />
  ) : (
    <LazyThumbnail name={name} />
  );
}
