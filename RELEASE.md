# Release checklist

Work happens on `main`; every push deploys to GitHub Pages. A release is a version bump plus these checks.

## 1. Before

- [ ] `npm run check` passes (typecheck, lint, format, unit tests including every level).
- [ ] `npm run validate-levels` passes.
- [ ] `npm run build && npm run size` is within the 300 KB budget.
- [ ] `npm run test:e2e` passes (three phone sizes).
- [ ] New levels: `npm run solve -- --write-par` run, and each played once by hand.
- [ ] New content: SPEC.md updated in the same change.
- [ ] Save format changed? `SAVE_VERSION` bumped, a migration added, and a test that loads a save from the previous version.
- [ ] Anything affecting the Daily Roll? Past dates must generate exactly the same floors (the golden daily test).

## 2. Version

- [ ] Bump `version` in `package.json` (`npm version X.Y.Z --no-git-tag-version`).
- [ ] Add a CHANGELOG.md entry: what players will notice, in plain words.
- [ ] Update README "Status" if a milestone changed.

## 3. Ship

- [ ] Commit and push to `main`.
- [ ] CI (`.github/workflows/ci.yml`) and Deploy (`pages.yml`) both green.
- [ ] Open https://net13200.github.io/Six-Sided-Knight/ and check the version on the title screen.
- [ ] Optional: create a GitHub release for the tag `vX.Y.Z` on github.com (tags can't be pushed from the automation environment).

## 4. On a real phone (for bigger releases)

- [ ] Installed app opens standalone; the splash plays; updates arrive (the "New version ready" bar after 10+ minutes in the background, or on the next launch).
- [ ] Airplane mode: the game opens and a level and a Daily floor can be played.
- [ ] A few levels at 60 fps (Chrome: Performance overlay or `?perf`).
- [ ] TalkBack/VoiceOver: moves are announced; Settings toggles read correctly.
- [ ] Old progress still there after updating.
