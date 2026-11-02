---
'@astryxdesign/core': patch
---

[fix] RadioList: a disabled radio stays reachable by keyboard and announces as disabled, with or without a `disabledMessage`. It renders `aria-disabled` instead of native `disabled`, refuses selection, runs no `onClick`, and submits no value. Arrow keys keep skipping an individually disabled option, and a focused disabled option shows the focus ring. A disabled group's radios render under the group's internal name instead of `htmlName`, since they submit nothing; this keeps two disabled groups that share an `htmlName` in different forms apart.

Before, a disabled radio rendered native `disabled`, so Tab skipped a group disabled without a reason and a screen reader moving by focus never reached it. Now it takes focus and is announced as disabled. Accessibility target: `spec:AST-085` FR1–FR4 (disabled controls stay focusable) and the WAI-ARIA radio group pattern.

One known gap remains: a form submitted before the page hydrates still includes a selected, individually disabled radio's value. It is excluded once the page hydrates (RadioListItem FR6).

@korkt-kim also proposed keeping a disabled radio focusable and inert in #9301.

@cixzhang @duytbp
