# Employee Scheduling App — Technical Specification

> Status: Draft v1 · Last updated: 2026-05-30
> Owner: Alan Young

A mobile app for building **optimal employee shift schedules**. Managers add staff;
each employee sets their own availability (24/7 shift work) and skill set; the app
generates an optimized schedule using Google **OR-Tools (CP-SAT)** and supports
dynamic re-solving as inputs change.

---

## 1. Goals & Non-Goals

### Goals
- Add/manage staff, their per-person availability, and their skills.
- Generate a **valid + optimal** schedule respecting hard rules and optimizing soft preferences.
- **Dynamic** behavior:
  1. Re-solve on change (staff/availability/skills/coverage edits).
  2. Live edits + lock (manually pin assignments, re-solve the rest around them).
  3. Real-time sync (multiple managers see updates live).
  4. Forecast-driven coverage (demand needs adapt per day/shift).
- Target scale: **25–150 staff** per schedule.

### Non-Goals (for v1)
- Payroll / time clock / attendance tracking.
- Multi-tenant SaaS billing.
- Native Android (RN keeps the door open, but iOS-first).
- 150+ / multi-site enterprise scale (design notes included, not built).

---

## 2. The Core Constraint: OR-Tools Cannot Run in React Native

Google OR-Tools (specifically **CP-SAT**, the solver for scheduling) is a **C++ library
with Python/Java/C#/Go bindings — no JavaScript binding**. It cannot run on-device in
React Native, and the solve is CPU-heavy anyway. **A backend service is mandatory.**

This drives the entire architecture below.

---

## 3. Architecture

```
┌─────────────────────┐      HTTPS / REST     ┌──────────────────────┐
│  React Native app   │ ───────────────────>  │  Backend API         │
│  (Expo, iOS-first)  │ <───────────────────  │  (Python + FastAPI)  │
│  - staff entry      │   schedule JSON       │  on Vercel           │
│  - availability UI  │                       │  - OR-Tools CP-SAT   │
│  - skill tagging    │                       │  - solver service    │
│  - schedule view    │                       └─────────┬────────────┘
│  - live edit/lock   │                                 │
└──────────┬──────────┘                       ┌─────────▼────────────┐
           │  Supabase Realtime subscribe     │  Supabase (Postgres) │
           └─────────────────────────────────>│  primary DB + Auth   │
                                              │  + Realtime           │
                                              └─────────┬────────────┘
                                                        │ (Phase 4)
                                              ┌─────────▼────────────┐
                                              │  DuckDB              │
                                              │  demand/forecast     │
                                              └──────────────────────┘
```

The app **never solves anything**. It collects inputs → calls the Python API → the API
runs OR-Tools → results are written to Supabase → all clients update via Realtime.

---

## 4. Tech Stack & Service Roles

| Layer | Choice | Role |
|---|---|---|
| **Mobile** | **Expo (React Native)** | iOS-first. Expo handles build/signing pain; preview on-device via Expo Go. |
| **Primary DB / Auth / Realtime** | **Supabase (Postgres)** | Relational store for all data; Auth for login; **Realtime powers live sync for free**. |
| **API + Solver** | **Vercel (Python / FastAPI)** | Hosts endpoints; runs OR-Tools CP-SAT. |
| **Forecast analytics** | **DuckDB** (Phase 4) | Aggregates historical demand → coverage requirements. |
| **MongoDB** | **Not used** | Postgres JSONB covers any document needs. Skip. |

### ⚠️ Phase 0 risk to validate first
OR-Tools' Python wheel is large (~100MB) and CPU-heavy. Vercel serverless has a
**250MB package limit** and **execution-time limits**. For 25–150 staff this is *likely*
fine because CP-SAT is an **"anytime" solver** — cap it (`max_time_in_seconds ≈ 25`) and
take the best schedule found so far. **Vercel Fluid Compute** (Pro) extends duration.

**Action:** Before building anything, deploy a hello-world Python function that imports
`ortools` and solves a 5-employee toy problem on Vercel. If it deploys and runs, the
architecture is green-lit. **Fallback:** a small dedicated worker on Railway/Render that
Vercel calls.

---

## 5. Data Model (Supabase / Postgres)

```sql
employees (
  id              uuid pk,
  name            text,
  max_weekly_hours int,
  employment_type text,          -- full_time | part_time | casual
  created_at      timestamptz
)

skills (
  id    uuid pk,
  name  text unique
)

employee_skills (                -- many-to-many
  employee_id uuid fk,
  skill_id    uuid fk,
  primary key (employee_id, skill_id)
)

availability (
  id          uuid pk,
  employee_id uuid fk,
  day_of_week int,               -- 0..6  (or use `date` for one-off overrides)
  date        date null,
  start_time  time,
  end_time    time,
  type        text               -- available | preferred | unavailable
)

shift_templates (
  id          uuid pk,
  name        text,              -- Day, Evening, Night
  start_time  time,              -- e.g. 07:00
  end_time    time,              -- e.g. 15:00 (handle overnight wrap)
  hours       numeric
)

coverage_needs (
  id                uuid pk,
  date              date,
  shift_template_id uuid fk,
  skill_id          uuid fk,
  required_count    int
)

schedules (                      -- one solve period
  id           uuid pk,
  period_start date,
  period_end   date,
  status       text              -- draft | solving | published
)

assignments (
  id                uuid pk,
  schedule_id       uuid fk,
  employee_id       uuid fk,
  date              date,
  shift_template_id uuid fk,
  locked            boolean default false   -- powers live-edit + lock
)

solve_runs (
  id              uuid pk,
  schedule_id     uuid fk,
  status          text,          -- queued | running | done | infeasible
  objective_value numeric,
  runtime_ms      int,
  log             jsonb          -- e.g. understaffing report
)
```

Key fields:
- `availability.type` — `unavailable` is a **hard** rule; `preferred` is a **soft** one.
- `assignments.locked` — pinned assignments survive re-solve.

---

## 6. The Optimization Model (OR-Tools CP-SAT)

Use **CP-SAT**, not the older linear solvers. One boolean variable per possible
assignment, then layer rules on top.

```python
from ortools.sat.python import cp_model

def solve(employees, days, shifts, avail, skills, needs, locks, hours, max_hours):
    m = cp_model.CpModel()

    # Decision: x[e,d,s] = 1 means employee e works shift s on day d
    x = {(e, d, s): m.NewBoolVar(f"x_{e}_{d}_{s}")
         for e in employees for d in days for s in shifts}

    # ---- HARD CONSTRAINTS (schedule invalid if any break) ----
    # 1. No assignment when marked unavailable
    for e in employees:
        for d in days:
            for s in shifts:
                if not is_available(e, d, s, avail):
                    m.Add(x[e, d, s] == 0)

    # 2. At most one shift per person per day
    for e in employees:
        for d in days:
            m.Add(sum(x[e, d, s] for s in shifts) <= 1)

    # 3. Coverage WITH skills: each shift needs N qualified people
    #    (Make this SOFT in practice — see note below.)
    for (d, s, skill), n in needs.items():
        qualified = [e for e in employees if skill in skills[e]]
        m.Add(sum(x[e, d, s] for e in qualified) >= n)

    # 4. Max weekly hours per person
    for e in employees:
        m.Add(sum(x[e, d, s] * hours[s] for d in days for s in shifts)
              <= max_hours[e])

    # 5. Min rest (e.g. no Night then Day next morning)
    for e in employees:
        for d in days[:-1]:
            m.Add(x[e, d, NIGHT] + x[e, d + 1, DAY] <= 1)

    # 6. LOCKED assignments (live-edit + re-solve)
    for (e, d, s) in locks:
        m.Add(x[e, d, s] == 1)

    # ---- SOFT CONSTRAINTS (optimize toward) ----
    penalties = []
    #   - Fairness: penalize spread in total hours between people
    #   - Preference: reward 'preferred' shift assignments
    #   - Understaffing slack: allow shortfalls, penalize heavily
    m.Minimize(sum(penalties))

    # ---- Warm start for fast incremental re-solves ----
    for (e, d, s), val in current_schedule.items():
        m.AddHint(x[e, d, s], val)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 25       # anytime cap
    solver.parameters.num_search_workers = 8
    status = solver.Solve(m)
    return extract_assignments(solver, x)
```

### Three principles to internalize
1. **Hard vs soft is the whole art.** If everything is hard, the solver returns
   `INFEASIBLE` and the user learns nothing. Make coverage **soft** via a penalized
   "understaffing" slack variable → you always get a schedule *plus* a report like
   "Friday night is short one nurse."
2. **Locking = adding `== 1` constraints.** That's literally how live-edit re-solve works.
3. **Warm starts make re-solves fast.** `m.AddHint(...)` seeds the solver with the
   current schedule, so a re-solve after one change takes ~1s instead of starting cold.

---

## 7. Mapping the Four "Dynamic" Requirements

| Requirement | Implementation |
|---|---|
| **Re-solve on change** | Edits write to Supabase → endpoint starts a new `solve_run` → results written back. |
| **Live edits + lock** | Drag an assignment → set `locked=true` → re-solve with it pinned (`== 1`) + warm-start hint. Fast. |
| **Real-time sync** | Supabase Realtime subscription on `assignments`. Solver writes → every manager's screen updates live. Zero extra infra. |
| **Forecast-driven** | DuckDB aggregates history → populates `coverage_needs` → those numbers feed constraint #3. Phase 4; start with manual coverage entry. |

---

## 8. API Surface (FastAPI on Vercel)

```
POST   /schedules                 create a schedule period
POST   /schedules/{id}/solve      run/queue a solve → writes assignments + solve_run
GET    /schedules/{id}            fetch schedule + assignments
PATCH  /assignments/{id}          lock/unlock or manually move an assignment
POST   /schedules/{id}/resolve    incremental re-solve (respects locks, warm-starts)
GET    /solve_runs/{id}           status + understaffing report
```

Auth via Supabase JWT verified in the API layer. Clients read schedule state directly
from Supabase (with RLS) and subscribe to Realtime for live updates; writes that trigger
solves go through the API.

---

## 9. Phased Roadmap

- **Phase 0 — De-risk (½ day):** Deploy OR-Tools "hello world" + toy CP-SAT solve to
  Vercel. Confirm package size + runtime fit. *Everything depends on this.*
- **Phase 1 — Data + entry (1–2 wks):** Supabase schema + Expo screens to add staff, set
  per-person availability, tag skills. CRUD only, no solver.
- **Phase 2 — Core solver (1–2 wks):** FastAPI `/solve` builds the CP-SAT model (hard
  constraints + basic fairness), writes assignments back. Schedule view in the app.
- **Phase 3 — Dynamic (1–2 wks):** Lock/drag-edit + warm-start re-solve, Supabase
  Realtime sync, soft constraints & preferences, understaffing report.
- **Phase 4 — Forecast (later):** DuckDB demand analysis auto-populating coverage needs.

---

## 10. Open Questions / To Decide

- Exact **shift definitions** (start/end times, overnight handling).
- Exact **rest rules** (min hours between shifts, max consecutive days).
- **Fairness definition** (balance total hours? weekends? nights?).
- Solve trigger: **on-demand button** vs **auto on every change** (auto can be noisy/costly).
- Long solves: keep within Vercel limits, or move to a queue + worker if needed.

---

## Appendix A — Glossary

- **CP-SAT** — Constraint Programming + SAT solver in OR-Tools; the engine for scheduling.
- **Anytime solver** — returns the best feasible solution found so far when time runs out.
- **Hard constraint** — must always hold; violating it makes the schedule invalid.
- **Soft constraint** — preference; violating it adds a penalty to the objective.
- **Warm start / hint** — seeding the solver with a known solution to speed up re-solving.
- **Nurse Rostering Problem** — the classic OR name for this shift-scheduling problem.
```
