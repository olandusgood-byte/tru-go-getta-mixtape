# V5700 — Public RPC Contract Hardening

V5700 replaces guessed homepage-response mapping with the exact live Supabase
contracts.

## Verified contracts

`tgg_public_discovery_growth_feed(integer,text)` returns one JSON object whose
release array is at `items`. The live version is `GROWTH-005`. Each item uses
`release_id`, `stage_name`, `first_track_id`, and `first_track_title`; it does
not return the nested `artists` and `tracks` objects expected by the old direct
table query.

`tgg_public_launch_mix(integer)` returns its release array at `releases` and
includes the real `featured` flag. The live version is
`PUBLIC-LAUNCH-MIX-1.1`. The current sample contains two releases and zero
featured releases, which must render as a valid empty featured state.

## Adapter corrections

- Read the growth feed from `payload.items`.
- Map `release_id` to the existing card `id` interface.
- Construct a one-item track array from `first_track_id` and
  `first_track_title`.
- Deliberately discard `first_track_audio_url`; protected playback remains
  track-ID based.
- Use the launch-mix contract for featured filtering.
- Treat missing or changed payload paths as errors instead of silently
  returning an empty successful result.

The growth feed is a public, anonymous-executable `SECURITY DEFINER` function.
Its current two returned items have null audio URL values, but the backend
contract still includes that field. Field minimization remains a security
follow-up before any non-null direct audio URL can enter this feed.

No database writes or schema changes were performed.
