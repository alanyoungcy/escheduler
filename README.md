# EScheduler

Employee scheduling app based on the local `spec.md`.

This repository is scaffolded as a small monorepo:

- `backend/` - FastAPI API and OR-Tools CP-SAT solver.
- `mobile/` - Expo React Native app skeleton for managers.
- `supabase/` - Postgres schema migrations.
- `docs/` - implementation notes and phase checklist.

## Phase 0: Validate OR-Tools on Vercel

The highest-risk architecture assumption is whether Vercel can package and run OR-Tools within its limits. Start here before building more product surface area.

```bash
cd backend
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python scripts/smoke_solve.py
uvicorn app.main:app --reload --port 8000
```

Then open:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/phase0/toy-solve
```

## Mobile App

```bash
cd mobile
npm install
npm run start
```

The initial app is a manager workspace using local mock data. It is wired with an API client boundary so Supabase/API integration can replace the mock data without reworking the UI.

## Planned Build Order

1. Deploy `/phase0/toy-solve` to Vercel and confirm OR-Tools imports and solves.
2. Apply the Supabase schema in `supabase/migrations/001_initial_schema.sql`.
3. Implement CRUD for staff, skills, availability, and coverage needs.
4. Expand the solver from toy/demo data to Supabase-backed schedule periods.
5. Add locked assignment edits, warm-start re-solving, and Realtime subscriptions.
