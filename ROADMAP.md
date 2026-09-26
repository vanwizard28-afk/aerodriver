# AeroDriver Product & Technical Roadmap

## Phase 1: Foundation & Core Refactor (Current)
- [x] Responsive dark mobile UI dashboard with live flight radar visualization
- [x] Stage progression machine (Driver Guidance, Arrived, Greeting Sign, Complete)
- [x] PWA mobile installation setup with dark home screen icons
- [x] Data refactor: ISO timestamps (`pickupAt`), numeric fares (`fareAmount`), embedded stages
- [x] Delete button with 3-second red confirm safety step
- [x] Browser title & PWA metadata set to "AeroDriver"

## Phase 2: Live Integrations
- [ ] **Supabase Cloud Sync:**
  - Connect PostgreSQL database to persist jobs across mobile and desktop
  - Set up Supabase Realtime for instant multi-device screen updates
  - `flight_cache` table (`flight_no`, `fetched_at`, `payload`) for API response caching — no separate Redis vendor needed
- [ ] **Supabase Auth:**
  - Magic-link login to gate the driver dashboard before public deployment
  - Required before Live Share links ship (passenger data exposure)
- [ ] **AeroDataBox Flight API:**
  - Connect RapidAPI key to auto-fetch live gate, terminal, delay, and altitude telemetry
  - Cache responses in `flight_cache` to minimize API costs (free tier is ~200 req/month)
  - Handle missing terminal/gate data gracefully — AeroDataBox fields are sometimes null

## Phase 3: Commercial Chauffeur Features
- [ ] **Buffer Time Calculator:**
  - Add `bufferMinutes` input field (+15m domestic, +45m international)
  - Calculate dynamic driver dispatch time: `actualLandingTime + bufferMinutes`
- [ ] **Terminal & Meeting Point Directives:**
  - Auto-fill terminal info from flight data (show "TBC" when unavailable)
  - Provide preset meeting point selection dropdowns (e.g. "Costa Coffee T5 Arrivals")
- [ ] **Passenger "Live Share" Link:**
  - Public read-only tracking URL using an unguessable `share_token` UUID — not the enumerable job ID (e.g. `aerodriver.app/track/<token>`)
  - Displays driver status, greeting sign details, and real-time airport arrival state
- [ ] **Automated SMS Alerts (Twilio):**
  - Send driver text alerts when flight delays exceed 15 minutes
  - Depends on background polling (Phase 4) — alerts need something checking flights on a schedule

## Phase 4: Production Hardening
- [ ] Background flight polling (every ~10 min)
  - Note: Vercel Hobby cron only runs once per day — use Supabase `pg_cron` + Edge Function or GitHub Actions hitting an API route to stay on free tier
- [ ] Offline PWA Service Worker caching
- [ ] Add job edit modal and search/filter bar

## Phase 5: Code Health & Data Quality
- [ ] Split `app/page.tsx` into components: `JobCard`, `StatsBar`, `AddJobModal`, `GreetingSignModal`, `FlightRadar`
- [ ] Day-boundary handling — roll "Today's Jobs"/"Day Earnings" at midnight, archive or expire old jobs
- [ ] Timezone correctness — AeroDataBox returns airport-local times; normalize against `pickupAt` before comparing
- [ ] Focus trap + `Esc` close on modals, `aria-expanded` on card toggles
