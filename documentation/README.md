# Sprite replacements

Generated from the original Nexus data, the Baram classic data, and the current `Release/` DATs. Each category has its own page. Previews show frame index 6 of each sprite before and after replacement, using the Nexus palette.

Sprite IDs come from the DSC files. The current splice starts writing body frames at sprite 0 even though its configured loop label begins at 2. Weapon writes advance 19 frames per group while DSC sprites have 20 frames, so the affected IDs can differ from the configured loop range.

One EPF frame can contain multiple visible shapes. For example, sword sprite 39 has two sword shapes in its original frame 6 PNG; its row still contains only one Original and one Released PNG.

| Sprite type | Affected sprites |
| --- | ---: |
| [Body](body.md) | 125 |
| [Fan](fan.md) | 6 |
| [Shield](shield.md) | 25 |
| [Spear](spear.md) | 49 |
| [Sword](sword.md) | 141 |

**Total: 346 sprites.**

