Original prompt: Analysiere das Project/Game. Nutze alle zur verfuegung stehenden skills aus [.agents](.agents/) und mach das Game cooler, besser!

## 2026-06-21

- Added a night-atmosphere feature: `src/scene/Fireflies.ts`.
- Integrated it into the persistent rig in `src/main.ts` and field syncing in `src/game/GameSession.ts`.
- Documented the feature in `docs/DEVELOPMENT.md`.
- `pnpm build` passes.
- Browser verification passed with a disposable Playwright script: new game, night, clear weather, 75 visible particles, opacity 0.6, no page/console errors.
- Inspected the screenshot visually; the glow reads as small night fireflies around the farm.
- Cleaned up the disposable script and screenshot.
