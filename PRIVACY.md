# Privacy

Short version: **Six Sided Knight collects nothing about you and sends nothing anywhere.**

## What is stored, and where

Everything stays in your browser's local storage on your device:

| Key                       | What                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssk.save`                | Your progress: stars, best moves and times, crowns, faces bought, your die, skin, settings, daily streak and results, Depths record, lifetime totals. |
| `ssk.analytics`           | Play statistics (see below). Deleted when you turn Play statistics off.                                                                               |
| `ssk.save.corrupt.<time>` | Only if a save ever becomes unreadable: a copy kept so it could be recovered.                                                                         |
| `ssk.settings.v1`         | Only on devices that played version 0.2: old sound setting, read once.                                                                                |

Clearing the site's data in your browser deletes all of it. There are no accounts and no cookies.

## Play statistics

Used for the hidden on-device KPI panel that helps tune level difficulty. Events are game facts only (for example "level c2-04 completed in 12 moves"), a random install id that never leaves the device, timestamps and the game version. At most 3000 events are kept. **Nothing is sent anywhere.** Turn it off in Settings; turning it off deletes what was stored.

## Network

- The game itself is downloaded from GitHub Pages (`net13200.github.io`), like any website; GitHub's own privacy policy applies to that request.
- After that the game makes no requests except, when it comes back to the foreground after 10+ minutes, re-reading its own page from the same site to see if a newer version is out.
- No third-party scripts, fonts, analytics, trackers or ads. The splash font is bundled.
- **Share** uses your device's share sheet or clipboard; the text is only the day's result (date, stars, moves, HP, streak) and a link. Nothing is shared unless you tap it.
