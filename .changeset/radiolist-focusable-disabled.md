---
'@astryxdesign/core': patch
---

[fix] RadioList: a disabled radio stays reachable by keyboard and announces as disabled, with or without a `disabledMessage`. It renders `aria-disabled` instead of native `disabled`, refuses selection, runs no `onClick`, and, once the page hydrates, submits no value. Arrow keys keep skipping an individually disabled option, and a focused disabled option shows the focus ring. A disabled group's radios render under the group's internal name instead of `htmlName`, since they submit nothing; this keeps two disabled groups that share an `htmlName` in different forms apart.

Before, a disabled radio rendered native `disabled`, so Tab skipped a group disabled without a reason and a screen reader moving by focus never reached it. Now it takes focus and is announced as disabled. Accessibility target: WCAG 2.2 SC 2.1.1 and 4.1.2, `spec:AST-085` FR1–FR4 (disabled controls stay focusable), and the WAI-ARIA radio group pattern. Arrow keys now stay put in a wholly disabled group.

Server-rendered markup has no native `disabled` either, so a disabled radio is focusable before hydration. Before the page hydrates, an individually disabled option can still be checked by a click or the arrow keys, and a form submits a checked one, including one selected from the start. A click can also check a radio of a wholly disabled group before hydration, but that group submits nothing.

@korkt-kim also proposed keeping a disabled radio focusable and inert in #9301.

@cixzhang @duytbp
