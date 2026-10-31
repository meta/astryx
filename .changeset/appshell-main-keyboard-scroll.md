---
'@astryxdesign/core': patch
---

[fix] With `height="fill"`, AppShell's main region can be scrolled from the keyboard when its content overflows and has nothing focusable (WCAG 2.1.1 Keyboard). Before, main was only the skip link's target (`tabIndex={-1}`): Tab passed it by, so long text, a report or a read-only page could not be scrolled without a pointer. Now, while main scrolls overflowing content, it is a stop in the tab order and keyboard focus on it draws the standard focus ring, inset; in an elevated shell with a top nav and an inline side nav, main then takes the surface's rounded top-start corner so the ring follows it. Tab entry moves on when the first focusable element inside main is a plain link or button; otherwise main is one stop before it. A main region that fits, and `height="auto"` (where the page scrolls), are unchanged.

@vjeux
