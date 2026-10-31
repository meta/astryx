// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatVirtualizer',
  subComponentOf: 'Chat',
  group: 'Chat',
  category: 'Chat',
  displayName: 'Chat Virtualizer',
  description: 'Windowed message list for long transcripts: only the rows near the viewport are rendered, and the rest is represented by two spacer elements, so a thread of thousands of messages costs a viewport of DOM. Rows stay in normal document flow and every position correction is written as spacer height rather than a scrollTop jump, so nothing moves under an active touch gesture — corrections are absorbed while the finger is down and settle at release. Follows the newest message by default, re-engaging that follow when a user scroll lands within endThreshold of the bottom. Renders its own scroll container, or nests inside one the caller already owns (see scrollElement).',
  props: [
    {
      name: 'data',
      type: 'readonly T[]',
      description: 'Rows to render, oldest first. Changes are detected by REFERENCE, so replace the array instead of mutating it — a mutation leaves the geometry stale.',
      required: true,
    },
    {
      name: 'keyExtractor',
      type: '(item: T, index: number) => string',
      description: 'Stable identity per row, coerced with String(). The size cache and the running size averages are keyed by it, so deriving a key from the index discards every measurement whenever the list shifts.',
      required: true,
    },
    {
      name: 'renderItem',
      type: '(info: {item: T; index: number}) => ReactNode',
      description: 'Renders one row. Row spacing must live inside what this returns (padding) — container gap and margins are invisible to measurement, so the geometry would drift by one gap per row.',
      required: true,
    },
    {
      name: 'estimatedItemSize',
      type: 'number | ((item: T, index: number) => number)',
      description: 'Height assumed for rows that have not been measured yet; a function is authoritative and is never overridden by the running averages. Bias it LOW — an estimate that is too small lets content grow below you and leaves your position valid, while one that is too large shrinks the scroll range and the browser clamps your position into it.',
      default: '120',
    },
    {
      name: 'measureMode',
      type: "'ro' | 'sync'",
      description: "Where sizes come from. 'ro' reads the observed border box plus one sync read per row at mount, so steady-state commits force no layout; 'sync' re-measures the whole window in every commit's layout effect, buying zero-window corrections for a forced layout per commit.",
      default: "'ro'",
    },
    {
      name: 'apiRef',
      type: 'Ref<ChatVirtualizerHandle>',
      description: 'Imperative handle exposing scrollToDistanceFromBottomPx and anchorToKey. Both DECLARE a reference frame rather than performing one scroll: the list keeps restoring the declared position as rows measure in, so a landing is not lost to content that arrives after it.',
    },
    {
      name: 'getItemType',
      type: '(item: T, index: number) => string',
      description: 'Classifies a row so measured sizes feed a running average per type. A transcript mixing one-line tool stubs with long markdown then converges to an honest price per shape instead of one blended number.',
    },
    {
      name: 'scrollElement',
      type: 'HTMLElement | null',
      description: 'Attach mode: the scroll container the caller already owns, into which spacers and rows render as one content block instead of the list creating its own scroller. Pass the ELEMENT, not a ref: a parent\'s ref attaches after its children\'s layout effects, so a ref still reads null on the commit that first needs the scroller, and a ref mutation is invisible to React — nothing re-renders and no effect re-runs when it lands, while an element in state makes its arrival a render and a real dependency (scroll listeners, observation, and the gesture state machine are rebuilt when the container changes). Read it in a passive effect and hold it in state. Pass null (not undefined) while it is still pending: undefined means own-container mode, and one commit of that inside an unbounded parent mounts every row.',
    },
    {
      name: 'endThreshold',
      type: 'number',
      description: 'How close to the bottom, in px, a user scroll must land to re-engage following the newest message; disengaging is any upward movement past it. Too tight and a user who stops visually at the bottom (trackpad inertia, fractional row heights, page zoom) silently stops following while output grows below them.',
      default: '24',
    },
    {
      name: 'overscanTop',
      type: 'number',
      description: 'Extra px of rows kept mounted above the viewport, absorbing upward scrolls before a new window has to be computed.',
      default: '1600',
    },
    {
      name: 'overscanBottom',
      type: 'number',
      description: 'Extra px of rows kept mounted below the viewport.',
      default: '600',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description: 'Applied to the scroll container the list creates. Own-container mode only.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'Applied to the scroll container the list creates. Own-container mode only.',
    },
  ],
};

export const docsZh = {
  name: 'ChatVirtualizer',
  displayName: 'Chat Virtualizer',
  description: '面向长会话的窗口化消息列表：只渲染视口附近的行，其余用两个占位元素表示，因此上千条消息的线程只消耗一个视口的 DOM。行保持在正常文档流中，位置修正一律写入占位高度而非跳写 scrollTop，所以触摸手势进行期间内容不会移动——修正在手指按下时被吸收，松手后落定。默认跟随最新消息，用户滚动落在距底部 endThreshold 以内时重新接管跟随。可自建滚动容器，也可嵌入调用方已有的容器（见 scrollElement）。',
  propDescriptions: {
    data: '要渲染的行，按时间正序。变更通过引用比较检测，所以请替换数组而不要原地修改。',
    keyExtractor: '每行的稳定标识（内部用 String() 转换）。尺寸缓存与运行时均值都以它为键，用下标派生会在列表位移时丢弃全部测量结果。',
    renderItem: '渲染单行。行间距必须放在返回内容内部（padding）——容器的 gap 和 margin 测量不到，会让几何每行漂移一个间距。',
    estimatedItemSize: '未测量行的假定高度；传函数则以函数为准，不受运行时均值覆盖。要往小估：估小了内容向下生长、位置依然有效；估大了滚动范围收缩，浏览器会把位置钳进新范围，无法挽回。',
    measureMode: "尺寸来源。'ro' 取自观察到的 border box 加挂载时一次同步读取，稳态提交不触发布局；'sync' 在每次提交的 layout effect 里重测整个窗口，用每次提交一次强制布局换取零窗口修正。",
    apiRef: '暴露 scrollToDistanceFromBottomPx 与 anchorToKey 的命令式句柄。两者都是“声明参考系”而非执行一次滚动：行陆续测量进来时列表会持续恢复所声明的位置。',
    getItemType: '为行分类，使测量结果按类型累积均值。工具调用短行与长 markdown 混排的会话因此能收敛出各自诚实的价格，而非一个混合数字。',
    scrollElement: '接管模式：调用方已有的滚动容器，占位与行包在一个内容块里渲染进去，列表不再自建滚动容器。传元素本身而非 ref：父的 ref 在子的 layout effect 之后才装配，所以最先需要滚动容器的那次提交里 ref 仍读到 null；而且 ref 赋值对 React 不可见，落地时既不重渲染也不重跑 effect，元素存进 state 才让“到达”成为一次渲染和真正的依赖（换容器时滚动监听、观察和手势状态机都要重建）。请在 passive effect 里读出并存进 state。尚未就绪时传 null 而不是 undefined：undefined 表示自建容器模式，在不限高的父容器里哪怕只有一次提交也会挂载全部行。',
    endThreshold: '用户滚动落点距底部多少 px 才重新接管跟随；脱离则是任何越过该范围的向上移动。设得太紧，视觉上停在底部的用户（触控板惯性、小数行高、页面缩放）会在内容持续产出时悄悄停止跟随。',
    overscanTop: '视口上方额外保持挂载的行数（按 px），用于在需要重算窗口前吸收向上滚动。',
    overscanBottom: '视口下方额外保持挂载的行数（按 px）。',
    style: '应用在列表自建的滚动容器上。仅自建容器模式有效。',
    className: '应用在列表自建的滚动容器上。仅自建容器模式有效。',
  },
};

export const docsDense = {
  name: 'ChatVirtualizer',
  displayName: 'Chat Virtualizer',
  description: 'windowed msg list; rows near viewport + 2 spacers => viewport-sized DOM for 1000s of msgs; rows in document flow, corrections written as spacer height not scrollTop, so nothing moves under an active touch gesture (absorbed under the finger, settled at release); follows newest by default, re-engages within endThreshold of bottom; own scroller or attach to caller (scrollElement)',
  propDescriptions: {
    data: 'rows oldest-first; REFERENCE change detection — replace, never mutate',
    keyExtractor: 'stable id per row; keys the size cache + running averages — never index-derived',
    renderItem: 'renders one row; spacing MUST be padding inside the row, not container gap/margin',
    estimatedItemSize: 'height for unmeasured rows (fn = authoritative); bias LOW — too large shrinks the range and the browser clamps you',
    measureMode: "'ro' = observed border box + one mount read, no layout in steady state; 'sync' = remeasure window every commit",
    apiRef: 'scrollToDistanceFromBottomPx + anchorToKey; both DECLARE a frame, restored as rows measure in',
    getItemType: 'per-type running averages; keeps tool stubs from blending with long markdown',
    scrollElement: "attach mode: caller's scroller, rows render in one content block; pass the ELEMENT not a ref (parent ref attaches after child layout effects + ref writes are invisible to React) — read it in a passive effect, hold it in state; null (not undefined) while pending, else one commit mounts every row",
    endThreshold: 'px from bottom for a user scroll to re-engage follow; too tight = silent unfollow',
    overscanTop: 'px of rows mounted above the viewport',
    overscanBottom: 'px of rows mounted below the viewport',
    style: 'on the created scroller; own-container mode only',
    className: 'on the created scroller; own-container mode only',
  },
};
