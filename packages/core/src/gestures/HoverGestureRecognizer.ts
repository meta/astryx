// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HoverGestureRecognizer.ts
 * @input Hover entry and exit from a component's pointer handlers
 * @output Internal hover timing with document-scoped intent groups
 * @position Hover-only recognizer; takes no touches from the gesture arena
 */

import {realmValue, sharedKey} from '../utils/sharedRealm';

interface HoverIntent {
  enterMs: number;
  exitMs: number;
  group: string;
}

interface HoverCallbacks {
  onEnter: () => boolean;
  onExit: () => void;
  isActive: () => boolean;
}

const groups = realmValue(
  sharedKey('gestures/hover-intent', 1),
  () => new WeakMap<Document, Map<string, HoverGestureRecognizer>>(),
);

export class HoverGestureRecognizer {
  readonly kind = 'hover';
  private enterTimer: ReturnType<typeof setTimeout> | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;
  private document: Document | null = null;
  private intent: HoverIntent | null = null;
  private callbacks: HoverCallbacks | null = null;
  private revision = 0;

  enter(
    document: Document,
    intent: HoverIntent,
    callbacks: HoverCallbacks,
  ): void {
    this.cancelEnter();
    this.cancelExit();
    if (this.document !== document || this.intent?.group !== intent.group) {
      this.releaseGroup();
    }
    this.document = document;
    this.intent = intent;
    this.callbacks = callbacks;
    const revision = ++this.revision;
    const previous = groups.get(document)?.get(intent.group);
    const show = () => {
      this.enterTimer = null;
      if (!callbacks.isActive() || !callbacks.onEnter()) {
        return;
      }
      if (this.revision !== revision) {
        return;
      }
      const active = groups.get(document)?.get(intent.group);
      if (active != null && active !== this) {
        active.close();
      }
      if (this.revision !== revision) {
        return;
      }
      let documentGroups = groups.get(document);
      if (documentGroups == null) {
        documentGroups = new Map();
        groups.set(document, documentGroups);
      }
      documentGroups.set(intent.group, this);
    };
    if (previous?.callbacks?.isActive()) {
      show();
    } else {
      this.enterTimer = setTimeout(show, intent.enterMs);
    }
  }

  leave(onExit: () => void, exitMs = this.intent?.exitMs ?? 0): void {
    this.cancelEnter();
    this.cancelExit();
    this.exitTimer = setTimeout(() => {
      this.exitTimer = null;
      this.releaseGroup();
      onExit();
    }, exitMs);
  }

  cancelEnter(): void {
    if (this.enterTimer != null) {
      clearTimeout(this.enterTimer);
      this.enterTimer = null;
    }
  }

  cancelExit(): void {
    if (this.exitTimer != null) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
  }

  cancel(): void {
    this.revision += 1;
    this.cancelEnter();
    this.cancelExit();
    this.releaseGroup();
    this.document = null;
    this.intent = null;
    this.callbacks = null;
  }

  private close(): void {
    const callbacks = this.callbacks;
    this.cancel();
    callbacks?.onExit();
  }

  private releaseGroup(): void {
    if (this.document == null || this.intent == null) {
      return;
    }
    const documentGroups = groups.get(this.document);
    if (documentGroups?.get(this.intent.group) === this) {
      documentGroups.delete(this.intent.group);
      if (documentGroups.size === 0) {
        groups.delete(this.document);
      }
    }
  }
}
