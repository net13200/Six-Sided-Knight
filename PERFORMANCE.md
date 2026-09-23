# Performance

Target: 60 fps on a mid-range phone, a small download, and no waiting.

## How it was measured

- Production build (`npm run build`, `vite preview`) in Chromium 1.63's bundled browser, emulating a Pixel-class phone: 412x915 CSS px, device pixel ratio 2.625, touch.
- **CPU slowed 4x** with the DevTools protocol (`Emulation.setCPUThrottlingRate`), the usual stand-in for a mid-range phone. Network: local, and "fast 3G" (1.6 Mbps, 150 ms latency).
- `?perf` in the URL records how long each frame's update + drawing takes (`window.__ssk.perf()`, last 600 frames). `?perf=flush` also waits for the canvas to finish painting.
- **Caveat:** the test machine has no GPU, so Chromium paints the canvas in software. Real phones paint 2D canvases on the GPU, so the "incl. painting" numbers below are pessimistic; the main-thread numbers are what a phone's CPU actually pays. No physical device was used; re-check on one before a big release (see RELEASE.md).

## Results (0.6.0)

Main-thread work per frame (update + drawing commands), CPU slowed 4x:

| Screen                            | Average | 95th percentile |
| --------------------------------- | ------- | --------------- |
| Title screen                      | 1.2 ms  | 2.2 ms          |
| Level 10 (crowd of enemies)       | 3.4 ms  | 4.7 ms          |
| Level 36 (ice rink, archer lanes) | 2.6 ms  | 3.6 ms          |
| Level 58 (ice, golem, skeleton)   | 3.6 ms  | 6.3 ms          |

The budget for 60 fps is 16.7 ms, so even at 4x slower there is 3-5x headroom. Unthrottled, including software painting, every screen runs a steady 60 fps (p95 frame interval 16.7-16.8 ms).

Loading (CPU 4x):

| Network | First paint | Title screen ready |
| ------- | ----------- | ------------------ |
| Local   | 0.12 s      | 0.47 s             |
| Fast 3G | 0.40 s      | 0.95 s             |

The SugiGames splash (about 4 s) covers loading completely. Memory: about 7.4 MB of JavaScript heap after playing several levels; it does not grow with play (undo history is per level).

Download: about 160 KB in total including icons and fonts; the game itself (HTML + JS + CSS) is about 64 KB gzipped. Budget: 300 KB, enforced in CI by `npm run size`.

Level generation (Daily Roll, Depths), in the Web Worker, on the test machine (not slowed): easy floors about 70 ms, medium about 100 ms, the hardest Depths band about 0.6 s on average (worst 1.8 s). The next floor is generated in the background while the current one is played, so this is normally never seen.

## What was changed

- **Cached board tiles.** The tiles are drawn once into an offscreen image and redrawn only when a tile changes (a door opens, a gem is taken). Only animated tiles (gems, pools, the exit) and tiles mid-change are drawn each frame. Ice glints were made static for this.
- **Canvas pixel density capped at 2x** (was 3x). On a 2.6x phone that is about 40% fewer pixels to paint every frame, with no visible loss of sharpness at this art size.
- **Half-rate idle drawing.** When nothing is moving on the play screen (only gentle idle animation), it redraws every other frame. Input and all move animations run at the full 60 fps.
- **Archer lanes** are computed once per game state instead of every frame.
- **Depths difficulty plateau** lowered to the band the generator reliably reaches (56-72, was 70-86). Aiming higher only made it try all 24 attempts for nothing: the deepest floors now generate about 4x faster.
- **Smaller app icons.** The soft glow in the icon made the PNGs 5x bigger; a flat halo keeps the look at 95 KB for all four icons (was 260 KB).

## Re-measuring

```sh
npm run build && npx vite preview --port 4173
# then open http://localhost:4173/?perf (or ?perf=flush), play, and in the console:
#   __ssk.perf()           // per-frame milliseconds
npm run size               # download size vs budget
npm run generate -- --sweep 20 --band 56,72   # generator timing
```
