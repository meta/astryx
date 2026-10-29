---
'@astryxdesign/cli': patch
---

[docs] The theme authoring guide, and the comment in the theme file `astryx init` and `astryx theme template` write, say an extending theme's `motion` inherits field by field: the child's `fast`, `medium` and `ratio` regenerate the fast and medium duration tokens, and `slow` or `easing` left unset keep the base theme's tokens (an inherited slow band stays at the base's ratio). It used to say the child's motion config replaced the base's entirely.

@cixzhang
