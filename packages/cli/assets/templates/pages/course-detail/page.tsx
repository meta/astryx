// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// Course Detail — an online-course sales page, authored to the official
// Astryx template contract (meta/astryx packages/cli/assets/templates:
// self-contained pair with a same-stem template.doc.mjs; components do all
// layout; tokens for every value the token set carries).
//
// ROUND 7 — the exact-replica pass, translated line by line from the
// Waypoint reference's own source (course-overview.tsx, enrol-panel.tsx,
// syllabus.tsx, reviews.tsx, faq-step-rows.tsx, share-button.tsx,
// course-card.tsx, start.ts, detail.ts). What changed, each answering a
// reviewer note carried over from the template’s own review rounds:
//
//   - THE ICONS, ON THE GALLERY'S SET: the fact rows, the syllabus's six
//     figures, the lesson kinds and the six review scores keep the
//     reference's glyph story, but every stroke draws from @heroicons/react —
//     the source glyphs the template package can resolve — under the
//     original local names (aliased), each mapped in template.doc.mjs
//     `icons`. Nothing is substituted structurally.
//   - THE PRICE CARD RIDES DOWN THE PAGE: only the EnrolPanel is sticky
//     (lg:top-20, as the reference holds it), inside a rail column that
//     stretches to the long read's height; the title and the fact rows
//     above it scroll away. The panel is held to the screen's height less
//     the header (max-h calc(100dvh - 7rem)) with the start rows scrolling
//     inside it, exactly as the reference's does on a short laptop.
//   - THE PANEL ITSELF is the reference's: the price in the heading face
//     with "once, yours to keep", the Or-in-Plus line, the 44px Enroll CTA
//     with the arrow, the 40px Start-lesson-one-free with the play glyph,
//     the money-back note, then the Start section — self-paced row with
//     the hours slider under it, and the cohort rows with their dates and
//     seats (a full cohort sunk into the panel, seats in coral at ten or
//     fewer). No compare-at, no sale badge, no includes list: the
//     reference's panel carries none of them.
//   - THE SYLLABUS TOOLBAR: "Find a lesson" and "Open every module" (one
//     toggle, as the reference draws it) on ONE line over a rule, the
//     field the reference's search row is (magnifier, card ground, hairline
//     ring, clear button) — not a form TextInput stacked above two ghost
//     buttons. The tally line beneath it counts lessons and modules the
//     reference's way.
//   - THE REVIEWS, REBUILT as reviews.tsx draws them: the rating is the
//     block's heading (star, figure, count); "How reviews work" opens in
//     place; the spread and the six scored aspects sit in one ruled row,
//     each aspect with its glyph drawn large at the foot of its cell;
//     search + rating filter + sort over the list; the reviews two abreast
//     with rules between, five partial stars and the Finished check on the
//     meta line, four-line clamp with Show more, and "Show N more reviews"
//     under the sample.
//   - THE FAQ, REBUILT as faq-step-rows.tsx draws it: the eyebrow chip and
//     the 48px section heading with the foot line at its side, then rows a
//     whole container wide — group label in caps, the question in the
//     heading face at 20/24/30px, the arrow disc that turns down; the open
//     row a slab of the brand's tint, its answer indented under the
//     question. (The old list was 14px questions under 24px — the
//     "squeezed" note.)
//   - THE HEAD carries Save (heart, compact count) and Share (the
//     reference's popover menu); the related rail is the reference's: the
//     48px heading with the marker swoosh, the two paging arrows, and the
//     photo course cards with topic chip, level dots, teacher chip, rating
//     row and price foot.
//
// Rounds 4–6's kept surfaces: the shared preview player, the poster, and
// the round-6 instructor card + also-taught-by band are carried forward
// unchanged (approved in review).
//
// Hover/press surfaces ride a scoped stylesheet (cr4-/cr6-/cr7- classes)
// because the component set has no hover-row primitive (documented gap
// #2614, tokens only). Geometry uses env(safe-area-inset-bottom) for the
// reach-bar, a hardware-geometry value, not a palette choice.
//
// Geometry and token exceptions carried from round 3:
//   #2582  no Image primitive — the instructor's portrait, the
//          also-taught-by thumbnails and the related rail's photographs are
//          raw <img> elements (hotlinked sample assets, never shipped);
//   #2613  no sticky prop — the panel's sticky slot style;
//   +      no spacing token above --spacing-12 (48px): the 56–64px block
//          rhythm and the 128px section rhythm ride explicit px;
//   +      no display-size token matches the rail's 40px headline or the
//          48px section heading — sized in style.
'use client';

import React, {
  createContext,
  useCallback,
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
import {
  ArrowRightIcon,
  BanknotesIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  ChartBarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CommandLineIcon,
  HandThumbUpIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PaintBrushIcon,
  PlayCircleIcon,
  PlusIcon,
  StarIcon as StarLine,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  CheckBadgeIcon as CheckBadgeSolid,
  HeartIcon as HeartSolid,
  PauseIcon,
  PlayIcon as PlaySolid,
  StarIcon as StarIconSolid,
} from '@heroicons/react/24/solid';
// The template package's dependency graph carries @heroicons/react (the
// gallery's icon source), not the reference's hugeicons set — so every glyph
// draws from heroicons under the same local name, aliased here, and each
// rendered icon is mapped in template.doc.mjs `icons`.
import {
  SparklesIcon as AiMagicIcon,
  CalendarIcon as Calendar03Icon,
  CheckBadgeIcon as Certificate01Icon,
  ClipboardDocumentCheckIcon as CheckListIcon,
  ChatBubbleBottomCenterTextIcon as ClosedCaptionIcon,
  ChatBubbleOvalLeftIcon as Comment01Icon,
  FireIcon as Dumbbell01Icon,
  ArrowTrendingUpIcon as GaugeIcon,
  EyeIcon as GlassesIcon,
  GlobeAltIcon as Globe02Icon,
  Square3Stack3DIcon as Layers01Icon,
  LinkIcon as Link01Icon,
  EnvelopeIcon as Mail01Icon,
  CubeIcon as Package01Icon,
  QueueListIcon as PlayListIcon,
  ShareIcon as Share03Icon,
  LockOpenIcon as SquareUnlock02Icon,
  TrophyIcon as StarAward01Icon,
  TagIcon as Tag01Icon,
  UserGroupIcon as TeachingIcon,
  BriefcaseIcon as WorkHistoryIcon,
} from '@heroicons/react/24/outline';
// ClockIcon is bound above; alias the same glyph for the reference's
// Clock01Icon without rebinding the existing name.
import {ClockIcon as Clock01Icon} from '@heroicons/react/24/outline';

/**
 * Icon data shape the template stores in its tables: an SVG component with
 * the sizing/stroke props the reference's icon data carried.
 */
type IconSvgElement = React.ComponentType<{
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}>;

/**
 * Render one stored icon. Same interface the reference's HugeiconsIcon
 * wrapper exposed (icon, size, strokeWidth); the glyph itself is now a
 * heroicons component rendered directly.
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
  'aria-hidden'?: boolean;
}) {
  return (
    <Glyph
      aria-hidden={hidden}
      style={{width: size, height: size, ...style}}
      strokeWidth={strokeWidth}
    />
  );
}

// ─── Reference geometry (documented token gap; see the header note) ─────────
// The rail the reference sets at lg (22rem) and xl (26rem); the gap between
// the columns steps with it (gap-x-12 → gap-x-16).
const RAIL_LG = 352;
const RAIL_XL = 416;
const stickyTop = 80; // lg:top-20
// The reference's block rhythm: mt-14/pt-14 below lg, mt-16/pt-16 from it.
const RHYTHM_LG = 56;
const RHYTHM_XL = 64;
const headlineStyle: CSSProperties = {
  fontSize: 40,
  fontWeight: 525,
  letterSpacing: '-0.05em',
  lineHeight: 1.15,
  width: '100%',
  textAlign: 'center',
};
const h2Style: CSSProperties = {
  fontSize: 24,
  fontWeight: 525,
  letterSpacing: '-0.025em',
};
/** The reference's SectionHeading, at its three steps: 30px, 36 from sm,
 *  48 from lg, tightened for its face, max-w-xl widening to max-w-3xl at lg
 *  (components/ui/section-heading.tsx). */
const sectionHeadingStyle = (sm: boolean, lg: boolean): CSSProperties => ({
  fontSize: lg ? 48 : sm ? 36 : 30,
  fontWeight: 525,
  letterSpacing: '-0.05em',
  lineHeight: 1.08,
  fontFamily: 'var(--font-family-heading)',
  maxWidth: lg ? 768 : 576,
  width: '100%',
});

// ─── Poster / cover art (#2582: no Image primitive; the reference's ink, ────
//     tint, and paper treatment) ─────────────────────────────────────────────
const inkArt: CSSProperties = {
  width: '100%',
  height: '100%',
  borderRadius: 'var(--radius-container)',
  background: 'linear-gradient(160deg, #1c1917 0%, #292524 55%, #3f3d3a 100%)',
  color: '#fafaf9',
};

/** Hover/press surfaces that the component set has no primitive for
 *  (documented gap #2614), plus round 7's reference-drawn controls: the
 *  search field and its clear button, the ring button, the select trigger
 *  and its menu rows, the ruled review grid, the FAQ slab and its rows, and
 *  the disclosures' easing. Token-carried colors and durations only. */
const hoverStyles = `
.cr4-row{display:flex;flex-direction:row;align-items:center;gap:var(--spacing-3);padding:var(--spacing-2) var(--spacing-3);border-radius:var(--radius-element);text-align:left;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard);}
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
/* ── Round 7 ───────────────────────────────────────────────────────────────
   The reference's search row: card ground, hairline ring that darkens under
   the pointer and doubles to the brand while it holds the caret. 40px tall,
   the page's control floor. */
.cr7-field{display:flex;align-items:center;gap:10px;height:40px;flex:1 1 auto;min-width:0;border-radius:var(--radius-element);background:var(--color-background-card);box-shadow:inset 0 0 0 1px var(--color-border);padding-left:14px;padding-right:4px;transition:box-shadow var(--duration-fast) var(--ease-standard);cursor:text;}
.cr7-field:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--color-text-primary) 20%,transparent);}
.cr7-field:focus-within{box-shadow:inset 0 0 0 2px var(--color-accent);}
.cr7-field input{flex:1 1 auto;min-width:0;height:100%;background:transparent;border:none;outline:none;font:inherit;font-size:16px;color:var(--color-text-primary);}
@media(min-width:640px){.cr7-field input{font-size:14px}}
.cr7-clear{display:flex;width:32px;height:32px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:999px;color:var(--color-text-secondary);transition:background-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard);cursor:pointer;background:transparent;border:none;}
.cr7-clear:hover{background:var(--color-background-wash);color:var(--color-text-primary);}
/* The reference's ghost control: a hairline ring, the page's ground showing
   through, the wash on hover. "Open every module", "Show more reviews",
   the panel's secondary CTA and the select triggers all wear it. */
.cr7-ringbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding-inline:16px;border-radius:var(--radius-element);background:transparent;box-shadow:inset 0 0 0 1px var(--color-border);font-size:14px;font-weight:500;color:var(--color-text-primary);transition:background-color var(--duration-fast) var(--ease-standard),box-shadow var(--duration-fast) var(--ease-standard);cursor:pointer;border:none;white-space:nowrap;}
.cr7-ringbtn:hover{background:var(--color-background-wash);}
.cr7-ringbtn:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
.cr7-ringbtn:disabled{cursor:not-allowed;color:var(--color-text-disabled);}
.cr7-ringbtn:disabled:hover{background:transparent;}
/* The select trigger: the search field's shape at a fixed width, holding a
   glyph and a chevron. */
.cr7-select{display:inline-flex;align-items:center;gap:8px;height:40px;padding-inline:12px 10px;border-radius:var(--radius-element);background:var(--color-background-card);box-shadow:inset 0 0 0 1px var(--color-border);font-size:14px;color:var(--color-text-primary);transition:box-shadow var(--duration-fast) var(--ease-standard),background-color var(--duration-fast) var(--ease-standard);cursor:pointer;border:none;white-space:nowrap;}
.cr7-select:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--color-text-primary) 20%,transparent);}
.cr7-select:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
.cr7-menurow{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding-inline:10px;border-radius:calc(var(--radius-container)*0.6);font-size:14px;color:var(--color-text-primary);text-align:left;cursor:pointer;background:transparent;border:none;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr7-menurow:hover{background:var(--color-background-wash);}
.cr7-menurow:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:-2px;}
/* The FAQ's open slab: three fifths of the chip's strength, mixed into the
   card (the reference's --color-tint). */
.cr7-tintslab{background:light-dark(color-mix(in oklab,var(--color-accent) 18%,var(--color-background-card)),color-mix(in oklab,var(--color-accent) 7%,var(--color-background-card)));}
/* The reviews, two abreast with rules between: in one column a rule under
   every review but the last; in two, a rule down the middle and one under
   every row but the last. */
.cr7-reviews{display:grid;grid-template-columns:minmax(0,1fr);margin-top:40px;margin-bottom:0;padding:0;list-style:none;}
@media(min-width:768px){.cr7-reviews{grid-template-columns:repeat(2,minmax(0,1fr));}}
.cr7-rv{min-width:0;list-style:none;}
.cr7-rv-b{border-bottom:1px solid var(--color-border);padding-bottom:32px;}
.cr7-rv-t{padding-top:32px;}
/* (Round 12: the side paddings held the reference's md: prefix — below
   md the list is one column and a review runs the full measure, not a
   column 40px short of its heading.) */
@media(min-width:768px){
  .cr7-rv-l{padding-right:40px;}
  .cr7-rv-r{padding-left:40px;}
}
@media(min-width:1280px){.cr7-rv-l{padding-right:48px}.cr7-rv-r{padding-left:48px}}
@media(min-width:768px){
  .cr7-rv-b{border-bottom:0;padding-bottom:0;}
  .cr7-rv-t{padding-top:0;}
  .cr7-rv-rowb{border-bottom:1px solid var(--color-border);padding-bottom:40px;}
  .cr7-rv-rowt{padding-top:40px;}
  .cr7-rv-mid{border-right:1px solid var(--color-border);}
}
/* The review row's spread + six ruled score cells (reviews.tsx: lg:flex,
   spread lg:w-72/xl:w-80, the cells lg:flex-1 lg:border-l). */
.cr7-scorerow{display:flex;flex-direction:column;}
@media(min-width:1024px){.cr7-scorerow{flex-direction:row;}}
.cr7-spread{max-width:384px;flex:0 1 auto;}
@media(min-width:1024px){.cr7-spread{width:288px;max-width:none;flex:0 0 auto;padding-right:40px;}}
@media(min-width:1280px){.cr7-spread{width:320px;}}
/* The six score cells, on the reference's own ladder (reviews.tsx): a
   sideways-scrolling strip on a phone (edge-to-edge over the container's
   padding, a hairline between cells, first cell flush), a six-column grid
   from sm, and only from lg the row beside the spread with its own left
   rule — below lg the strip/grid sits UNDER the spread with mt-8. */
.cr7-scores{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));margin-top:32px;}
.cr7-score{display:flex;flex-direction:column;min-width:0;border-left:1px solid var(--color-border);padding-left:16px;padding-right:8px;}
.cr7-score:first-child{border-left:none;padding-left:0;}
@media(min-width:1024px){
  .cr7-scores{flex:1 1 0%;margin-top:0;border-left:1px solid var(--color-border);}
  .cr7-score{padding-left:24px;}
  .cr7-score:first-child{padding-left:24px;}
}
@media(max-width:639px){
  .cr7-scores{display:flex;overflow-x:auto;margin-inline:-24px;padding-inline:24px;scrollbar-width:none;}
  .cr7-scores::-webkit-scrollbar{display:none;}
  .cr7-score{flex:0 0 auto;width:112px;}
}
/* A held review: four lines, then "Show more". */
.cr7-clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;}
/* The panel's primary CTA: the brand fill, the ink on it, the fill at 80%
   under the pointer (the reference's hover:bg-primary/80). */
.cr7-cta{display:flex;height:44px;width:100%;align-items:center;justify-content:center;gap:8px;border-radius:var(--radius-element);background:var(--color-accent);padding-inline:24px;font-size:14px;font-weight:500;color:var(--color-on-accent);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr7-cta:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr7-cta:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* The FAQ's caps column: the whole row's width on a phone, its own 160px
   column from sm. */
.cr7-faqcaps{grid-column:1 / -1;min-width:0;}
@media(min-width:640px){.cr7-faqcaps{grid-column:1;}}
/* The syllabus' six figures: two to a row on a phone, three from sm. */
.cr7-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;}
@media(min-width:640px){.cr7-facts{grid-template-columns:repeat(3,minmax(0,1fr));}}
.cr7-fact{display:flex;flex-direction:column;min-width:0;padding-right:16px;}
/* The syllabus toolbar and the reviews' one: the field and the controls on
   one line from sm, stacked under it on a phone. */
.cr7-toolbar{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--color-border);padding-top:32px;margin-top:32px;}
@media(min-width:640px){.cr7-toolbar{flex-direction:row;align-items:center;}}
@media(min-width:1024px){.cr7-field{max-width:384px;}}
/* What the price covers: two columns where a line fits its column — from sm
   while the page is one column, and from xl; between, the panel beside
   takes the room. */
.cr7-cols2{display:grid;grid-template-columns:minmax(0,1fr);gap:40px;}
@media(min-width:640px){.cr7-cols2{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;}}
@media(min-width:1024px) and (max-width:1279px){.cr7-cols2{grid-template-columns:minmax(0,1fr);gap:40px;}}
/* The FAQ's rows: the group label's column holds the longest label on one
   line; the open answer indents by it plus the gap. The reference's margins
   and rules step over the same 300ms ease-out as the disclosure. */
.cr7-faqrow{position:relative;border-radius:var(--radius-container);transition:margin-block 300ms cubic-bezier(0,0,0.2,1),background-color 300ms cubic-bezier(0,0,0.2,1);}
.cr7-faqrow::before{content:'';position:absolute;inset-inline:0;top:0;height:1px;background:var(--color-border);transition:opacity 150ms cubic-bezier(0.4,0,0.2,1);opacity:1;}
.cr7-faqrow[data-open='true']{margin-block:12px;}
.cr7-faqrow[data-open='true']::before,.cr7-faqrow[data-after-open='true']::before{opacity:0;}
.cr7-faqrow[data-last='true']::after{content:'';position:absolute;inset-inline:0;bottom:0;height:1px;background:var(--color-border);transition:opacity 150ms cubic-bezier(0.4,0,0.2,1);opacity:1;}
.cr7-faqrow[data-last='true'][data-open='true']::after{opacity:0;}
.cr7-faqbtn{display:grid;width:100%;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:24px;row-gap:8px;align-items:center;padding:20px 16px;border-radius:var(--radius-container);text-align:left;background:transparent;border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr7-faqbtn:hover{background:var(--color-background-wash);}
.cr7-faqbtn:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:-2px;}
@media(min-width:640px){.cr7-faqbtn{grid-template-columns:160px minmax(0,1fr) auto;grid-template-rows:auto;padding-block:24px;padding-inline:24px;}}
.cr7-faqq{font-family:var(--font-family-heading);font-weight:525;letter-spacing:-0.05em;line-height:1.15;font-size:20px;color:var(--color-text-primary);}
@media(min-width:640px){.cr7-faqq{font-size:24px;}}
@media(min-width:1024px){.cr7-faqq{font-size:30px;}}
.cr7-faqa{max-width:560px;padding:0 16px 32px 16px;font-size:16px;color:var(--color-text-primary);}
@media(min-width:640px){.cr7-faqa{padding:0 24px 40px;margin-left:calc(160px + 24px);}}
/* The FAQ section head: the eyebrow and heading over the foot line, beside
   it from lg. */
.cr7-faqhead{display:flex;flex-direction:column;gap:24px;}
@media(min-width:1024px){.cr7-faqhead{flex-direction:row;align-items:flex-end;justify-content:space-between;gap:64px;}}
/* The reference's arrow disc: an arrow pointing on, that turns down to the
   answer as the row opens. */
.cr7-faqdisc{display:flex;width:36px;height:36px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:999px;transition:background-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard);color:var(--color-text-primary);box-shadow:inset 0 0 0 1px var(--color-border);}
.cr7-faqbtn:hover .cr7-faqdisc{background:var(--color-background-card);}
.cr7-faqrow[data-open='true'] .cr7-faqdisc{background:var(--color-text-primary);color:var(--color-background-card);box-shadow:none;}
.cr7-faqarrow{transition:transform 300ms cubic-bezier(0,0,0.2,1);}
.cr7-faqrow[data-open='true'] .cr7-faqarrow{transform:rotate(90deg);}
/* Disclosed bodies — FAQ answers and syllabus module lists — eased open to
   their own height, exactly as the reference draws them: a grid whose rows
   step 0fr → 1fr over 300ms ease-out (Tailwind's ease-out curve), the clip
   overflowing hidden inside. The rows beneath slide rather than jump; the
   body is inert while shut so a screen reader does not read what nobody
   opened. */
.cr7-disclosure{display:grid;grid-template-rows:0fr;transition:grid-template-rows 300ms cubic-bezier(0,0,0.2,1);}
.cr7-disclosure[data-open='true']{grid-template-rows:1fr;}
.cr7-clip{overflow:hidden;min-width:0;}
@media(prefers-reduced-motion:reduce){.cr7-disclosure{transition:none;}}
/* The reference's module chevron turns over the same 300ms ease-out the
   disclosure runs on. */
.cr4-chev{transition:transform 300ms cubic-bezier(0,0,0.2,1);}
/* The panel's start list: held to the panel's height, its own scroll under
   the fixed price and buttons. */
.cr7-startlist{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;}
.cr7-startlist::-webkit-scrollbar{display:none;}
/* The rail's shelf: cards snap to the column's edge; the padding is room
   for a lifted card's shadow, the margins take it back out. */
.cr7-shelf{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;margin-inline:-24px;margin-bottom:-40px;margin-top:28px;padding-inline:24px;padding-bottom:48px;padding-top:12px;scrollbar-width:none;}
.cr7-shelf::-webkit-scrollbar{display:none;}
.cr7-shelf>*{scroll-snap-align:start;}
/* the paging arrows: the reference holds them off a phone entirely
   (the !important outweighs the StyleX display on the HStack wrapper) */
.cr7-arrows{display:none !important;}
@media(min-width:640px){.cr7-arrows{display:flex !important;}}
/* ── Round 11 ──────────────────────────────────────────────────────────────
   The closing band's doors and hand (ClosingPhotoHalf): two 40px doors —
   the primary told apart by its fill, the other raised in white with a
   soft shadow; the sparks in ink on the copy half. */
.cr11-door{display:flex;height:40px;align-items:center;justify-content:center;border-radius:var(--radius-element);padding-inline:20px;font-size:14px;font-weight:500;cursor:pointer;width:100%;}
@media(min-width:640px){.cr11-door{width:auto;}}
.cr11-door--primary{background:var(--color-accent);color:var(--color-on-accent);border:none;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr11-door--primary:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr11-door--card{background:var(--color-background-card);color:var(--color-text-primary);border:none;box-shadow:var(--shadow-low);transition:box-shadow var(--duration-fast) var(--ease-standard);}
.cr11-door--card:hover{box-shadow:var(--shadow-med);}
.cr11-door:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* the sparks: the large one over the heading's top-left, the small one in
   the strip between the risk line and the photograph */
.cr11-spark{position:absolute;pointer-events:none;fill:var(--color-text-primary);}
.cr11-spark--lg{width:32px;left:4%;top:12px;}
.cr11-spark--sm{width:24px;bottom:16px;right:8%;transform:rotate(16deg);}
@media(min-width:640px){.cr11-spark--lg{width:44px;left:5%;top:20px;}.cr11-spark--sm{width:28px;}}
@media(min-width:1024px){.cr11-spark--lg{left:4%;top:6%;}.cr11-spark--sm{right:auto;left:17%;bottom:8%;}}
/* the squiggle over the photograph's edge from xl, the sprout off its top
   corner from lg — the hand's two wide-screen strokes */
.cr11-squiggle{display:none;position:absolute;pointer-events:none;width:128px;color:var(--color-text-primary);z-index:1;}
.cr11-sprout{display:none;position:absolute;pointer-events:none;width:64px;right:4px;top:8px;}
@media(min-width:1024px){.cr11-sprout{display:block;}}
@media(min-width:1280px){
  .cr11-squiggle{display:block;left:calc(100% - 110px);top:42%;}
}
/* the photograph: the reference's own crop ladder — the desk held in from
   the left edge on a phone, the chair's floor kept from sm */
.cr11-photoimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:15% 50%;}
@media(min-width:640px){.cr11-photoimg{object-position:50% 100%;}}
@media(min-width:1024px){.cr11-photoimg{object-position:15% 50%;}}
/* the footer's cells: horizontal rules between them below lg, full-height
   rules and the 1.15/1/1/1.25 columns from it — the reference's own cut.
   (Round 12: the paddings were written camelCase — paddingInline and kin —
   which a stylesheet parses as unknown properties and drops, so every text
   sat hard on its rule. Kebab, as CSS spells them.) */
.cr11-footgrid{display:grid;}
.cr11-footcell{padding-block:40px;}
.cr11-footcell:first-child{padding-top:0;}
.cr11-footcell:last-child{padding-bottom:0;}
.cr11-footcell + .cr11-footcell{border-top:1px solid var(--color-border);}
@media(min-width:1024px){
  .cr11-footgrid{grid-template-columns:1.15fr 1fr 1fr 1.25fr;}
  .cr11-footcell{padding-block:0;}
  .cr11-footcell + .cr11-footcell{border-top:none;border-left:1px solid var(--color-border);}
  .cr11-footcell{padding-inline:40px;}
  .cr11-footcell:first-child{padding-left:0;}
  .cr11-footcell:last-child{padding-right:0;}
}
.cr11-footlink{background:transparent;border:none;padding:0;cursor:pointer;font:inherit;font-size:14px;color:var(--color-text-secondary);text-decoration-line:underline;text-decoration-color:transparent;text-underline-offset:4;transition:color var(--duration-fast) var(--ease-standard);}
.cr11-footlink:hover{color:var(--color-text-primary);}
.cr11-footlink:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* the newsletter's inline field: card ground, hairline ring that darkens
   under the pointer, a 36px round submit in the brand fill */
.cr11-newsrow{display:flex;height:44px;align-items:center;border-radius:var(--radius-element);background:var(--color-background-card);padding-left:16px;padding-right:4px;box-shadow:inset 0 0 0 1px var(--color-border);transition:box-shadow var(--duration-fast) var(--ease-standard);}
.cr11-newsrow:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--color-text-primary) 20%,transparent);}
.cr11-newsrow:focus-within{box-shadow:inset 0 0 0 2px var(--color-accent);}
.cr11-newsinput{min-width:0;flex:1 1 auto;height:100%;background:transparent;border:none;outline:none;font:inherit;font-size:16px;color:var(--color-text-primary);}
.cr11-newsinput::placeholder{color:var(--color-text-secondary);}
@media(min-width:640px){.cr11-newsinput{font-size:14px;}}
.cr11-newssub{display:flex;width:36px;height:36px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:999px;background:var(--color-accent);color:var(--color-on-accent);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr11-newssub:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr11-newssub:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
.cr7-card{position:relative;display:flex;flex-direction:column;height:100%;border-radius:var(--radius-container);background:var(--color-background-card);box-shadow:var(--shadow-low);padding:8px;transition:box-shadow 200ms cubic-bezier(0,0,0.2,1);}
.cr7-card:hover{box-shadow:var(--shadow-med);}
.cr7-cardlink{position:absolute;inset:0;z-index:1;border-radius:inherit;background:transparent;border:none;padding:0;cursor:pointer;}
.cr7-cardlink:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:4px;}
.cr7-photo{transition:transform 500ms cubic-bezier(0,0,0.2,1);width:100%;height:100%;object-fit:cover;display:block;}
.cr7-card:hover .cr7-photo{transform:scale(1.04);}
/* ── Round 9 ───────────────────────────────────────────────────────────────
   The poster (reference PreviewFrame): the art leans in under the pointer and
   the dim doubles; the play disc steps up a size and its shadow lifts. */
.cr9-plate{position:absolute;inset-inline:12px;bottom:12px;}
@media(min-width:640px){.cr9-plate{inset-inline:auto;left:16px;bottom:16px;max-width:448px;}}
.cr9-poster-art{position:absolute;inset:0;display:block;transition:transform 700ms cubic-bezier(0,0,0.2,1);}
.cr9-poster:hover .cr9-poster-art{transform:scale(1.03);}
.cr9-poster-dim{position:absolute;inset:0;background:rgba(28,25,23,0.1);transition:background-color 300ms cubic-bezier(0.4,0,0.2,1);}
.cr9-poster:hover .cr9-poster-dim{background:rgba(28,25,23,0.2);}
.cr9-poster-disc{display:flex;width:72px;height:72px;align-items:center;justify-content:center;border-radius:999px;background:var(--color-background-card);color:var(--color-text-primary);box-shadow:var(--shadow-med);transition:transform 300ms cubic-bezier(0,0,0.2,1),box-shadow 300ms cubic-bezier(0,0,0.2,1);}
.cr9-poster:hover .cr9-poster-disc{transform:scale(1.1);box-shadow:var(--shadow-high);}
/* The player (reference preview.tsx): the frame is the play control; its disc
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
.cr9-shelfrow{display:flex;width:100%;align-items:center;gap:12px;border-radius:calc(var(--radius-container)*0.4);padding:8px;text-align:left;background:transparent;border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr9-shelfrow:hover{background:var(--color-background-muted);}
.cr9-shelfrow[aria-current='true']{background:var(--color-background-muted);}
.cr9-shelfrow:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:-2px;}
/* ── Round 12 ───────────────────────────────────────────────────────────────
   The player's own dialog, drawn as the reference's DialogContent draws it
   (ui/dialog.tsx): on a phone it rises from the foot of the screen as a
   sheet — full-bleed, its top corners rounded (rounded-t-xl = 2.1rem over
   the reference's 1.5rem radius), flush with the screen's bottom edge, as
   tall as the viewport less 24px — and from sm it sits centered with 24px of
   viewport padding, 24px corners and the reference's own 54rem ceiling.
   !important carries these past the dialog primitive's stylex sizing. */
.cr12-sheet{width:100vw !important;max-width:100vw !important;margin:auto auto 0 !important;border-radius:2.1rem 2.1rem 0 0 !important;max-height:calc(100dvh - 24px) !important;}
/* the primitive's inner wrapper carries its own 75vh ceiling; the sheet's
   height is the dialog's own, and the wrapper must not cap it short */
.cr12-sheet > div{max-height:none !important;}
@media(min-width:640px){
  .cr12-sheet{width:1024px !important;max-width:min(1024px,calc(100vw - 48px)) !important;margin:auto !important;border-radius:var(--radius-container) !important;max-height:min(54rem,calc(100dvh - 48px)) !important;}
}
/* The sheet's own chrome, on the reference's own paddings: the header
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
/* The sheet's dismiss control: the reference's DialogCloseButton — a 40px
   muted square (rounded-control), the thin outline XMark at 16px, one rung
   darker under the pointer. */
.cr12-dclose{display:flex;width:40px;height:40px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:var(--radius-element);background:var(--color-background-muted);color:var(--color-text-primary);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard);}
.cr12-dclose:hover{background:var(--color-background-gray);}
.cr12-dclose:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* The control bar's own gap, the reference's gap-2 → sm:gap-3. */
.cr12-ctlbar{gap:8px;}
@media(min-width:640px){.cr12-ctlbar{gap:12px;}}
/* The captions and the lesson's title card, on the reference's own ladder:
   12px from the frame's edges on a phone, 16px (title) / 40px (captions)
   from sm. */
.cr12-titlecard{left:12px;top:12px;max-width:calc(100% - 24px);}
.cr12-ccpos{left:16px;right:16px;bottom:16px;}
@media(min-width:640px){
  .cr12-titlecard{left:16px;top:16px;max-width:384px;}
  .cr12-ccpos{left:40px;right:40px;}
}
/* The scrubber, as the reference's Slider draws it: an 8px muted rail, the
   played part in the brand, and a 24px disc on the card's white lifted by
   the soft shadow — not the primitive's 4px cool-grey rail with the brand
   disc. !important carries these past the primitive's stylex rules, which
   arrive as a hashed class chained through two negated id selectors — an
   id-strength pair a plain descendant selector cannot out-rank. */
.cr12-scrub{--color-track:var(--color-background-muted);}
.cr12-scrub .astryx-slider-track{height:8px !important;background:var(--color-background-muted) !important;}
.cr12-scrub .astryx-slider-track + div{height:8px !important;}
.cr12-scrub .astryx-slider-thumb{width:24px !important;height:24px !important;background:var(--color-background-card) !important;box-shadow:var(--shadow-low) !important;}
/* The reviews' toolbar on a phone, as reviews.tsx holds it: the two selects
   a column under the search (each w-full, the reference's w-full sm:w-48),
   the pair held to the right edge only from lg (lg:ml-auto). */
.cr12-selcol{display:flex;flex-direction:column;gap:12px;}
.cr12-selcol .cr7-select{width:100%;}
@media(min-width:640px){
  .cr12-selcol{flex-direction:row;align-items:center;}
  .cr12-selcol .cr7-select{width:192px;}
}
@media(min-width:1024px){.cr12-selcol{margin-left:auto;}}
/* The instructor's two buttons, on the reference's own recipe
   (instructor.tsx + follow-button.tsx): a 40px row of muted fill that
   darkens a rung under the pointer; Follow answering in the brand fill,
   its plus turning to a tick, both labels in one grid cell so the width
   holds. */
.cr12-actbtn{height:40px;border-radius:var(--radius-element);padding-inline:20px;font-size:14px;font-weight:500;color:var(--color-text-primary);border:none;cursor:pointer;transition:background-color var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard);width:100%;background:var(--color-background-muted);}
.cr12-actbtn:hover{background:var(--color-background-gray);}
.cr12-actbtn:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}
/* Follow: a grid holding its two labels in one cell, the one not in use
   invisible, so the button keeps the longer label's width (the
   reference's col-start-1 row-start-1 pair) */
.cr12-follow{display:grid;place-items:center;}
.cr12-follow[data-on='true']{background:var(--color-accent);color:var(--color-on-accent);}
.cr12-follow[data-on='true']:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr12-labelcell{grid-area:1/1;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;}
/* the teacher's spoken name under 360px: heard, not drawn (the
   reference's max-[359px]:sr-only) */
.cr12-un360{font-size:0;}
@media(min-width:360px){.cr12-un360{font-size:inherit;}}
/* ── Round 13 ───────────────────────────────────────────────────────────────
   The reference's motion, brought over whole. Tailwind runs every hover it
   never sizes on its default curve — 150ms on cubic-bezier(0.4,0,0.2,1) —
   and sizes every lift on ease-out — cubic-bezier(0,0,0.2,1) at the
   duration the element names. The cr* rules ride
   var(--duration-fast)/var(--ease-standard), so retargeting those two
   tokens on the page's root converts all forty-odd of them at once; the
   rules that name their own timing (the photographs, the poster, the
   player's disc, the disclosures, the FAQ) were rewritten above on the
   reference's own values. */
.cr13-root{--duration-fast:150ms;--ease-standard:cubic-bezier(0.4,0,0.2,1);}
/* the reference's globals.css: anchors glide for a reader who did not ask
   for stillness */
@media(prefers-reduced-motion:no-preference){html:has(.cr13-root){scroll-behavior:smooth;}}

/* The player's sheet (ui/dialog.tsx): the reference's Popup rises — 40px
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
/* the reference's backdrop exactly: black at a tenth under blur-xs,
   fading over 300ms on the default curve, in and out */
dialog.cr12-sheet::backdrop{
  background:rgba(0,0,0,0.1) !important;
  backdrop-filter:blur(4px) !important;
  transition-duration:300ms !important;
  transition-timing-function:cubic-bezier(0.4,0,0.2,1) !important;
}

/* The popovers — the selects, the share menu, "How reviews work" — as the
   reference's own Popup runs: opacity and scale over 150ms ease-out, the
   scale a hair under one at both ends, in on open and out on close (the
   native popover's display flip held back by allow-discrete; the layer
   stays mounted after its hide, so the exit has its 150ms too).
   animation:none retires the layer's own entrance keyframes, and the
   tokens ride the [popover] itself because its content is portaled
   outside the page's root. */
[popover]{--duration-fast:150ms;--ease-standard:cubic-bezier(0.4,0,0.2,1);}
[popover]{animation:none !important;opacity:0;scale:0.98;transition:opacity 150ms cubic-bezier(0,0,0.2,1),scale 150ms cubic-bezier(0,0,0.2,1),display 150ms cubic-bezier(0,0,0.2,1) allow-discrete,overlay 150ms cubic-bezier(0,0,0.2,1) allow-discrete !important;}
[popover]:popover-open{opacity:1;scale:1;}
@starting-style{[popover]:popover-open{opacity:0;scale:0.98;}}

/* The phone's reach bar (enrol-panel.tsx): mounted once below lg — the
   reference's lg:hidden — and held off the screen by translate, sliding
   its full height up over 300ms ease-out once the panel's own CTA has
   left the screen, visibility stepping with it so nothing of it ever
   draws below the screen's edge. */
.cr13-reachbar{
  position:fixed;left:0;right:0;bottom:0;z-index:40;
  background:var(--color-background-card);
  border-top:1px solid var(--color-border);
  box-shadow:0 -6px 20px var(--color-shadow);
  padding-inline:24px;padding-top:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));
  translate:0 100%;visibility:hidden;
  transition:translate 300ms cubic-bezier(0,0,0.2,1),visibility 300ms cubic-bezier(0,0,0.2,1);
}
.cr13-reachbar[data-away='true']{translate:0 0;visibility:visible;}
@media(min-width:1024px){.cr13-reachbar{display:none;}}
/* its Enroll, the reference's own: the brand fill that dips a fifth under
   the pointer */
.cr13-reachcta{display:flex;height:40px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:var(--radius-element);background:var(--color-accent);padding-inline:20px;font-size:14px;font-weight:500;color:var(--color-on-accent);border:none;cursor:pointer;transition:background-color 150ms cubic-bezier(0.4,0,0.2,1);}
.cr13-reachcta:hover{background:color-mix(in srgb,var(--color-accent) 80%,transparent);}
.cr13-reachcta:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);}

/* The reference's blanket kill, scoped to this page and its layers: a
   reader who asked for stillness gets every state arrived at, never
   travelled to — the hovers land, the sheet and the popovers appear, the
   bar steps in, and the zooms the reference gates behind motion-safe
   never move at all. */
@media(prefers-reduced-motion:reduce){
  .cr13-root,.cr13-root *,.cr13-root *::before,.cr13-root *::after,
  dialog.cr12-sheet,dialog.cr12-sheet::backdrop,
  [popover],[popover] *,[popover] *::before,[popover] *::after,
  .cr13-reachbar,.cr13-reachcta{
    animation-duration:0.01ms !important;
    animation-iteration-count:1 !important;
    transition-duration:0.01ms !important;
  }
  html:has(.cr13-root){scroll-behavior:auto !important;}
  .cr7-card:hover .cr7-photo,
  .cr6-row:hover .cr6-photo,
  .cr9-poster:hover .cr9-poster-art,
  .cr9-poster:hover .cr9-poster-disc{transform:none;}
}
/* ── Round 14 ───────────────────────────────────────────────────────────────
   The one edit this round carries: the weekly-pace slider as the reference
   draws it (enrol-panel.tsx + ui/slider.tsx's SliderSteps) — the track given
   no fill of its own, drawn instead as one dash a step, the steps taken in
   the brand and the rest a pale ink, so the week reads as a count; the 24px
   white card-disc thumb stands on the seam between the last dash taken and
   the next, lifted by the soft shadow and one rung higher under the pointer
   (the reference's group-hover). The dashes and the thumb ride the page's
   own motion tokens, and the reduced-motion blanket above already covers
   them — they sit in .cr13-root's subtree. */
.cr14-segctrl{position:relative;height:24px;width:100%;display:flex;align-items:center;touch-action:none;cursor:pointer;}
.cr14-segctrl:focus-visible{outline:var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);outline-offset:var(--focus-outline-offset);border-radius:var(--radius-element);}
.cr14-dash{position:absolute;top:50%;height:6px;transform:translateY(-50%);border-radius:999px;background:color-mix(in srgb,var(--color-text-primary) 10%,transparent);transition:background-color var(--duration-fast) var(--ease-standard);}
.cr14-dash.on{background:var(--color-accent);}
.cr14-segthumb{position:absolute;top:50%;width:24px;height:24px;border-radius:999px;background:var(--color-background-card);box-shadow:var(--shadow-low);transform:translate(-50%,-50%);transition:box-shadow var(--duration-fast) var(--ease-standard);}
.cr14-segctrl:hover .cr14-segthumb{box-shadow:var(--shadow-med);}
`;

// ─── Hook: below 768px the page switches to its phone composition ───────────
function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  });
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
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
   *  reference keeps these on its own demo course's first lesson). */
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
  // The reference's Plus tier, as the panel and the FAQ speak of it.
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
          // The transcript the player captions, as the reference's own demo
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
  // The teacher, as the reference's own data keeps them (courses.ts
  // Teacher + detail.ts Instructor): a trade line, a portrait where there
  // is one, three credentials in the teacher's own words, and every course
  // they teach — so the figures on the card and the two courses in the
  // Also-taught-by band are computed from the same records a real
  // catalogue would keep. The portrait is a Lummi asset, hotlinked and
  // never shipped, cast for the name it sits beside (the reference's own
  // discipline); the thumbnails are Unsplash, likewise hotlinked.
  instructor: {
    name: 'Dr. Maya Chen',
    trade: 'Applied AI lead · ex-research scientist',
    portrait: 'QmTXXhoG3QraHWg8vjxjtafnTDtkzE9Hfz4kBiiraBUfqF',
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
        image: '1601656269222-fda862e6dc7d',
      },
      {
        id: 'prompts',
        title: 'Prompt Engineering in Production',
        level: 'Intermediate',
        weeks: 3,
        price: 59,
        rating: 4.7,
        learners: 9400,
        image: '1742198914612-fc531719f1b4',
      },
    ],
  },
  // The written reviews, as the reference's reviews.ts keeps them: stars,
  // weeks ago, helpful counts (what "Most helpful" sorts by — the list
  // itself never prints them), whether they finished, a face where the
  // reviewer gave one (Lummi, hotlinked, never shipped) and initials where
  // they did not, and one that runs past four lines so the list shows what
  // a long one does.
  reviews: [
    {
      id: 'r1',
      name: 'Maya T.',
      face: 'QmVSVgUQycRafA8BtpBaMqEF9KLUfB4jEyv5gCFWsetdJt',
      role: 'Analyst, logistics',
      stars: 5,
      weeks: 3,
      helpful: 48,
      finished: true,
      text: 'Two courses in, I still froze at a blank screen. Here every lesson ends with something you write, and the tutor asks what you expect before it tells you whether you were right.',
    },
    {
      id: 'r2',
      name: 'Jonas W.',
      role: 'Operations lead',
      stars: 5,
      weeks: 6,
      helpful: 36,
      finished: true,
      text: 'Maya pointed at one step in my project and asked how many rows it should return. In five years of spreadsheets, I had never asked myself that.',
    },
    {
      id: 'r3',
      name: 'Priyanka S.',
      face: 'QmQHWNkyDCNz2xH49Db2j8PhCYBpGNBhYDHNBpdcxJLdQo',
      role: 'Product analyst',
      stars: 4,
      weeks: 2,
      helpful: 21,
      finished: true,
      text: 'Strong on the fundamentals, and the practice sets are the best part. The second module moves fast, so I watched two lessons twice.',
    },
    {
      id: 'r4',
      name: 'Carlos M.',
      face: 'QmapisvjQVKzKNN8aKVeQSsnphF6YPSMNMf6JRdLYw8H1Q',
      role: 'Finance associate',
      stars: 5,
      weeks: 9,
      helpful: 67,
      finished: true,
      text: 'The tutor would not hand me the answer, which annoyed me for a week. It is also why I could do it alone in my interview last month.',
    },
    {
      id: 'r5',
      name: 'Ruth A.',
      role: 'Marketing manager',
      stars: 3,
      weeks: 5,
      helpful: 34,
      finished: false,
      text: 'Good material, but the pace assumes more free time than I had. Its 6 hours a week were closer to 9 for me once the project started.',
    },
    {
      id: 'r6',
      name: 'Wei L.',
      face: 'QmcUirACzY1MXe3xPuhmvJzoiMENVWsYbWjTujhjmCQyG5',
      role: 'Data engineer',
      stars: 5,
      weeks: 4,
      helpful: 29,
      finished: true,
      text: 'I came for the syllabus and stayed for the project. The dataset is messy in the ways real data is, and nobody tidied it up for us first.',
    },
    {
      id: 'r7',
      name: 'Hannah K.',
      role: 'Researcher',
      stars: 4,
      weeks: 7,
      helpful: 12,
      finished: true,
      text: 'Clear lessons and honest quizzes. I wanted one more worked example before the project, and the forum had one within a day.',
    },
    {
      id: 'r8',
      name: 'Tunde O.',
      role: 'Supply chain planner',
      stars: 5,
      weeks: 1,
      helpful: 18,
      finished: false,
      text: 'I watched the hard lessons twice, the second time with the transcript open. Clicking a line to send the video to that minute saved me hours.',
    },
    {
      id: 'r9',
      name: 'Amara N.',
      face: 'QmR3fwR7FQR2XuSxLxtfS4nDf96h4HAhFFRp5rLLPLy2Xk',
      role: 'Nurse, moving into data',
      stars: 5,
      weeks: 16,
      helpful: 38,
      finished: true,
      text: 'I started without knowing what a CSV was. Maya never assumed I knew anything, never made me feel slow for asking, and answered every question I posted, even the ones I was embarrassed to ask. By week six I was using what I learned at work, and my manager has since moved me onto the reporting team, where I build the weekly figures for every ward.',
    },
  ],
  // The questions people ask before they enrol, as the reference's
  // course-page copy keeps them: a group a piece, the answers worked out
  // from the course they sit under.
  faqs: [
    {
      group: 'Before',
      q: 'Do I need to know anything before I start?',
      a: 'Enough of the basics to follow along without stopping to look things up. Lesson one is free, so open that first: if its practice set feels routine to you, you are ready for the rest of the course.',
    },
    {
      group: 'Time',
      q: 'What if I cannot give it 6 hours a week?',
      a: 'Nothing expires. 6 weeks at 6 hours a week is the pace the course was planned at, and at 4 hours it takes 9 weeks. The panel above works out a finish date for whatever pace you give it.',
    },
    {
      group: 'Time',
      q: 'What does a cohort add?',
      a: 'A start date, a finish date and a live review of the week’s work every Thursday, with the same 30 people from the first week to the last. The lessons and the tutor are the ones the self-paced track gets.',
    },
    {
      group: 'After',
      q: 'What do I get when I finish?',
      a: 'A certificate from the school that made the course, and the project the instructor’s team reviewed. Each comes with a link that anyone, an employer included, can open and check in a few seconds.',
    },
    {
      group: 'Money',
      q: 'Can I get my money back?',
      a: 'Yes, within 30 days of enrolling, from your account page and with no form to fill in or reason to give. Lesson one is free with the tutor, so most people know the course suits them before they pay.',
    },
    {
      group: 'Money',
      q: 'Is it cheaper on Plus?',
      a: 'Plus is $12 a month and opens this course along with every other. At $89 this one costs about 7 months of it, so buy it on its own if it is the only course you mean to take this year.',
    },
  ],
  // Where to go after this one: the same subject first, then the skills it
  // shares — the reference's relatedTo order, as sample data. Photographs
  // are Unsplash (hotlinked, never shipped); the teachers' portraits are
  // the reference's own Lummi casts.
  related: [
    {
      topic: 'Data & AI',
      level: 'Advanced',
      title: 'Evaluation Engineering, End to End',
      teacher: 'Dr. Maya Chen',
      portrait: 'QmTXXhoG3QraHWg8vjxjtafnTDtkzE9Hfz4kBiiraBUfqF',
      school: 'Harbor School of Data',
      credential: 'Specialization',
      learners: 15800,
      reviews: 2140,
      rating: 4.9,
      price: 99,
      saves: 1580,
      image: '1601656269222-fda862e6dc7d',
    },
    {
      topic: 'Engineering',
      level: 'Advanced',
      title: 'HTTP, and what a framework hides',
      teacher: 'Tomás Oliveira',
      portrait: 'QmRBa7eL2PP6veUJvczAYFSeuvU3J4yakpXJDaxppaJUbP',
      school: 'Rowan Engineering',
      credential: 'Course',
      learners: 12300,
      reviews: 1180,
      rating: 4.5,
      price: 79,
      saves: 990,
      image: '1456291927223-1689b7ef0a7b',
    },
    {
      topic: 'Design',
      level: 'Advanced',
      title: 'Design systems in practice',
      teacher: 'Mara Lindqvist',
      portrait: 'QmSsEjkNCgfH2SxvNAW27fN9gG6LFGVpQMfn3utW1NNbHb',
      school: 'Meridian Lab',
      credential: 'Specialization',
      learners: 11050,
      reviews: 1020,
      rating: 4.6,
      price: 139,
      saves: 1180,
      badge: 'New',
      image: '1681933859581-55594c9a09a0',
    },
    {
      topic: 'Data & AI',
      level: 'Beginner',
      title: 'Statistics without the proofs',
      teacher: 'Ibrahim Salah',
      portrait: 'QmPC2k7DgPCgKNK8es6qb8zWMXYEuKjC4BM8cBF2TbGeEf',
      school: 'Harbor School of Data',
      credential: 'Course',
      learners: 18900,
      reviews: 2310,
      rating: 4.6,
      price: 49,
      saves: 1440,
      badge: 'Bestseller',
      image: '1517090823101-30a5937ceb3c',
    },
    {
      topic: 'Business',
      level: 'Beginner',
      title: 'Pricing what you build',
      teacher: 'Priya Raman',
      portrait: 'QmesJxZ78A5iXStQ9G1KXZNcwLo4SfwTc36uyM6SJbxfVy',
      school: 'Northline Institute',
      credential: 'Guided Project',
      learners: 6720,
      reviews: 412,
      rating: 4.3,
      price: 0,
      saves: 510,
      badge: 'Free preview',
      image: '1750337684539-0c58aa348a8b',
    },
    {
      topic: 'Engineering',
      level: 'Intermediate',
      title: 'Python beyond scripts',
      teacher: 'Tomás Oliveira',
      portrait: 'QmRBa7eL2PP6veUJvczAYFSeuvU3J4yakpXJDaxppaJUbP',
      school: 'Rowan Engineering',
      credential: 'Specialization',
      learners: 63700,
      reviews: 8940,
      rating: 4.9,
      price: 129,
      saves: 5210,
      badge: 'Bestseller',
      image: '1499673610122-01c7122c5dcb',
    },
  ],
};

// ─── Reference helpers, ported ──────────────────────────────────────────────
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

// The reference's own sample-asset loaders (quotes.ts face() and
// courses.ts photo()): portraits are Lummi assets cropped to the face,
// course photographs are Unsplash — both hotlinked and never shipped, so
// the pair stays self-contained while the sample content stays real.
const face = (id: string, px: number) =>
  `https://assets.lummi.ai/assets/${id}?auto=format&fit=facearea&facepad=2.5&w=${px}&h=${px}`;
const photo = (id: string, w = 560) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

/** How the course's reviews spread across one to five stars, as whole
 *  percentages adding to 100 (detail.ts spread): one family of shapes,
 *  placed by the rating — a 4.8 course is mostly fives with a thin tail. */
function spreadOf(rating: number, reviews: number) {
  const tail = [0.7, 0.18, 0.07, 0.05];
  const tailMean = 4 * tail[0] + 3 * tail[1] + 2 * tail[2] + 1 * tail[3];
  const five = Math.min(
    0.97,
    Math.max(0.2, (rating - tailMean) / (5 - tailMean)),
  );
  const shares = [five, ...tail.map(t => t * (1 - five))];
  const raw = shares.map(s => s * 100);
  const pct = raw.map(Math.floor);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < 100 - pct.reduce((a, b) => a + b, 0); k++) {
    pct[order[k][1]] += 1;
  }
  return pct.map((p, i) => ({
    stars: 5 - i,
    pct: p,
    count: Math.round(shares[i] * reviews),
  }));
}

// What learners are asked to rate besides the whole, in the order the page
// draws them (detail.ts aspectsOf): Pace scores lowest on most courses, as
// it does on real ones.
const ASPECTS: [string, number][] = [
  ['Clarity', 0.1],
  ['Pace', -0.25],
  ['Practice', 0],
  ['Tutor', 0.05],
  ['Feedback', 0.05],
  ['Value', -0.1],
];
const REVIEW_ASPECTS = ASPECTS.map(([label, lean]) => {
  const jitter = ((hash(`c1${label}`) % 5) - 2) * 0.05;
  const score = Math.min(5, Math.max(3.5, COURSE.rating + lean + jitter));
  return {label, score: Math.round(score * 10) / 10};
});

// When the course can start, worked out from today (start.ts): at the
// learner's own pace from today, or with a cohort on a Monday. The first
// cohort is already full, so the list shows the state a sold-out row
// takes. Dates are kept as keys and read back at noon UTC, so a date
// never slips a day.
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
function localToday() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
  | {kind: 'cohort'; key: string; starts: string; ends: string; left: number};
function startsFor(today: string): Start[] {
  const h = hash(COURSE.title);
  const first = monday(today, 1);
  const runs = [
    {starts: first, left: 0},
    {starts: plusDays(first, 7), left: 3 + (h % 10)},
    {starts: plusDays(first, 35), left: 14 + (h % 12)},
  ];
  return [
    {kind: 'self', key: 'self'},
    ...runs.map(({starts, left}) => ({
      kind: 'cohort' as const,
      key: starts,
      starts,
      ends: plusDays(starts, COURSE.weeks * 7 - 3),
      left,
    })),
  ];
}
/** The day a self-paced learner finishes at `perWeek` hours a week. */
function finishAt(today: string, perWeek: number) {
  const weeks = Math.ceil((COURSE.weeks * COURSE.hours) / perWeek);
  return {weeks, key: plusDays(today, weeks * 7)};
}

/** A lesson's number in the course, as the reference's own ids keep it. */
const lessonId = (mi: number, li: number) => `${mi + 1}.${li + 1}`;

/** The free clips, in syllabus order — the player's shelf. The id is the
 *  lesson's number (1.1, 2.1 …), as the reference's clips carry it, so the
 *  shelf and the player's title card read "Lesson 1.1 · 14 min" its way. */
const CLIPS = COURSE.modules.flatMap((m, mi) =>
  m.lessons
    .map((l, li) => ({...l, id: lessonId(mi, li), module: m.title}))
    .filter(l => l.preview),
);

/** The page's one player (reference: PreviewProvider) — held once, opened
 *  by the poster or by any Preview chip in the syllabus. */
type PreviewContextType = {open: (id?: string) => void};
const PreviewContext = createContext<PreviewContextType>({open: () => {}});
const usePreview = () => useContext(PreviewContext);

/** The speeds the reference's player steps through, one press at a time. */
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
  // clip) so it starts from the top, exactly as the reference keys its own.
  const pickClip = (id: string) => {
    setClipId(id);
    setOpened(id);
  };

  return (
    <PreviewContext.Provider value={{open: show}}>
      {children}
      {/* the dialog lives once at the page's root, as the reference holds
          its own: the reference's DialogContent is sm:max-w-5xl, header / a
          scrolling grid of player and shelf / a ruled footer of two CTAs.
          cr12-sheet carries the reference's own phone register: a sheet that
          rises from the foot of the screen, full-bleed with its top corners
          rounded (ui/dialog.tsx: items-end + rounded-t-xl below sm). */}
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
            {/* the reference's DialogCloseButton: a 40px muted square, the
                thin outline XMark at 16px, one rung darker under the pointer */}
            <button type="button" className="cr12-dclose" onClick={close}>
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
                player is on screen (the reference's portal mounts its own
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
                          play glyph over it, as the reference sets its photo */}
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

          {/* the reference's ruled footer of two CTAs (preview.tsx): a column
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

/** The player, as the reference draws it: a demo that plays on the clock —
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
            frame's edges on a phone, 16px from sm (the reference's left-3
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

      {/* the control bar, the reference's gap-2 → sm:gap-3 holding it */}
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

        {/* the scrubber, the reference's own Slider (ui/slider.tsx): an 8px
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
 *  reads (the reference's Stars). */
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
                  left: 0,
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

/** The star held against the figure it belongs to (the reference's head
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

/** A caps micro-label riding its section — the reference draws these in the
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

/** The line over a section heading (the reference's Eyebrow): the capitals
 *  in a chip of the brand's tint, with a dot of its dark ink. */
function Eyebrow({children}: {children: React.ReactNode}) {
  return (
    <p style={{display: 'flex', margin: 0}}>
      <span
        style={{
          display: 'inline-flex',
          height: 28,
          alignItems: 'center',
          gap: 8,
          borderRadius: 'var(--radius-element)',
          background: 'var(--color-accent-muted)',
          paddingLeft: 10,
          paddingRight: 12,
        }}>
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'var(--color-text-accent)',
            flexShrink: 0,
          }}
        />
        <Caps>{children}</Caps>
      </span>
    </p>
  );
}

/** The words a heading turns on, swiped through with the brand's marker
 *  (the reference's Highlight): two strokes, not one — they cross at the
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

/** Screen-reader-only text — the reference's sr-only utility: visually
 *  hidden, still announced (the name's ", verified instructor" suffix). */
function SrOnly({children}: {children: React.ReactNode}) {
  return (
    <span
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
        border: 0,
      }}>
      {children}
    </span>
  );
}

/** A text avatar disc: initials in the tint, as the reference draws a
 *  faceless reviewer or teacher. */
function AvatarDisc({
  size,
  tint,
  children,
}: {
  size: number;
  tint?: string;
  children?: React.ReactNode;
}) {
  return (
    <VStack
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: tint ?? 'var(--color-background-muted)',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
      }}>
      {children}
    </VStack>
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

/** The reference's search row: the magnifier, the card ground, the
 *  hairline ring, and the clear button once there is something to clear. */
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
    <label className="cr7-field">
      <MagnifyingGlassIcon
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          color: 'var(--color-text-secondary)',
        }}
      />
      <span
        className="sr-only-style"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {value && (
        <button
          type="button"
          className="cr7-clear"
          onClick={() => onChange('')}
          aria-label="Clear the search">
          <XMarkIcon style={{width: 16, height: 16}} />
        </button>
      )}
    </label>
  );
}

/** The reference's menu-style select: a trigger the search field's shape
 *  (a glyph, the chosen label, a chevron) opening the popover the
 *  reference's own selects open — rows with a glyph, a label and a tally. */
type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
};
function SelectField({
  label,
  value,
  options,
  onChange,
  width,
  menuLabel,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  /** Fixed trigger width, for the rare context that wants one; the
   *  reviews' pair leaves it off and takes the responsive w-full /
   *  sm:w-48 the cr12-selcol class carries. */
  width?: number;
  menuLabel?: string;
}) {
  const current = options.find(o => o.value === value) ?? options[0];
  return (
    <Popover
      label={label}
      placement="below"
      alignment="start"
      width={248}
      style={{padding: 6}}
      content={
        <VStack gap={0.5} role="listbox" aria-label={label}>
          {menuLabel && (
            <Text
              type="supporting"
              color="secondary"
              style={{padding: '6px 10px'}}>
              {menuLabel}
            </Text>
          )}
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              disabled={o.disabled}
              className="cr7-menurow"
              onClick={() => onChange(o.value)}
              style={
                o.disabled
                  ? {cursor: 'not-allowed', color: 'var(--color-text-disabled)'}
                  : undefined
              }>
              {o.icon}
              <span
                style={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                {o.label}
              </span>
              {o.value === value ? (
                <CheckIcon
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    color: 'var(--color-text-primary)',
                  }}
                />
              ) : (
                o.trailing
              )}
            </button>
          ))}
        </VStack>
      }>
      {trigger => (
        <button
          type="button"
          {...trigger}
          className="cr7-select"
          style={width ? {width} : undefined}
          aria-label={label}>
          {current?.icon}
          <span
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'left',
            }}>
            {current?.label}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              flexShrink: 0,
              color: 'var(--color-text-secondary)',
            }}
          />
        </button>
      )}
    </Popover>
  );
}

/** The reference's topic marks: one glyph per subject and one hue — the
 *  chip on every card of that subject and at the head of the course page
 *  (the reference's own glyph map is heroicons throughout). */
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
        paddingLeft: 10,
        paddingRight: 10,
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

/** Save, as the reference's cards and the head draw it: a 36px toggle a
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

/** Share, as the reference draws it: a small menu of the ways a page gets
 *  passed on — its link on the clipboard, and an email with the link in it. */
function ShareButton({title}: {title: string}) {
  const [copied, setCopied] = useState(false);
  const url = () =>
    typeof window === 'undefined'
      ? ''
      : new URL('/shop/applied-ai', window.location.origin).toString();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // a blocked clipboard leaves the row as it was rather than claiming a copy
    }
  };
  const row = 'cr7-menurow';
  return (
    <Popover
      label={`Share ${title}`}
      placement="below"
      alignment="center"
      width={248}
      style={{padding: 6}}
      content={
        <VStack gap={0.5}>
          <button type="button" className={row} onClick={copy}>
            {copied ? (
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
            {copied ? 'Link copied' : 'Copy the link'}
          </button>
          <button
            type="button"
            className={row}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}`)}`;
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
          <p
            aria-live="polite"
            className="sr-only-style"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
            }}>
            {copied ? 'Link copied' : ''}
          </p>
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

// ─── Head (the rail's first block, centered) ─────────────────────────────────
function HeadBlock() {
  const [saved, setSaved] = useState(false);
  return (
    // The reference's own parting (course-overview.tsx Head): mt-6 under the
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
          // the reference's Head is set on the centre line (text-center on
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
/** The reference's fact tile: a 44px card tile (the avatar's size, so the
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
        onClick={() =>
          document
            .getElementById('instructor')
            ?.scrollIntoView({behavior: 'smooth'})
        }>
        {/* The teacher's face where there is one (the reference's Avatar,
            size sm): the same portrait the instructor card wears. */}
        <img
          src={face(COURSE.instructor.portrait, 88)}
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
              <SrOnly>, verified instructor</SrOnly>
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
            <dt
              className="sr-only-style"
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
                whiteSpace: 'nowrap',
              }}>
              {f.term}
            </dt>
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
/** The frame at the top of the page (the reference's PreviewFrame): the
 *  course's cover art as the poster of its first free lesson, with the
 *  lesson named on a plate over it. A press anywhere opens the player on
 *  that lesson. The card must FILL the 4:3 box the AspectRatio holds open
 *  for it — the round-8 squeeze was the card sizing to its content inside
 *  that box (210px of 552), which left the art short and a hole below. */
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
        style={{height: '100%'}}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: 'var(--radius-container)',
            overflow: 'hidden',
            color: '#fafaf9',
          }}>
          {/* the art (the reference's photograph; #2582 no Image primitive)
              leans in under the pointer, and the dim over it doubles */}
          <span aria-hidden="true" className="cr9-poster-art" style={inkArt} />
          <span aria-hidden="true" className="cr9-poster-dim" />

          {/* the course's badge, as the reference sets it at the top-left on
              its own tinted chip */}
          <span
            style={{
              position: 'absolute',
              left: 16,
              top: 16,
              zIndex: 2,
              borderRadius: 'var(--radius-element)',
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 4,
              paddingBottom: 4,
              background: 'var(--color-accent-muted)',
              color: 'var(--color-text-accent)',
              fontSize: 12,
              fontWeight: 500,
            }}>
            First lessons free
          </span>

          {/* the disc, dead centre, nothing beside it — the reference's own
              composition */}
          <span
            aria-hidden="true"
            className="cr9-poster-disc"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              marginLeft: -36,
              marginTop: -36,
              zIndex: 2,
            }}>
            <PlaySolid
              style={{width: 28, height: 28, transform: 'translateX(2px)'}}
            />
          </span>

          {/* The lesson it opens on, on its own plate: text straight on a
              photograph is unreadable somewhere in it. The reference's own
              mobile branch insets the plate 12px on every side and runs it
              the frame's full width; only from sm does it anchor bottom-LEFT
              at 16px with a max width (preview.tsx's inset-x-3 bottom-3 →
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
 *  or making something somebody will review (the reference's Kind). */
function Kind({lesson: l}: {lesson: Lesson}) {
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

/** The lesson's number in the syllabus: "2.3", as the reference prints it
 *  (shared with the player's clips, above). */

function Syllabus() {
  const preview = usePreview();
  // The reference's module rail and preview chip step at sm (640), not md.
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
  const all = open.length === COURSE.modules.length;

  const toggle = (id: string) =>
    setOpen(o => (o.includes(id) ? o.filter(x => x !== id) : [...o, id]));

  // The course in six figures, each with the line that says what it holds
  // (the reference computes these from the syllabus itself, so a rewritten
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

      <p
        aria-live="polite"
        style={
          q
            ? {
                margin: '16px 0 0',
                fontSize: 14,
                color: 'var(--color-text-secondary)',
              }
            : {
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
                whiteSpace: 'nowrap',
              }
        }>
        {q &&
          tally &&
          `${tally} ${found + titled === 1 ? 'mentions' : 'mention'} “${query.trim()}”`}
      </p>

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
        <ol style={{margin: '24px 0 0', padding: 0, listStyle: 'none'}}>
          {shown.map(({m, lessons}, k) => {
            const isOpen = !!q || open.includes(m.id);
            const last = k === shown.length - 1;
            const moduleVideos = m.lessons.filter(l => !l.quiz && !l.project);
            const time = moduleVideos.reduce((sum, l) => sum + l.minutes, 0);
            const closer = m.lessons[m.lessons.length - 1];
            const mi = COURSE.modules.indexOf(m);
            // On a phone the number sits in front of the title; from sm the
            // reference's rail: each module's tile, and a line running down
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
                  {closer?.quiz ? ' · quiz' : ' · project'}
                </span>
              </span>
            );
            return (
              <li
                key={m.id}
                style={{
                  position: 'relative',
                  display: isMobile ? 'block' : 'grid',
                  ...(isMobile
                    ? {
                        borderTop:
                          k === 0 ? undefined : '1px solid var(--color-border)',
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
                  {q ? (
                    <div style={{padding: '6px 8px 6px 2px'}}>{head}</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      aria-expanded={isOpen}
                      className="cr4-row"
                      style={{
                        width: '100%',
                        paddingInline: isMobile ? '8px 4px' : '12px 8px',
                        alignItems: 'center',
                      }}>
                      {head}
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'flex',
                          width: 36,
                          height: 36,
                          flexShrink: 0,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 999,
                          boxShadow: 'inset 0 0 0 1px var(--color-border)',
                          background: 'transparent',
                          transition:
                            'background-color var(--duration-fast) var(--ease-standard)',
                        }}>
                        <ChevronDownIcon
                          className="cr4-chev"
                          style={{
                            width: 16,
                            height: 16,
                            transform: isOpen ? 'rotate(180deg)' : 'none',
                          }}
                        />
                      </span>
                    </button>
                  )}

                  {/* Eased open to its own height, as the reference eases
                      its module lists (grid-rows 0fr → 1fr, 300ms ease-out),
                      and inert while shut, so a screen reader does not read
                      the lessons of a module nobody opened. The clip is
                      widened by the focus ring's reach and taken back by the
                      margins, so it does not cut a previewable row's ring. */}
                  <div
                    className="cr7-disclosure"
                    data-open={isOpen}
                    inert={!isOpen}>
                    <div
                      className="cr7-clip"
                      style={{marginInline: -4, paddingInline: 4}}>
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
                              <Kind lesson={l} />
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
                                  textAlign: 'right',
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
                            padding: isMobile
                              ? '8px 4px 8px 8px'
                              : '8px 8px 8px 12px',
                            textAlign: 'left',
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
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
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
// The teacher as the reference sets them (course-page/instructor.tsx): a
// 16rem card with the face, the trade and the figures their courses add up
// to, and beside it three rows in the teacher's own words. Under both,
// Follow and the full profile as one row of buttons, then two of the
// teacher's other courses. The card and its rows are one tutor profile —
// the data of a person the product keeps — so the reference marks the grid
// as an object and sets it at 14px; the figures are computed from the
// teacher's own catalogue, never typed in twice.
function Instructor() {
  const t = COURSE.instructor;
  const isMobile = useIsMobile();
  // Below 1280 this page's content column runs beside the rail — the
  // reference's own lg state, where the card stands over the rows; from
  // 1280 (its xl) the column is wide enough for the two-column grid.
  const isNarrow = useIsMobile(1279);
  // The button row splits into two columns from 640 (the reference's sm),
  // and the phone card runs the full width below it (its base).
  const isTiny = useIsMobile(639);
  const [following, setFollowing] = useState(false);
  // The teacher's spoken name — 'Maya' out of 'Dr. Maya Chen'. The
  // reference's split(' ')[0] assumes no honorific; ours carries one.
  const first = t.name.replace(/^Dr\.\s+/, '').split(' ')[0];
  // Two of the teacher's other courses, the two the most learners have
  // taken — the reference's own pick. The band carries only courses with
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
            src={face(t.portrait, 160)}
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
              right: -2,
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
            <SrOnly>, verified instructor</SrOnly>
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
                paddingLeft: i === 0 ? 0 : 12,
                borderLeft:
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
  // reference sets them bare, no disc. The 28px row rhythm rides an
  // explicit px (no --spacing-7 step; the block-rhythm precedent).
  const credentials = (
    <VStack gap={6} style={{gap: 28}}>
      {[
        // the reference's own three glyphs (instructor.tsx): WorkHistory,
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
  // reference draws them (instructor.tsx's row + follow-button.tsx): two
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
        // one grid cell (the reference hides the unused one with
        // visibility:hidden, which a real browser's name computation
        // excludes but a text-content one reads through) — the announcement
        // is the reference's own either way
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
      {/* Full profile: the reference's row — the muted fill, the arrow at
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
        <ArrowRightIcon aria-hidden="true" style={{width: 16, height: 16}} />
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

/** One of the teacher's other courses, as the reference's wide card with
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
            src={photo(x.image)}
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
            photograph's own edges. The reference's own column carries
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
type ReviewSort = 'helpful' | 'newest' | 'highest' | 'lowest';
const ORDERS: {id: ReviewSort; label: string; Icon: typeof ClockIcon}[] = [
  {id: 'helpful', label: 'Most helpful', Icon: HandThumbUpIcon},
  {id: 'newest', label: 'Newest', Icon: ClockIcon},
  {id: 'highest', label: 'Highest rated', Icon: BarsArrowDownIcon},
  {id: 'lowest', label: 'Lowest rated', Icon: BarsArrowUpIcon},
];

// One glyph per thing learners rate, drawn large at the foot of its cell
// as the reference draws its own. Tutor keeps the AI glyph in the AI
// accent, the mark the tutor wears everywhere else on the site.
const aspectIcon: Record<string, IconSvgElement | 'tutor'> = {
  Clarity: GlassesIcon,
  Pace: GaugeIcon,
  Practice: Dumbbell01Icon,
  Tutor: 'tutor',
  Feedback: Comment01Icon,
  Value: Tag01Icon,
};

/** The first six reviews the list opens on; "Show more" brings in the rest. */
const FIRST = 6;

/** The reference's line under its heading: how reviews get onto the page,
 *  opened in place rather than sent to a page of its own. */
function HowReviewsWork() {
  return (
    <Popover
      label="How reviews work"
      placement="below"
      alignment="start"
      width={320}
      style={{padding: 20}}
      content={
        <VStack gap={2} style={{gap: 10}}>
          <Text type="body" weight="medium">
            How reviews work
          </Text>
          <ul
            style={{
              margin: '12px 0 0',
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 14,
              color: 'var(--color-text-secondary)',
            }}>
            <li>
              A learner can review a course after finishing its first two
              modules, and can review it once.
            </li>
            <li>
              The rating is the mean of every review the course has had. The six
              scores come from the same form, one question each.
            </li>
            <li>
              Nobody edits a review, and a low one stays up like any other.
            </li>
          </ul>
        </VStack>
      }>
      {trigger => (
        <button
          type="button"
          {...trigger}
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            textDecorationLine: 'underline',
            textUnderlineOffset: 4,
            background: 'transparent',
            border: 'none',
            padding: 0,
            marginTop: -12,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}>
          How reviews work
        </button>
      )}
    </Popover>
  );
}

function Reviews() {
  const [stars, setStars] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<ReviewSort>('helpful');
  const [more, setMore] = useState(false);
  const spread = spreadOf(COURSE.rating, COURSE.reviewCount);

  const q = fold(query.trim());
  const found = COURSE.reviews.filter(
    r => !q || fold(r.text).includes(q) || fold(r.role).includes(q),
  );
  const list = found
    .filter(r => (stars ? r.stars === stars : true))
    .sort((a, b) =>
      order === 'helpful'
        ? b.helpful - a.helpful
        : order === 'newest'
          ? a.weeks - b.weeks
          : order === 'highest'
            ? b.stars - a.stars || b.helpful - a.helpful
            : a.stars - b.stars || b.helpful - a.helpful,
    );
  const narrowed = stars !== null || !!q;
  const shown = more || narrowed ? list : list.slice(0, FIRST);
  const clear = () => {
    setStars(null);
    setQuery('');
  };

  // How many reviews each rating would leave, counted after the search, as
  // the catalogue's filters count what an option would leave.
  const leaves = (s: number) => found.filter(r => r.stars === s).length;
  const starItems: SelectOption[] = [
    {
      value: 'all',
      label: 'All ratings',
      icon: (
        <StarLine
          aria-hidden="true"
          style={{width: 16, height: 16, color: 'var(--color-text-secondary)'}}
        />
      ),
      trailing: <Tally n={found.length} />,
    },
    ...spread.map(s => ({
      value: String(s.stars),
      label: count(s.stars, 'star'),
      icon: (
        <StarIconSolid
          aria-hidden="true"
          style={{width: 16, height: 16, color: 'var(--color-text-primary)'}}
        />
      ),
      trailing: <Tally n={leaves(s.stars)} />,
      disabled: stars !== s.stars && leaves(s.stars) === 0,
    })),
  ];
  const orderItems: SelectOption[] = ORDERS.map(o => ({
    value: o.id,
    label: o.label,
    icon: (
      <o.Icon
        aria-hidden="true"
        style={{width: 16, height: 16, color: 'var(--color-text-secondary)'}}
      />
    ),
  }));

  return (
    <VStack gap={0} align="stretch">
      <HowReviewsWork />

      {/* The reference's row: the spread first, then one cell a score, with
          a rule between each and the next. */}
      <div className="cr7-scorerow" style={{marginTop: 32}}>
        <div className="cr7-spread">
          <p style={{margin: 0, fontSize: 14, fontWeight: 500}}>
            Overall rating
          </p>
          <ul
            style={{
              margin: '8px 0 0',
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}>
            {spread.map(s => (
              <li
                key={s.stars}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                }}>
                <span
                  aria-hidden="true"
                  style={{width: 8, fontVariantNumeric: 'tabular-nums'}}>
                  {s.stars}
                </span>
                <span
                  className="sr-only-style"
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                    clip: 'rect(0 0 0 0)',
                    whiteSpace: 'nowrap',
                  }}>
                  {count(s.stars, 'star')}, {s.pct}% of reviews
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    height: 4,
                    flex: '1 1 auto',
                    overflow: 'hidden',
                    borderRadius: 999,
                    background: 'var(--color-background-muted)',
                  }}>
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      borderRadius: 999,
                      background: 'var(--color-text-primary)',
                      width: `${Math.max(s.pct, s.pct ? 2 : 0)}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ul className="cr7-scores" style={{listStyle: 'none'}}>
          {REVIEW_ASPECTS.map(a => {
            const icon = aspectIcon[a.label];
            return (
              <li key={a.label} className="cr7-score">
                <p style={{margin: 0, fontSize: 14, fontWeight: 500}}>
                  {a.label}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                  {a.score.toFixed(1)}
                </p>
                <span
                  style={{marginTop: 'auto', paddingTop: 24, display: 'flex'}}>
                  {icon === 'tutor' ? (
                    <HugeIcon
                      icon={AiMagicIcon}
                      size={30}
                      strokeWidth={1.4}
                      aria-hidden="true"
                      style={{color: 'var(--color-text-purple)'}}
                    />
                  ) : (
                    <HugeIcon
                      icon={icon as IconSvgElement}
                      size={30}
                      strokeWidth={1.3}
                      aria-hidden="true"
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* the rule under the row, and the three ways into the list: the
          search on the left, the two selects held to the right edge
          (reviews.tsx: lg:ml-auto), as the reference sets them */}
      <div className="cr7-toolbar" style={{marginTop: 32}}>
        <SearchField
          label="Search the reviews"
          placeholder="Search the reviews"
          value={query}
          onChange={setQuery}
        />
        {/* the two selects, as reviews.tsx holds them: a column under the
            search on a phone with each trigger the full row (w-full
            sm:w-48), a row from sm, held to the right edge only from lg */}
        <div className="cr12-selcol">
          <SelectField
            label="Filter the reviews by rating"
            value={stars === null ? 'all' : String(stars)}
            options={starItems}
            onChange={v => setStars(v === 'all' ? null : Number(v))}
            menuLabel="Rating"
          />
          <SelectField
            label="Sort the reviews"
            value={order}
            options={orderItems}
            onChange={v => setOrder(v as ReviewSort)}
            menuLabel="Sort by"
          />
        </div>
      </div>

      {narrowed && list.length > 0 && (
        <p
          style={{
            margin: '20px 0 0',
            fontSize: 14,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 12px',
          }}>
          <span
            aria-hidden="true"
            style={{color: 'var(--color-text-secondary)'}}>
            {list.length} of the {COURSE.reviews.length} here
          </span>
          <button
            type="button"
            onClick={clear}
            style={{
              textDecorationLine: 'underline',
              textUnderlineOffset: 4,
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: 14,
              cursor: 'pointer',
              color: 'inherit',
            }}>
            Clear the filters
          </button>
        </p>
      )}

      {list.length === 0 ? (
        <VStack
          gap={2}
          style={{
            marginTop: 32,
            borderRadius: 'var(--radius-container)',
            background: 'var(--color-background-muted)',
            padding: 24,
            width: '100%',
          }}>
          <Text type="body" weight="medium">
            {!q
              ? `No ${stars}-star review in this sample`
              : stars !== null
                ? `No ${stars}-star review here mentions “${query.trim()}”`
                : `No review here mentions “${query.trim()}”`}
          </Text>
          <Text type="supporting" color="secondary">
            The sample is {COURSE.reviews.length} of{' '}
            {figure(COURSE.reviewCount)}. Clear the filters to read them all.
          </Text>
          <button
            type="button"
            onClick={clear}
            className="cr7-ringbtn"
            style={{marginTop: 16, width: 'fit-content'}}>
            Clear the filters
          </button>
        </VStack>
      ) : (
        <ul className="cr7-reviews">
          {shown.map((r, i) => (
            <ReviewItem
              key={r.id}
              review={r}
              query={q}
              className={edges(i, shown.length)}
            />
          ))}
        </ul>
      )}

      {!narrowed && list.length > FIRST && (
        <HStack gap={5} vAlign="center" wrap="wrap" style={{marginTop: 48}}>
          {!more && (
            <button
              type="button"
              className="cr7-ringbtn"
              onClick={() => setMore(true)}>
              Show {list.length - FIRST} more reviews
            </button>
          )}
          <Text type="supporting" color="secondary">
            {more ? list.length : FIRST} of {figure(COURSE.reviewCount)} reviews
          </Text>
        </HStack>
      )}
    </VStack>
  );
}

/** The rules round review `i` of `n`, and nothing round the list (the
 *  reference's edges): in one column a rule under every review but the
 *  last; in two, a rule down the middle and one under every row but the
 *  last. */
function edges(i: number, n: number) {
  const row = Math.floor(i / 2);
  const rows = Math.ceil(n / 2);
  const left = i % 2 === 0;
  return [
    'cr7-rv',
    i < n - 1 && 'cr7-rv-b',
    i > 0 && 'cr7-rv-t',
    left ? 'cr7-rv-l' : 'cr7-rv-r',
    left && i < n - 1 && 'cr7-rv-mid',
    row < rows - 1 && 'cr7-rv-rowb',
    row > 0 && 'cr7-rv-rowt',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The figure at a rating's end: how many reviews it would leave. */
function Tally({n}: {n: number}) {
  return (
    <span
      style={{
        marginLeft: 'auto',
        paddingLeft: 16,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--color-text-secondary)',
        flexShrink: 0,
      }}>
      {n}
      <span
        className="sr-only-style"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}>
        {' '}
        {n === 1 ? 'review' : 'reviews'}
      </span>
    </span>
  );
}

/** One review in a list: the face or initials, the name and role, the
 *  stars, when, whether they finished, and the words (the reference's
 *  ReviewItem — the helpful count sorts the list and is never printed). */
function ReviewItem({
  review: r,
  query,
  className,
}: {
  review: (typeof COURSE.reviews)[number];
  query: string;
  className?: string;
}) {
  const initials = r.name
    .split(' ')
    .map(w => w[0])
    .join('');
  return (
    <li className={className}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
        {/* the reviewer's photograph where they gave one, their initials
            where they did not, as a real list mixes the two */}
        {r.face ? (
          <img
            src={face(r.face, 96)}
            alt=""
            width={48}
            height={48}
            style={{
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: 999,
              background: 'var(--color-background-muted)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <AvatarDisc size={48}>
            <span style={{fontSize: 16, fontWeight: 500}}>{initials}</span>
          </AvatarDisc>
        )}
        <p style={{margin: 0, minWidth: 0, flex: '1 1 auto'}}>
          <span
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 16,
              fontWeight: 500,
            }}>
            {r.name}
          </span>
          <span
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 14,
              color: 'var(--color-text-secondary)',
            }}>
            {r.role}
          </span>
        </p>
      </div>

      <p
        style={{
          margin: '20px 0 0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 8,
          rowGap: 4,
          fontSize: 14,
          color: 'var(--color-text-secondary)',
        }}>
        <Stars value={r.stars} />
        <span aria-hidden="true">·</span>
        <span>{ago(r.weeks)}</span>
        {r.finished && (
          <>
            <span aria-hidden="true">·</span>
            <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
              <CheckIcon
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  color: 'var(--color-text-purple)',
                }}
              />
              Finished
            </span>
          </>
        )}
      </p>

      <Body text={r.text} query={query} />
    </li>
  );
}

/** A review's words, held to four lines as the reference holds a long one,
 *  with "Show more" under it only where the four lines cut something off.
 *  A search opens every review it matched, so a marked word is never the
 *  part that is cut. */
function Body({text, query}: {text: string; query: string}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const clamped = !open && !query;

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const read = () => setCut(el.scrollHeight > el.clientHeight + 1);
    read();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamped]);

  return (
    <>
      <p
        ref={ref}
        className={clamped ? 'cr7-clamp' : undefined}
        style={{margin: '10px 0 0', fontSize: 16}}>
        <Marked text={text} query={query} />
      </p>
      {!query && (cut || open) && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            marginTop: 8,
            width: 'fit-content',
            fontSize: 14,
            fontWeight: 500,
            textDecorationLine: 'underline',
            textUnderlineOffset: 4,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
          }}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
}

// ─── Related courses ─────────────────────────────────────────────────────────
/** Where to go after this course, on the reference's rail: the 48px
 *  heading with the marker swoosh, the two paging arrows, and the photo
 *  course cards the home shelf carries. */
function RelatedRail() {
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const shelf = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({start: true, end: false});
  // The reference's SectionHeading steps: 36 from sm, 48 from lg.
  const sm = !useIsMobile(639);
  const lg = !useIsMobile(1023);

  useEffect(() => {
    const el = shelf.current;
    if (!el) {
      return;
    }
    const read = () => {
      const max = el.scrollWidth - el.clientWidth - 1;
      setEnds({start: el.scrollLeft <= 1, end: el.scrollLeft >= max});
    };
    read();
    el.addEventListener('scroll', read, {passive: true});
    window.addEventListener('resize', read);
    return () => {
      el.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, []);

  const page = (dir: number) => {
    const el = shelf.current;
    if (!el) {
      return;
    }
    // the reference pages the row's whole width, and a reader who asked
    // for stillness gets the jump, not the glide (use-rail.ts)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: dir * el.clientWidth,
      behavior: still ? 'auto' : 'smooth',
    });
  };

  return (
    <section style={{width: '100%'}}>
      <HStack vAlign="end" justify="between" gap={6} style={{width: '100%'}}>
        <Text as="h2" style={sectionHeadingStyle(sm, lg)}>
          Where to go <Highlight>after this one</Highlight>
        </Text>
        {/* the reference's two arrows at the heading's end — hidden below
            sm exactly as the reference hides them (related-rail.tsx:
            "hidden shrink-0 gap-2 sm:flex"; a phone scrolls the rail
            itself) */}
        <HStack
          gap={2}
          className="cr7-arrows"
          style={{flexShrink: 0, marginBottom: 6}}>
          <button
            type="button"
            className="cr7-ringbtn"
            style={{width: 40, paddingInline: 0}}
            aria-label="Previous courses"
            aria-controls="related-shelf"
            disabled={ends.start}
            onClick={() => page(-1)}>
            <ChevronLeftIcon
              aria-hidden="true"
              style={{width: 20, height: 20}}
            />
          </button>
          <button
            type="button"
            className="cr7-ringbtn"
            style={{width: 40, paddingInline: 0}}
            aria-label="Next courses"
            aria-controls="related-shelf"
            disabled={ends.end}
            onClick={() => page(1)}>
            <ChevronRightIcon
              aria-hidden="true"
              style={{width: 20, height: 20}}
            />
          </button>
        </HStack>
      </HStack>

      {/* The home shelf's rail and its reasons: the padding is room for a
          lifted card's shadow, the margins take it back out of the layout,
          and the snap holds to the column's edge. */}
      <ul
        id="related-shelf"
        ref={shelf}
        aria-label="Courses to take next"
        className="cr7-shelf"
        style={{listStyle: 'none'}}>
        {COURSE.related.map(c => (
          <li
            key={c.title}
            style={{
              width: 272,
              flexShrink: 0,
              scrollSnapAlign: 'start',
              display: 'flex',
            }}>
            <CourseCard
              course={c}
              saved={!!favs[c.title]}
              onToggle={() => setFavs(f => ({...f, [c.title]: !f[c.title]}))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One course card, as the reference's CourseCard draws it: the photograph
 *  with the badge and the teacher chip on it, the topic chip and level
 *  under, the title, then the school line and the two ruled figure rows —
 *  learners and the rating over the price and Save. One press opens the
 *  course (an overlay the size of the card, labelled by the title alone);
 *  Save and the teacher chip stand above it. */
function CourseCard({
  course: c,
  saved,
  onToggle,
}: {
  course: (typeof COURSE.related)[number];
  saved: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="cr7-card" style={{width: '100%'}}>
      {/* one press opens the course; labelled by the title alone, so a
          screen reader hears the course's name rather than every line */}
      <button
        type="button"
        className="cr7-cardlink"
        aria-label={`Open the course ${c.title}`}
        onClick={() => {}}
      />

      {/* the photograph, inset in the card at the card's radius less the
          8px between them. It leans in while the card is pointed at. */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          overflow: 'hidden',
          borderRadius: 'calc(var(--radius-container) - 8px)',
          background: 'var(--color-background-muted)',
        }}>
        <img src={photo(c.image)} alt="" className="cr7-photo" loading="lazy" />
        {/* The badge is the brand's pale chip, mixed into white so nothing
            in the frame shows through behind its ink. */}
        {c.badge && (
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              zIndex: 2,
              borderRadius: 'var(--radius-element)',
              background:
                'light-dark(color-mix(in oklab, var(--color-accent) 30%, var(--color-background-card)), color-mix(in oklab, var(--color-accent) 12%, var(--color-background-card)))',
              paddingInline: 10,
              paddingTop: 4,
              paddingBottom: 4,
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-accent)',
              boxShadow: 'var(--shadow-low)',
            }}>
            {c.badge}
          </span>
        )}
        {/* The teacher, on the photograph's foot: a way to their profile
            from every card. */}
        <button
          type="button"
          aria-label={`Open ${c.teacher}'s profile`}
          onClick={() => {}}
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 2,
            display: 'flex',
            width: 'fit-content',
            maxWidth: 'calc(100% - 24px)',
            alignItems: 'center',
            gap: 8,
            borderRadius: 'var(--radius-element)',
            background: 'var(--color-background-card)',
            paddingBlock: 4,
            paddingLeft: 4,
            paddingRight: 12,
            fontSize: 12,
            fontWeight: 500,
            boxShadow: 'var(--shadow-low)',
            border: 'none',
            cursor: 'pointer',
            transition:
              'background-color var(--duration-fast) var(--ease-standard)',
          }}>
          {c.portrait && (
            <img
              src={face(c.portrait, 64)}
              alt=""
              width={24}
              height={24}
              style={{
                width: 24,
                height: 24,
                flexShrink: 0,
                borderRadius: 999,
                objectFit: 'cover',
              }}
            />
          )}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
            {c.teacher}
          </span>
        </button>
      </div>

      {/* The topic chip and the level answer one another across the row. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingInline: 12,
          paddingTop: 16,
        }}>
        <TopicChip topic={c.topic} />
        <span
          style={{
            display: 'flex',
            flexShrink: 0,
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}>
          <LevelDots level={c.level} />
          {c.level}
        </span>
      </div>
      <h3
        style={{
          margin: '12px 12px 0',
          fontSize: 18,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-family-heading)',
        }}>
        {c.title}
      </h3>

      <div
        style={{
          display: 'flex',
          flex: '1 1 auto',
          flexDirection: 'column',
          paddingInline: 12,
          paddingBottom: 12,
        }}>
        {/* The school and the credential on one line, so every card keeps
            the same stack under its title. */}
        <p
          style={{
            margin: '4px 12px 16px',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
          {c.school}
          <span style={{whiteSpace: 'nowrap'}}>&nbsp;· {c.credential}</span>
        </p>

        {/* The rating reports, so it is a row of figures; Save acts, so it
            is a button in the footer, and the two never share a row. */}
        <p
          style={{
            margin: 'auto 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 16,
            fontSize: 14,
          }}>
          <span>
            <span style={{fontVariantNumeric: 'tabular-nums'}}>
              {figure(c.learners)}
            </span>{' '}
            <span style={{color: 'var(--color-text-secondary)'}}>learners</span>
          </span>
          <StarFig value={c.rating} size={14} />
        </p>

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 16,
          }}>
          {/* The price is the footer's figure, so it is set in the heading
              face, as the page's other prices are. */}
          <span
            style={{
              fontFamily: 'var(--font-family-heading)',
              fontSize: 20,
              letterSpacing: '-0.025em',
              fontVariantNumeric: 'tabular-nums',
            }}>
            {priceLabel(c.price)}
          </span>
          <span style={{position: 'relative', zIndex: 2}}>
            <SaveButton
              saved={saved}
              onToggle={onToggle}
              count={c.saves}
              ariaLabel={`Save ${c.title}`}
            />
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Enroll panel (the reference's EnrolPanel: sticky beside the syllabus ────
//     + the phone's reach-bar) ────────────────────────────────────────────────
/** One way to start, as the reference's date rows are drawn. The
 *  self-paced row carries its finish date under it; a cohort row is one
 *  line, its first day in the ink that is read first and its last in the
 *  muted one, with the seats on the right. A full cohort keeps its row,
 *  sunk into the panel the way a disabled control is. */
function StartRow({
  start,
  on,
  onPick,
  finish,
}: {
  start: Start;
  on: boolean;
  onPick: () => void;
  finish?: string;
}) {
  const full = start.kind === 'cohort' && start.left === 0;
  const few = start.kind === 'cohort' && start.left > 0 && start.left <= 10;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-disabled={full || undefined}
      onClick={full ? undefined : onPick}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 12,
        borderRadius: 'calc(var(--radius-container) * 0.6)',
        paddingInline: 20,
        paddingBlock: 14,
        textAlign: 'left',
        cursor: full ? 'not-allowed' : 'pointer',
        border: 'none',
        transition:
          'box-shadow var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)',
        ...(full
          ? {background: 'var(--color-background-muted)'}
          : on
            ? {
                background: 'var(--color-background-card)',
                boxShadow: 'inset 0 0 0 2px var(--color-accent)',
              }
            : {boxShadow: 'inset 0 0 0 1px var(--color-border)'}),
      }}>
      {start.kind === 'self' ? (
        <span style={{minWidth: 0, flex: '1 1 auto'}}>
          <span style={{display: 'block', fontSize: 14, fontWeight: 500}}>
            Today, at your own pace
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 2,
              fontSize: 14,
              color: 'var(--color-text-secondary)',
            }}>
            Finish around {finish}
          </span>
        </span>
      ) : (
        <span style={{minWidth: 0, flex: '1 1 auto', fontSize: 14}}>
          <span
            className="sr-only-style"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
            }}>
            Cohort,{' '}
          </span>
          <span
            style={
              full ? {color: 'var(--color-text-secondary)'} : {fontWeight: 500}
            }>
            {dayLabel(start.starts)}
          </span>
          <span style={{color: 'var(--color-text-secondary)'}}>
            {' '}
            – {dateLabel(start.ends)}
          </span>
        </span>
      )}
      {start.kind === 'cohort' && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
            color: full
              ? 'var(--color-text-secondary)'
              : few
                ? 'var(--color-text-orange)'
                : 'var(--color-text-secondary)',
          }}>
          {full ? 'Full' : `${start.left} left`}
        </span>
      )}
    </button>
  );
}

// ─── The segmented slider (round 14: the reference's SliderSteps) ────────────
// One dash a step, the steps taken in the brand and the rest a pale ink, so
// the week reads as a count; the 24px white card-disc thumb stands on the
// seam between the last one taken and the next — the dash the thumb stands
// ON never counts itself taken. A press anywhere on the control lands the
// thumb there and the drag follows the pointer; the arrows, Home and End
// move it from the keyboard. (Drawn on the page's own tokens, cr14-*,
// because the primitive's Slider draws a continuous rail and an accent
// thumb — the segmented track with the white disc is the reference's own.)
function StepsSlider({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const n = Math.round(max - min);
  const taken = Math.round(value - min);
  const pct = ((value - min) / (max - min)) * 100;
  const ref = useRef<HTMLDivElement>(null);

  const setFromX = useCallback(
    (x: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const ratio = Math.min(Math.max((x - rect.left) / rect.width, 0), 1);
      onChange(Math.round(min + ratio * (max - min)));
    },
    [min, max, onChange],
  );

  return (
    <div
      ref={ref}
      className="cr14-segctrl"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.focus();
        setFromX(e.clientX);
        const move = (ev: globalThis.PointerEvent) => setFromX(ev.clientX);
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(Math.min(value + 1, max));
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(Math.max(value - 1, min));
        }
        if (e.key === 'Home') {
          e.preventDefault();
          onChange(min);
        }
        if (e.key === 'End') {
          e.preventDefault();
          onChange(max);
        }
      }}>
      <span aria-hidden="true" style={{position: 'absolute', inset: 0}}>
        {Array.from({length: n}, (_, i) => (
          <span
            key={i}
            className={`cr14-dash${i < taken ? ' on' : ''}`}
            style={{
              left: `calc(${(i / n) * 100}% + 2px)`,
              width: `calc(${100 / n}% - 4px)`,
            }}
          />
        ))}
      </span>
      <span
        className="cr14-segthumb"
        style={{left: `${pct}%`}}
        aria-hidden="true"
      />
    </div>
  );
}

function EnrollPanel() {
  const isMobile = useIsMobile();
  // The panel is held to the screen's height less the header only from lg,
  // where it rides beside the syllabus (the reference's own gate).
  const tall = !useIsMobile(1023);
  const today = localToday();
  const starts = startsFor(today);
  const [picked, setPicked] = useState<string>('self');
  const maxPace = Math.max(12, COURSE.hours * 2);
  const [pace, setPace] = useState(COURSE.hours);
  const start = starts.find(s => s.key === picked) ?? starts[0];
  const finish = finishAt(today, pace);
  const paid = COURSE.price > 0;

  // The reference's reach-bar: once the CTA has scrolled away above the
  // screen, the bar keeps the price and the button in reach. The root runs
  // far below the screen, so the button counts as in view down the page and
  // only leaving past the top turns the bar on.
  const [ctaEl, setCtaEl] = useState<HTMLDivElement | null>(null);
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!ctaEl || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const io = new IntersectionObserver(
      entries => setAway(!entries[0].isIntersecting),
      {
        rootMargin: '0px 0px 10000px 0px',
      },
    );
    io.observe(ctaEl);
    return () => io.disconnect();
  }, [ctaEl]);

  const self = starts.find(s => s.kind === 'self');
  const cohortRows = starts.filter(s => s.kind === 'cohort');
  const ctaLabel = paid ? `Enroll for ${fmt(COURSE.price)}` : 'Enroll for free';

  return (
    <>
      {/* Beside the syllabus the panel is held to the screen's height, less
          the header above it and a margin below, so on a short laptop its
          foot is never under the screen's edge: the price and the buttons
          stay whole, and the ways to start scroll inside it instead. */}
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
              Or in{' '}
              <span
                style={{
                  textDecorationLine: 'underline',
                  textUnderlineOffset: 4,
                  color: 'inherit',
                }}>
                {COURSE.tier.name}
              </span>{' '}
              for ${COURSE.tier.monthly} a month
            </p>
          )}

          <div ref={setCtaEl} style={{marginTop: 20, width: '100%'}}>
            <button type="button" className="cr7-cta">
              {ctaLabel}
              <ArrowRightIcon
                aria-hidden="true"
                style={{width: 16, height: 16}}
              />
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
          role="radiogroup"
          aria-label="When to start"
          style={{
            marginTop: 20,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 20,
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: 0,
            width: '100%',
          }}>
          <Caps>Start</Caps>
          <div
            className="cr7-startlist"
            style={{
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
            <div>
              {self && (
                <StartRow
                  start={self}
                  on={start.kind === 'self'}
                  onPick={() => setPicked('self')}
                  finish={dayLabel(finish.key)}
                />
              )}
              {/* The pace belongs to the self-paced row, so it opens under
                  it and moves that row's finish date as it is dragged. */}
              {start.kind === 'self' && (
                <VStack gap={2} style={{padding: '16px 20px 4px'}}>
                  <HStack
                    vAlign="center"
                    justify="between"
                    gap={3}
                    style={{width: '100%'}}>
                    <Text type="supporting">Hours you have a week</Text>
                    <Text
                      type="body"
                      style={{fontVariantNumeric: 'tabular-nums'}}>
                      {pace} {pace === 1 ? 'hour' : 'hours'}
                    </Text>
                  </HStack>
                  {/* ROUND 14: the reference's SliderSteps — the segmented
                      track with the white card-disc thumb (was the
                      primitive's continuous rail and accent thumb). */}
                  <StepsSlider
                    value={pace}
                    min={1}
                    max={maxPace}
                    onChange={(v: number) => setPace(v)}
                    label="Hours you have a week"
                  />
                </VStack>
              )}
            </div>

            {/* What every cohort shares is said once, over the rows, which
                leaves each row its dates and its seats. */}
            {cohortRows.length > 0 && (
              <>
                <span style={{display: 'block', marginTop: 20}}>
                  <Caps>Cohorts · live Thursdays</Caps>
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginTop: 8,
                  }}>
                  {cohortRows.map(s => (
                    <StartRow
                      key={s.key}
                      start={s}
                      on={start.kind === 'cohort' && start.key === s.key}
                      onPick={() => setPicked(s.key)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* The phone's bar: the price and the same button, once the panel's
          own button has scrolled off the top. Solid rather than frosted —
          the header already spends the page's blur. Mounted once below lg
          (the reference's lg:hidden) and slid on over 300ms ease-out,
          visibility held with it so nothing of it draws below the edge. */}
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
    </>
  );
}

// ─── Closing CTA band (the reference's ClosingPhotoHalf) ─────────────────────
/** The closing band as the reference draws it: a slab of the accent tint
 *  holding the copy centred on one side and a photograph inset on the other
 *  (stacked below lg), the two doors at one height — the primary told apart
 *  by its fill, the other raised in white — and the design's hand: two
 *  sparks on the copy half, the squiggle and the sprout taking the gap
 *  along the photograph's edge from lg and xl. */
const CLOSING_PHOTO =
  'https://images.unsplash.com/photo-1587136527278-47b852bb3ef4?auto=format&fit=crop&w=1600&q=80';

// The design's spark: tapered rays, each a little longer or shorter than a
// compass would leave it (the reference's own path).
const SPARKLE =
  'M26.3 23.9Q24.3 14.7 23.2 2Q23 14.8 21.7 24.1ZM24.1 26.1Q31.6 24.2 42 23.1Q31.5 23 23.9 21.9ZM21.7 24Q23.5 32.8 24.4 45Q24.8 32.8 26.3 24ZM23.9 21.9Q16.8 23.7 7 24.6Q16.9 24.8 24.1 26.1Z';

function ClosingCta() {
  const sm = !useIsMobile(639);
  const lg = !useIsMobile(1023);
  const xl = !useIsMobile(1279);
  void xl;

  // Two doors at one height (40px), stacked at one width on a phone until
  // they fit side by side.
  const doors = (
    <div
      style={{
        marginTop: 36,
        display: 'flex',
        flexDirection: sm ? 'row' : 'column',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        maxWidth: sm ? 'none' : 320,
      }}>
      <button
        type="button"
        className="cr11-door cr11-door--primary"
        onClick={() => {}}>
        Start lesson one free
      </button>
      <button
        type="button"
        className="cr11-door cr11-door--card"
        onClick={() => {}}>
        Enroll for $89
      </button>
    </div>
  );

  return (
    <section style={{width: '100%'}} aria-labelledby="closing-heading">
      <div
        style={{
          display: 'grid',
          overflow: 'hidden',
          borderRadius: 'var(--radius-container)',
          // the reference's bg-accent is its wash (hsl(30 8% 96.5%)), not
          // the brand tint — a quiet slab, the photograph's own frame
          background: 'var(--color-background-wash)',
          padding: 8,
          ...(lg ? {gridTemplateColumns: '1fr 1fr', minHeight: 544} : {}),
        }}>
        {/* the copy half, centred both ways, and the frame the hand is
            drawn in */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 56,
            paddingBottom: 56,
            textAlign: 'center',
            ...(sm ? {paddingLeft: 48, paddingRight: 48} : {}),
            ...(lg ? {paddingTop: 64, paddingBottom: 64} : {}),
          }}>
          {/* the design's hand: the large spark over the heading's
              top-left, the small one in the strip between the risk line
              and the photograph */}
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className="cr11-spark cr11-spark--lg">
            <path d={SPARKLE} />
          </svg>
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className="cr11-spark cr11-spark--sm">
            <path d={SPARKLE} />
          </svg>
          {/* the squiggle, drawn over the photograph's edge from xl: its
              dot lands on the picture — the one place the hand touches
              it — coiling twice round itself down the gap between the copy
              and the photograph (the reference's own path) */}
          <svg
            aria-hidden="true"
            viewBox="0 0 110 210"
            fill="none"
            className="cr11-squiggle">
            <path
              d="M40 6C58 20 70 40 62 60c-6 16-26 16-24 2 2-14 26-10 28 10 2 24-26 40-32 60-4 16 10 28 22 20 10-8 4-24-8-16-10 8 0 32 22 42 12 6 22 12 28 18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx="98"
              cy="196"
              r="9"
              style={{fill: 'var(--color-accent)'}}
            />
          </svg>
          {/* the sprout of three curved strokes in the brand hue, fanning
              off the photograph's top corner from lg */}
          <svg
            aria-hidden="true"
            viewBox="0 0 70 70"
            fill="none"
            strokeLinecap="round"
            className="cr11-sprout">
            <g
              strokeWidth="2.2"
              style={{
                stroke:
                  'color-mix(in srgb, var(--color-accent), var(--color-on-accent))',
              }}>
              <path
                d="M58 60C52 48 44 38 34 30"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d="M62 50C62 38 60 26 56 12"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d="M50 64C40 62 28 62 14 66"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>

          <Text
            as="h2"
            id="closing-heading"
            style={sectionHeadingStyle(sm, lg)}>
            Watch lesson one tonight. Decide in the morning.
          </Text>
          <p
            style={{
              margin: '20px 0 0',
              maxWidth: 352,
              fontSize: 16,
              color: 'var(--color-text-secondary)',
            }}>
            It opens with the tutor beside it and the practice set under it, and
            asks for no card. The other 9 lessons are $89 once, or part of Plus.
          </p>

          {doors}

          <p
            style={{
              margin: '24px 0 0',
              fontSize: 14,
              color: 'var(--color-text-secondary)',
            }}>
            Your money back within 30 days.
          </p>
        </div>

        {/* The photograph, inset from the band's edge by the band's own
            padding so it reads as a picture held in it — the reference's
            own Unsplash desk scene, cropped per its own object-position
            ladder. */}
        <div
          className="cr11-photo"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 'calc(var(--radius-container) - 8px)',
            minHeight: lg ? 0 : sm ? 448 : 288,
          }}>
          <img
            src={CLOSING_PHOTO}
            alt="A laptop on a white desk by a sunlit window, with shelves of books and plants and an orange armchair beside it"
            className="cr11-photoimg"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Site footer (the reference's SiteFooter) ────────────────────────────────
/** The page's own close, as the reference draws it: four unequal cells cut
 *  by full-height rules from lg (and by horizontal ones below, where there
 *  is no width to divide — each cell pads itself, which keeps every line
 *  centred between the two blocks it separates), then the baseline row the
 *  legal set belongs on: a reader looks along that line for it, not up in a
 *  column. Not a section — a hairline across the page rather than a band is
 *  what says the page has stopped. */
const FOOTER_LEARN = [
  'Browse courses',
  'Career paths',
  'Instructors',
  'My learning',
  'Pricing',
];
const FOOTER_GROUPS = [
  {
    heading: 'Teach',
    links: ['Teach on Waypoint', 'Course studio', 'Earnings calculator'],
  },
  {
    heading: 'Company',
    links: ['About', 'Contact', 'Course standards'],
  },
];
const FOOTER_LEGAL = ['Privacy', 'Terms', 'How we use AI', 'Support'];

/** The reference's own newsletter row: one inline field closed by a round
 *  button. No backend, so the state it keeps is the only thing that proves
 *  the control is wired: a field that swallows a submit reads as
 *  decoration. As every form in the demo, it walks to its success from
 *  rest, so an empty field subscribes too; an address typed wrong says so
 *  under the field. */
function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'rest' | 'sent' | 'wrong'>('rest');
  const address = email.trim();
  const shaped = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault();
        setState(address && !shaped(address) ? 'wrong' : 'sent');
      }}
      style={{marginTop: 20}}>
      <div className="cr11-newsrow">
        <input
          size={1}
          type="email"
          name="email"
          autoComplete="email"
          spellCheck={false}
          value={email}
          onChange={e => {
            setEmail(e.target.value);
            setState('rest');
          }}
          aria-label="Email address"
          aria-invalid={state === 'wrong'}
          aria-describedby="newsletter-note"
          placeholder="you@studio.com"
          className="cr11-newsinput"
        />
        <button type="submit" aria-label="Subscribe" className="cr11-newssub">
          {state === 'sent' ? (
            <CheckIcon aria-hidden="true" style={{width: 16, height: 16}} />
          ) : (
            <ArrowRightIcon
              aria-hidden="true"
              style={{width: 16, height: 16}}
            />
          )}
        </button>
      </div>
      <p
        id="newsletter-note"
        aria-live="polite"
        style={{
          margin: '8px 0 0',
          fontSize: 14,
          color:
            state === 'wrong'
              ? 'var(--color-text-destructive)'
              : 'var(--color-text-secondary)',
        }}>
        {state === 'sent'
          ? address
            ? `Thanks. The Tuesday letter goes to ${address}.`
            : 'Thanks. The Tuesday letter is on its way.'
          : state === 'wrong'
            ? 'That address needs an @ and a domain, like you@studio.com.'
            : 'One letter a week. What shipped, and what we got wrong.'}
      </p>
    </form>
  );
}

/** The brand's mark, as the reference signs its footer: the name cut to its
 *  first word, the point on the way set as the full point after it — the
 *  dot is the "point", riding the baseline in the brand hue with the chip's
 *  halo. */
function FooterLogo() {
  return (
    <span
      style={{
        display: 'flex',
        width: 'fit-content',
        alignItems: 'baseline',
        fontSize: 18,
        letterSpacing: '-0.05em',
        fontFamily: 'var(--font-family-heading)',
        fontWeight: 525,
        color: 'var(--color-text-primary)',
      }}>
      <span
        className="sr-only-style"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}>
        Waypoint
      </span>
      <span
        aria-hidden="true"
        style={{display: 'flex', alignItems: 'baseline'}}>
        way
        <span
          style={{
            marginLeft: '0.06em',
            width: '0.3em',
            height: '0.3em',
            flexShrink: 0,
            borderRadius: 999,
            background: 'var(--color-accent)',
            boxShadow: '0 0 0 0.12em var(--color-accent-muted)',
          }}
        />
      </span>
    </span>
  );
}

function SiteFooter() {
  const sm = !useIsMobile(639);
  const lg = !useIsMobile(1023);
  const link = (label: string) => (
    <button
      key={label}
      type="button"
      className="cr11-footlink"
      onClick={() => {}}>
      {label}
    </button>
  );
  return (
    <footer
      style={{
        marginTop: sm ? 160 : 128,
        borderTop: '1px solid var(--color-border)',
        width: '100%',
      }}>
      <div
        style={{
          paddingTop: sm ? 80 : 64,
          paddingBottom: sm ? 80 : 64,
          display: 'grid',
          rowGap: 0,
        }}
        className="cr11-footgrid">
        {/* the first cell — the one a visitor arrives wanting — keeps its
            heading off, which is what makes the four read as different
            objects rather than four of the same column */}
        <div className="cr11-footcell">
          <p style={{margin: 0, display: 'flex'}}>
            <FooterLogo />
          </p>
          <p
            style={{
              margin: '12px 0 0',
              maxWidth: 320,
              fontSize: 14,
              color: 'var(--color-text-secondary)',
            }}>
            A course platform with a tutor that answers from the lesson you have
            open, and a studio that turns a raw transcript into a chapter list.
          </p>
        </div>

        <div className="cr11-footcell">
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
            {FOOTER_LEARN.map(l => (
              <li key={l}>{link(l)}</li>
            ))}
          </ul>
        </div>

        <div
          className="cr11-footcell"
          style={{display: 'flex', flexDirection: 'column', gap: 40}}>
          {FOOTER_GROUPS.map(g => (
            <div key={g.heading}>
              <Caps>{g.heading}</Caps>
              <ul
                style={{
                  margin: '16px 0 0',
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                {g.links.map(l => (
                  <li key={l}>{link(l)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="cr11-footcell">
          <Caps>Newsletter</Caps>
          <p
            style={{
              margin: '16px 0 0',
              maxWidth: 320,
              fontSize: 14,
              color: 'var(--color-text-secondary)',
            }}>
            The lesson teardowns and studio notes we write for instructors, sent
            once a week.
          </p>
          <NewsletterForm />
        </div>
      </div>

      {/* the reference's baseline row, and where the legal set belongs */}
      <div
        className="cr11-footbase"
        style={{
          marginTop: sm ? 64 : 56,
          borderTop: '1px solid var(--color-border)',
          paddingTop: 32,
          display: 'flex',
          flexDirection: lg ? 'row' : 'column',
          alignItems: lg ? 'center' : 'stretch',
          justifyContent: lg ? 'space-between' : 'flex-start',
          gap: 20,
        }}>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          © {new Date().getFullYear()} Waypoint. A demo template. Every figure
          here is written for it.
        </p>
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 24,
            rowGap: 8,
          }}>
          {FOOTER_LEGAL.map(l => (
            <li key={l}>{link(l)}</li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

// ─── FAQ (the reference's FaqStepRows) ──────────────────────────────────────
/** The questions people ask before they enrol: rows a whole container
 *  wide — the group label in caps, the question in the heading face, the
 *  arrow disc that turns down — and the open row a slab of the brand's
 *  tint, its answer indented under the question. The first row opens with
 *  the page (a stack of closed rows reads as a list rather than as
 *  something that opens). */
function FaqStepRows() {
  const [open, setOpen] = useState(0);
  const items = COURSE.faqs;
  // The reference's SectionHeading steps: 36 from sm, 48 from lg.
  const sm = !useIsMobile(639);
  const lg = !useIsMobile(1023);
  return (
    <section style={{width: '100%'}} aria-labelledby="faq-heading">
      <div className="cr7-faqhead">
        <div>
          <Eyebrow>Enrolling</Eyebrow>
          <Text
            as="h2"
            id="faq-heading"
            style={{...sectionHeadingStyle(sm, lg), marginTop: 20}}>
            What people ask before they enroll
          </Text>
        </div>
        <p
          style={{
            margin: 0,
            maxWidth: 448,
            fontSize: 16,
            color: 'var(--color-text-secondary)',
          }}>
          A person answers anything this list does not.{' '}
          <span
            style={{
              textDecorationLine: 'underline',
              textUnderlineOffset: 4,
              color: 'inherit',
            }}>
            Ask us
          </span>
          .
        </p>
      </div>

      <ul style={{margin: '56px 0 0', padding: 0, listStyle: 'none'}}>
        {items.map((f, i) => {
          const on = open === i;
          const afterOpen = i > 0 && open === i - 1;
          const last = i === items.length - 1;
          return (
            <li
              key={f.q}
              className={`cr7-faqrow${on ? ' cr7-tintslab' : ''}`}
              data-open={on}
              data-after-open={afterOpen}
              data-last={last}>
              <div style={{paddingBlock: 4}}>
                <button
                  type="button"
                  onClick={() => setOpen(on ? -1 : i)}
                  aria-expanded={on}
                  className="cr7-faqbtn">
                  <span className="cr7-faqcaps">
                    <Caps
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: on ? 'var(--color-text-primary)' : undefined,
                      }}>
                      {String(i + 1).padStart(2, '0')} · {f.group}
                    </Caps>
                  </span>
                  <span className="cr7-faqq">{f.q}</span>
                  {/* the reference's disc: an arrow pointing on, that turns
                      down to the answer as the row opens */}
                  <span aria-hidden="true" className="cr7-faqdisc">
                    <ArrowRightIcon
                      className="cr7-faqarrow"
                      style={{width: 16, height: 16}}
                    />
                  </span>
                </button>
              </div>

              {/* The answer eases open to its own height rather than
                  appearing — the reference's grid-rows 0fr → 1fr over 300ms
                  ease-out, the clip overflowing hidden inside — and stays
                  mounted and inert while shut, so a screen reader does not
                  read six answers nobody opened. */}
              <div className="cr7-disclosure" data-open={on} inert={!on}>
                <div className="cr7-clip">
                  <p className="cr7-faqa" style={{margin: 0}}>
                    {f.a}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Block: a long-read part with its heading and hairline ──────────────────
/** The reference's own rhythm (course-overview.tsx): the first part of the
 *  long read carries no top margin below lg (the grid's gap-10 parts it
 *  from the panel above) and mt-16 from lg; every other part, mt-14/pt-14
 *  below lg stepping to mt-16/pt-16 from it. The margins live on the parts
 *  themselves, so no parent gap rides on top of them. */
function Block({
  id,
  title,
  first,
  narrow,
  rhythm,
  children,
}: {
  id?: string;
  title: ReactNode;
  first?: boolean;
  /** Below lg — the one-column composition. */
  narrow?: boolean;
  /** The rhythm in force: 56 below lg, 64 from it. */
  rhythm: number;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        marginTop: first ? (narrow ? 0 : rhythm) : rhythm,
        ...(first
          ? {}
          : {borderTop: '1px solid var(--color-border)', paddingTop: rhythm}),
      }}>
      <Text
        type="display-2"
        as="h2"
        style={{...h2Style, marginBottom: 24, display: 'block'}}>
        {title}
      </Text>
      {children}
    </section>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function CourseDetailTemplate() {
  // The reference's own composition steps: its container padding (px-6 →
  // sm:px-8), its section rhythm (gap-32 → sm:gap-40), and the one that
  // matters most — the two-column grid forms at lg (1024), not at a phone
  // width. Below lg the page is one column in reading order: the title
  // centered over the full-width poster, the facts, the panel, then the long
  // read — which is why the reference's title never stands far from its
  // preview and its poster is never squeezed into half a screen.
  const isTiny = useIsMobile(639); // below sm
  const isNarrow = useIsMobile(1023); // below lg — one column
  const isXl = !useIsMobile(1279); // xl and up — the wider rail
  const railWidth = isXl ? RAIL_XL : RAIL_LG;
  const heroGap = isXl ? 64 : 48; // xl:gap-x-16 / lg:gap-x-12
  const rhythm = isNarrow ? RHYTHM_LG : RHYTHM_XL; // mt-14|pt-14 → mt-16|pt-16

  // The long read, shared by both compositions. The blocks carry their own
  // margins (the reference's mt-14/pt-14 stepping to mt-16/pt-16 at lg), so
  // no parent gap is added on top of them.
  const aboutBlock = (
    <Block title="About this course" first narrow={isNarrow} rhythm={rhythm}>
      <VStack gap={6}>
        <Text type="body" style={{width: '100%', maxWidth: 576}}>
          Most courses show you what a model can do. This one makes you build
          the three features every product team is asked for — retrieval that
          answers the right question, output you can hand to other code, and an
          evaluation harness that catches regressions before your users do.
          Every module ends in something that runs; the reviewed project is a
          working extraction pipeline you can adapt.
        </Text>
        <Caps>Skills you practice</Caps>
        <HStack gap={2} wrap="wrap">
          {COURSE.skills.map(s => (
            <button
              key={s}
              type="button"
              style={{
                display: 'flex',
                height: 40,
                alignItems: 'center',
                borderRadius: 'var(--radius-element)',
                background: 'var(--color-background-card)',
                paddingInline: 16,
                fontSize: 14,
                boxShadow: 'var(--shadow-low)',
                border: 'none',
                cursor: 'pointer',
                transition:
                  'box-shadow var(--duration-fast) var(--ease-standard)',
              }}>
              {s}
            </button>
          ))}
        </HStack>
      </VStack>
    </Block>
  );
  const syllabusBlock = (
    <Block title="Syllabus" narrow={isNarrow} rhythm={rhythm}>
      <Syllabus />
    </Block>
  );
  const coversBlock = (
    <Block title="What the price covers" narrow={isNarrow} rhythm={rhythm}>
      <Covers />
    </Block>
  );
  const instructorBlock = (
    <section
      id="instructor"
      style={{
        marginTop: rhythm,
        borderTop: '1px solid var(--color-border)',
        paddingTop: rhythm,
      }}>
      <Text
        type="display-2"
        as="h2"
        style={{...h2Style, marginBottom: 24, display: 'block'}}>
        Your instructor
      </Text>
      <Instructor />
    </section>
  );

  // One column, in the reference's own reading order (course-overview.tsx:
  // max-lg:order-1…5): head, poster, details, panel, long read, every part
  // parted by the grid's gap-10 (40px).
  const mobileBody = (
    <VStack gap={0} style={{gap: 40}}>
      <HeadBlock />
      <Poster />
      <DetailsBlock />
      <EnrollPanel />
      <VStack gap={0} style={{gap: 0}}>
        {aboutBlock}
        {syllabusBlock}
        {coversBlock}
        {instructorBlock}
      </VStack>
    </VStack>
  );

  // From lg: the title's column on the right, the poster and the long read
  // down the left — the rail at the reference's lg (22rem) and xl (26rem)
  // widths — and ONLY the panel sticks at lg:top-20 inside the rail, which
  // stretches to the long read's height, so the head and the facts scroll
  // away and the price card rides down beside the syllabus, exactly as the
  // reference holds it.
  const desktopBody = (
    <HStack
      vAlign="stretch"
      gap={4}
      style={{gap: heroGap, alignItems: 'stretch'}}>
      <StackItem size="fill">
        <VStack gap={0} style={{gap: 0}}>
          <Poster />
          {aboutBlock}
          {syllabusBlock}
          {coversBlock}
          {instructorBlock}
        </VStack>
      </StackItem>
      <VStack gap={0} style={{width: railWidth, flexShrink: 0, gap: 0}}>
        <HeadBlock />
        <VStack
          gap={5}
          style={{
            marginTop: 40,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 40,
            width: '100%',
          }}>
          <DetailsBlock />
        </VStack>
        {/* #2613: no sticky prop on Astryx layout primitives — the panel's
            slot style. The reference's mt-12 (48px) clears the fold. */}
        <VStack
          gap={5}
          style={{
            position: 'sticky',
            top: stickyTop,
            marginTop: 48,
            zIndex: 1,
            width: '100%',
          }}>
          <EnrollPanel />
        </VStack>
      </VStack>
    </HStack>
  );

  const reviewsHeadingRow = (
    <span style={{display: 'flex', alignItems: 'center', gap: 10}}>
      {/* the star held against the figure it belongs to, 2px off it as on
          the teacher's card */}
      <SrOnly>Reviews, rated </SrOnly>
      <StarFig value={COURSE.rating} size={24} bold />
      <span aria-hidden="true">·</span>
      <span style={{fontVariantNumeric: 'tabular-nums'}}>
        {figure(COURSE.reviewCount)} reviews
      </span>
    </span>
  );

  return (
    // cr13-root carries the page's motion tokens (display:contents keeps
    // the wrapper out of the layout entirely) and answers the
    // html:has(.cr13-root) smooth-anchor rule; the player's dialog renders
    // inside it, so its buttons inherit the tokens too.
    <div className="cr13-root" style={{display: 'contents'}}>
      <PreviewProvider>
        {/* height="auto": the page scrolls the WINDOW, as the reference's
          does — "fill" would make the content an internal scroll box, and
          position: sticky never rides relative to the window through one
          (the documented reason the reference's panel rides beside the
          syllabus). */}
        <Layout
          height="auto"
          contentWidth={1280}
          content={
            // isScrollable={false}: the content must NOT become its own scroll
            // box — position: sticky never rides relative to the window through
            // an overflow:auto ancestor, and the reference's panel rides beside
            // the syllabus down the window's own scroll.
            <LayoutContent padding={isTiny ? 6 : 8} isScrollable={false}>
              <style>{hoverStyles}</style>
              {/* The reference's main rhythm (gap-32 → sm:gap-40) parts its
                sections — the course page, the related rail, the FAQ, the
                closing band — while the course section's own parts (the
                breadcrumb, the grid, the reviews) sit on the block rhythm
                inside it. */}
              <VStack gap={10} style={{gap: isTiny ? 128 : 160}}>
                <VStack gap={0}>
                  {/* The breadcrumb over the grid, parted by the reference's
                    mt-6 → lg:mt-8 (24/32px), inside the course section.
                    The reference's own trail: a chevron between the steps,
                    the linked steps muted, the page itself last and
                    truncated (site/breadcrumb.tsx). */}
                  <nav
                    aria-label="Breadcrumb"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      columnGap: 6,
                      rowGap: 4,
                      fontSize: 14,
                      marginBottom: isNarrow ? 24 : 32,
                      maxWidth: '100%',
                    }}>
                    {[
                      {label: 'Courses', href: '#', muted: true},
                      {label: COURSE.topic, href: '#', muted: true},
                      {label: COURSE.title, muted: false},
                    ].map((c, i) => (
                      <span
                        key={c.label}
                        style={{
                          display: 'flex',
                          minWidth: 0,
                          alignItems: 'center',
                          gap: 6,
                        }}>
                        {i > 0 && (
                          <ChevronRightIcon
                            aria-hidden="true"
                            style={{
                              width: 16,
                              height: 16,
                              flexShrink: 0,
                              color: 'var(--color-text-secondary)',
                            }}
                          />
                        )}
                        {c.muted ? (
                          <span
                            style={{
                              color: 'var(--color-text-secondary)',
                              textDecorationLine: 'underline',
                              textDecorationColor: 'transparent',
                              textUnderlineOffset: 4,
                            }}>
                            {c.label}
                          </span>
                        ) : (
                          <span
                            aria-current="page"
                            style={{
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'var(--color-text-primary)',
                            }}>
                            {c.label}
                          </span>
                        )}
                      </span>
                    ))}
                  </nav>
                  {isNarrow ? mobileBody : desktopBody}
                  {/* The reviews run the container's whole width under both
                    columns, as the reference lays its own under the listing:
                    the panel stops riding at the teacher, the scores take a
                    cell each across the page, and the list runs two abreast
                    with rules between. The rating is the heading. */}
                  <Block
                    id="reviews"
                    title={reviewsHeadingRow}
                    narrow={isNarrow}
                    rhythm={rhythm}>
                    <Reviews />
                  </Block>
                </VStack>
                <RelatedRail />
                <FaqStepRows />
                <ClosingCta />
              </VStack>
              {/* the footer, outside main's rhythm as the reference keeps it
                (a hairline across the page is what says the page has
                stopped) */}
              <SiteFooter />
            </LayoutContent>
          }
        />
      </PreviewProvider>
    </div>
  );
}
