# TGG Video Studio Render Pipeline

Production contract: V565 browser editor + V563/V566 server render runtime.

## Browser master

The Video Studio compositor is authoritative for creative composition. It renders the timeline, tracks, captions/titles, transitions, keyframes, audio automation and browser-supported FX into one master.

Preferred browser container is MP4/H.264 + AAC when `MediaRecorder.isTypeSupported()` reports support. The fallback is WebM/Opus. The actual format, MIME type, duration, dimensions, aspect ratio, resolution and source revision travel with the render event and secure upload metadata.

## Private staging

Server transcoding never receives public media URLs. The browser master is finalized into the private `creator-media` bucket and represented by a `tgg_media_vault_assets` video asset. V564 stages the current rendered master once and caches that source asset until a fresh browser render invalidates the cache.

## Queue

`tgg_video_studio_queue_transcode_v1` queues MP4 master transcodes for `720p`, `1080p`, `2160p` or `source`. V565 makes the request idempotent for the same creator, project, revision, source asset and preset so repeat clicks do not create duplicate active/ready jobs.

Render jobs are revision locked. Stale queued jobs fail rather than silently rendering a newer edit, and stale results are rejected at completion.

## Secretless GitHub worker

Workflow: `.github/workflows/tgg-video-render-worker.yml`

Probe: `scripts/tgg-video-render-probe.mjs`

Worker: `scripts/tgg-video-render-worker.mjs`

The workflow uses GitHub OIDC (`id-token: write`) with audience `tgg-video-render-worker`. No Supabase service/secret key is stored in the repository or workflow. `tgg-media-operations` validates the GitHub token and brokers only the render-worker operations.

The scheduled probe runs every five minutes. It registers a worker heartbeat and claims a job only when one is available. If the queue is empty, FFmpeg and the TUS client are not installed. If work exists, the probe writes the lease manifest to the runner temp directory and the heavy worker resumes that exact lease in the same run.

## Broker boundary

The OIDC broker is `tgg-media-operations`. The worker is restricted to the expected GitHub repository/workflow/ref and GitHub-hosted runtime. The broker exposes only:

- worker register
- render claim
- lease heartbeat
- short-lived private source download URL
- signed private output upload ticket
- render completion
- render failure

The Supabase service credential remains inside Supabase.

## FFmpeg output

Server output is H.264 (`libx264`) + AAC, `yuv420p`, with `+faststart`. Scaling is orientation aware:

- landscape 1080p targets 1920x1080-class output
- portrait 1080p targets 1080x1920-class output
- square targets equal edges
- 2160p uses the corresponding 4K-class short edge
- source leaves dimensions unchanged

A push-time GitHub Actions smoke gate generates synthetic landscape and portrait media and verifies H.264, AAC and the expected 1080p dimensions. This synthetic test does not touch creator media.

## Completion and publishing

A completed server MP4 is registered as a reusable private Media Vault asset and as a render output. The V565 job panel shows queued/processing/progress/ready/failed state. A creator with publish permission can submit a ready server MP4 into the existing admin-review video flow. Submission is idempotent per completed render job.

## Runtime health

`tgg_video_studio_render_readiness` treats the GitHub FFmpeg provider as connected only when a valid `online` worker heartbeat is recent. V566 indexes provider/status/last-seen lookup and prunes run-specific heartbeat rows older than 24 hours during worker registration.

The protected Blogger baseline remains unchanged; Video Studio changes are represented only by the additive page-hash allowance.

## Evidence boundary

The OIDC broker, scheduled worker, codec/orientation smoke, browser-to-private staging, queue contract, progress UI and publish handoff are all live. A true end-to-end private creator-media transcode is considered proven only after a creator actually renders a browser master and queues a server MP4; synthetic CI media is not reported as creator-media proof.
