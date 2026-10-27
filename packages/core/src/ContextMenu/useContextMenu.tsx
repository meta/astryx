// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useContextMenu.tsx
 * @input A ref to the element, and createContextMenu's options with a
 *   ReactNode `menuContent`
 * @output useContextMenu: the React wrapper over createContextMenu,
 *   returning `{open, close}` (spec:AST-107 FR8, FR6)
 * @position Public hook; it delegates entirely to the factory and has no
 *   behavior of its own. The menu renders in the factory's root with the
 *   caller's Core providers carried over (theme, layer, link, i18n)
 */

import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {InternationalizationContext} from '../i18n/InternationalizationContext';
import {LayerContext} from '../Layer/LayerContext';
import {LinkContext} from '../Link/LinkContext';
import {ThemeContext} from '../theme/useTheme';
import type {ContextMenuOption} from './ContextMenu';
import {
  createInternalContextMenu,
  type ContextMenuInternals,
  type ContextMenuPoint,
  type InternalContextMenuController,
} from './createContextMenu';

interface UseContextMenuSharedOptions {
  /** Names the menu for assistive technology. */
  label?: string;
  /** While true, the element makes no context request and keeps the browser's own menu. */
  isDisabled?: boolean;
  /** Called with true when the menu opens and false when it closes. */
  onOpenChange?: (isOpen: boolean) => void;
}

export type UseContextMenuOptions = UseContextMenuSharedOptions &
  (
    | {items: ReadonlyArray<ContextMenuOption>; menuContent?: undefined}
    | {items?: undefined; menuContent: ReactNode}
  );

/** What useContextMenu returns. */
export interface UseContextMenuResult {
  /** Opens the menu at `at`, client coordinates; at the element without it. */
  open: (at?: ContextMenuPoint) => void;
  /** Closes the menu. */
  close: () => void;
}

/**
 * Attaches a context menu to the element `ref` points at (spec:AST-107 FR8):
 * it opens on that element's context request, and unmounting removes it.
 */
export function useContextMenu(
  ref: RefObject<HTMLElement | null>,
  options: UseContextMenuOptions,
): UseContextMenuResult {
  const theme = use(ThemeContext);
  const layer = use(LayerContext);
  const link = use(LinkContext);
  const intl = use(InternationalizationContext);
  const wrap = useCallback(
    (menu: ReactNode): ReactNode => (
      <InternationalizationContext value={intl}>
        <ThemeContext value={theme}>
          <LayerContext value={layer}>
            <LinkContext value={link}>{menu}</LinkContext>
          </LayerContext>
        </ThemeContext>
      </InternationalizationContext>
    ),
    [intl, theme, layer, link],
  );
  const {menuContent, ...shared} = options;
  const factoryOptions = menuContent === undefined ? options : shared;
  const internals: ContextMenuInternals = useMemo(
    () => ({reactContent: menuContent, wrap}),
    [menuContent, wrap],
  );
  const latestRef = useRef({factoryOptions, internals});
  const controllerRef = useRef<InternalContextMenuController | null>(null);

  useLayoutEffect(() => {
    latestRef.current = {factoryOptions, internals};
    controllerRef.current?.update(factoryOptions, internals);
  });

  useEffect(() => {
    const element = ref.current;
    if (element == null) {
      return;
    }
    const latest = latestRef.current;
    const controller = createInternalContextMenu(
      element,
      latest.factoryOptions,
      latest.internals,
    );
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [ref]);

  return useMemo(
    () => ({
      open: (at?: ContextMenuPoint) => controllerRef.current?.open(at),
      close: () => controllerRef.current?.close(),
    }),
    [],
  );
}
