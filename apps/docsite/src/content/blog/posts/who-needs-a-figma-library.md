---
title: 'Who needs a Figma Library?'
description: 'Introducing the Astryx Figma Library, built and self-maintained by a Night Watch that keeps it in sync with code on every dot release.'
date: '2026-08-05'
type: 'update'
authors:
  - 'ernest'
tags:
  - 'Figma'
  - 'AI'
  - 'Release'
coverImage: '/blog/who-needs-a-figma-library/cover.png'
coverAlt: 'A Figma canvas showing an Astryx Button component — a dark, rounded button with the Astryx logo, the word Astryx, and a dropdown chevron — selected with its component boundary and a cursor hovering the chevron'
relatedDocs:
  - title: 'Vibe Test'
    href: '/blog/vibe-tests'
  - title: 'How Astryx works'
    href: '/blog/how-astryx-works'
---

Well, we got one for you [here](https://www.figma.com/community/file/1659998707120781098)!

To be honest, we contemplated for a long time if we even needed a Figma library. Internally we saw a sharp 95% drop in our weekly insertion rate. And most designers around us are designing through code and not canvas. We wondered about the place that Figma serves in our design workflow…

What made us still want to give it a try is when we found ourselves still turning back to Figma in certain situations. It is still the fastest way to do rapid explorations and create visual assets. Though we no longer use it as a speccing or hand off tool, it's still useful as a sketchpad. Plus seeing how quickly community built Figma libraries popped up really motivated us. (Shoutout to [Lee](https://www.figma.com/community/file/1655939158795671259/astryx-for-figma) and [Adrian](https://www.figma.com/community/file/1661363854016665156/astryx-design-system-for-figma-v0-1). Go check out their libraries too!)

We decided that we would put something out if we can generally automate the building and maintenance of it. So that's what we did! We are putting out this [Astryx Figma Library](https://www.figma.com/community/file/1659998707120781098) as an experiment on two fronts:

1. Is there still a place for Figma library in the designer's workflow?
2. Can we automate it so the effort to reward trade off is in balance?

## Figma Librarian Night Watch

This Astryx Figma library is largely built and will be maintained by a Night Watch (Astryx's cron job set up) called the [Figma Librarian](https://github.com/meta/astryx/wiki/Night-Watch-Figma-Librarian). It is connected to the [Figma MCP](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server) and is given a set of component build skills that includes our build preferences like, "always use a slot feature in reflection of a react node in code". The librarian checks for relevant changes to the system on every dot release and self maintains the library so it can stay up to date.
