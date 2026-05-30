from uuid import uuid4

from fastapi import FastAPI, HTTPException

from .models import ScheduleCreateRequest, ScheduleCreateResponse, SolveRequest, SolveResponse
from .solver import build_toy_request, solve_schedule


app = FastAPI(
    title="EScheduler API",
    version="0.1.0",
    description="FastAPI service for employee schedule solving with OR-Tools CP-SAT.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/phase0/toy-solve", response_model=SolveResponse)
def phase0_toy_solve() -> SolveResponse:
    return solve_schedule(build_toy_request())


@app.post("/schedules", response_model=ScheduleCreateResponse, status_code=201)
def create_schedule(request: ScheduleCreateRequest) -> ScheduleCreateResponse:
    if request.period_end < request.period_start:
        raise HTTPException(status_code=400, detail="period_end must be after period_start")
    return ScheduleCreateResponse(
        id=str(uuid4()),
        period_start=request.period_start,
        period_end=request.period_end,
        status="draft",
    )


@app.post("/schedules/{schedule_id}/solve", response_model=SolveResponse)
def solve(schedule_id: str, request: SolveRequest) -> SolveResponse:
    # The schedule id is part of the public API contract. Supabase persistence is Phase 1/2.
    if not schedule_id:
        raise HTTPException(status_code=400, detail="schedule_id is required")
    return solve_schedule(request)


@app.post("/schedules/{schedule_id}/resolve", response_model=SolveResponse)
def resolve(schedule_id: str, request: SolveRequest) -> SolveResponse:
    if not schedule_id:
        raise HTTPException(status_code=400, detail="schedule_id is required")
    return solve_schedule(request)

