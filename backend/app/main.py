from fastapi import FastAPI, HTTPException

from .db import get_connection
from .models import (
    AssignmentPatchRequest,
    AssignmentPatchResponse,
    AvailabilityEntryCreate,
    AvailabilityEntryResponse,
    CoverageNeedUpsert,
    EmployeeCreate,
    EmployeeResponse,
    EmployeeSkillsReplaceRequest,
    ScheduleCreateRequest,
    ScheduleDetailResponse,
    SchedulePublishResponse,
    ScheduleSummaryResponse,
    ShiftTemplate,
    ShiftTemplateCreate,
    SkillCreate,
    SkillResponse,
    SolveRequest,
    SolveResponse,
    SolveRunListItem,
    SolveRunResponse,
)
from .repository import (
    build_solve_request,
    complete_solve_run,
    create_employee,
    create_schedule,
    create_shift_template,
    create_skill,
    create_solve_run,
    get_employee,
    get_schedule,
    get_solve_run,
    list_coverage_needs,
    list_employees,
    list_employee_availability,
    list_schedules,
    list_shift_templates,
    list_skills,
    list_solve_runs,
    mark_solve_run_failed,
    patch_assignment,
    publish_schedule,
    replace_employee_availability,
    replace_employee_skills,
    upsert_coverage_needs,
    update_employee,
)
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


@app.get("/employees", response_model=list[EmployeeResponse])
def get_employees() -> list[EmployeeResponse]:
    with get_connection() as conn:
        return list_employees(conn)


@app.post("/employees", response_model=EmployeeResponse, status_code=201)
def post_employee(request: EmployeeCreate) -> EmployeeResponse:
    with get_connection() as conn:
        return create_employee(conn, request)


@app.patch("/employees/{employee_id}", response_model=EmployeeResponse)
def patch_employee(employee_id: str, request: EmployeeCreate) -> EmployeeResponse:
    with get_connection() as conn:
        employee = update_employee(conn, employee_id, request)
        if employee is None:
            raise HTTPException(status_code=404, detail="employee not found")
        return employee


@app.get("/skills", response_model=list[SkillResponse])
def get_skills() -> list[SkillResponse]:
    with get_connection() as conn:
        return list_skills(conn)


@app.post("/skills", response_model=SkillResponse, status_code=201)
def post_skill(request: SkillCreate) -> SkillResponse:
    with get_connection() as conn:
        return create_skill(conn, request)


@app.post("/employees/{employee_id}/skills", response_model=EmployeeResponse)
def post_employee_skills(employee_id: str, request: EmployeeSkillsReplaceRequest) -> EmployeeResponse:
    with get_connection() as conn:
        employee = replace_employee_skills(conn, employee_id, request.skill_ids)
        if employee is None:
            raise HTTPException(status_code=404, detail="employee not found")
        return employee


@app.put("/employees/{employee_id}/availability", response_model=list[AvailabilityEntryResponse])
def put_employee_availability(
    employee_id: str, request: list[AvailabilityEntryCreate]
) -> list[AvailabilityEntryResponse]:
    with get_connection() as conn:
        availability = replace_employee_availability(conn, employee_id, request)
        if availability is None:
            raise HTTPException(status_code=404, detail="employee not found")
        return availability


@app.get("/employees/{employee_id}/availability", response_model=list[AvailabilityEntryResponse])
def get_employee_availability(employee_id: str) -> list[AvailabilityEntryResponse]:
    with get_connection() as conn:
        if get_employee(conn, employee_id) is None:
            raise HTTPException(status_code=404, detail="employee not found")
        return list_employee_availability(conn, employee_id)


@app.get("/shift-templates", response_model=list[ShiftTemplate])
def get_shift_templates() -> list[ShiftTemplate]:
    with get_connection() as conn:
        return list_shift_templates(conn)


@app.post("/shift-templates", response_model=ShiftTemplate, status_code=201)
def post_shift_template(request: ShiftTemplateCreate) -> ShiftTemplate:
    with get_connection() as conn:
        return create_shift_template(conn, request)


@app.put("/coverage-needs", response_model=list[CoverageNeedUpsert])
def put_coverage_needs(request: list[CoverageNeedUpsert]) -> list[CoverageNeedUpsert]:
    with get_connection() as conn:
        return upsert_coverage_needs(conn, request)


@app.get("/coverage-needs", response_model=list[CoverageNeedUpsert])
def get_coverage_needs(start: str, end: str) -> list[CoverageNeedUpsert]:
    from datetime import date

    with get_connection() as conn:
        return list_coverage_needs(conn, date.fromisoformat(start), date.fromisoformat(end))


@app.post("/schedules", response_model=ScheduleSummaryResponse, status_code=201)
def post_schedule(request: ScheduleCreateRequest) -> ScheduleSummaryResponse:
    if request.period_end < request.period_start:
        raise HTTPException(status_code=400, detail="period_end must be after period_start")
    with get_connection() as conn:
        return create_schedule(conn, request)


@app.get("/schedules", response_model=list[ScheduleSummaryResponse])
def get_schedules() -> list[ScheduleSummaryResponse]:
    with get_connection() as conn:
        return list_schedules(conn)


@app.get("/schedules/{schedule_id}", response_model=ScheduleDetailResponse)
def get_schedule_detail(schedule_id: str) -> ScheduleDetailResponse:
    with get_connection() as conn:
        schedule = get_schedule(conn, schedule_id)
        if schedule is None:
            raise HTTPException(status_code=404, detail="schedule not found")
        return schedule


@app.post("/schedules/{schedule_id}/solve", response_model=SolveResponse)
def solve(schedule_id: str, request: SolveRequest | None = None) -> SolveResponse:
    with get_connection() as conn:
        solve_run_id = create_solve_run(conn, schedule_id)
        try:
            solve_request = request
            if solve_request is None:
                solve_request, _ = build_solve_request(conn, schedule_id, max_time_seconds=25)
            response = solve_schedule(solve_request)
            complete_solve_run(conn, schedule_id, solve_run_id, response)
            return response
        except ValueError as exc:
            mark_solve_run_failed(conn, schedule_id, solve_run_id, str(exc))
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            mark_solve_run_failed(conn, schedule_id, solve_run_id, str(exc))
            raise


@app.post("/schedules/{schedule_id}/resolve", response_model=SolveResponse)
def resolve(schedule_id: str, request: SolveRequest | None = None) -> SolveResponse:
    return solve(schedule_id, request)


@app.patch("/assignments/{assignment_id}", response_model=AssignmentPatchResponse)
def patch_assignment_route(assignment_id: str, request: AssignmentPatchRequest) -> AssignmentPatchResponse:
    with get_connection() as conn:
        assignment = patch_assignment(conn, assignment_id, request)
        if assignment is None:
            raise HTTPException(status_code=404, detail="assignment not found")
        return AssignmentPatchResponse.model_validate(assignment)


@app.get("/solve_runs/{solve_run_id}", response_model=SolveRunResponse)
def get_solve_run_detail(solve_run_id: str) -> SolveRunResponse:
    with get_connection() as conn:
        solve_run = get_solve_run(conn, solve_run_id)
        if solve_run is None:
            raise HTTPException(status_code=404, detail="solve run not found")
        return solve_run


@app.get("/schedules/{schedule_id}/solve-runs", response_model=list[SolveRunListItem])
def get_schedule_solve_runs(schedule_id: str) -> list[SolveRunListItem]:
    with get_connection() as conn:
        if get_schedule(conn, schedule_id) is None:
            raise HTTPException(status_code=404, detail="schedule not found")
        return list_solve_runs(conn, schedule_id)


@app.post("/schedules/{schedule_id}/publish", response_model=SchedulePublishResponse)
def post_schedule_publish(schedule_id: str) -> SchedulePublishResponse:
    with get_connection() as conn:
        schedule = publish_schedule(conn, schedule_id)
        if schedule is None:
            raise HTTPException(status_code=404, detail="schedule not found")
        return schedule
