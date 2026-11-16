---
'@astryxdesign/core': patch
---

[fix] A Table inside a Stack or another wrapper no longer reaches past its container's top or bottom padding. Before, a Table that was the last item of a Stack inside a Section, Card or Dialog pulled that Stack short, and the content after it overlapped the table's last row. Now a Table reaches a container's top or bottom edge only when it is that container's direct first or last child, the same rule its rounded corners follow. A Table that is a direct child looks the same as before, except when another Table or a bleeding List sits deeper in the same container: then the direct-child Table also keeps the container's padding at that edge, as its rounded corners already did. A Table nested in a Stack keeps the container's padding above and below it. Its sides still reach the container's edges as before.

@josephfarina
