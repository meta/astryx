// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// Course Detail — a long-form sales page for a single offering with a
// curriculum and a purchase rail. The main column carries the save/share
// head, the preview poster with the lesson player, fact tiles, the about
// block with skill chips, a searchable module syllabus, the learn list,
// an instructor card with credentials, scored reviews with filter and
// sort, a related-course rail, a numbered FAQ, a closing band and a
// footer; the sticky rail carries the price, the start picker and the
// weekly-pace slider that computes a finish date.
//
// Authored to the template contract: components do the layout, tokens
// carry every value the set has, gaps ride scoped styles. The glyphs
// draw from @heroicons/react under the template's import names (each
// mapped in template.doc.mjs); directional icons mirror under RTL;
// sample media rides the shipped fixture images.

'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack, StackItem} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Popover} from '@astryxdesign/core/Popover';
import {Slider} from '@astryxdesign/core/Slider';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {rtlStyles} from '@astryxdesign/core/utils';
import {useClipboard, useMediaQuery} from '@astryxdesign/core/hooks';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  ArrowRightIcon,
  BanknotesIcon,
  ChartBarIcon,
  CheckIcon,
  ClockIcon,
  CommandLineIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PaintBrushIcon,
  PlayCircleIcon,
  PlusIcon,
  XMarkIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import {
  CheckBadgeIcon as CheckBadgeSolid,
  HeartIcon as HeartSolid,
  PauseIcon,
  PlayIcon as PlaySolid,
  StarIcon as StarIconSolid,
} from '@heroicons/react/24/solid';
// The template package's dependency graph carries @heroicons/react (the
// gallery's icon source), not the design's hugeicons set — so every glyph
// draws from heroicons under the same local name, aliased here, and each
// rendered icon is mapped in template.doc.mjs `icons`.
import {
  SparklesIcon as AiMagicIcon,
  CalendarIcon as Calendar03Icon,
  CheckBadgeIcon as Certificate01Icon,
  ClipboardDocumentCheckIcon as CheckListIcon,
  ChatBubbleBottomCenterTextIcon as ClosedCaptionIcon,
  GlobeAltIcon as Globe02Icon,
  Square3Stack3DIcon as Layers01Icon,
  LinkIcon as Link01Icon,
  EnvelopeIcon as Mail01Icon,
  CubeIcon as Package01Icon,
  QueueListIcon as PlayListIcon,
  ShareIcon as Share03Icon,
  LockOpenIcon as SquareUnlock02Icon,
  TrophyIcon as StarAward01Icon,
  UserGroupIcon as TeachingIcon,
  BriefcaseIcon as WorkHistoryIcon,
} from '@heroicons/react/24/outline';
// ClockIcon is bound above; alias the same glyph for the design's
// Clock01Icon without rebinding the existing name.
import {ClockIcon as Clock01Icon} from '@heroicons/react/24/outline';
import {Section} from '@astryxdesign/core/Layout';
import {Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Link} from '@astryxdesign/core/Link';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Badge} from '@astryxdesign/core/Badge';

/**
 * Icon data shape the template stores in its tables: an SVG component with
 * the sizing/stroke props the design's icon data carried.
 */
type IconSvgElement = React.ComponentType<{
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}>;

/**
 * Render one stored icon. Same interface the design's HugeiconsIcon
 * wrapper exposed (icon, size, strokeWidth); the glyph is a heroicons
 * component rendered directly.
 */
function HugeIcon({
  icon: Glyph,
  size = 20,
  strokeWidth,
  style,
  'aria-hidden': hidden,
}: {
  icon: IconSvgElement;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  'aria-hidden'?: React.AriaAttributes['aria-hidden'];
}) {
  return (
    <Glyph
      aria-hidden={hidden}
      style={{width: size, height: size, ...style}}
      strokeWidth={strokeWidth}
    />
  );
}

// ─── Geometry steps (documented token gap; see the header note) ─────────
const headlineStyle: CSSProperties = {
  fontSize: 40,
  fontWeight: 525,
  letterSpacing: '-0.05em',
  lineHeight: 1.15,
  width: '100%',
  textAlign: 'center',
};
//     tint, and paper treatment) ─────────────────────────────────────────────
const inkArt: CSSProperties = {
  width: '100%',
  height: '100%',
  borderRadius: 'var(--radius-container)',
  background: 'linear-gradient(160deg, #1c1917 0%, #292524 55%, #3f3d3a 100%)',
  color: '#fafaf9',
};

/** Hover/press surfaces that the component set has no primitive for
 *  (documented gap #2614), plus the tuning-drawn controls: the
 *  search field and its clear button, the ring button, the select trigger
 *  and its menu rows, the ruled review grid, and
 *  the disclosures' easing. Token-carried colors and durations only. */
const hoverStyles = `
.cr4-row{display:flex;flex-direction:row;align-items:center;gap:var(--spacing-3);padding:var(--spacing-2) var(--spacing-3);border-radius:var(--radius-element);text-align:start;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard);}
.cr4-row:hover{background-color:var(--color-background-wash);}
.cr4-row:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
.cr4-lift{transition:box-shadow var(--duration-fast) var(--ease-standard),transform var(--duration-fast) var(--ease-standard);}
.cr4-lift:hover{box-shadow:0 10px 24px var(--color-shadow);transform:translateY(-2px);}
.cr4-disc{transition:transform var(--duration-fast) var(--ease-standard);}
.cr4-disc:hover{transform:scale(1.06);}
.cr4-mark{background-color:var(--color-accent-muted);border-radius:4px;padding-inline:2px;color:inherit;}
.cr6-row{border-radius:calc(var(--radius-container) * 0.6);}
.cr6-photo{transition:transform 500ms cubic-bezier(0,0,0.2,1);}
.cr6-row:hover .cr6-photo{transform:scale(1.04);}
/* The search slot: the field fills the row until lg, where the design
   caps it; the slot carries the sizing so the core field keeps its own
   width behavior inside it. */
.cr7-search{flex:1 1 auto;min-width:0;}
@media(min-width:1024px){.cr7-search{max-width:384px;}}
/* The design's ghost control: a hairline ring, the page's ground showing
   through, the wash on hover. "Open every module", "Show more reviews",
   the panel's secondary CTA and the select triggers all wear it. */
.cr7-ringbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding-inline:16px;border-radius:var(--radius-element);background:transparent;box-shadow:inset 0 0 0 1px var(--color-border);font-size:14px;font-weight:500;color:var(--color-text-primary);transition:background-color var(--duration-fast) var(--ease-standard),box-shadow var(--duration-fast) var(--ease-standard);cursor:pointer;border:none;white-space:nowrap;}
.cr7-ringbtn:hover{background:var(--color-background-wash);}
.cr7-ringbtn:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
.cr7-ringbtn:disabled{cursor:not-allowed;color:var(--color-text-disabled);}
.cr7-ringbtn:disabled:hover{background:transparent;}
.cr7-menurow{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding-inline:10px;border-radius:calc(var(--radius-container)*0.6);font-size:14px;color:var(--color-text-primary);text-align:start;cursor:pointer;background:transparent;border:none;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr7-menurow:hover{background:var(--color-background-wash);}
.cr7-menurow:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:-2px;}
/* (Polish: the side paddings held the design's md: prefix — below
   md the list is one column and a review runs the full measure, not a
   column 40px short of its heading.) */

/* The panel's primary CTA: the brand fill, the ink on it, the fill at 80%
   under the pointer (the design's hover:bg-primary/80). */
.cr7-cta{display:flex;height:44px;width:100%;align-items:center;justify-content:center;gap:8px;border-radius:var(--radius-element);background:var(--color-accent);padding-inline:24px;font-size:14px;font-weight:500;color:var(--color-on-accent);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr7-cta:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr7-cta:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* The FAQ's caps column: the whole row's width on a phone, its own 160px
   column from sm. */
/* The syllabus' six figures: two to a row on a phone, three from sm. */
.cr7-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;}
@media(min-width:640px){.cr7-facts{grid-template-columns:repeat(3,minmax(0,1fr));}}
.cr7-fact{display:flex;flex-direction:column;min-width:0;padding-inline-end:16px;}
/* The syllabus toolbar and the reviews' one: the field and the controls on
   one line from sm, stacked under it on a phone. */
.cr7-toolbar{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--color-border);padding-top:32px;margin-top:32px;}
@media(min-width:640px){.cr7-toolbar{flex-direction:row;align-items:center;}}
/* What the price covers: two columns where a line fits its column — from sm
   while the page is one column, and from xl; between, the panel beside
   takes the room. */
.cr7-cols2{display:grid;grid-template-columns:minmax(0,1fr);gap:40px;}
@media(min-width:640px){.cr7-cols2{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;}}
@media(min-width:1024px) and (max-width:1279px){.cr7-cols2{grid-template-columns:minmax(0,1fr);gap:40px;}}
/* ── Polish ───────────────────────────────────────────────────────────────
   The poster (poster frame): the art leans in under the pointer and
   the dim doubles; the play disc steps up a size and its shadow lifts. */
.cr9-plate{position:absolute;inset-inline:12px;bottom:12px;}
@media(min-width:640px){.cr9-plate{inset-inline-start:16px;bottom:16px;max-width:448px;}}
.cr9-poster-art{position:absolute;inset:0;display:block;transition:transform 700ms cubic-bezier(0,0,0.2,1);}
.cr9-poster:hover .cr9-poster-art{transform:scale(1.03);}
.cr9-poster-dim{position:absolute;inset:0;background:rgba(28,25,23,0.1);transition:background-color 300ms cubic-bezier(0.4,0,0.2,1);}
.cr9-poster:hover .cr9-poster-dim{background:rgba(28,25,23,0.2);}
.cr9-poster-disc{display:flex;width:72px;height:72px;align-items:center;justify-content:center;border-radius:999px;background:var(--color-background-card);color:var(--color-text-primary);box-shadow:var(--shadow-med);transition:transform 300ms cubic-bezier(0,0,0.2,1),box-shadow 300ms cubic-bezier(0,0,0.2,1);}
.cr9-poster:hover .cr9-poster-disc{transform:scale(1.1);box-shadow:var(--shadow-high);}
/* The player (the preview body): the frame is the play control; its disc
   and the dim under it step aside while the lesson runs and come back under
   the pointer. */
.cr9-frame{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:none;background:transparent;padding:0;cursor:pointer;}
.cr9-frame:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:-4px;}
.cr9-dim{position:absolute;inset:0;background:rgba(28,25,23,0.2);transition:opacity 300ms cubic-bezier(0.4,0,0.2,1);}
.cr9-pdisc{position:relative;display:flex;width:64px;height:64px;align-items:center;justify-content:center;border-radius:999px;background:var(--color-background-card);color:var(--color-text-primary);box-shadow:var(--shadow-med);transition:opacity 300ms cubic-bezier(0,0,0.2,1),transform 300ms cubic-bezier(0,0,0.2,1),box-shadow 300ms cubic-bezier(0,0,0.2,1);}
.cr9-away{opacity:0;}
.cr9-frame:hover .cr9-away{opacity:1;}
.cr9-frame:hover .cr9-pdisc{box-shadow:var(--shadow-high);}
/* The player's chrome: the round play control, the cycling speed button and
   the captions toggle — muted ground, hairline ring, the wash on hover. */
.cr9-ctl{display:flex;align-items:center;justify-content:center;background:transparent;box-shadow:inset 0 0 0 1px var(--color-border);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr9-ctl:hover{background:var(--color-background-wash);}
.cr9-ctl:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
.cr9-play{width:40px;height:40px;flex:0 0 auto;border-radius:999px;background:var(--color-background-muted);box-shadow:none;}
.cr9-play:hover{background:var(--color-background-surface);}
.cr9-speed{height:40px;width:56px;flex:0 0 auto;border-radius:var(--radius-element);font-size:14px;font-variant-numeric:tabular-nums;color:var(--color-text-primary);}
.cr9-cc{width:40px;height:40px;flex:0 0 auto;border-radius:var(--radius-element);}
.cr9-cc[data-on='true']{background:var(--color-accent);color:var(--color-on-accent);box-shadow:none;}
/* The dialog's body: the player beside its shelf, one column under md. */
.cr9-playergrid{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;}
@media(min-width:768px){.cr9-playergrid{grid-template-columns:minmax(0,1fr) 272px;}}
/* A shelf row: the active clip holds the wash, the rest take it on hover. */
.cr9-shelfrow{display:flex;width:100%;align-items:center;gap:12px;border-radius:calc(var(--radius-container)*0.4);padding:8px;text-align:start;background:transparent;border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr9-shelfrow:hover{background:var(--color-background-muted);}
.cr9-shelfrow[aria-current='true']{background:var(--color-background-muted);}
.cr9-shelfrow:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:-2px;}
/* ── Polish ───────────────────────────────────────────────────────────────
   The player's own dialog, drawn as the design's dialog body draws it
   (the dialog): on a phone it rises from the foot of the screen as a
   sheet — full-bleed, its top corners rounded (rounded-t-xl = 2.1rem over
   the design's 1.5rem radius), flush with the screen's bottom edge, as
   tall as the viewport less 24px — and from sm it sits centered with 24px of
   viewport padding, 24px corners and the design's own 54rem ceiling.
   !important carries these past the dialog primitive's stylex sizing. */
.cr12-sheet{width:100vw !important;max-width:100vw !important;margin:auto auto 0 !important;border-radius:2.1rem 2.1rem 0 0 !important;max-height:calc(100dvh - 24px) !important;}
/* the primitive's inner wrapper carries its own 75vh ceiling; the sheet's
   height is the dialog's own, and the wrapper must not cap it short */
.cr12-sheet > div{max-height:none !important;}
@media(min-width:640px){
  .cr12-sheet{width:1024px !important;max-width:min(1024px,calc(100vw - 48px)) !important;margin:auto !important;border-radius:var(--radius-container) !important;max-height:min(54rem,calc(100dvh - 48px)) !important;}
}
/* The sheet's own chrome, on the design's own paddings: the header
   px-5 pb-4 pt-5 → sm:px-6 sm:pt-6; the body px-5 pb-5 → sm:px-6 sm:pb-6
   (no top padding — the header's own bottom padding is the gap); the ruled
   footer of two CTAs, a column on a phone where each takes the full row,
   a right-held row from sm. */
.cr12-dhead{padding:20px 20px 16px;}
.cr12-dbody{padding:0 20px 20px;}
.cr12-dfoot{display:flex;flex-direction:column;gap:12px;align-items:stretch;border-top:1px solid var(--color-border);padding:16px 20px;}
.cr12-dfoot > button{width:100%;}
.cr12-dfoot .cr7-ringbtn{padding-inline:20px;}
@media(min-width:640px){
  .cr12-dhead{padding:24px 24px 16px;}
  .cr12-dbody{padding:0 24px 24px;}
  .cr12-dfoot{flex-direction:row;align-items:center;justify-content:flex-end;padding:16px 24px;}
  .cr12-dfoot > button{width:auto;}
}
/* The sheet's dismiss control: the design's close control — a 40px
   muted square (rounded-control), the thin outline XMark at 16px, one rung
   darker under the pointer. */
.cr12-dclose{display:flex;width:40px;height:40px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:var(--radius-element);background:var(--color-background-muted);color:var(--color-text-primary);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr12-dclose:hover{background:var(--color-background-gray);}
.cr12-dclose:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* The control bar's own gap, the design's gap-2 → sm:gap-3. */
.cr12-ctlbar{gap:8px;}
@media(min-width:640px){.cr12-ctlbar{gap:12px;}}
/* The captions and the lesson's title card, on the design's own ladder:
   12px from the frame's edges on a phone, 16px (title) / 40px (captions)
   from sm. */
.cr12-titlecard{inset-inline-start:12px;top:12px;max-width:calc(100% - 24px);}
.cr12-ccpos{inset-inline:16px;bottom:16px;}
@media(min-width:640px){
  .cr12-titlecard{inset-inline-start:16px;top:16px;max-width:384px;}
  .cr12-ccpos{inset-inline:40px;}
}
/* The scrubber, as the design's Slider draws it: an 8px muted rail, the
   played part in the brand, and a 24px disc on the card's white lifted by
   the soft shadow — not the primitive's 4px cool-grey rail with the brand
   disc. !important carries these past the primitive's stylex rules, which
   arrive as a hashed class chained through two negated id selectors — an
   id-strength pair a plain descendant selector cannot out-rank. */
.cr12-scrub{--color-track:var(--color-background-muted);}
.cr12-scrub .astryx-slider-track{height:8px !important;background:var(--color-background-muted) !important;}
.cr12-scrub .astryx-slider-track + div{height:8px !important;}
.cr12-scrub .astryx-slider-thumb{width:24px !important;height:24px !important;background:var(--color-background-card) !important;box-shadow:var(--shadow-low) !important;}
/* The instructor's two buttons, on the design's own recipe
   (instructor.tsx + follow-button.tsx): a 40px row of muted fill that
   darkens a rung under the pointer; Follow answering in the brand fill,
   its plus turning to a tick, both labels in one grid cell so the width
   holds. */
.cr12-actbtn{height:40px;border-radius:var(--radius-element);padding-inline:20px;font-size:14px;font-weight:500;color:var(--color-text-primary);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard);width:100%;background:var(--color-background-muted);}
.cr12-actbtn:hover{background:var(--color-background-gray);}
.cr12-actbtn:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* Follow: a grid holding its two labels in one cell, the one not in use
   invisible, so the button keeps the longer label's width (the
   design's col-start-1 row-start-1 pair) */
.cr12-follow{display:grid;place-items:center;}
.cr12-follow[data-on='true']{background:var(--color-accent);color:var(--color-on-accent);}
.cr12-follow[data-on='true']:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr12-labelcell{grid-area:1/1;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;}
/* the teacher's spoken name under 360px: heard, not drawn (the
   design's max-[359px]:sr-only) */
.cr12-un360{font-size:0;}
@media(min-width:360px){.cr12-un360{font-size:inherit;}}
/* the design's globals.css: anchors glide for a reader who did not ask
   for stillness */

/* The player's sheet (the dialog): the design's popover layer rises — 40px
   from the screen's foot on a phone, 12px from sm — over 300ms on
   cubic-bezier(0.22,1,0.36,1), opacity along; the same transition plays
   in reverse on close because display and overlay ride allow-discrete,
   which holds the open styles until the transition ends. !important
   carries it past the app's m3-dialog-enter (a 250ms scale-from-centre)
   and the primitive's id-strength chains. */
dialog.cr12-sheet{--duration-fast:150ms;--ease-standard:cubic-bezier(0.4,0,0.2,1);}
dialog.cr12-sheet[open]{opacity:1 !important;transform:translateY(0) !important;}
dialog.cr12-sheet{
  animation:none !important;
  opacity:0 !important;transform:translateY(40px) !important;
  transition:opacity 300ms cubic-bezier(0.22,1,0.36,1),transform 300ms cubic-bezier(0.22,1,0.36,1),display 300ms cubic-bezier(0.22,1,0.36,1) allow-discrete,overlay 300ms cubic-bezier(0.22,1,0.36,1) allow-discrete !important;
}
@starting-style{dialog.cr12-sheet[open]{opacity:0 !important;transform:translateY(40px) !important;}}
@media(min-width:640px){
  dialog.cr12-sheet{transform:translateY(12px) !important;}
  @starting-style{dialog.cr12-sheet[open]{transform:translateY(12px) !important;}}
}
/* the design's backdrop exactly: black at a tenth under blur-xs,
   fading over 300ms on the default curve, in and out */
dialog.cr12-sheet::backdrop{
  background:rgba(0,0,0,0.1) !important;
  backdrop-filter:blur(4px) !important;
  transition-duration:300ms !important;
  transition-timing-function:cubic-bezier(0.4,0,0.2,1) !important;
}

/* The popovers — the selects, the share menu, "How reviews work" — as the
   design's own popover layer runs: opacity and scale over 150ms ease-out, the
   scale a hair under one at both ends, in on open and out on close (the
   native popover's display flip held back by allow-discrete; the layer
   stays mounted after its hide, so the exit has its 150ms too).
   animation:none retires the layer's own entrance keyframes, and the
   tokens ride the [popover].cr7-pop scope because its content is portaled
   outside the page's root. */
[popover].cr7-pop{--duration-fast:150ms;--ease-standard:cubic-bezier(0.4,0,0.2,1);}
[popover].cr7-pop{animation:none !important;opacity:0;scale:0.98;transition:opacity 150ms cubic-bezier(0,0,0.2,1),scale 150ms cubic-bezier(0,0,0.2,1),display 150ms cubic-bezier(0,0,0.2,1) allow-discrete,overlay 150ms cubic-bezier(0,0,0.2,1) allow-discrete !important;}
[popover].cr7-pop:popover-open{opacity:1;scale:1;}
@starting-style{[popover].cr7-pop:popover-open{opacity:0;scale:0.98;}}

/* The phone's reach bar (the enroll panel): mounted once below lg — the
   design's lg:hidden — and held off the screen by translate, sliding
   its full height up over 300ms ease-out once the panel's own CTA has
   left the screen, visibility stepping with it so nothing of it ever
   draws below the screen's edge. */
.cr13-reachbar{
  position:fixed;inset-inline:0;bottom:0;
  background:var(--color-background-card);
  border-top:1px solid var(--color-border);
  box-shadow:0 -6px 20px var(--color-shadow);
  padding-inline:24px;padding-top:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));
  translate:0 100%;visibility:hidden;
  transition:translate 300ms cubic-bezier(0,0,0.2,1),visibility 300ms cubic-bezier(0,0,0.2,1);
}
.cr13-reachbar[data-away='true']{translate:0 0;visibility:visible;}
@media(min-width:1024px){.cr13-reachbar{display:none;}}
/* its Enroll, the design's own: the brand fill that dips a fifth under
   the pointer */
.cr13-reachcta{display:flex;height:40px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:var(--radius-element);background:var(--color-accent);padding-inline:20px;font-size:14px;font-weight:500;color:var(--color-on-accent);border:none;cursor:pointer;transition:background-color 150ms cubic-bezier(0.4,0,0.2,1);}
.cr13-reachcta:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr13-reachcta:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}

/* The design's blanket kill, scoped to this page and its layers: a
   reader who asked for stillness gets every state arrived at, never
   travelled to — the hovers land, the sheet and the popovers appear, the
   bar steps in, and the zooms the design gates behind motion-safe
   never move at all. */
@media(prefers-reduced-motion:reduce){
  dialog.cr12-sheet,dialog.cr12-sheet::backdrop,
  [popover].cr7-pop,[popover].cr7-pop *,[popover].cr7-pop *::before,[popover].cr7-pop *::after,
  .cr13-reachbar,.cr13-reachcta{
    animation-duration:0.01ms !important;
    animation-iteration-count:1 !important;
    transition-duration:0.01ms !important;
  }
  .cr6-row:hover .cr6-photo,
  .cr9-poster:hover .cr9-poster-art,
  .cr9-poster:hover .cr9-poster-disc{transform:none;}
}
`;

// ─── The merged base page's sections, until their rewrites land ────────

const stickyRail: CSSProperties = {
  position: 'sticky',
  top: 'var(--spacing-8)',
  alignSelf: 'start',
};

const BASE_COURSE = {
  title: 'Applied AI: Build with Language Models',
  level: 'Intermediate',
  language: 'English',
  rating: 4.8,
  ratingCount: 1284,
  learnerCount: '12,840',
  lessonCount: 13,
  runtime: '4h 07m',
  price: 89,
  compareAt: 129,
  about:
    'Most courses show you what a model can do. This one makes you build the three features every product team is asked for — retrieval that answers the right question, output you can hand to other code, and an evaluation harness that catches regressions before your users do. Every module ends in something that runs; the reviewed project is a working extraction pipeline you can adapt.',
  skills: [
    'Retrieval-augmented generation',
    'Structured output',
    'Evaluation harnesses',
    'Prompt design',
    'Vector search',
  ],
};

const ASPECTS = [
  {label: 'Content depth', score: 4.9},
  {label: 'Practical exercises', score: 4.8},
  {label: 'Instructor clarity', score: 4.9},
  {label: 'Pacing', score: 4.6},
  {label: 'Materials and project', score: 4.7},
  {label: 'Community support', score: 4.5},
];

const REVIEWS = [
  {
    name: 'Drew Young',
    avatar: '/template-assets/DATA-Drew-Young.png',
    date: 'Reviewed 2 weeks ago',
    rating: 5,
    body: 'The evaluation module alone is worth the price. I walked in with a half-working RAG demo and walked out with a harness that caught two regressions in our first sprint after launch.',
    helpful: 41,
  },
  {
    name: 'Jihoo Song',
    avatar: '/template-assets/DATA-Jihoo-Song.png',
    date: 'Reviewed a month ago',
    rating: 5,
    body: 'Gabriela explains rerankers better than the papers do. The chunking lesson changed how our team splits documentation, and the project review was concrete, not rubber-stamp.',
    helpful: 28,
  },
  {
    name: 'Ana Thomas',
    avatar: '/template-assets/DATA-Ana-Thomas.png',
    date: 'Reviewed 2 months ago',
    rating: 4,
    body: 'Dense but fair. I wanted more on fine-tuning and got none — the course is honest about scoping to what ships. The structured-output lessons replaced three fragile regex pipelines of mine.',
    helpful: 19,
  },
  {
    name: 'Pablo Morales',
    avatar: '/template-assets/DATA-Pablo-Morales.png',
    date: 'Reviewed 3 months ago',
    rating: 5,
    body: 'I have taken four applied-AI courses this year and finished one. This is the one. Every module ends in something that runs, exactly as promised, and the finish-date picker kept me honest about pacing.',
    helpful: 33,
  },
];

const FAQS = [
  {
    q: 'Do I need production access to a language model?',
    a: 'No. Every exercise runs on a free-tier API key, and the project review accepts either the free tier or a local model. The course states where results differ between them.',
  },
  {
    q: 'How long do I have access?',
    a: 'Access is lifetime, including every future revision of the lessons. When the tooling shifts — and it will — the affected lessons are re-recorded rather than patched with errata.',
  },
  {
    q: 'What if the course is not right for me?',
    a: 'Every purchase carries a 30-day money-back guarantee, no questions and no forms beyond one click. Certificates already issued are yours to keep.',
  },
  {
    q: 'Is there a certificate?',
    a: 'Yes — a graded certificate issued when the reviewed project passes. It lists the pipeline you built, not just attendance.',
  },
];

function StarRating({rating, count}: {rating: number; count?: number}) {
  const filled = Math.round(rating);
  const empty = 5 - filled;

  return (
    <HStack gap={1} vAlign="center">
      {Array.from({length: filled}, (_, i) => (
        <Icon key={`full-${i}`} icon={StarIconSolid} size="sm" />
      ))}
      {Array.from({length: empty}, (_, i) => (
        <Icon key={`empty-${i}`} icon={StarIcon} size="sm" />
      ))}
      {count === undefined && (
        <VisuallyHidden>{`Rated ${rating} out of 5`}</VisuallyHidden>
      )}
      {count !== undefined && (
        <Text type="body" color="secondary">
          {rating} ({count.toLocaleString('en-US')})
        </Text>
      )}
    </HStack>
  );
}

function SectionHeader({title, action}: {title: string; action?: ReactNode}) {
  return (
    <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
      <Heading level={2}>{title}</Heading>
      {action}
    </HStack>
  );
}

// ─── Course head: title, poster, facts ──────────────────────────────────────

function AboutSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader title="About this course" />
        <Text type="body">{BASE_COURSE.about}</Text>
        <VStack gap={2}>
          <Text type="label">Skills you practice</Text>
          <HStack gap={2} wrap="wrap">
            {BASE_COURSE.skills.map(skill => (
              <Badge key={skill} label={skill} />
            ))}
          </HStack>
        </VStack>
      </VStack>
    </Section>
  );
}

// ─── Syllabus ────────────────────────────────────────────────────────────────

function ReviewCard({review}: {review: (typeof REVIEWS)[number]}) {
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <Avatar name={review.name} src={review.avatar} size="sm" />
          <VStack gap={1}>
            <Text type="body" weight="bold">
              {review.name}
            </Text>
            <Text type="supporting" color="secondary">
              {review.date}
            </Text>
          </VStack>
        </HStack>
        <StarRating rating={review.rating} />
        <Text type="body">{review.body}</Text>
        <HStack gap={2} vAlign="center">
          <Button
            label={`Helpful (${review.helpful})`}
            variant="ghost"
            size="sm"
            icon={<Icon icon={CheckIcon} size="xsm" />}
          />
        </HStack>
      </VStack>
    </Card>
  );
}

function ReviewsSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader
          title="Reviews"
          action={
            <Link href="#" type="supporting" color="secondary">
              How reviews work
            </Link>
          }
        />
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={5} vAlign="center">
              <VStack gap={1}>
                <Text type="display-3">{BASE_COURSE.rating}</Text>
                <StarRating rating={BASE_COURSE.rating} />
                <Text type="supporting" color="secondary">
                  {BASE_COURSE.ratingCount.toLocaleString('en-US')} reviews
                </Text>
              </VStack>
              <StackItem size="fill">
                <VStack gap={3}>
                  {ASPECTS.map(aspect => (
                    <VStack key={aspect.label} gap={1}>
                      <HStack gap={2} vAlign="center" hAlign="between">
                        <Text type="body" color="secondary">
                          {aspect.label}
                        </Text>
                        <Text type="body" color="secondary">
                          {aspect.score.toFixed(1)}
                        </Text>
                      </HStack>
                      <ProgressBar
                        label={aspect.label}
                        isLabelHidden
                        value={(aspect.score / 5) * 100}
                      />
                    </VStack>
                  ))}
                </VStack>
              </StackItem>
            </HStack>
          </VStack>
        </Card>
        <Grid columns={{minWidth: 280, repeat: 'fit'}} gap={4}>
          {REVIEWS.map(review => (
            <ReviewCard key={review.name} review={review} />
          ))}
        </Grid>
      </VStack>
    </Section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FaqSection() {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <SectionHeader title="Common questions" />
        <CollapsibleGroup type="multiple">
          {FAQS.map(faq => (
            <Collapsible
              key={faq.q}
              value={faq.q}
              defaultIsOpen={false}
              trigger={
                <Text type="large" weight="bold">
                  {faq.q}
                </Text>
              }>
              <Text type="body">{faq.a}</Text>
            </Collapsible>
          ))}
        </CollapsibleGroup>
      </VStack>
    </Section>
  );
}

// ─── Enroll rail ─────────────────────────────────────────────────────────────

// ─── Hook: below 768px the page switches to its phone composition ───────────
// Core's useMediaQuery shares one listener per query across the page and
// reads matchMedia during render, so the first paint already carries the
// right composition.
function useIsMobile(breakpoint = 768): boolean {
  return useMediaQuery(`(max-width: ${breakpoint}px)`);
}

// ─── Course data (domain-shaped sample content) ─────────────────────────────
type Lesson = {
  title: string;
  minutes: number;
  preview?: boolean;
  quiz?: boolean;
  project?: boolean;
  questions?: number;
  /** Timed lines for the player's captions, where the lesson has them (the
   *  design keeps these on its own demo course's first lesson). */
  captions?: {at: number; text: string}[];
};
type Module = {id: string; title: string; lessons: Lesson[]};

const COURSE = {
  school: 'Harbor School of Data',
  topic: 'Data & AI',
  title: 'Applied AI: Build with Language Models',
  outcome:
    'Ship three working LLM features in six weeks — retrieval, structured output, and evaluation — with the patterns production teams actually use.',
  rating: 4.8,
  reviewCount: 1284,
  students: 6420,
  saves: 810,
  price: 89,
  level: 'Intermediate',
  hours: 6,
  weeks: 6,
  language: 'English',
  subtitles: 12,
  // The design's Plus tier, as the panel and the FAQ speak of it.
  tier: {name: 'Plus', monthly: 12},
  modules: [
    {
      id: 'm1',
      title: 'Foundations that hold up in production',
      lessons: [
        {
          title: 'How models actually behave',
          minutes: 14,
          preview: true,
          // The transcript the player captions, as the design's own demo
          // lesson carries one so its player shows the lines it draws.
          captions: [
            {
              at: 0,
              text: 'A language model does not know things. It predicts what belongs next, one token at a time.',
            },
            {
              at: 42,
              text: 'That difference explains most of what looks like magic — and most of what goes wrong.',
            },
            {
              at: 104,
              text: 'Ask it a fact and it is drawing on patterns, not looking anything up.',
            },
            {
              at: 168,
              text: 'Which is why the same question can come back with two different answers.',
            },
            {
              at: 232,
              text: 'Here is the same prompt, run five times, with the temperature dial in three places.',
            },
            {
              at: 305,
              text: 'Notice what changes: not the facts, but the confidence in them.',
            },
            {
              at: 372,
              text: 'The context window is the other half of the story. Everything you send sits in it.',
            },
            {
              at: 448,
              text: 'Fill it, and the earliest parts fall out of view — silently.',
            },
            {
              at: 520,
              text: 'So the order you hand the model matters as much as what you hand it.',
            },
            {
              at: 600,
              text: 'We build the habit now: stable instructions first, changing data after.',
            },
            {
              at: 684,
              text: 'Open the practice set under this video and find the answer the model should not have given.',
            },
            {
              at: 764,
              text: 'The tutor will ask you why it slipped before it tells you the fix.',
            },
          ],
        },
        {title: 'Prompts as interfaces', minutes: 21, preview: true},
        {title: 'Tokens, context, and cost', minutes: 17},
        {title: 'Quiz: foundations', minutes: 8, quiz: true, questions: 8},
      ],
    },
    {
      id: 'm2',
      title: 'Retrieval that answers the right question',
      lessons: [
        {title: 'Chunking strategies compared', minutes: 19, preview: true},
        {title: 'Embeddings and hybrid search', minutes: 24},
        {title: 'Citations and grounding', minutes: 16},
      ],
    },
    {
      id: 'm3',
      title: 'Structured output and tool use',
      lessons: [
        {title: 'Schemas the model cannot miss', minutes: 18},
        {title: 'Function calling end to end', minutes: 22},
        {
          title: 'Project: extract a structured dataset',
          minutes: 180,
          project: true,
        },
      ],
    },
    {
      id: 'm4',
      title: 'Evaluation before deployment',
      lessons: [
        {title: 'Golden sets and graders', minutes: 20, preview: true},
        {title: 'Regression testing prompts', minutes: 15},
        {title: 'Quiz: evaluation', minutes: 8, quiz: true, questions: 6},
      ],
    },
  ] as Module[],
  inPrice: [
    '10 video lessons, 3 h 6 min in all',
    'The AI tutor beside every lesson',
    '2 quizzes, graded as you answer',
    'A project reviewed by Maya’s team',
    'A course certificate when you finish',
    'Transcripts in 12 languages',
  ],
  notInPrice: [
    'Answers the tutor writes for you',
    'Live reviews outside a cohort',
    'One-to-one mentoring',
    'A job guarantee',
  ],
  skills: [
    'Prompt design',
    'RAG pipelines',
    'Structured output',
    'Evaluation',
    'Cost control',
  ],
  // The teacher, as the design's own data keeps them (the catalog data
  // Teacher + the detail model Instructor): a trade line, a portrait where there
  // is one, three credentials in the teacher's own words, and every course
  // they teach — so the figures on the card and the two courses in the
  // Also-taught-by band are computed from the same records a real
  // catalogue would keep. The portrait is a shipped fixture image,
  // named for the person it sits beside.
  instructor: {
    name: 'Dr. Maya Chen',
    trade: 'Applied AI lead · ex-research scientist',
    portrait: '/template-assets/DATA-Gabriela-Fernandez.png',
    credentials: {
      years: 'Twelve years in ML',
      work: 'From research labs to shipping product features used every day.',
      highlight: 'The evaluation harness behind a top-ten assistant launch.',
      teaching: 'Working code first, theory exactly where it earns its place.',
    },
    rating: 4.9,
    learners: 48200,
    courses: [
      {
        id: 'this',
        title: 'Applied AI: Build with Language Models',
        level: 'Intermediate',
        weeks: 6,
        price: 89,
        rating: 4.8,
        learners: 6420,
      },
      {
        id: 'eval',
        title: 'Evaluation Engineering, End to End',
        level: 'Advanced',
        weeks: 4,
        price: 99,
        rating: 4.9,
        learners: 15800,
        image: '/template-assets/light-working-horizontal-2.png',
      },
      {
        id: 'prompts',
        title: 'Prompt Engineering in Production',
        level: 'Intermediate',
        weeks: 3,
        price: 59,
        rating: 4.7,
        learners: 9400,
        image: '/template-assets/moody-working-horizontal-1.png',
      },
    ],
  },
};

// ─── Shared helpers, ported ──────────────────────────────────────────────
const fmt = (n: number) => `$${n}`;
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (s: number) => `${pad(s / 60)}:${pad(s % 60)}`;
/** Folded for matching: accents off and lower case, so "Analisis" finds
 *  "Análisis" and a search reads the way people type. */
const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const figure = (n: number) => n.toLocaleString('en-US');
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const priceLabel = (p: number) => (p === 0 ? 'Free' : fmt(p));
const count = (n: number, one: string, many?: string) =>
  `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) {
    return `${m} min`;
  }
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** "This week", "3 weeks ago", "2 months ago". */
function ago(weeks: number) {
  if (weeks < 2) {
    return 'This week';
  }
  if (weeks < 5) {
    return `${weeks} weeks ago`;
  }
  const months = Math.round(weeks / 4.3);
  return `${months} ${months === 1 ? 'month' : 'months'} ago`;
}
const hash = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);

// Sample media: complete static fixture paths, so the copy step can find
// and ship every file, and nothing hotlinks a host.

// When the course can start, worked out from the page's frozen demo date
// (the start picker): at the learner's own pace from that day, or with a
// cohort on a Monday. The first cohort is already full, so the list shows
// the state a sold-out row takes. Dates are kept as keys and read back at
// noon UTC, so a date never slips a day.
const DAY = 86_400_000;
const at = (key: string) => new Date(`${key}T12:00:00Z`);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (key: string, days: number) =>
  keyOf(new Date(at(key).getTime() + days * DAY));
function monday(key: string, min: number) {
  const d = at(plusDays(key, min));
  const ahead = (8 - d.getUTCDay()) % 7;
  return keyOf(new Date(d.getTime() + ahead * DAY));
}
// A demo page shows one story, not the reader's calendar: the worked-from
// date is frozen so every render — server, client, any day of the year —
// agrees on the cohort window and the pace picker's finish date.
const DEMO_TODAY = '2025-09-21';
function localToday() {
  return DEMO_TODAY;
}
const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const shortDate = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
/** "Mon, Nov 9" */
const dayLabel = (key: string) => longDate.format(at(key));
/** "Nov 9" */
const dateLabel = (key: string) => shortDate.format(at(key));
type Start =
  | {kind: 'self'; key: 'self'}
  | {kind: 'cohort'; key: string; starts: string; ends: string; seats: number};
function startsFor(today: string): Start[] {
  const h = hash(COURSE.title);
  const first = monday(today, 1);
  const runs = [
    {starts: first, seats: 0},
    {starts: plusDays(first, 7), seats: 3 + (h % 10)},
    {starts: plusDays(first, 35), seats: 14 + (h % 12)},
  ];
  return [
    {kind: 'self', key: 'self'},
    ...runs.map(({starts, seats}) => ({
      kind: 'cohort' as const,
      key: starts,
      starts,
      ends: plusDays(starts, COURSE.weeks * 7 - 3),
      seats,
    })),
  ];
}
/** The day a self-paced learner finishes at `perWeek` hours a week. */
function finishAt(today: string, perWeek: number) {
  const weeks = Math.ceil((COURSE.weeks * COURSE.hours) / perWeek);
  return {weeks, key: plusDays(today, weeks * 7)};
}

/** A lesson's number in the course, as the design's own ids keep it. */
const lessonId = (mi: number, li: number) => `${mi + 1}.${li + 1}`;

/** The free clips, in syllabus order — the player's shelf. The id is the
 *  lesson's number (1.1, 2.1 …), as the design's clips carry it, so the
 *  shelf and the player's title card read "Lesson 1.1 · 14 min" its way. */
const CLIPS = COURSE.modules.flatMap((m, mi) =>
  m.lessons
    .map((l, li) => ({...l, id: lessonId(mi, li), module: m.title}))
    .filter(l => l.preview),
);

/** The page's one player — held once, opened
 *  by the poster or by any Preview chip in the syllabus. */
type PreviewContextType = {open: (id?: string) => void};
const PreviewContext = createContext<PreviewContextType>({open: () => {}});
const usePreview = () => useContext(PreviewContext);

/** The speeds the design's player steps through, one press at a time. */
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

function PreviewProvider({children}: {children: React.ReactNode}) {
  const [opened, setOpened] = useState<string | null>(null); // clip id while open
  const [clipId, setClipId] = useState(CLIPS[0]?.id);
  const show = (id?: string) => {
    if (id) {
      setClipId(id);
    }
    setOpened(id ?? CLIPS[0]?.id ?? null);
  };
  const clip = CLIPS.find(c => c.id === clipId) ?? CLIPS[0];

  const close = () => setOpened(null);

  // Picking another lesson from the shelf swaps the Player (keyed on the
  // clip) so it starts from the top, exactly as the design keys its own.
  const pickClip = (id: string) => {
    setClipId(id);
    setOpened(id);
  };

  return (
    <PreviewContext.Provider value={{open: show}}>
      {children}
      {/* the dialog lives once at the page's root, as the design holds
          its own: the design's dialog body is sm:max-w-5xl, header / a
          scrolling grid of player and shelf / a ruled footer of two CTAs.
          cr12-sheet carries the design's own phone register: a sheet that
          rises from the foot of the screen, full-bleed with its top corners
          rounded (the dialog: items-end + rounded-t-xl below sm). */}
      <Dialog
        isOpen={opened !== null}
        onOpenChange={o => {
          if (!o) {
            close();
          }
        }}
        width={1024}
        padding={0}
        aria-label="Course preview player"
        className="cr12-sheet">
        {/* minHeight 0: the sheet's column is a flex item of the dialog's
            inner wrapper, and a column of visible overflow would hold its
            content height and push the ruled footer past the sheet's foot.
            Reset the automatic minimum (the rule every flex scroll region
            rides) so the column takes the clamped height and its middle —
            the scrolling grid, min-height 0 itself — gives. */}
        <VStack gap={0} style={{width: '100%', minHeight: 0}}>
          <div
            className="cr12-dhead"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              width: '100%',
            }}>
            <VStack gap={1} style={{minWidth: 0, flex: '1 1 auto'}}>
              <Caps>Preview</Caps>
              <Text
                type="body"
                weight="medium"
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                {COURSE.title}
              </Text>
            </VStack>
            {/* the design's close control: a 40px muted square, the
                thin outline XMark at 16px, one rung darker under the pointer */}
            <button
              type="button"
              className="cr12-dclose"
              aria-label="Close the preview"
              onClick={close}>
              <XMarkIcon aria-hidden="true" style={{width: 16, height: 16}} />
            </button>
          </div>

          <div
            className="cr9-playergrid cr12-dbody"
            style={{
              width: '100%',
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
            }}>
            {/* Keyed on the lesson, so picking another one starts it from the
                top rather than at the second the last one stopped — and held
                back until the dialog opens, so the clock only runs while the
                player is on screen (the design's portal mounts its own
                player on open). */}
            {clip && opened !== null && <Player key={clip.id} clip={clip} />}

            <VStack gap={0} style={{minWidth: 0, height: '100%'}}>
              <Caps>Free to watch</Caps>
              <VStack gap={1} style={{marginTop: 12}}>
                {CLIPS.map(c => {
                  const on = c.id === clip?.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="cr9-shelfrow"
                      onClick={() => pickClip(c.id)}
                      aria-current={on || undefined}>
                      {/* the clip's plate: the poster art at 56px with the
                          play glyph over it, as the design sets its photo */}
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'relative',
                          display: 'flex',
                          width: 56,
                          height: 56,
                          flexShrink: 0,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          borderRadius: 10,
                          background:
                            'linear-gradient(160deg, #1c1917 0%, #292524 55%, #3f3d3a 100%)',
                        }}>
                        <span
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(28,25,23,0.25)',
                          }}>
                          <PlaySolid
                            style={{
                              width: 16,
                              height: 16,
                              color: '#fafaf9',
                              transform: 'translateX(1px)',
                            }}
                          />
                        </span>
                      </span>
                      <span style={{minWidth: 0}}>
                        <span
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: 1.4,
                          }}>
                          {c.title}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            marginTop: 2,
                            fontSize: 14,
                            fontVariantNumeric: 'tabular-nums',
                            color: 'var(--color-text-secondary)',
                          }}>
                          Lesson {c.id} · {c.minutes} min
                        </span>
                      </span>
                    </button>
                  );
                })}
              </VStack>
              <Text
                type="supporting"
                color="secondary"
                style={{marginTop: 'auto', paddingTop: 24}}>
                The preview is the video on its own. Lesson one opens in full,
                with the tutor and its practice set, and asks for no card.
              </Text>
            </VStack>
          </div>

          {/* the design's ruled footer of two CTAs (the preview body): a column
              on a phone, each button the full row; a right-held row from sm */}
          <div className="cr12-dfoot">
            <button type="button" className="cr7-ringbtn" onClick={close}>
              Start lesson one free
            </button>
            <button
              type="button"
              onClick={close}
              style={{
                display: 'inline-flex',
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-element)',
                background: 'var(--color-accent)',
                paddingInline: 20,
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--color-on-accent)',
                border: 'none',
                cursor: 'pointer',
                transition:
                  'background-color var(--duration-fast) var(--ease-standard)',
              }}>
              Enroll for {priceLabel(COURSE.price)}
            </button>
          </div>
        </VStack>
      </Dialog>
    </PreviewContext.Provider>
  );
}

/** The player, as the design draws it: a demo that plays on the clock —
 *  from wherever the thumb stands, a second a second times the speed, stopping
 *  on its own at the end. The poster leans in as the lesson runs, so a
 *  playing frame does not read as a paused one, and a lesson with a transcript
 *  shows its captions. It opens playing: a reader who asked for a preview
 *  asked to watch it. */
function Player({clip}: {clip: (typeof CLIPS)[number]}) {
  const total = clip.minutes * 60;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cc, setCc] = useState(true);

  const running = playing && at < total;
  useEffect(() => {
    if (!running) {
      return;
    }
    const t = setInterval(
      () => setAt(s => Math.min(total, s + 0.25 * speed)),
      250,
    );
    return () => clearInterval(t);
  }, [running, speed, total]);

  const toggle = () => {
    if (running) {
      return setPlaying(false);
    }
    if (at >= total) {
      setAt(0);
    }
    setPlaying(true);
  };

  const line = clip.captions?.filter(c => c.at <= at).pop();
  const fresh = at === 0 && !running;

  return (
    <VStack gap={0} style={{minWidth: 0}}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          overflow: 'hidden',
          borderRadius: 'calc(var(--radius-container) * 0.6)',
          background: '#141210',
        }}>
        {/* the art leans in as the lesson runs */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(160deg, #1c1917 0%, #292524 55%, #3f3d3a 100%)',
            transition: 'transform 300ms linear',
            transform: `scale(${(1.02 + (0.06 * at) / total).toFixed(4)})`,
          }}
        />
        {/* The whole frame is the play control, as it is on every player.
            Its disc and the dim under it step aside while the lesson runs and
            come back under the pointer. */}
        <button
          type="button"
          onClick={toggle}
          aria-label={running ? 'Pause the preview' : 'Play the preview'}
          className="cr9-frame">
          <span
            aria-hidden="true"
            className={`cr9-dim${running ? ' cr9-away' : ''}`}
          />
          <span
            aria-hidden="true"
            className={`cr9-pdisc${running ? ' cr9-away' : ''}`}>
            {running ? (
              <PauseIcon style={{width: 24, height: 24}} />
            ) : (
              <PlaySolid
                style={{width: 24, height: 24, transform: 'translateX(2px)'}}
              />
            )}
          </span>
        </button>

        {/* The lesson's own title card until it starts: which lesson, and from
            which module, on a surface of its own over the art — 12px off the
            frame's edges on a phone, 16px from sm (the design's left-3
            top-3 → sm:left-4 sm:top-4). */}
        {fresh && (
          <div
            className="cr12-titlecard"
            style={{
              position: 'absolute',
              borderRadius: 'calc(var(--radius-container) * 0.6)',
              background: 'var(--color-background-card)',
              padding: '10px 14px',
              boxShadow: 'var(--shadow-low)',
              pointerEvents: 'none',
            }}>
            <Caps>
              Lesson {clip.id} · {clip.module}
            </Caps>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
              {clip.title}
            </p>
          </div>
        )}

        {cc && line && !fresh && (
          <p
            className="cr12-ccpos"
            style={{
              position: 'absolute',
              textAlign: 'center',
              margin: 0,
              pointerEvents: 'none',
            }}>
            <span
              style={{
                display: 'inline-block',
                maxWidth: '100%',
                borderRadius: 'calc(var(--radius-container) * 0.6)',
                background: 'rgba(28,25,23,0.8)',
                padding: '4px 10px',
                fontSize: 14,
                color: '#fafaf9',
              }}>
              {line.text}
            </span>
          </p>
        )}
      </div>

      {/* the control bar, the design's gap-2 → sm:gap-3 holding it */}
      <div
        className="cr12-ctlbar"
        style={{marginTop: 12, display: 'flex', alignItems: 'center'}}>
        <button
          type="button"
          onClick={toggle}
          aria-label={running ? 'Pause' : 'Play'}
          className="cr9-ctl cr9-play">
          {running ? (
            <PauseIcon style={{width: 16, height: 16}} />
          ) : (
            <PlaySolid
              style={{width: 16, height: 16, transform: 'translateX(1px)'}}
            />
          )}
        </button>

        {/* the scrubber, the design's own Slider (the slider): an 8px
            muted rail, the played part in the brand, a 24px white disc lifted
            by the soft shadow — cr12-scrub restyles the primitive to it */}
        <div className="cr12-scrub" style={{minWidth: 0, flex: '1 1 auto'}}>
          <Slider
            label="Position in the lesson"
            value={Math.min(at, total)}
            onChange={(v: number) => setAt(v)}
            min={0}
            max={Math.max(total, 1)}
            step={1}
            isLabelHidden
          />
        </div>

        <span
          style={{
            flexShrink: 0,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-text-secondary)',
          }}>
          {mmss(at)} / {mmss(total)}
        </span>

        {/* One press steps through the speeds, as the players people already
            know do; the label is the speed it is on. */}
        <button
          type="button"
          onClick={() =>
            setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])
          }
          aria-label={`Playback speed, ${speed} times`}
          className="cr9-ctl cr9-speed">
          {speed}×
        </button>

        {clip.captions && (
          <button
            type="button"
            onClick={() => setCc(v => !v)}
            aria-pressed={cc}
            aria-label="Captions"
            className="cr9-ctl cr9-cc"
            data-on={cc || undefined}>
            <HugeIcon
              icon={ClosedCaptionIcon}
              size={18}
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </VStack>
  );
}

// ─── Small shared pieces ─────────────────────────────────────────────────────
/** Five stars, in ink up to the rating's whole number, the next one inked
 *  to the rating's fraction, and pale past it, the way a disabled control
 *  reads (the design's Stars). */
function Stars({value, size = 12}: {value: number; size?: number}) {
  const whole = Math.floor(value);
  return (
    <span
      role="img"
      aria-label={`Rated ${value} out of 5`}
      style={{display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0}}>
      {[1, 2, 3, 4, 5].map(n => {
        const fill = n <= whole ? 1 : n === whole + 1 ? value - whole : 0;
        return (
          <span
            key={n}
            aria-hidden="true"
            style={{
              position: 'relative',
              flexShrink: 0,
              width: size,
              height: size,
            }}>
            <StarIconSolid
              style={{
                width: size,
                height: size,
                color:
                  'color-mix(in srgb, var(--color-text-primary) 20%, transparent)',
              }}
            />
            {fill > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  insetInlineStart: 0,
                  width: `${fill * 100}%`,
                  overflow: 'hidden',
                }}>
                <StarIconSolid
                  style={{
                    width: size,
                    height: size,
                    maxWidth: 'none',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** The star held against the figure it belongs to (the design's head
 *  rows and card feet): one solid star, the figure tabular beside it. */
function StarFig({
  value,
  size = 16,
  bold = false,
}: {
  value: number;
  size?: number;
  bold?: boolean;
}) {
  return (
    <span style={{display: 'flex', alignItems: 'center', gap: 2}}>
      <StarIconSolid
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          color: 'var(--color-text-primary)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: bold ? 525 : undefined,
        }}>
        {value}
      </span>
    </span>
  );
}

/** A caps micro-label riding its section — the design draws these in the
 *  mono face (Geist Mono here), uppercase with wide tracking. */
function Caps({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Text
      type="code"
      style={{textTransform: 'uppercase', letterSpacing: '0.08em', ...style}}>
      {children}
    </Text>
  );
}

/** The words a heading turns on, swiped through with the brand's marker
 *  (the design's Highlight): two strokes, not one — they cross at the
 *  left and open out to the right, and both overrun the words at either
 *  end. The drawing takes its width outright; it takes no pointer events. */
function Highlight({children}: {children: React.ReactNode}) {
  return (
    <span style={{position: 'relative', whiteSpace: 'nowrap'}}>
      {children}
      <svg
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          bottom: -6,
          left: -12,
          height: 16,
          width: 'calc(100% + 24px)',
        }}>
        <g
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke">
          <path d="M2 6 C 60 1, 140 11, 198 5" />
          <path d="M10 5 C 66 10, 140 16, 190 11" />
        </g>
      </svg>
    </span>
  );
}

/** The words a search found, marked in the brand's chip tint. `query` is
 *  already folded. */
function Marked({text, query}: {text: string; query: string}) {
  if (!query) {
    return <>{text}</>;
  }
  const i = fold(text).indexOf(query);
  if (i < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, i)}
      <mark className="cr4-mark">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

/** The syllabus and the reviews search rows: the core `TextInput` carries
 *  the magnifier (`startIcon`) and the clear button (`hasClear` — clearing
 *  hands focus back to the input). */
function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="cr7-search">
      <TextInput
        label={label}
        isLabelHidden
        size="md"
        width="100%"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        startIcon={MagnifyingGlassIcon}
        hasClear
      />
    </div>
  );
}

/** The design's topic marks: one glyph per subject and one hue — the
 *  chip on every card of that subject and at the head of the course page
 *  (the design's own glyph map is heroicons throughout). */
const topicGlyph: Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  'Data & AI': ChartBarIcon,
  Engineering: CommandLineIcon,
  Design: PaintBrushIcon,
  Business: BanknotesIcon,
};
const topicTint: Record<string, {lid: string; ink: string}> = {
  'Data & AI': {
    lid: 'var(--color-background-purple)',
    ink: 'var(--color-text-purple)',
  },
  Engineering: {
    lid: 'var(--color-background-blue)',
    ink: 'var(--color-text-blue)',
  },
  Design: {
    lid: 'var(--color-background-orange)',
    ink: 'var(--color-text-orange)',
  },
  Business: {
    lid: 'var(--color-background-yellow)',
    ink: 'var(--color-text-yellow)',
  },
};
function TopicChip({topic}: {topic: string}) {
  const Glyph = topicGlyph[topic] ?? ChartBarIcon;
  const tint = topicTint[topic] ?? topicTint['Data & AI'];
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 'var(--radius-element)',
        paddingInline: 10,
        paddingTop: 4,
        paddingBottom: 4,
        background: tint.lid,
        color: tint.ink,
        fontSize: 12,
        fontWeight: 500,
        flexShrink: 0,
      }}>
      <Glyph aria-hidden="true" style={{width: 14, height: 14}} />
      {topic}
    </span>
  );
}

/** Save, as the design's cards and the head draw it: a 36px toggle a
 *  step under the controls beside it, the heart turning solid and the chip
 *  taking the coral recipe once it is saved. */
function SaveButton({
  saved,
  onToggle,
  count,
  ariaLabel,
}: {
  saved: boolean;
  onToggle: () => void;
  count: number;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={ariaLabel}
      className={saved ? undefined : 'cr7-ringbtn'}
      style={
        saved
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 36,
              paddingInline: 12,
              borderRadius: 'var(--radius-element)',
              background: 'var(--color-background-orange)',
              color: 'var(--color-text-orange)',
              fontSize: 14,
              cursor: 'pointer',
              border: 'none',
              transition:
                'background-color var(--duration-fast) var(--ease-standard)',
            }
          : {height: 36, paddingInline: 12, gap: 6, flexShrink: 0}
      }>
      {saved ? (
        <HeartSolid aria-hidden="true" style={{width: 16, height: 16}} />
      ) : (
        <HeartIcon aria-hidden="true" style={{width: 16, height: 16}} />
      )}
      <span style={{fontVariantNumeric: 'tabular-nums'}}>
        {compact.format(count + (saved ? 1 : 0))}
      </span>
    </button>
  );
}

/** Share, as the design draws it: a small menu of the ways a page gets
 *  passed on — its link on the clipboard, and an email with the link in it. */
function ShareButton({title}: {title: string}) {
  const {copy, isCopied} = useClipboard({announce: 'Link copied'});
  const url = () =>
    typeof window === 'undefined'
      ? ''
      : new URL('/shop/applied-ai', window.location.origin).toString();
  const row = 'cr7-menurow';
  return (
    <Popover
      label={`Share ${title}`}
      className="cr7-pop"
      placement="below"
      alignment="center"
      width={248}
      style={{padding: 6}}
      content={
        <VStack gap={0.5}>
          <button
            type="button"
            className={row}
            onClick={() => void copy(url())}>
            {isCopied ? (
              <CheckIcon
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  color: 'var(--color-text-purple)',
                }}
              />
            ) : (
              <HugeIcon
                icon={Link01Icon}
                size={16}
                strokeWidth={1.6}
                aria-hidden="true"
              />
            )}
            {isCopied ? 'Link copied' : 'Copy the link'}
          </button>
          <button
            type="button"
            className={row}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url()}`)}`;
              }
            }}>
            <HugeIcon
              icon={Mail01Icon}
              size={16}
              strokeWidth={1.6}
              aria-hidden="true"
            />
            Send it by email
          </button>
        </VStack>
      }>
      {trigger => (
        <button
          type="button"
          {...trigger}
          className="cr7-ringbtn"
          style={{height: 40, flexShrink: 0}}>
          <HugeIcon
            icon={Share03Icon}
            size={16}
            strokeWidth={1.6}
            aria-hidden="true"
          />
          Share
        </button>
      )}
    </Popover>
  );
}

// ─── head (the rail's first block, centered) ─────────────────────────────────
function HeadBlock() {
  const [saved, setSaved] = useState(false);
  return (
    // The design's own parting (the page shell head): mt-6 under the
    // tags, mt-5 under the outcome, mt-6 under the rating line and mt-6
    // under the buttons — no uniform stack gap.
    <VStack gap={0} align="center">
      <HStack gap={4} vAlign="center" wrap="wrap" justify="center">
        <TopicChip topic={COURSE.topic} />
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}>
          <LevelDots level={COURSE.level} />
          {COURSE.level}
        </span>
      </HStack>
      <Text type="display-1" as="h1" style={{...headlineStyle, marginTop: 24}}>
        {COURSE.title}
      </Text>
      <Text
        type="body"
        color="secondary"
        style={{
          maxWidth: 448,
          marginTop: 20,
          // the design's head is set on the centre line (text-center on
          // the wrapper) with the outcome's lines balanced
          textAlign: 'center',
          textWrap: 'balance',
        }}>
        {COURSE.outcome}
      </Text>
      <p
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          columnGap: 8,
          rowGap: 4,
          margin: '24px 0 0',
          fontSize: 14,
        }}>
        <StarFig value={COURSE.rating} size={16} />
        <a
          href="#reviews"
          style={{
            fontVariantNumeric: 'tabular-nums',
            textDecorationLine: 'underline',
            textUnderlineOffset: 4,
            color: 'inherit',
          }}>
          {figure(COURSE.reviewCount)} reviews
        </a>
        <span aria-hidden="true" style={{color: 'var(--color-text-secondary)'}}>
          ·
        </span>
        <span>
          <span style={{fontVariantNumeric: 'tabular-nums'}}>
            {figure(COURSE.students)}
          </span>{' '}
          <span style={{color: 'var(--color-text-secondary)'}}>learners</span>
        </span>
      </p>

      <HStack gap={2} vAlign="center" justify="center" style={{marginTop: 24}}>
        <SaveButton
          saved={saved}
          onToggle={() => setSaved(s => !s)}
          count={COURSE.saves}
          ariaLabel={`Save ${COURSE.title}`}
        />
        <ShareButton title={COURSE.title} />
      </HStack>
    </VStack>
  );
}

// ─── Details: the teacher row + the four facts ──────────────────────────────
/** The design's fact tile: a 44px card tile (the avatar's size, so the
 *  five rows share one edge) with the soft shadow, the glyph inside it. */
function FactTile({icon, ai = false}: {icon: IconSvgElement; ai?: boolean}) {
  return (
    <VStack
      style={{
        width: 44,
        height: 44,
        borderRadius: 'calc(var(--radius-container) * 0.6)',
        background: 'var(--color-background-card)',
        boxShadow: 'var(--shadow-low)',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
      }}>
      <HugeIcon
        icon={icon}
        size={22}
        strokeWidth={1.5}
        aria-hidden="true"
        style={ai ? {color: 'var(--color-text-purple)'} : undefined}
      />
    </VStack>
  );
}

function DetailsBlock() {
  const facts: {
    term: string;
    icon: IconSvgElement;
    ai?: boolean;
    value: string;
    note: string;
  }[] = [
    {
      term: 'Length',
      icon: Calendar03Icon,
      value: `${COURSE.weeks} weeks at ${COURSE.hours} hours a week`,
      note: 'At your own pace, or in a live cohort',
    },
    {
      term: 'Credential',
      icon: Certificate01Icon,
      value: 'Earn a course certificate',
      note: `Issued by ${COURSE.school}`,
    },
    {
      term: 'Language',
      icon: Globe02Icon,
      value: `Taught in ${COURSE.language}`,
      note: `With subtitles in ${count(COURSE.subtitles, 'language')}`,
    },
    {
      term: 'Tutor',
      icon: AiMagicIcon,
      ai: true,
      value: 'An AI tutor in every lesson',
      note: 'It answers from the lesson on screen',
    },
  ];
  return (
    <VStack gap={6}>
      <button
        type="button"
        className="cr4-row"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          paddingInline: 0,
        }}
        onClick={() => document.getElementById('instructor')?.scrollIntoView()}>
        {/* The teacher's face where there is one (the design's Avatar,
            size sm): the same portrait the instructor card wears. */}
        <img
          src={COURSE.instructor.portrait}
          alt=""
          width={44}
          height={44}
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
        <StackItem size="fill">
          <VStack gap={0.5}>
            <HStack gap={1} vAlign="center">
              <Text type="body" weight="medium">
                Taught by {COURSE.instructor.name}
              </Text>
              <CheckBadgeSolid
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  color: 'var(--color-text-purple)',
                }}
              />
              <VisuallyHidden>, verified instructor</VisuallyHidden>
            </HStack>
            <Text type="supporting" color="secondary" style={{width: '100%'}}>
              {COURSE.instructor.trade} · {COURSE.school}
            </Text>
          </VStack>
        </StackItem>
      </button>
      <dl
        style={{display: 'flex', flexDirection: 'column', gap: 24, margin: 0}}>
        {facts.map(f => (
          <div key={f.term}>
            <VisuallyHidden as="dt">{f.term}</VisuallyHidden>
            <dd
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                margin: 0,
              }}>
              <FactTile icon={f.icon} ai={f.ai} />
              <span style={{minWidth: 0}}>
                <span style={{display: 'block', fontSize: 14, fontWeight: 500}}>
                  {f.value}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 14,
                    color: 'var(--color-text-secondary)',
                  }}>
                  {f.note}
                </span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </VStack>
  );
}

// ─── Poster (lesson preview → the player) ───────────────────────────────────
/** The frame at the top of the page (the design's poster frame): the
 *  course's cover art as the poster of its first free lesson, with the
 *  lesson named on a plate over it. A press anywhere opens the player on
 *  that lesson. The card must FILL the 4:3 box the AspectRatio holds open
 *  for it: a card sized to its content inside that box leaves the art
 *  short and a hole below the poster. */
function Poster() {
  const preview = usePreview();
  const clip = CLIPS[0];
  return (
    <AspectRatio ratio={4 / 3}>
      <ClickableCard
        className="cr9-poster"
        label={`Preview ${COURSE.title}: ${CLIPS.length} free lessons`}
        onClick={() => preview.open(clip?.id)}
        padding={0}
        style={{height: '100%', isolation: 'isolate'}}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: 'var(--radius-container)',
            overflow: 'hidden',
            color: '#fafaf9',
          }}>
          {/* the art (the design's photograph; no Image primitive)
              leans in under the pointer, and the dim over it doubles */}
          <span aria-hidden="true" className="cr9-poster-art" style={inkArt} />
          <span aria-hidden="true" className="cr9-poster-dim" />

          {/* the course's badge, as the design sets it at the top-left on
              its own tinted chip */}
          <span
            style={{
              position: 'absolute',
              insetInlineStart: 16,
              top: 16,
              zIndex: 2,
              borderRadius: 'var(--radius-element)',
              paddingInline: 10,
              paddingTop: 4,
              paddingBottom: 4,
              background: 'var(--color-accent-muted)',
              color: 'var(--color-text-accent)',
              fontSize: 12,
              fontWeight: 500,
            }}>
            First lessons free
          </span>

          {/* the disc, dead centre, nothing beside it — the design's own
              composition */}
          <span
            aria-hidden="true"
            className="cr9-poster-disc"
            style={{
              position: 'absolute',
              insetInlineStart: '50%',
              top: '50%',
              marginInlineStart: -36,
              marginTop: -36,
              zIndex: 2,
            }}>
            <PlaySolid
              style={{width: 28, height: 28, transform: 'translateX(2px)'}}
            />
          </span>

          {/* The lesson it opens on, on its own plate: text straight on a
              photograph is unreadable somewhere in it. The design's own
              mobile branch insets the plate 12px on every side and runs it
              the frame's full width; only from sm does it anchor bottom-LEFT
              at 16px with a max width (the preview body's inset-x-3 bottom-3 →
              sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-md). */}
          {clip && (
            <span
              className="cr9-plate"
              style={{
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRadius: 'calc(var(--radius-container) * 0.6)',
                background: 'var(--color-background-card)',
                padding: '12px 16px 12px 12px',
                boxShadow: 'var(--shadow-low)',
                color: 'var(--color-text-primary)',
              }}>
              <span
                style={{
                  display: 'flex',
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  background: 'var(--color-background-muted)',
                }}>
                <PlaySolid
                  style={{width: 16, height: 16, transform: 'translateX(1px)'}}
                />
              </span>
              <span style={{minWidth: 0}}>
                <Caps>Preview · {CLIPS.length} free lessons</Caps>
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontSize: 14,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                  {clip.title}
                </span>
              </span>
            </span>
          )}
        </div>
      </ClickableCard>
    </AspectRatio>
  );
}

// ─── Syllabus ────────────────────────────────────────────────────────────────
const ALL_OPEN = COURSE.modules.map(m => m.id);

/** A lesson's glyph says what kind of time it asks for: watching, answering,
 *  or making something somebody will review (the design's tag). */
function LessonTag({lesson: l}: {lesson: Lesson}) {
  if (!l.quiz && !l.project) {
    return (
      <PlayCircleIcon
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          color: 'var(--color-text-secondary)',
        }}
      />
    );
  }
  return (
    <HugeIcon
      icon={l.quiz ? CheckListIcon : Package01Icon}
      size={20}
      strokeWidth={1.5}
      aria-hidden="true"
      style={{color: 'var(--color-text-secondary)', flexShrink: 0}}
    />
  );
}

/** The lesson's number in the syllabus: "2.3", as the design prints it
 *  (shared with the player's clips, above). */

function Syllabus() {
  const preview = usePreview();
  // The design's module rail and preview chip step at sm (640), not md.
  const isMobile = useIsMobile(639);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string[]>(['m1']);
  const q = fold(query.trim());
  // What the search shows: modules whose title matches keep every lesson;
  // otherwise only the lessons that match, and modules with none drop out.
  const shown = COURSE.modules
    .map(m => ({
      m,
      lessons: fold(m.title).includes(q)
        ? m.lessons
        : m.lessons.filter(l => fold(l.title).includes(q)),
    }))
    .filter(x => x.lessons.length > 0 || (q && fold(x.m.title).includes(q)));
  const found = q
    ? COURSE.modules
        .flatMap(m => m.lessons)
        .filter(l => fold(l.title).includes(q)).length
    : 0;
  const titled = q
    ? COURSE.modules.filter(m => fold(m.title).includes(q)).length
    : 0;
  const tally = [
    found ? count(found, 'lesson') : '',
    titled ? count(titled, 'module') : '',
  ]
    .filter(Boolean)
    .join(' and ');
  // The tally's one sentence, held in a variable so the live region below
  // stays mounted whether or not a search has a match to announce.
  const tallyText = `${tally} ${found + titled === 1 ? 'mentions' : 'mention'} “${query.trim()}”`;
  const all = open.length === COURSE.modules.length;

  // The course in six figures, each with the line that says what it holds
  // (the design computes these from the syllabus itself, so a rewritten
  // course keeps a true summary, and a figure that comes to nothing drops
  // out).
  const items = COURSE.modules.flatMap(m => m.lessons);
  const videos = items.filter(l => !l.quiz && !l.project);
  const lengths = videos.map(l => l.minutes);
  const [shortest, longest] = [Math.min(...lengths), Math.max(...lengths)];
  const free = videos.filter(l => l.preview).length;
  const quizzes = items.filter(l => l.quiz).length;
  const questions = items.reduce((sum, l) => sum + (l.questions ?? 0), 0);
  const project = items.some(l => l.project);
  const minutes = videos.reduce((sum, l) => sum + l.minutes, 0);
  const facts: {
    n: number;
    icon: IconSvgElement;
    title: string;
    text: string;
  }[] = [
    {
      n: COURSE.modules.length,
      icon: Layers01Icon,
      title: count(COURSE.modules.length, 'module'),
      text: 'Ends on the project',
    },
    {
      n: videos.length,
      icon: PlayListIcon,
      title: count(videos.length, 'lesson'),
      text:
        shortest === longest
          ? `${shortest} min each`
          : `${shortest} to ${longest} min each`,
    },
    {
      n: minutes,
      icon: Clock01Icon,
      title: `${duration(minutes)} of video`,
      text: 'Pause to ask the tutor',
    },
    {
      n: free,
      icon: SquareUnlock02Icon,
      title: count(free, 'free lesson'),
      text: 'Watch before you pay',
    },
    {
      n: quizzes,
      icon: CheckListIcon,
      title: count(quizzes, 'quiz', 'quizzes'),
      text: `${questions} questions in all`,
    },
    {
      n: project ? 1 : 0,
      icon: Package01Icon,
      title: '1 project',
      text: 'Reviewed by Maya’s team',
    },
  ].filter(f => f.n > 0);

  return (
    <VStack gap={0}>
      {/* The course in six figures: each a glyph, the figure, and one line
          on what it holds — two to a row on a phone, three from sm. */}
      <ul
        className="cr7-facts"
        style={{margin: 0, padding: 0, listStyle: 'none'}}>
        {facts.map(f => (
          <li key={f.title} className="cr7-fact">
            <HugeIcon
              icon={f.icon}
              size={20}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p style={{margin: '12px 0 0', fontSize: 14, fontWeight: 500}}>
              {f.title}
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 14,
                color: 'var(--color-text-secondary)',
              }}>
              {f.text}
            </p>
          </li>
        ))}
      </ul>

      {/* The two ways through the list, as the reviews set theirs: the
          search and Open-every-module on one line over a rule. */}
      <div className="cr7-toolbar">
        <SearchField
          label="Search the syllabus"
          placeholder="Find a lesson"
          value={query}
          onChange={setQuery}
        />
        {!q && (
          <button
            type="button"
            className="cr7-ringbtn"
            style={{flexShrink: 0}}
            onClick={() => setOpen(all ? [] : ALL_OPEN)}>
            {all ? 'Close every module' : 'Open every module'}
          </button>
        )}
      </div>

      {q && tally ? (
        <p
          aria-hidden="true"
          style={{
            margin: '16px 0 0',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          {tallyText}
        </p>
      ) : null}
      <VisuallyHidden as="p" aria-live="polite">
        {q && tally ? tallyText : ''}
      </VisuallyHidden>

      {q && shown.length === 0 ? (
        <VStack
          gap={2}
          style={{
            marginTop: 16,
            borderRadius: 'var(--radius-container)',
            background: 'var(--color-background-muted)',
            padding: 24,
          }}>
          <Text type="body" weight="medium">
            No lesson mentions “{query.trim()}”
          </Text>
          <Text type="supporting" color="secondary">
            Try one of the skills the course is built on.
          </Text>
          <HStack gap={2} wrap="wrap" style={{marginTop: 16}}>
            {COURSE.skills.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                style={{
                  height: 40,
                  borderRadius: 'var(--radius-element)',
                  background: 'var(--color-background-card)',
                  boxShadow: 'var(--shadow-low)',
                  paddingInline: 16,
                  fontSize: 14,
                  cursor: 'pointer',
                  border: 'none',
                }}>
                {s}
              </button>
            ))}
          </HStack>
        </VStack>
      ) : (
        <CollapsibleGroup
          type="multiple"
          value={q ? shown.map(x => x.m.id) : open}
          onChange={v => {
            if (!q) {
              setOpen(Array.isArray(v) ? v : [v]);
            }
          }}>
          <ol style={{margin: '24px 0 0', padding: 0, listStyle: 'none'}}>
            {shown.map(({m, lessons}, k) => {
              const last = k === shown.length - 1;
              const moduleVideos = m.lessons.filter(l => !l.quiz && !l.project);
              const time = moduleVideos.reduce((sum, l) => sum + l.minutes, 0);
              const closer = m.lessons[m.lessons.length - 1];
              const mi = COURSE.modules.indexOf(m);
              // On a phone the number sits in front of the title; from sm the
              // design's rail: each module's tile, and a line running down
              // from it to the next, so the modules read as one course taken
              // in order.
              const head = (
                <span style={{minWidth: 0, flex: '1 1 auto'}}>
                  <span
                    style={{
                      display: 'flex',
                      gap: 8,
                      fontSize: 16,
                      fontWeight: 500,
                    }}>
                    {isMobile && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontFamily: 'var(--font-family-heading)',
                          fontVariantNumeric: 'tabular-nums',
                          color: 'var(--color-text-secondary)',
                        }}>
                        {String(mi + 1).padStart(2, '0')}
                      </span>
                    )}
                    <span style={{minWidth: 0}}>
                      <Marked text={m.title} query={q} />
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 14,
                      color: 'var(--color-text-secondary)',
                    }}>
                    {count(moduleVideos.length, 'lesson')} · {duration(time)}
                    {closer?.quiz
                      ? ' · quiz'
                      : closer?.project
                        ? ' · project'
                        : ''}
                  </span>
                </span>
              );
              return (
                <li
                  key={m.id}
                  style={{
                    position: 'relative',
                    isolation: 'isolate',
                    display: isMobile ? 'block' : 'grid',
                    ...(isMobile
                      ? {
                          borderTop:
                            k === 0
                              ? undefined
                              : '1px solid var(--color-border)',
                          paddingTop: k === 0 ? 0 : 16,
                          marginTop: k === 0 ? 0 : 16,
                        }
                      : {
                          gridTemplateColumns: '48px minmax(0, 1fr)',
                          columnGap: 20,
                        }),
                  }}>
                  {!isMobile && (
                    <div
                      style={{
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'center',
                      }}>
                      <span
                        style={{
                          position: 'relative',
                          zIndex: 1,
                          display: 'flex',
                          width: 48,
                          height: 48,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 'calc(var(--radius-container) * 0.6)',
                          background: 'var(--color-background-muted)',
                          fontFamily: 'var(--font-family-heading)',
                          fontSize: 16,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                        {String(mi + 1).padStart(2, '0')}
                      </span>
                      {!last && (
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            top: 48,
                            bottom: 0,
                            width: 1,
                            background: 'var(--color-border)',
                          }}
                        />
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      minWidth: 0,
                      ...(isMobile ? {} : {paddingBottom: last ? 0 : 16}),
                    }}>
                    <Collapsible value={m.id} trigger={head}>
                      <ul
                        style={{
                          margin: '4px 0 8px',
                          padding: 0,
                          listStyle: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                        }}>
                        {(q ? lessons : m.lessons).map(l => {
                          const id = lessonId(mi, m.lessons.indexOf(l));
                          const length = l.project
                            ? `${l.minutes / 60} hours`
                            : `${l.minutes} min`;
                          const title = l.quiz ? (
                            <Marked
                              text={`Quiz · ${l.questions} questions`}
                              query={q}
                            />
                          ) : (
                            <>
                              {l.project && 'Project · '}
                              <Marked text={l.title} query={q} />
                            </>
                          );
                          const chip = (
                            <span
                              style={{
                                display: 'flex',
                                height: 24,
                                width: 'fit-content',
                                flexShrink: 0,
                                alignItems: 'center',
                                gap: 4,
                                borderRadius: 'var(--radius-element)',
                                background: 'var(--color-accent-muted)',
                                paddingInline: 8,
                                fontSize: 12,
                                fontWeight: 500,
                                color: 'var(--color-text-accent)',
                              }}>
                              <PlaySolid
                                aria-hidden="true"
                                style={{width: 12, height: 12}}
                              />
                              Preview
                            </span>
                          );
                          const body = (
                            <>
                              <LessonTag lesson={l} />
                              <span
                                style={{
                                  display: 'flex',
                                  minWidth: 0,
                                  flex: '1 1 auto',
                                  gap: 8,
                                  fontSize: 14,
                                }}>
                                {!l.quiz && !l.project && (
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      fontVariantNumeric: 'tabular-nums',
                                      color: 'var(--color-text-secondary)',
                                    }}>
                                    {id}
                                  </span>
                                )}
                                <span style={{minWidth: 0}}>{title}</span>
                                {l.preview && isMobile && (
                                  <span
                                    style={{marginTop: 6, display: 'block'}}>
                                    {chip}
                                  </span>
                                )}
                              </span>
                              {l.preview && !isMobile && chip}
                              <span
                                style={{
                                  width: isMobile ? 56 : 64,
                                  flexShrink: 0,
                                  textAlign: 'end',
                                  fontSize: 14,
                                  fontVariantNumeric: 'tabular-nums',
                                  color: 'var(--color-text-secondary)',
                                }}>
                                {length}
                              </span>
                            </>
                          );
                          const row: CSSProperties = {
                            display: 'flex',
                            minHeight: 44,
                            width: '100%',
                            alignItems: 'center',
                            gap: 12,
                            borderRadius: 'calc(var(--radius-container) * 0.6)',
                            paddingBlock: 8,
                            paddingInlineStart: isMobile ? 8 : 12,
                            paddingInlineEnd: isMobile ? 4 : 8,
                            textAlign: 'start',
                          };
                          return (
                            <li
                              key={id}
                              style={{
                                borderBottom:
                                  '1px solid color-mix(in srgb, var(--color-border) 70%, transparent)',
                              }}>
                              {l.preview ? (
                                <button
                                  type="button"
                                  onClick={() => preview.open(id)}
                                  aria-label={`Preview lesson ${id}, ${l.title}, ${length}`}
                                  className="cr4-row"
                                  style={row}>
                                  {body}
                                </button>
                              ) : (
                                <div style={row}>{body}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </Collapsible>
                  </div>
                </li>
              );
            })}
          </ol>
        </CollapsibleGroup>
      )}
    </VStack>
  );
}

// ─── Covers: In the price / Not in it ────────────────────────────────────────
function Covers() {
  const cols = [
    {head: 'In the price', rows: COURSE.inPrice, on: true},
    {head: 'Not in it', rows: COURSE.notInPrice, on: false},
  ];
  return (
    <div className="cr7-cols2">
      {cols.map(col => (
        <div key={col.head}>
          <Caps>{col.head}</Caps>
          <ul
            style={{
              margin: '16px 0 0',
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
            {col.rows.map(line => (
              <li key={line} style={{display: 'flex', gap: 12, fontSize: 16}}>
                <span
                  style={{
                    display: 'flex',
                    height: 24,
                    flexShrink: 0,
                    alignItems: 'center',
                  }}>
                  {col.on ? (
                    <CheckIcon
                      aria-hidden="true"
                      style={{
                        width: 18,
                        height: 18,
                        color: 'var(--color-text-purple)',
                      }}
                    />
                  ) : (
                    <NoSymbolIcon
                      aria-hidden="true"
                      style={{
                        width: 18,
                        height: 18,
                        color: 'var(--color-text-secondary)',
                      }}
                    />
                  )}
                </span>
                <span
                  style={
                    col.on ? undefined : {color: 'var(--color-text-secondary)'}
                  }>
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Instructor ──────────────────────────────────────────────────────────────
// The teacher as the design sets them (course-page/instructor.tsx): a
// 16rem card with the face, the trade and the figures their courses add up
// to, and beside it three rows in the teacher's own words. Under both,
// Follow and the full profile as one row of buttons, then two of the
// teacher's other courses. The card and its rows are one tutor profile —
// the data of a person the product keeps — so the design marks the grid
// as an object and sets it at 14px; the figures are computed from the
// teacher's own catalogue, never typed in twice.
function Instructor() {
  const t = COURSE.instructor;
  const isMobile = useIsMobile();
  // Below 1280 this page's content column runs beside the rail — the
  // design's own lg state, where the card stands over the rows; from
  // 1280 (its xl) the column is wide enough for the two-column grid.
  const isNarrow = useIsMobile(1279);
  // The button row splits into two columns from 640 (the design's sm),
  // and the phone card runs the full width below it (its base).
  const isTiny = useIsMobile(639);
  const [following, setFollowing] = useState(false);
  // The teacher's spoken name — 'Maya' out of 'Dr. Maya Chen'. The
  // design's split(' ')[0] assumes no honorific; ours carries one.
  const first = t.name.replace(/^Dr\.\s+/, '').split(' ')[0];
  // Two of the teacher's other courses, the two the most learners have
  // taken — the design's own pick. The band carries only courses with
  // a photograph (the catalogue's current course never shows here).
  const others = t.courses
    .filter(
      (x): x is (typeof COURSE.instructor.courses)[number] & {image: string} =>
        x.id !== 'this' && x.image !== undefined,
    )
    .sort((a, b) => b.learners - a.learners)
    .slice(0, 2);

  const stats = [
    {figure: t.rating.toFixed(1), label: 'Rating', star: true},
    {figure: compact.format(t.learners), label: 'Learners'},
    {
      figure: String(t.courses.length),
      label: t.courses.length === 1 ? 'Course' : 'Courses',
    },
  ];

  const card = (
    <Card
      style={{
        width: isMobile && isTiny ? '100%' : 256,
        flexShrink: 0,
        padding: '28px 20px 20px',
        textAlign: 'center',
      }}>
      <VStack gap={3} align="center">
        {/* The face, with the verified badge on the portrait's edge as the
            home page's cards wear it: a disc the icon's own size, its
            centre on the circle at 45°. */}
        <span style={{position: 'relative', display: 'inline-block'}}>
          <img
            src={t.portrait}
            alt=""
            width={80}
            height={80}
            style={{
              width: 80,
              height: 80,
              borderRadius: 999,
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <span
            style={{
              position: 'absolute',
              insetInlineEnd: -2,
              bottom: -2,
              width: 24,
              height: 24,
              borderRadius: 999,
              background: 'var(--color-background-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon
              icon={CheckBadgeSolid}
              style={{width: 24, height: 24, color: 'var(--color-text-purple)'}}
            />
          </span>
        </span>
        <VStack gap={0.5} align="center" style={{marginTop: 12}}>
          <Text
            as="h3"
            type="body"
            style={{
              fontSize: 20,
              fontWeight: 525,
              letterSpacing: '-0.025em',
              fontFamily: 'var(--font-family-heading)',
              width: '100%',
            }}>
            {t.name}
            <VisuallyHidden>, verified instructor</VisuallyHidden>
          </Text>
          <Text type="body" color="secondary" style={{width: '100%'}}>
            {t.trade}
          </Text>
        </VStack>
        {/* Each figure set to its column's left edge, 12px off the rule
            before it, the learners' column a quarter wider for a
            six-character count; the star is held against the figure it
            belongs to. */}
        <HStack
          gap={0}
          vAlign="start"
          style={{
            width: '100%',
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--color-border)',
          }}>
          {stats.map((s, i) => (
            <StackItem
              key={s.label}
              size="fill"
              style={{
                flexGrow: i === 1 ? 1.25 : 1,
                paddingInlineStart: i === 0 ? 0 : 12,
                borderInlineStart:
                  i === 0 ? undefined : '1px solid var(--color-border)',
              }}>
              <VStack gap={0.5}>
                <HStack gap={0.5} vAlign="center">
                  <Text
                    type="body"
                    style={{
                      fontSize: 18,
                      fontWeight: 525,
                      fontFamily: 'var(--font-family-heading)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                    {s.figure}
                  </Text>
                  {s.star && (
                    <Icon
                      icon={StarIconSolid}
                      style={{width: 14, height: 14}}
                    />
                  )}
                </HStack>
                <Text type="body" color="secondary" style={{fontSize: 12}}>
                  {s.label}
                </Text>
              </VStack>
            </StackItem>
          ))}
        </HStack>
      </VStack>
    </Card>
  );

  // Three rows in the teacher's own words under bare outline glyphs — the
  // design sets them bare, no disc. The 28px row rhythm rides an
  // explicit px (no --spacing-7 step; the block-rhythm precedent).
  const credentials = (
    <VStack gap={6} style={{gap: 28}}>
      {[
        // the design's own three glyphs (instructor.tsx): WorkHistory,
        // StarAward01, Teaching — 28px rendered icons, set bare.
        {
          icon: WorkHistoryIcon,
          title: t.credentials.years,
          text: t.credentials.work,
        },
        {
          icon: StarAward01Icon,
          title: 'Career highlight',
          text: t.credentials.highlight,
        },
        {
          icon: TeachingIcon,
          title: `How ${first} teaches`,
          text: t.credentials.teaching,
        },
      ].map(r => (
        <HStack key={r.title} gap={4} vAlign="start">
          <HugeIcon
            icon={r.icon}
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
            style={{flexShrink: 0}}
          />
          <StackItem size="fill">
            <VStack gap={0.5}>
              <Text type="body" weight="medium" style={{width: '100%'}}>
                {r.title}
              </Text>
              <Text type="body" color="secondary" style={{width: '100%'}}>
                {r.text}
              </Text>
            </VStack>
          </StackItem>
        </HStack>
      ))}
    </VStack>
  );

  // Follow and the full profile as one row of buttons, drawn exactly as the
  // design draws them (the profile row + follow button): two
  // 40px controls of muted fill that darken a rung under the pointer; Follow
  // answering in the brand fill, its plus turning to a tick. Both labels
  // stand in one grid cell and the one not in use is hidden, so the button
  // keeps the longer one's width and nothing beside it moves when the label
  // changes. Under 360px the name is heard and not drawn.
  const buttonsRow = (
    <Grid columns={isTiny ? 1 : 2} gap={3} style={{marginTop: 32}}>
      <button
        type="button"
        className="cr12-actbtn cr12-follow"
        data-on={following || undefined}
        aria-pressed={following}
        // the name said aloud, held explicit because both labels stand in
        // one grid cell (the design hides the unused one with
        // visibility:hidden, which a real browser's name computation
        // excludes but a text-content one reads through) — the announcement
        // is the design's own either way
        aria-label={following ? `Following ${first}` : `Follow ${first}`}
        onClick={() => setFollowing(f => !f)}>
        <span
          className="cr12-labelcell"
          style={following ? {visibility: 'hidden'} : undefined}
          aria-hidden={following || undefined}>
          <PlusIcon aria-hidden="true" style={{width: 16, height: 16}} />
          <span>
            Follow
            <span className="cr12-un360"> {first}</span>
          </span>
        </span>
        <span
          className="cr12-labelcell"
          style={!following ? {visibility: 'hidden'} : undefined}
          aria-hidden={!following || undefined}>
          <CheckIcon aria-hidden="true" style={{width: 16, height: 16}} />
          <span>
            Following
            <span className="cr12-un360"> {first}</span>
          </span>
        </span>
      </button>
      {/* Full profile: the design's row — the muted fill, the arrow at
          the label's end, 8px between them */}
      <button
        type="button"
        className="cr12-actbtn"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
        onClick={() => {}}>
        Full profile
        <Icon icon={ArrowRightIcon} size="sm" xstyle={rtlStyles.mirror} />
      </button>
    </Grid>
  );

  const othersBlock =
    others.length > 0 ? (
      <VStack gap={4} style={{marginTop: 48}}>
        <Caps>Also taught by {first}</Caps>
        {/* Side by side only from 1280, where a row has room for the
            photograph and the title beside it; narrower, one over the
            other, so a phone is the only other width that cuts a title. */}
        <Grid columns={isNarrow ? 1 : 2} gap={4}>
          {others.map(x => (
            <OtherCourse key={x.id} course={x} />
          ))}
        </Grid>
      </VStack>
    ) : null;

  return (
    <VStack gap={0}>
      {isNarrow ? (
        <VStack gap={8} align="start">
          {card}
          {credentials}
        </VStack>
      ) : (
        <HStack gap={10} vAlign="center">
          {card}
          <StackItem size="fill">{credentials}</StackItem>
        </HStack>
      )}
      {buttonsRow}
      {othersBlock}
    </VStack>
  );
}

// ─── Also taught by ──────────────────────────────────────────────────────────
/** The level as the course cards draw it: three dots, one lit per rung. */
function LevelDots({level}: {level: string}) {
  const rank =
    ({Beginner: 1, Intermediate: 2, Advanced: 3} as Record<string, number>)[
      level
    ] ?? 1;
  return (
    <HStack gap={0.5} vAlign="center" aria-hidden="true">
      {[1, 2, 3].map(step => (
        <span
          key={step}
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            ...(step <= rank
              ? {background: 'var(--color-accent)'}
              : {boxShadow: 'inset 0 0 0 1px var(--color-accent)'}),
          }}
        />
      ))}
    </HStack>
  );
}

/** One of the teacher's other courses, as the design's wide card with
 *  its frame taken off (course-page/other-course.tsx): the photograph at
 *  the left, on the page's own ground, and beside it the title, the level
 *  and length under it, and the rating and the price along the foot, one
 *  after the other. The photograph leans in while it is pointed at, as a
 *  course card's does everywhere else on the site. */
function OtherCourse({
  course: x,
}: {
  course: (typeof COURSE.instructor.courses)[number] & {image: string};
}) {
  return (
    <ClickableCard
      label={`Open the course ${x.title}`}
      variant="transparent"
      padding={0}
      className="cr6-row"
      style={{minWidth: 0}}
      onClick={() => {}}>
      <HStack gap={4} vAlign="stretch" style={{width: '100%', minWidth: 0}}>
        <span
          style={{
            width: 96,
            height: 96,
            borderRadius: 'calc(var(--radius-container) - 6px)',
            overflow: 'hidden',
            background: 'var(--color-background-muted)',
            flexShrink: 0,
            display: 'block',
          }}>
          <img
            src={x.image}
            alt=""
            width={96}
            height={96}
            className="cr6-photo"
            style={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </span>
        {/* 1px top and bottom, so the title and the foot sit on the
            photograph's own edges. The design's own column carries
            min-w-0 (other-course.tsx) — without it the nowrap title's
            min-content overflows a phone's column, and the row ran 5px
            past the viewport. */}
        <StackItem size="fill" style={{minWidth: 0}}>
          <VStack
            gap={1}
            style={{
              height: '100%',
              minWidth: 0,
              paddingTop: 1,
              paddingBottom: 1,
            }}>
            <Text
              type="body"
              weight="medium"
              style={{
                width: '100%',
                minWidth: 0,
                fontSize: 16,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
              {x.title}
            </Text>
            <HStack gap={1.5} vAlign="center" style={{minWidth: 0}}>
              <LevelDots level={x.level} />
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 14,
                  color: 'var(--color-text-secondary)',
                }}>
                {x.level} · {x.weeks} weeks
              </span>
            </HStack>
            {/* The rating and the price in a row, a slash between them, set
                on one baseline: the star rides the figure's centre, and the
                figure carries the rating's baseline out to the row. The
                star is ink, as the teacher's card draws theirs. */}
            <HStack gap={2} vAlign="center" style={{marginTop: 'auto'}}>
              <HStack gap={0.5} vAlign="center">
                <Icon icon={StarIconSolid} style={{width: 14, height: 14}} />
                <Text type="body" style={{fontVariantNumeric: 'tabular-nums'}}>
                  {x.rating.toFixed(1)}
                </Text>
              </HStack>
              <Text type="body" color="secondary">
                /
              </Text>
              <Text
                type="body"
                style={{
                  fontSize: 18,
                  fontWeight: 525,
                  fontFamily: 'var(--font-family-heading)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                {priceLabel(x.price)}
              </Text>
            </HStack>
          </VStack>
        </StackItem>
      </HStack>
    </ClickableCard>
  );
}

// ─── Reviews ────────────────────────────────────────────────────────────────
//     + the phone's reach-bar) ────────────────────────────────────────────────
function EnrollPanel() {
  const isMobile = useIsMobile();
  // The panel is held to the screen's height less the header only from lg,
  // where it rides beside the syllabus (the design's own gate).
  const tall = !useIsMobile(1023);
  const {today, starts, picked, setPicked, pace, setPace, setAway} =
    useEnrollment();
  const maxPace = Math.max(12, COURSE.hours * 2);
  const start = starts.find(s => s.key === picked) ?? starts[0];
  const finish = finishAt(today, pace);
  const paid = COURSE.price > 0;

  // The design's reach-bar: once the CTA has scrolled away above the
  // screen, the bar keeps the price and the button in reach. The bar
  // itself mounts once at the page's end (its own component, below the
  // provider), so the panel only reports the CTA's reach. The root runs
  // far below the screen, so the button counts as in view down the page and
  // only leaving past the top turns the bar on.
  const ctaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const io = new IntersectionObserver(
      entries => setAway(!entries[0].isIntersecting),
      {
        rootMargin: '0px 0px 10000px 0px',
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [setAway]);

  const self = starts.find(s => s.kind === 'self');
  const cohortRows = starts.filter(s => s.kind === 'cohort');
  const ctaLabel = paid ? `Enroll for ${fmt(COURSE.price)}` : 'Enroll for free';

  return (
    // Beside the syllabus the panel is held to the screen's height, less
    // the header above it and a margin below, so on a short laptop its
    // foot is never under the screen's edge: the price and the buttons
    // stay whole, and the ways to start scroll inside it instead.
    <Card
      variant="transparent"
      padding={isMobile ? 5 : 6}
      style={{
        width: '100%',
        background: 'var(--color-background-card)',
        boxShadow: 'var(--shadow-low)',
        borderRadius: 'var(--radius-container)',
        display: 'flex',
        flexDirection: 'column',
        ...(tall
          ? {maxHeight: 'calc(100dvh - 112px)', overflow: 'hidden'}
          : null),
      }}>
      <VStack gap={0} style={{flexShrink: 0}}>
        <p
          style={{
            margin: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: 12,
            rowGap: 4,
          }}>
          <span
            style={{
              fontFamily: 'var(--font-family-heading)',
              fontSize: 36,
              fontWeight: 525,
              letterSpacing: '-0.05em',
              fontVariantNumeric: 'tabular-nums',
            }}>
            {priceLabel(COURSE.price)}
          </span>
          <span style={{fontSize: 14, color: 'var(--color-text-secondary)'}}>
            {paid ? 'once, yours to keep' : 'tutor included'}
          </span>
        </p>
        {paid && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 14,
              color: 'var(--color-text-secondary)',
            }}>
            Or in <span style={{color: 'inherit'}}>{COURSE.tier.name}</span> for
            ${COURSE.tier.monthly} a month
          </p>
        )}

        <div ref={ctaRef} style={{marginTop: 20, width: '100%'}}>
          <button type="button" className="cr7-cta">
            {ctaLabel}
            <Icon icon={ArrowRightIcon} size="sm" xstyle={rtlStyles.mirror} />
          </button>
        </div>
        <button
          type="button"
          className="cr7-ringbtn"
          style={{marginTop: 10, width: '100%'}}>
          <PlaySolid aria-hidden="true" style={{width: 14, height: 14}} />
          {paid ? 'Start lesson one free' : 'Start lesson one'}
        </button>
        <p
          style={{
            margin: '12px 0 0',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          {paid ? 'Your money back within 30 days' : 'No card, now or later'}
        </p>
      </VStack>

      <div
        style={{
          marginTop: 20,
          borderTop: '1px solid var(--color-border)',
          paddingTop: 20,
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          overflowY: 'auto',
        }}>
        <RadioList label="When to start" value={picked} onChange={setPicked}>
          {self && (
            <RadioListItem
              value="self"
              label="Today, at your own pace"
              description={`Finish around ${dayLabel(finish.key)}`}
            />
          )}
          {cohortRows.map(s => (
            <RadioListItem
              key={s.key}
              value={s.key}
              label={`${dayLabel(s.starts)} – ${dateLabel(s.ends)}`}
              description={
                s.seats === 0
                  ? 'Full'
                  : `${s.seats} seats left · live Thursdays`
              }
              isDisabled={s.seats === 0}
            />
          ))}
        </RadioList>
        {/* The pace belongs to the self-paced choice, so it opens under
              the list and moves that choice's finish date as it is dragged. */}
        {start.kind === 'self' && (
          <VStack gap={2} style={{padding: '16px 20px 4px'}}>
            <Slider
              label="Hours you have a week"
              value={pace}
              onChange={(v: number) => setPace(v)}
              min={1}
              max={maxPace}
              marks={[{value: 1}, {value: maxPace}]}
              formatValue={(value: number) => `${value} h/week`}
            />
          </VStack>
        )}
        <Text type="supporting" color="secondary" style={{marginTop: 8}}>
          Cohorts run live on Thursdays.
        </Text>
      </div>
    </Card>
  );
}

// ─── The phone's reach bar (one mount, after the footer) ─────────────
/** What the reader picked and where the panel's button went: the
 *  provider sits above whichever composition renders the panel, and the
 *  bar mounts once as the page's last child — after the footer — where
 *  tree order paints it above the page without a number (AST-027 FR2:
 *  the surface owns its order, never a page-wide rank). */
type Enrollment = {
  today: string;
  starts: Start[];
  picked: string;
  setPicked: (value: string) => void;
  pace: number;
  setPace: (value: number) => void;
  away: boolean;
  setAway: (value: boolean) => void;
};
const EnrollmentContext = createContext<Enrollment | null>(null);

function EnrollmentProvider({children}: {children: ReactNode}) {
  const today = localToday();
  const starts = startsFor(today);
  const [picked, setPicked] = useState<string>('self');
  const [pace, setPace] = useState(COURSE.hours);
  const [away, setAway] = useState(false);
  return (
    <EnrollmentContext.Provider
      value={{
        today,
        starts,
        picked,
        setPicked,
        pace,
        setPace,
        away,
        setAway,
      }}>
      {children}
    </EnrollmentContext.Provider>
  );
}

function useEnrollment(): Enrollment {
  const enrollment = useContext(EnrollmentContext);
  if (!enrollment) {
    throw new Error('EnrollmentContext is missing its provider');
  }
  return enrollment;
}

/** The phone's reach bar as the design draws it: the price and the same
 *  action, once the panel's own button has scrolled off the screen.
 *  Solid rather than frosted — the header already spends the page's blur.
 *  The bar hides from lg (the design's lg:hidden), reads the reader's
 *  pick for its date line, and slides on over 300ms ease-out, visibility
 *  held with it so nothing of it draws below the edge. */
function ReachBar() {
  const {starts, picked, away} = useEnrollment();
  const start = starts.find(s => s.key === picked) ?? starts[0];
  const paid = COURSE.price > 0;
  return (
    <div
      className="cr13-reachbar"
      data-away={away || undefined}
      aria-hidden={!away}
      inert={!away}>
      <HStack
        gap={3}
        vAlign="center"
        justify="between"
        style={{width: '100%', maxWidth: 576, marginInline: 'auto'}}>
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Text
              type="body"
              weight="semibold"
              style={{
                fontFamily: 'var(--font-family-heading)',
                fontSize: 24,
                letterSpacing: '-0.025em',
                fontVariantNumeric: 'tabular-nums',
              }}>
              {priceLabel(COURSE.price)}
            </Text>
            <Text type="supporting" color="secondary">
              {start.kind === 'self'
                ? 'Start today, at your pace'
                : `Cohort from ${dateLabel(start.starts)}`}
            </Text>
          </VStack>
        </StackItem>
        <button type="button" className="cr13-reachcta">
          {paid ? 'Enroll' : 'Enroll free'}
        </button>
      </HStack>
    </div>
  );
}

// ─── Closing CTA band (the design's closing band) ─────────────────────

export default function CourseDetailTemplate() {
  return (
    <PreviewProvider>
      <Layout
        height="fill"
        contentWidth={1200}
        content={
          <LayoutContent padding={6}>
            <style>{hoverStyles}</style>
            <EnrollmentProvider>
              <Grid columns={{minWidth: 320, repeat: 'fit'}} gap={6}>
                <VStack gap={4}>
                  <HeadBlock />
                  <Poster />
                  <DetailsBlock />
                  <AboutSection />
                  <SectionHeader title="Syllabus" />
                  <Syllabus />
                  <SectionHeader title="What the price covers" />
                  <Covers />
                  <SectionHeader title="Your instructor" />
                  <Instructor />
                  <ReviewsSection />
                  <FaqSection />
                </VStack>
                <VStack gap={4} style={stickyRail}>
                  <EnrollPanel />
                </VStack>
              </Grid>
              <ReachBar />
            </EnrollmentProvider>
          </LayoutContent>
        }
      />
    </PreviewProvider>
  );
}
