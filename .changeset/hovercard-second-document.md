---
'@astryxdesign/core': patch
---

[fix] A `HoverCard` rendered into another document, such as an iframe or a Picture-in-Picture window, now closes when Escape is pressed there, and Escape from inside the card returns focus to its trigger. Moving focus from the trigger into such a card also keeps it open. Before, the card read only the page's document, so Escape in the other document never closed it. The card now also ranks on the shared dismissal stack by its trigger's place, so a card whose trigger sits inside a focus-trap container takes Escape before that container, as the topmost layer.

@cixzhang @duytbp
