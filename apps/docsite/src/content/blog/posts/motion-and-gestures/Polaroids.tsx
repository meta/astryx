// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Polaroids.tsx
 * @input Nothing: the demo owns its photos.
 * @output A table of photos to throw, lay out, flip, put away and reorder.
 * @position Post-local example asset for the motion-and-gestures blog post.
 *   It is not an Astryx component and no package exports it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {
  useAnnounce,
  useLongPress,
  usePressFeedback,
} from '@astryxdesign/core/hooks';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import {
  SpringAnimator,
  attachPan,
  clamp,
  placementAnimator,
  prefersReducedMotion,
  rubberBand,
  springs,
  type Placement,
} from './motion';

type Layout = 'stack' | 'fan' | 'spread';
type Place = 'hand' | 'table' | 'away';

interface Photo {
  id: string;
  caption: string;
  date: string;
  scene: (gradientId: string) => ReactNode;
  /** A fixed, per-photo tilt so the stack looks handled. */
  jitter: number;
}

interface ReorderGhost {
  ghost: HTMLElement;
  ghostPlacement: SpringAnimator<Placement>;
  /** Where the ghost started, so the finger's travel moves it from there. */
  origin: Placement;
  insertAt: number;
}

interface LongPress {
  start: (point: {x: number; y: number}) => void;
  cancel: () => void;
}

interface Snapshot {
  layout: Layout;
  faceUp: ReadonlySet<string>;
  away: ReadonlySet<string>;
  reordering: string | null;
  status: string;
}

const TRAY_HEIGHT = 30;
const HOLD_MS = 350;

/**
 * Owns where every photo is and how it moves. React renders the photos; the
 * deck moves them with springs outside React, so a drag never re-renders.
 */
class PhotoDeck {
  private readonly elements = new Map<string, HTMLElement>();
  private readonly placements = new Map<string, SpringAnimator<Placement>>();
  private readonly flips = new Map<string, SpringAnimator<{angle: number}>>();
  private readonly places = new Map<string, Place>();
  private order: string[];
  private width = 0;
  private height = 0;
  private topZ = 200;
  private selected: string | null = null;
  private keyboardReorder: {id: string; original: string[]} | null = null;
  private snapshot: Snapshot;
  private readonly listeners = new Set<() => void>();
  stage: HTMLElement | null = null;
  announce: (message: string) => void = () => {};

  constructor(private readonly photos: Photo[]) {
    this.order = photos.map(photo => photo.id);
    photos.forEach(photo => this.places.set(photo.id, 'hand'));
    this.snapshot = {
      layout: 'stack',
      faceUp: new Set(),
      away: new Set(),
      reordering: null,
      status: '',
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private update(change: Partial<Snapshot>) {
    this.snapshot = {...this.snapshot, ...change};
    if (change.status) {
      this.announce(change.status);
    }
    this.listeners.forEach(listener => listener());
  }

  private say(status: string) {
    this.update({status});
  }

  register(id: string, element: HTMLElement | null) {
    if (element == null) {
      this.elements.delete(id);
      return;
    }
    this.elements.set(id, element);
    if (!this.placements.has(id)) {
      this.placements.set(id, placementAnimator(element));
      const inner = element.querySelector<HTMLElement>('[data-flip-inner]');
      const shadow = element.querySelector<HTMLElement>('[data-flip-shadow]');
      if (inner != null && shadow != null) {
        this.flips.set(id, flipAnimator(inner, shadow));
      }
    }
  }

  private geometry() {
    const {width, height} = this;
    const photoWidth = width < 480 ? 76 : 92;
    const photoHeight = Math.round(photoWidth * 1.21);
    const table = {x: 8, y: 8, width: width - 16, height: height * 0.4};
    const handTop = table.y + table.height;
    const centerY = handTop + (height - TRAY_HEIGHT - handTop) / 2;
    return {width, height, photoWidth, photoHeight, table, centerY};
  }

  /** Where the photo at `index` of `count` rests in the current layout. */
  private home(index: number, count: number, id: string): Placement {
    const {width, photoWidth, photoHeight, centerY} = this.geometry();
    const jitter = this.photo(id).jitter;
    const centerX = width / 2;
    if (this.snapshot.layout === 'stack') {
      return {
        x: centerX - photoWidth / 2 + (index - count / 2) * 1.5,
        y: centerY - photoHeight / 2 - index * 1.5,
        rotate: jitter * 5,
        scale: 1,
      };
    }
    if (this.snapshot.layout === 'fan') {
      const radius = photoHeight * 2.1;
      const maxHalfAngle =
        (Math.asin(clamp((width / 2 - photoWidth / 2 - 10) / radius, 0, 1)) *
          180) /
        Math.PI;
      const half = Math.min(count * 5.5, maxHalfAngle, 36);
      const angle = count > 1 ? -half + (2 * half * index) / (count - 1) : 0;
      const radians = (angle * Math.PI) / 180;
      return {
        x: centerX - photoWidth / 2 + radius * Math.sin(radians),
        y: centerY - photoHeight / 2 + radius * (1 - Math.cos(radians)) - 10,
        rotate: angle,
        scale: 1,
      };
    }
    const gap = Math.min(
      photoWidth + 12,
      (width - 24 - photoWidth) / Math.max(1, count - 1),
    );
    return {
      x: centerX - ((count - 1) * gap + photoWidth) / 2 + index * gap,
      y: centerY - photoHeight / 2 + (index % 2 === 1 ? 6 : -6),
      rotate: jitter * 3,
      scale: 1,
    };
  }

  private photo(id: string): Photo {
    return this.photos.find(photo => photo.id === id) ?? this.photos[0];
  }

  private element(id: string): HTMLElement | undefined {
    return this.elements.get(id);
  }

  private placement(id: string): SpringAnimator<Placement> | undefined {
    return this.placements.get(id);
  }

  /** Springs every photo in the hand to its slot. Running glides retarget. */
  private layoutHand(
    except?: string,
    carried?: {id: string; velocity: Partial<Placement>},
  ) {
    this.order.forEach((id, index) => {
      const element = this.element(id);
      if (element != null) {
        element.style.zIndex = String(10 + index);
      }
      if (id === except) {
        return;
      }
      void this.placement(id)?.to(this.home(index, this.order.length, id), {
        velocity: carried?.id === id ? carried.velocity : undefined,
      });
    });
  }

  resize(width: number, height: number) {
    const isFirst = this.width === 0;
    this.width = width;
    this.height = height;
    const {photoWidth, photoHeight} = this.geometry();
    for (const element of this.elements.values()) {
      element.style.width = `${photoWidth}px`;
      element.style.height = `${photoHeight}px`;
      element.style.setProperty('--photo-width', `${photoWidth}px`);
    }
    if (isFirst) {
      this.deal();
    } else {
      this.layoutHand();
    }
  }

  setLayout(layout: Layout, reason?: string) {
    this.update({layout, status: reason ?? `${capitalize(layout)} layout.`});
    this.layoutHand();
  }

  deal() {
    const {width, photoWidth, photoHeight} = this.geometry();
    this.order = this.photos.map(photo => photo.id);
    this.photos.forEach(photo => this.places.set(photo.id, 'hand'));
    this.flips.forEach(flip => flip.set({angle: 0}));
    this.update({faceUp: new Set(), away: new Set(), status: 'Dealt.'});
    this.order.forEach((id, index) => {
      const placement = this.placement(id);
      const element = this.element(id);
      if (placement == null || element == null) {
        return;
      }
      element.style.zIndex = String(10 + index);
      const home = this.home(index, this.order.length, id);
      if (prefersReducedMotion()) {
        placement.set(home);
        return;
      }
      placement.set({
        x: width / 2 - photoWidth / 2,
        y: -photoHeight - 30,
        rotate: this.photo(id).jitter * 25,
        scale: 1,
      });
      window.setTimeout(
        () => void placement.to(home, {spring: springs.toss}),
        index * 70,
      );
    });
  }

  flip(id: string) {
    const faceUp = new Set(this.snapshot.faceUp);
    const isFaceUp = !faceUp.has(id);
    if (isFaceUp) {
      faceUp.add(id);
    } else {
      faceUp.delete(id);
    }
    const flip = this.flips.get(id);
    void flip?.to({angle: isFaceUp ? 180 : 0}, {spring: springs.flip});
    const {caption} = this.photo(id);
    this.update({
      faceUp,
      status: isFaceUp ? `Back: “${caption}”` : 'Front: the photo.',
    });
  }

  select(id: string) {
    this.selected = id;
  }

  /** The photo the toolbar acts on: the last one touched or focused. */
  private target(): string | null {
    if (this.selected != null && this.places.get(this.selected) !== 'away') {
      return this.selected;
    }
    return this.order[this.order.length - 1] ?? null;
  }

  flipSelected() {
    const id = this.target();
    if (id != null) {
      this.flip(id);
    }
  }

  throwSelected() {
    const id = this.target();
    if (id == null) {
      return;
    }
    if (this.places.get(id) === 'table') {
      this.toHand(id);
      return;
    }
    const {table, photoWidth} = this.geometry();
    this.toTable(
      id,
      {
        x: table.x + 20 + Math.random() * (table.width - photoWidth - 40),
        y: table.y + 10,
      },
      {x: (Math.random() - 0.5) * 900, y: -1400},
      (Math.random() - 0.5) * 500,
    );
  }

  putAwaySelected() {
    const id = this.target();
    if (id != null) {
      this.putAway(id);
    }
  }

  private toTable(
    id: string,
    point: {x: number; y: number},
    velocity: {x: number; y: number},
    spin: number,
  ) {
    const {photoWidth, photoHeight, table} = this.geometry();
    const placement = this.placement(id);
    const element = this.element(id);
    if (placement == null || element == null) {
      return;
    }
    this.order = this.order.filter(other => other !== id);
    this.places.set(id, 'table');
    element.style.zIndex = String(++this.topZ);
    void placement.to(
      {
        x: clamp(point.x, table.x, table.x + table.width - photoWidth),
        y: clamp(point.y, table.y, table.y + table.height - photoHeight),
        rotate: clamp(placement.value.rotate + spin * 0.18, -40, 40),
        scale: 1,
      },
      {spring: springs.toss, velocity: {...velocity, rotate: spin}},
    );
    this.layoutHand();
    this.say('On the table.');
  }

  private toHand(
    id: string,
    index?: number,
    velocity?: Partial<Placement>,
    status = 'Back in the hand.',
  ) {
    this.order = this.order.filter(other => other !== id);
    this.order.splice(index ?? this.order.length, 0, id);
    this.places.set(id, 'hand');
    this.layoutHand(undefined, velocity ? {id, velocity} : undefined);
    this.say(status);
  }

  private putAway(id: string, velocity = {x: 0, y: 0}) {
    const placement = this.placement(id);
    if (placement == null) {
      return;
    }
    const index = this.order.indexOf(id);
    this.order = this.order.filter(other => other !== id);
    this.places.set(id, 'away');
    this.layoutHand();
    const next = this.order[index] ?? this.order[index - 1];
    if (next != null) {
      this.element(next)?.focus({preventScroll: true});
    }
    void placement
      .to(
        {
          x: placement.value.x + velocity.x * 0.1,
          y: this.height + 40,
          rotate: placement.value.rotate + velocity.x * 0.01,
        },
        {
          spring: springs.toss,
          velocity: {x: velocity.x, y: Math.max(velocity.y, 600)},
        },
      )
      .then(() => {
        if (this.places.get(id) === 'away') {
          this.update({away: new Set([...this.snapshot.away, id])});
        }
      });
    this.say('Put away.');
  }

  /** Wires one photo's pointer gestures. Returns a cleanup. */
  attach(id: string, element: HTMLElement, longPress: LongPress): () => void {
    let start: Placement = {x: 0, y: 0, rotate: 0, scale: 1};
    let grabOffset = {x: 0, y: 0};
    let reorder: ReorderGhost | null = null;

    const hot = (name: string, isHot: boolean) =>
      this.stage
        ?.querySelector(`[data-zone="${name}"]`)
        ?.toggleAttribute('data-hot', isHot);

    return attachPan(element, {
      onPress: state => {
        const placement = this.placement(id);
        if (placement == null) {
          return;
        }
        this.selected = id;
        const rect = element.getBoundingClientRect();
        grabOffset = {
          x: state.startX - (rect.left + rect.width / 2),
          y: state.startY - (rect.top + rect.height / 2),
        };
        if (this.places.get(id) === 'table') {
          element.style.zIndex = String(++this.topZ);
        }
        element.setAttribute('data-lifted', '');
        void placement.to({scale: 1.04}, {spring: springs.lift});
        longPress.start({x: state.startX, y: state.startY});
      },
      onRelease: () => {
        longPress.cancel();
        element.removeAttribute('data-lifted');
        hot('table', false);
        hot('tray', false);
      },
      onTap: () => {
        void this.placement(id)?.to({scale: 1}, {spring: springs.lift});
        if (this.snapshot.reordering === id) {
          // A hold that ends without a move is not a tap.
          this.update({reordering: null, status: 'Reorder cancelled.'});
          return;
        }
        this.flip(id);
      },
      onDragStart: () => {
        longPress.cancel();
        const placement = this.placement(id);
        if (placement == null) {
          return;
        }
        if (this.snapshot.reordering === id) {
          reorder = this.startReorderGhost(id);
          return;
        }
        start = {...placement.value};
        placement.stop();
        element.style.zIndex = '900';
      },
      onDragMove: state => {
        if (reorder != null) {
          this.moveReorderGhost(id, reorder, state.dx, state.dy);
          return;
        }
        const placement = this.placement(id);
        if (placement == null) {
          return;
        }
        const {width, height, photoWidth, photoHeight, table} = this.geometry();
        const velocity = state.tracker.velocity();
        const x = rubberBand(start.x + state.dx, 0, width - photoWidth);
        const y = rubberBand(start.y + state.dy, 0, height - photoHeight);
        placement.set({
          x,
          y,
          rotate: start.rotate * 0.5 + clamp(velocity.x * 0.012, -10, 10),
          scale: 1.04,
        });
        const centerY = y + photoHeight / 2;
        hot('table', centerY < table.y + table.height);
        hot('tray', centerY > height - TRAY_HEIGHT || velocity.y > 700);
      },
      onDragEnd: state => {
        if (reorder != null) {
          this.endReorderGhost(id, reorder, state.isCancelled);
          reorder = null;
          return;
        }
        if (this.snapshot.reordering === id) {
          this.update({reordering: null});
        }
        const placement = this.placement(id);
        if (placement == null) {
          return;
        }
        const {height, photoWidth, photoHeight, table} = this.geometry();
        const {x, y} = placement.value;
        const centerY = y + photoHeight / 2;
        const velocity = {x: state.vx, y: state.vy};
        if (state.isCancelled) {
          if (this.places.get(id) === 'hand') {
            this.layoutHand();
          } else {
            void placement.to({...start, scale: 1});
          }
          this.say('Move cancelled.');
          return;
        }
        if (
          (state.vy > 700 && state.dy > 40) ||
          centerY > height - TRAY_HEIGHT
        ) {
          this.putAway(id, velocity);
          return;
        }
        if (state.vy < -500 || centerY < table.y + table.height) {
          // A throw spins the photo by how far off-center it was held.
          const spin = clamp(
            ((grabOffset.x * state.vy - grabOffset.y * state.vx) /
              (photoWidth * photoHeight)) *
              60,
            -900,
            900,
          );
          this.toTable(
            id,
            {x: x + state.vx * 0.22, y: y + state.vy * 0.22},
            velocity,
            spin,
          );
          return;
        }
        const index =
          this.places.get(id) === 'hand'
            ? this.order.indexOf(id)
            : this.nearestSlot(x + photoWidth / 2);
        this.toHand(id, index, velocity, 'Snapped back.');
      },
    });
  }

  /** Long press on a photo in the hand starts a reorder. */
  beginReorder(id: string) {
    if (this.places.get(id) !== 'hand') {
      return;
    }
    if (this.snapshot.layout === 'stack') {
      this.setLayout('spread', 'Spread out to reorder.');
    }
    this.update({
      reordering: id,
      status: 'Reordering: drag to the accent line.',
    });
  }

  private nearestSlot(centerX: number): number {
    const {photoWidth} = this.geometry();
    const count = this.order.length + 1;
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < count; index++) {
      const id = this.order[Math.min(index, this.order.length - 1)];
      if (id == null) {
        break;
      }
      const home = this.home(index, count, id);
      const distance = Math.abs(home.x + photoWidth / 2 - centerX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  private startReorderGhost(id: string): ReorderGhost | null {
    const element = this.element(id);
    const placement = this.placement(id);
    if (element == null || placement == null || this.stage == null) {
      return null;
    }
    const ghost = element.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('tabindex');
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-ghost-copy', '');
    ghost.style.zIndex = '950';
    this.stage.appendChild(ghost);
    const origin = {...placement.value, rotate: 0};
    const ghostPlacement = placementAnimator(ghost, origin);
    void ghostPlacement.to({scale: 1.07}, {spring: springs.lift});
    element.setAttribute('data-reorder-source', '');
    return {ghost, ghostPlacement, origin, insertAt: this.order.indexOf(id)};
  }

  private moveReorderGhost(
    id: string,
    reorder: ReorderGhost,
    dx: number,
    dy: number,
  ) {
    const {photoWidth, photoHeight, centerY} = this.geometry();
    const x = reorder.origin.x + dx;
    const y = reorder.origin.y + dy;
    reorder.ghostPlacement.set({x, y, rotate: 0, scale: 1.07});
    const others = this.order.filter(other => other !== id);
    const homes = others.map(other =>
      this.home(this.order.indexOf(other), this.order.length, other),
    );
    const centerX = x + photoWidth / 2;
    let insertAt = others.length;
    for (let index = 0; index < homes.length; index++) {
      if (centerX < homes[index].x + photoWidth / 2) {
        insertAt = index;
        break;
      }
    }
    reorder.insertAt = insertAt;
    const before = homes[insertAt - 1];
    const after = homes[insertAt];
    const markerX =
      before != null && after != null
        ? (before.x + after.x + photoWidth) / 2
        : before != null
          ? before.x + photoWidth + 6
          : (after?.x ?? 0) - 6;
    this.showMarker(
      markerX - 2,
      centerY - photoHeight * 0.45,
      photoHeight * 0.9,
    );
  }

  private endReorderGhost(
    id: string,
    reorder: ReorderGhost,
    isCancelled: boolean,
  ) {
    this.showMarker(null);
    const placement = this.placement(id);
    placement?.set({...reorder.ghostPlacement.value, rotate: 0, scale: 1});
    reorder.ghost.remove();
    this.element(id)?.removeAttribute('data-reorder-source');
    if (isCancelled) {
      this.update({reordering: null, status: 'Reorder cancelled.'});
      this.layoutHand();
      return;
    }
    this.order = this.order.filter(other => other !== id);
    this.order.splice(reorder.insertAt, 0, id);
    this.update({
      reordering: null,
      status: `Moved to position ${reorder.insertAt + 1} of ${this.order.length}.`,
    });
    this.layoutHand();
  }

  private showMarker(x: number | null, y = 0, height = 0) {
    const marker = this.stage?.querySelector<HTMLElement>('[data-marker]');
    if (marker == null) {
      return;
    }
    marker.hidden = x == null;
    if (x != null) {
      marker.style.height = `${height}px`;
      marker.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  handleKey(id: string, event: ReactKeyboardEvent<HTMLElement>) {
    const place = this.places.get(id);
    const index = this.order.indexOf(id);
    const reorder = this.keyboardReorder;
    if (reorder?.id === id) {
      const step = {ArrowLeft: -1, ArrowRight: 1}[event.key];
      if (step != null) {
        const to = clamp(index + step, 0, this.order.length - 1);
        this.order.splice(index, 1);
        this.order.splice(to, 0, id);
        this.layoutHand();
        this.say(`Position ${to + 1} of ${this.order.length}.`);
      } else if (event.key === 'Enter' || event.key === ' ') {
        this.keyboardReorder = null;
        this.update({reordering: null, status: 'Dropped.'});
      } else if (event.key === 'Escape') {
        this.order = reorder.original;
        this.keyboardReorder = null;
        this.update({reordering: null, status: 'Reorder cancelled.'});
        this.layoutHand();
      } else {
        return;
      }
      event.preventDefault();
      return;
    }
    if (event.key === ' ') {
      this.flip(id);
    } else if (event.key === 'Enter' && place === 'hand') {
      if (this.snapshot.layout === 'stack') {
        this.setLayout('spread');
      }
      this.keyboardReorder = {id, original: [...this.order]};
      this.update({
        reordering: id,
        status:
          'Picked up. Left and Right move it, Enter drops, Escape cancels.',
      });
    } else if (event.key === 't' || event.key === 'T') {
      this.selected = id;
      this.throwSelected();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      this.putAway(id);
    } else if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      place === 'hand'
    ) {
      const next =
        this.order[
          clamp(
            index + (event.key === 'ArrowLeft' ? -1 : 1),
            0,
            this.order.length - 1,
          )
        ];
      this.element(next)?.focus();
    } else {
      return;
    }
    event.preventDefault();
  }

  /** Focus left a photo mid keyboard reorder: keep the order it reached. */
  blur(id: string) {
    if (this.keyboardReorder?.id === id) {
      this.keyboardReorder = null;
      this.update({reordering: null});
    }
  }
}

/**
 * The 3D flip: a critically damped spring turns the card about its vertical
 * center. The card lifts and its shadow softens at the 90° point.
 */
function flipAnimator(inner: HTMLElement, shadow: HTMLElement) {
  return new SpringAnimator({angle: 0}, ({angle}) => {
    const radians = (angle * Math.PI) / 180;
    const lift = Math.abs(Math.sin(radians));
    inner.style.transform = `scale(${1 + 0.06 * lift}) rotateY(${angle}deg)`;
    if (lift < 0.001) {
      shadow.style.filter = '';
      return;
    }
    const slide = 6 * Math.sin(2 * radians);
    shadow.style.filter =
      `drop-shadow(${slide / 2}px ${1 + 5 * lift}px ${1 + 3 * lift}px rgb(0 0 0 / 0.1)) ` +
      `drop-shadow(${slide}px ${2 + 12 * lift}px ${8 + 14 * lift}px rgb(0 0 0 / ${0.1 + 0.12 * lift}))`;
  });
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function PhotoCard({
  photo,
  deck,
  snapshot,
  helpId,
}: {
  photo: Photo;
  deck: PhotoDeck;
  snapshot: Snapshot;
  helpId: string;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();
  const pressable = usePressFeedback();
  const longPress = useLongPress({
    delayMs: HOLD_MS,
    onLongPress: () => deck.beginReorder(photo.id),
  });
  // The gesture is wired once per photo; it reads the latest detector.
  const longPressRef = useRef<LongPress>(longPress);
  useEffect(() => {
    longPressRef.current = longPress;
  });

  useEffect(() => {
    const element = elementRef.current;
    if (element == null) {
      return;
    }
    return deck.attach(photo.id, element, {
      start: point => longPressRef.current.start(point),
      cancel: () => longPressRef.current.cancel(),
    });
  }, [deck, photo.id]);

  const registerElement = useCallback(
    (element: HTMLDivElement | null) => {
      elementRef.current = element;
      deck.register(photo.id, element);
    },
    [deck, photo.id],
  );

  const isFaceUp = snapshot.faceUp.has(photo.id);
  const isAway = snapshot.away.has(photo.id);
  const focus = stylex.props(focusOutlineStyles.focusVisible);
  return (
    <div
      ref={registerElement}
      {...pressable}
      className={`mgp-photo ${focus.className ?? ''}`}
      role="button"
      tabIndex={isAway ? -1 : 0}
      hidden={isAway}
      aria-roledescription="photo"
      aria-label={`${photo.caption}, ${photo.date}${isFaceUp ? ', showing the back' : ''}`}
      aria-describedby={helpId}
      data-face-up={isFaceUp || undefined}
      data-reordering={snapshot.reordering === photo.id || undefined}
      onFocus={() => deck.select(photo.id)}
      onBlur={() => deck.blur(photo.id)}
      onKeyDown={event => deck.handleKey(photo.id, event)}
      onContextMenu={event => event.preventDefault()}>
      <div className="mgp-shadow" data-flip-shadow="">
        <div className="mgp-inner" data-flip-inner="">
          <div className="mgp-front" aria-hidden="true">
            {photo.scene(gradientId)}
          </div>
          <div className="mgp-back" aria-hidden="true">
            <span className="mgp-caption">{photo.caption}</span>
            <span className="mgp-date">{photo.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Photos to throw, lay out, flip, put away and reorder. */
export function PolaroidTable() {
  const [deck] = useState(() => new PhotoDeck(PHOTOS));
  const snapshot = useSyncExternalStore(
    deck.subscribe,
    deck.getSnapshot,
    deck.getSnapshot,
  );
  const announce = useAnnounce({hasReplace: true});
  const stageRef = useRef<HTMLDivElement>(null);
  const helpId = useId();

  useEffect(() => {
    deck.announce = announce;
  }, [deck, announce]);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage == null) {
      return;
    }
    deck.stage = stage;
    const observer = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect;
      if (width > 0 && height > 0) {
        deck.resize(width, height);
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [deck]);

  const awayCount = snapshot.away.size;
  return (
    <div className="mgp-root">
      <style>{POLAROID_CSS}</style>
      <HStack gap={2} wrap="wrap" align="center">
        <SegmentedControl
          label="Layout"
          size="sm"
          value={snapshot.layout}
          onChange={value => deck.setLayout(value as Layout)}>
          <SegmentedControlItem value="stack" label="Stack" />
          <SegmentedControlItem value="fan" label="Fan" />
          <SegmentedControlItem value="spread" label="Spread" />
        </SegmentedControl>
        <Button
          label="Flip"
          size="sm"
          variant="secondary"
          onClick={() => deck.flipSelected()}
        />
        <Button
          label="Throw"
          size="sm"
          variant="secondary"
          onClick={() => deck.throwSelected()}
        />
        <Button
          label="Put away"
          size="sm"
          variant="secondary"
          onClick={() => deck.putAwaySelected()}
        />
        <Button
          label="Deal again"
          size="sm"
          variant="primary"
          onClick={() => deck.deal()}
        />
      </HStack>
      <div ref={stageRef} className="mgp-stage">
        <div className="mgp-table" data-zone="table" aria-hidden="true">
          <Text type="supporting" color="secondary">
            Table: throw a photo up here
          </Text>
        </div>
        <div className="mgp-tray" data-zone="tray" aria-hidden="true">
          <Text type="supporting" color="secondary">
            {awayCount > 0
              ? `Put away: ${awayCount}. Deal again brings them back.`
              : 'Swipe down to put a photo away'}
          </Text>
        </div>
        <div className="mgp-marker" data-marker="" hidden aria-hidden="true" />
        {PHOTOS.map(photo => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            deck={deck}
            snapshot={snapshot}
            helpId={helpId}
          />
        ))}
      </div>
      <p className="mgp-status">
        <Text type="supporting" color="secondary">
          {snapshot.status ||
            'Throw a photo up, tap to flip it, swipe it down, or hold to reorder.'}
        </Text>
      </p>
      <p id={helpId} className="mgp-help">
        Space flips a photo. Enter picks it up, Left and Right move it, Enter
        drops it and Escape cancels. T throws it to the table and back. Delete
        puts it away.
      </p>
    </div>
  );
}

const PHOTOS: Photo[] = [
  {
    id: 'tide',
    caption: 'Low tide, first swim of the summer',
    date: 'June 14',
    jitter: 0,
    scene: id => (
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7fc4e8" />
            <stop offset="1" stopColor="#e3f5ff" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id})`} />
        <circle cx="72" cy="28" r="9" fill="#ffd166" />
        <rect y="56" width="100" height="44" fill="#1f8fb3" />
        <path d="M0 86Q50 78 100 89V100H0Z" fill="#f2d6a2" />
      </svg>
    ),
  },
  {
    id: 'hill',
    caption: 'The hill we always race up',
    date: 'Aug 2',
    jitter: 0.43,
    scene: id => (
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bfe3ff" />
            <stop offset="1" stopColor="#f4fbff" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id})`} />
        <path d="M0 62Q30 40 60 60T100 55V100H0Z" fill="#8cc084" />
        <path d="M0 78Q40 58 100 74V100H0Z" fill="#5a9e5a" />
        <path d="M0 92Q50 80 100 90V100H0Z" fill="#3f7f45" />
      </svg>
    ),
  },
  {
    id: 'dunes',
    caption: 'Dunes at golden hour',
    date: 'Sep 9',
    jitter: -0.78,
    scene: id => (
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff9a5c" />
            <stop offset="1" stopColor="#ffe0b0" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id})`} />
        <circle cx="50" cy="58" r="16" fill="#fff1c9" opacity=".9" />
        <path d="M0 66Q35 50 70 66T100 62V100H0Z" fill="#e58a4a" />
        <path d="M0 82Q45 64 100 80V100H0Z" fill="#c9622d" />
      </svg>
    ),
  },
  {
    id: 'peaks',
    caption: 'A lake so still it doubled the peaks',
    date: 'Jul 21',
    jitter: 0.95,
    scene: id => (
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cfe6fb" />
            <stop offset="1" stopColor="#eef6ff" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id})`} />
        <path d="M0 58L24 26L40 46L58 18L82 50L100 34V58Z" fill="#6f84a3" />
        <rect y="58" width="100" height="42" fill="#86b8d8" />
        <path
          d="M0 58L24 90L40 70L58 98L82 66L100 82V58Z"
          fill="#6f84a3"
          opacity=".35"
        />
      </svg>
    ),
  },
  {
    id: 'stars',
    caption: 'Counting stars past midnight',
    date: 'Aug 12',
    jitter: -0.34,
    scene: id => (
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16244a" />
            <stop offset="1" stopColor="#3f5688" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id})`} />
        <circle cx="70" cy="26" r="10" fill="#f6f1d1" />
        <circle cx="75" cy="22" r="9" fill="#1c2c55" />
        {[
          [12, 14],
          [30, 30],
          [22, 48],
          [48, 12],
          [88, 44],
          [56, 36],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r=".9" fill="#fff" />
        ))}
        <path d="M0 74Q30 60 60 72T100 68V100H0Z" fill="#0d1730" />
      </svg>
    ),
  },
];

// Colors, radii, shadows, type and durations come from Astryx tokens. The
// photo paper and the ink are part of the illustration, so they are fixed.
const POLAROID_CSS = `
.mgp-root{display:flex;flex-direction:column;gap:var(--spacing-2);height:100dvh;box-sizing:border-box;padding:var(--spacing-2);background:var(--color-background-surface);color:var(--color-text-primary);font-family:var(--font-family-body)}
.mgp-stage{position:relative;flex:1;min-height:0;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-container);background:var(--color-background-muted);user-select:none;-webkit-user-select:none;touch-action:none}
.mgp-table{position:absolute;inset:8px 8px auto 8px;height:40%;box-sizing:border-box;border:2px dashed var(--color-border-emphasized);border-radius:var(--radius-page);display:grid;place-items:center;pointer-events:none;transition:border-color var(--duration-fast),background-color var(--duration-fast)}
.mgp-tray{position:absolute;inset:auto 0 0 0;height:${TRAY_HEIGHT}px;border-top:1px dashed var(--color-border-emphasized);display:grid;place-items:center;pointer-events:none;background:var(--color-background-surface)}
.mgp-table[data-hot],.mgp-tray[data-hot]{border-color:var(--color-accent);background-color:var(--color-accent-muted)}
.mgp-marker{position:absolute;left:0;top:0;width:4px;border-radius:2px;background:var(--color-accent);pointer-events:none;z-index:960}
.mgp-photo{position:absolute;left:0;top:0;border-radius:3px;cursor:grab;touch-action:none;-webkit-touch-callout:none;--photo-width:92px}
.mgp-photo[data-lifted]{cursor:grabbing}
.mgp-photo[data-reorder-source]{opacity:.4}
.mgp-photo[data-reordering]{outline:3px solid var(--color-accent);outline-offset:4px}
.mgp-photo::after{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--color-overlay-pressed);opacity:0;transition:opacity var(--duration-fast-min) linear;pointer-events:none}
.mgp-photo[data-astryx-press="on"]::after,.mgp-photo:active::after{opacity:1}
.mgp-shadow{position:absolute;inset:0;border-radius:inherit;perspective:900px;filter:drop-shadow(0 1px 1px rgb(0 0 0 / .1)) drop-shadow(0 2px 8px rgb(0 0 0 / .1))}
.mgp-photo[data-lifted] .mgp-shadow{filter:var(--shadow-high-filter,drop-shadow(0 2px 2px rgb(0 0 0 / .1)) drop-shadow(0 8px 24px rgb(0 0 0 / .3)))}
.mgp-inner{position:absolute;inset:0;border-radius:inherit;transform-style:preserve-3d;transform-origin:50% 50%;will-change:transform}
.mgp-front,.mgp-back{position:absolute;inset:0;box-sizing:border-box;border-radius:inherit;border:1px solid rgb(0 0 0 / .08);backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;transition:opacity var(--duration-fast) linear}
.mgp-front{background:#fbfaf6;padding:6.5% 6.5% 0}
.mgp-front svg{display:block;width:100%;aspect-ratio:1;border-radius:1px}
.mgp-back{transform:rotateY(180deg);justify-content:center;gap:6%;padding:12%;background-color:#f7f3ea;background-image:repeating-linear-gradient(transparent 0 calc(var(--photo-width)*.17),rgb(80 120 180 / .14) calc(var(--photo-width)*.17) calc(var(--photo-width)*.17 + 1px))}
.mgp-caption{font-family:"Bradley Hand","Segoe Print","Marker Felt","Chalkboard SE","Comic Neue","Comic Sans MS",cursive;font-size:calc(var(--photo-width)*.12);line-height:1.35;color:#29406b;text-align:center;transform:rotate(-2deg)}
.mgp-date{font-family:"Bradley Hand","Segoe Print","Comic Sans MS",cursive;font-size:calc(var(--photo-width)*.09);color:#6b5b4b}
.mgp-status{margin:0;min-height:1.6em}
.mgp-help{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion: reduce){
  .mgp-inner{transform:none!important}
  .mgp-back{transform:none}
  .mgp-photo[data-face-up] .mgp-front{opacity:0}
  .mgp-photo:not([data-face-up]) .mgp-back{opacity:0}
}
@media (forced-colors: active){
  .mgp-marker{background:Highlight}
  .mgp-photo[data-reordering]{outline-color:Highlight}
}
`;
