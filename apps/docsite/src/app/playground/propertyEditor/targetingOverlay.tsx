// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file targetingOverlay.tsx
 * @input Pointer events inside the preview iframe + the current clean source
 * @output Hover/selection overlays, the selection badge, and the Properties popover
 * @position Playground preview iframe — the element-targeting half of property editing.
 *
 * Runs inside the preview iframe. The hover/selection overlays and their labels
 * are vanilla DOM (created imperatively and positioned every animation frame for
 * performance); each label hosts a React root rendering the selection badge,
 * whose popover embeds the PropertyEditor. The preview page drives this via
 * createTargetingController() and the setActiveSiteMode/setCleanSource setters.
 */

import {useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import './targetingOverlay.css';
import {Settings, X} from 'lucide-react';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Popover} from '@astryxdesign/core/Popover';
import {Theme, MediaTheme} from '@astryxdesign/core/theme';
import type {ThemeMode} from '@astryxdesign/core/theme';
import {astryxTheme} from '../../../themes/astryx';
import {PropertyEditor} from './PropertyEditor';

const styles = stylex.create({
  badge: {minHeight: 32},
  badgeActions: {marginRight: -10},
  popover: {paddingBlock: 0, paddingInline: 0},
});

// Blue label for a selected instance with a popover for its properties.
function TargetLabel({
  name,
  isInteractive,
  id,
  code,
  onCodeChange,
}: {
  name: string;
  isInteractive: boolean;
  id: string;
  code: string;
  onCodeChange: (code: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const badge = (
    <MediaTheme mode="dark">
      <HStack gap={2} vAlign="center" xstyle={styles.badge}>
        <Text>{name}</Text>
        {isInteractive && (
          <HStack xstyle={styles.badgeActions}>
            <Button
              label="Properties"
              variant="ghost"
              size="sm"
              isIconOnly
              icon={<Settings size={12} />}
            />
            <Button
              label="Deselect"
              variant="ghost"
              size="sm"
              isIconOnly
              icon={<X size={12} />}
              onClick={() => clearSelectionOverlay()}
            />
          </HStack>
        )}
      </HStack>
    </MediaTheme>
  );

  if (!isInteractive) {
    return badge;
  }

  const sep = id.lastIndexOf('#');
  const component = sep >= 0 ? id.slice(0, sep) : id;
  const instanceIndex = sep >= 0 ? Number(id.slice(sep + 1)) : 0;

  return (
    <Popover
      label="Component properties"
      placement="below"
      alignment="start"
      width={400}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      xstyle={styles.popover}
      content={
        <PropertyEditor
          code={code}
          onCodeChange={onCodeChange}
          externalSelection={{component, instanceIndex}}
          onApplied={() => setIsOpen(false)}
        />
      }>
      {badge}
    </Popover>
  );
}

const labelRoots = new WeakMap<HTMLElement, Root>();
const activeLabels = new Set<HTMLDivElement>();

// The selection tool (badges, popover, ring) is Playground chrome, not preview
// content — it always renders on the site theme (Astryx) so it stays visually
// distinct from whatever theme the preview is showing. We only track the site
// color mode so the chrome matches light/dark.
let activeSiteMode: ThemeMode = 'light';

let cleanSource = '';

/** The site color mode the badges render in (set by the preview page). */
export function setActiveSiteMode(mode: ThemeMode) {
  activeSiteMode = mode;
}

/** The un-annotated source the popover's PropertyEditor edits against. */
export function setCleanSource(source: string) {
  cleanSource = source;
}

/**
 * The channel back to the playground, set by the preview page once its port
 * handshake lands (see previewChannel.ts). Module-level like the site-mode and
 * clean-source setters above, because the popover roots render outside the
 * page's React tree.
 */
let postToParentFn: (msg: Record<string, unknown>) => void = () => {};

export function setPostToParent(fn: (msg: Record<string, unknown>) => void) {
  postToParentFn = fn;
}

function postEditToParent(code: string) {
  postToParentFn({type: 'preview-edit-code', code});
}

function renderTargetLabel(label: HTMLDivElement) {
  const root = labelRoots.get(label);
  if (!root) {
    return;
  }
  const name = label.dataset.labelText ?? '';
  const isInteractive = label.dataset.interactive === 'true';
  const id = label.dataset.labelId ?? '';
  root.render(
    <Theme theme={astryxTheme} mode={activeSiteMode}>
      <TargetLabel
        name={name}
        isInteractive={isInteractive}
        id={id}
        code={cleanSource}
        onCodeChange={postEditToParent}
      />
    </Theme>,
  );
}

function createTargetLabel(isInteractive: boolean): HTMLDivElement {
  const label = document.createElement('div');
  label.className = 'pg-target-label';
  label.dataset.interactive = String(isInteractive);
  label.dataset.labelText = '';
  labelRoots.set(label, createRoot(label));
  activeLabels.add(label);
  renderTargetLabel(label);
  return label;
}

function setTargetLabelText(label: HTMLDivElement, value: string) {
  if (label.dataset.labelText === value) {
    return;
  }
  label.dataset.labelText = value;
  renderTargetLabel(label);
}

/** Re-render every live badge (e.g. after the site mode or source changes). */
export function refreshTargetLabels() {
  for (const label of activeLabels) {
    renderTargetLabel(label);
  }
}

/**
 * Persistent selection overlay — same visual treatment as the hover overlay
 * (blue border + tinted fill + component name label). Lives in a separate
 * DOM element so it can coexist with (or be hidden by) the hover overlay.
 */
const selectionState = {
  overlay: null as HTMLDivElement | null,
  label: null as HTMLDivElement | null,
  id: null as string | null,
  rafId: 0,
};

function ensureSelectionOverlay() {
  if (selectionState.overlay) {
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'pg-target-selection';
  const label = createTargetLabel(true);
  overlay.appendChild(label);
  document.body.appendChild(overlay);
  selectionState.overlay = overlay;
  selectionState.label = label;
}

function updateSelectionPosition() {
  const {overlay, label, id} = selectionState;
  if (!overlay || !label || !id) {
    return;
  }
  const el = document.querySelector<HTMLElement>(`[data-pg-id="${id}"]`);
  if (!el) {
    overlay.dataset.visible = 'false';
    return;
  }
  const rect = el.getBoundingClientRect();
  overlay.style.top = `${rect.top - 2}px`;
  overlay.style.left = `${rect.left - 2}px`;
  overlay.style.width = `${rect.width + 4}px`;
  overlay.style.height = `${rect.height + 4}px`;
  overlay.dataset.visible = 'true';

  // Carry the full id (Component#index) so the selection badge's popover can
  // scope its PropertyEditor to this exact instance. Re-render only when the
  // name or id actually changes (this runs every animation frame).
  const sep = id.lastIndexOf('#');
  const name = sep >= 0 ? id.slice(0, sep) : id;
  if (label.dataset.labelText !== name || label.dataset.labelId !== id) {
    label.dataset.labelText = name;
    label.dataset.labelId = id;
    renderTargetLabel(label);
  }

  if (rect.top < 28) {
    label.classList.add('pg-target-label-bottom');
  } else {
    label.classList.remove('pg-target-label-bottom');
  }
}

function selectElement(id: string) {
  ensureSelectionOverlay();
  selectionState.id = id;
  const el = document.querySelector<HTMLElement>(`[data-pg-id="${id}"]`);
  if (el) {
    el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }
  updateSelectionPosition();

  // Keep the overlay positioned during scroll.
  cancelAnimationFrame(selectionState.rafId);
  const track = () => {
    updateSelectionPosition();
    if (selectionState.id === id) {
      selectionState.rafId = requestAnimationFrame(track);
    }
  };
  selectionState.rafId = requestAnimationFrame(track);
}

function clearSelectionOverlay() {
  cancelAnimationFrame(selectionState.rafId);
  selectionState.id = null;
  if (selectionState.overlay) {
    selectionState.overlay.dataset.visible = 'false';
  }
}

/**
 * Manages the targeting overlay lifecycle inside the iframe. When enabled,
 * intercepts pointer events to highlight hovered Astryx components and report
 * clicks back to the parent frame.
 */
export function createTargetingController(
  postToParent: (msg: Record<string, unknown>) => void,
) {
  let enabled = false;
  let overlayEl: HTMLDivElement | null = null;
  let labelEl: HTMLDivElement | null = null;
  let rafId = 0;
  let lastHoveredId: string | null = null;

  function ensureOverlay() {
    if (overlayEl) {
      return;
    }
    overlayEl = document.createElement('div');
    overlayEl.className = 'pg-target-overlay';
    labelEl = createTargetLabel(false);
    overlayEl.appendChild(labelEl);
    document.body.appendChild(overlayEl);
  }

  function findTargetable(el: Element | null): HTMLElement | null {
    let node = el;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement && node.dataset.pgId) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function parsePgId(id: string): {component: string; index: number} | null {
    const sep = id.lastIndexOf('#');
    if (sep < 0) {
      return null;
    }
    return {
      component: id.slice(0, sep),
      index: parseInt(id.slice(sep + 1), 10),
    };
  }

  function positionOverlay(target: HTMLElement) {
    if (!overlayEl || !labelEl) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const pgId = target.dataset.pgId ?? '';
    overlayEl.style.top = `${rect.top - 2}px`;
    overlayEl.style.left = `${rect.left - 2}px`;
    overlayEl.style.width = `${rect.width + 4}px`;
    overlayEl.style.height = `${rect.height + 4}px`;
    overlayEl.dataset.visible = 'true';

    const parsed = parsePgId(pgId);
    setTargetLabelText(labelEl, parsed ? parsed.component : pgId);

    // Flip label below if it would overflow above the viewport
    if (rect.top < 28) {
      labelEl.classList.add('pg-target-label-bottom');
    } else {
      labelEl.classList.remove('pg-target-label-bottom');
    }
  }

  function hideOverlay() {
    if (overlayEl) {
      overlayEl.dataset.visible = 'false';
    }
    lastHoveredId = null;
  }

  function clearSelection() {
    clearSelectionOverlay();
  }

  function onMouseMove(e: MouseEvent) {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      // Hide overlay temporarily to hit-test through it
      if (overlayEl) {
        overlayEl.style.display = 'none';
      }
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (overlayEl) {
        overlayEl.style.display = '';
      }

      const target = findTargetable(hit);
      if (!target) {
        hideOverlay();
        postToParent({type: 'targeting-hover', id: null});
        return;
      }

      const id = target.dataset.pgId ?? '';
      if (id !== lastHoveredId) {
        lastHoveredId = id;
        positionOverlay(target);
        const parsed = parsePgId(id);
        postToParent({
          type: 'targeting-hover',
          id,
          component: parsed?.component ?? null,
          index: parsed?.index ?? 0,
        });
      }
    });
  }

  function onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (overlayEl) {
      overlayEl.style.display = 'none';
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (overlayEl) {
      overlayEl.style.display = '';
    }

    const target = findTargetable(hit);
    if (!target) {
      return;
    }

    const id = target.dataset.pgId ?? '';
    const parsed = parsePgId(id);
    if (!parsed) {
      return;
    }

    clearSelection();
    selectElement(id);

    postToParent({
      type: 'targeting-select',
      id,
      component: parsed.component,
      index: parsed.index,
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      disable();
      postToParent({type: 'targeting-exit'});
    }
  }

  function enable() {
    if (enabled) {
      return;
    }
    enabled = true;
    clearSelection();
    ensureOverlay();
    document.documentElement.classList.add('pg-targeting');
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function disable() {
    if (!enabled) {
      return;
    }
    enabled = false;
    cancelAnimationFrame(rafId);
    document.documentElement.classList.remove('pg-targeting');
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    hideOverlay();
  }

  return {enable, disable, clearSelection};
}
