# TGG Core

TGG Core is the first TGG-owned backend layer replacing application dependence on Supabase.

## Current services

- PostgreSQL data layer
- Auth + 30-day sessions
- Artist profiles
- Releases/tracks data model
- Media object metadata
- TGG World missions/evidence/rewards
- Crew data model
- Realtime event log + PostgreSQL NOTIFY
- REST API

## API

- GET /health
- POST /v1/auth/register
- POST /v1/auth/login
- POST /v1/auth/logout
- GET /v1/me
- GET/POST /v1/artists/me
- GET/POST /v1/releases
- GET /v1/missions
- POST /v1/realtime/publish
- GET /v1/realtime/events

The frontend can migrate to this API without changing the TGG domain model.

## Deployment

The service expects:

- DATABASE_URL
- PORT (Render supplies this)
- optional TGG_TOKEN_SECRET
- optional DATABASE_SSL=false for local Postgres

The schema is applied automatically at startup. Production deployments should later move schema changes into versioned migrations.
