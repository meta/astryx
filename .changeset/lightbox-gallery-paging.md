---
'@astryxdesign/core': patch
---

[feat] A Lightbox gallery now pages the way the iOS Photos viewer does. On a phone or tablet, drag or flick between items: the row follows your finger, and the release lands on the next or previous item, one at most. A gap of 40 px separates the items while they move. A zoomed photo pans with your finger until it reaches its edge; a new drag from that edge moves to the next item. A photo you leave zoomed returns to its fitted size once the gallery rests. Under a finger, the previous and next buttons and the arrow keys slide to the item instead of swapping it in place.

Each item's caption moves with its item, right under its photo. `onIndexChange` also reports a swipe.

Lightbox now loads its touch code with it, as Toast and Slider do. Its import grows from 51.4 KB to 99.6 KB gzip with the zoom and paging beneath, mostly shared touch modules that a page loads once; Lightbox's own code adds 14.1 KB minified.

@vjeux
