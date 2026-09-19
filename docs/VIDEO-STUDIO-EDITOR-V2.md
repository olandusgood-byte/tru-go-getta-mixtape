# TGG Video Studio V2 Workstation

The professional editor shell is served by TGG Core at `/video-studio/`.

## Workstation

- Dashboard, Edit, Color, Audio, Captions and Deliver workspaces.
- Multi-track timeline with clip selection, drag, split, delete, duplicate, snapping, zoom and playhead.
- Project media, effects, titles, transitions and audio-FX browsers.
- Realtime preview controls, safe guides, grid, scopes and render panel.
- Local autosave plus optional TGG Core project/version persistence.
- Private creator media uses the `creator-media` bucket.
- Browser master rendering uses MediaRecorder where supported.
- Existing GitHub OIDC + FFmpeg pipeline remains the production server-render contract.

## Load strategy

1. Framework-free static editor shell.
2. Editing starts before cloud/dashboard data is required.
3. Imported media uses local object URLs and metadata preload.
4. Preview defaults to half-resolution and supports Full, 3/4, 1/2 and 1/4.
5. Preview redraw is dirty/playback driven.
6. Cloud media uses binary streaming instead of JSON/base64.
7. Service worker caches the shell; HTML remains network-first.
8. CSS/JS use short cache plus stale-while-revalidate.

## Blogger integration

Keep Blogger as the navigation/launch surface and launch the editor at:

`https://tgg-core.onrender.com/video-studio/`

Do not paste the complete workstation into a Blogger page. Keeping the editor standalone reduces theme conflicts and makes upgrades faster.

## Render boundary

V2 handles composition, project state, private media sync, browser master creation and export registration in TGG Core. Production FFmpeg transcode/publish remains on the existing GitHub OIDC render worker contract documented in `VIDEO-STUDIO-RENDER-PIPELINE.md`.
