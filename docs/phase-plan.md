# Phase Plan

## Phase 0 - OR-Tools Deployment Risk

Goal: prove Vercel can import `ortools` and solve a small CP-SAT model.

Acceptance criteria:

- `GET /health` returns `ok`.
- `GET /phase0/toy-solve` returns a feasible or optimal schedule.
- Vercel deployment package size is accepted.
- Runtime stays comfortably under the configured timeout.

Fallback if Vercel fails: deploy the same FastAPI app to Railway or Render as a dedicated worker, and keep Vercel as the web/API edge if needed.

## Phase 1 - Data Entry

- Supabase schema and RLS policies.
- Staff list CRUD.
- Skill tagging.
- Weekly availability entry.
- Manual coverage needs entry.

## Phase 2 - Core Solver

- Build CP-SAT variables from schedule period data.
- Enforce hard constraints: unavailable windows, one shift per day, max hours, rest rules, locks.
- Use soft coverage slack for understaffing reports.
- Write assignments and solve run metadata back to Supabase.

## Phase 3 - Dynamic Behavior

- Drag or tap assignment edits.
- Locked assignments survive re-solve.
- Warm-start from current assignments.
- Supabase Realtime subscription for manager screens.

## Phase 4 - Forecast Coverage

- Add DuckDB demand aggregation.
- Populate `coverage_needs` from historical patterns.
- Keep manual override support.

