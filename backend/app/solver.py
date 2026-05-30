from __future__ import annotations

from collections import defaultdict
from time import perf_counter

from ortools.sat.python import cp_model

from .models import (
    AssignmentResult,
    AvailabilityType,
    SolveRequest,
    SolveResponse,
    UnderstaffingResult,
)


SOLVER_STATUSES = {
    cp_model.OPTIMAL: "optimal",
    cp_model.FEASIBLE: "feasible",
    cp_model.INFEASIBLE: "infeasible",
    cp_model.MODEL_INVALID: "model_invalid",
    cp_model.UNKNOWN: "unknown",
}


def solve_schedule(request: SolveRequest) -> SolveResponse:
    start = perf_counter()
    model = cp_model.CpModel()

    employee_by_id = {employee.id: employee for employee in request.employees}
    shift_by_id = {shift.id: shift for shift in request.shifts}
    skills_by_employee = {
        employee.id: set(employee.skills) for employee in request.employees
    }
    unavailable = {
        (rule.employee_id, rule.day, rule.shift_id)
        for rule in request.availability
        if rule.type == AvailabilityType.unavailable
    }
    preferred = {
        (rule.employee_id, rule.day, rule.shift_id)
        for rule in request.availability
        if rule.type == AvailabilityType.preferred
    }
    locks = {(lock.employee_id, lock.day, lock.shift_id) for lock in request.locks}

    x = {
        (employee.id, day, shift.id): model.NewBoolVar(
            f"x_{employee.id}_{day}_{shift.id}"
        )
        for employee in request.employees
        for day in request.days
        for shift in request.shifts
    }

    for key in unavailable:
        if key in x:
            model.Add(x[key] == 0)

    for employee in request.employees:
        for day in request.days:
            model.Add(sum(x[employee.id, day, shift.id] for shift in request.shifts) <= 1)

    for employee in request.employees:
        model.Add(
            sum(
                x[employee.id, day, shift.id] * shift.hours
                for day in request.days
                for shift in request.shifts
            )
            <= employee.max_weekly_hours
        )

    # Initial rest rule from the spec: do not assign Night followed by Day.
    day_shift = _find_shift_id(request, "day")
    night_shift = _find_shift_id(request, "night")
    if day_shift and night_shift:
        sorted_days = sorted(request.days)
        for employee in request.employees:
            for current_day, next_day in zip(sorted_days, sorted_days[1:]):
                model.Add(
                    x[employee.id, current_day, night_shift]
                    + x[employee.id, next_day, day_shift]
                    <= 1
                )

    for key in locks:
        if key in x:
            model.Add(x[key] == 1)

    penalties = []
    understaffing_vars = {}
    for need in request.coverage_needs:
        qualified_employee_ids = [
            employee.id
            for employee in request.employees
            if need.skill_id in skills_by_employee[employee.id]
        ]
        shortfall = model.NewIntVar(
            0,
            need.required_count,
            f"shortfall_{need.day}_{need.shift_id}_{need.skill_id}",
        )
        understaffing_vars[(need.day, need.shift_id, need.skill_id)] = (need, shortfall)
        assigned = sum(
            x[employee_id, need.day, need.shift_id]
            for employee_id in qualified_employee_ids
            if (employee_id, need.day, need.shift_id) in x
        )
        model.Add(assigned + shortfall >= need.required_count)
        penalties.append(shortfall * 1000)

    for key in preferred:
        if key in x:
            penalties.append((1 - x[key]) * 5)

    total_hours = {
        employee.id: sum(
            x[employee.id, day, shift.id] * shift.hours
            for day in request.days
            for shift in request.shifts
        )
        for employee in request.employees
    }
    average_target = _average_target_hours(request)
    for employee_id, hours in total_hours.items():
        over = model.NewIntVar(0, 168, f"over_target_{employee_id}")
        under = model.NewIntVar(0, 168, f"under_target_{employee_id}")
        model.Add(hours - average_target == over - under)
        penalties.extend([over, under])

    model.Minimize(sum(penalties) if penalties else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.max_time_seconds
    solver.parameters.num_search_workers = 8

    status_code = solver.Solve(model)
    runtime_ms = int((perf_counter() - start) * 1000)

    assignments = []
    if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (employee_id, day, shift_id), variable in x.items():
            if solver.BooleanValue(variable):
                employee = employee_by_id[employee_id]
                shift = shift_by_id[shift_id]
                assignments.append(
                    AssignmentResult(
                        employee_id=employee_id,
                        employee_name=employee.name,
                        day=day,
                        shift_id=shift_id,
                        shift_name=shift.name,
                        locked=(employee_id, day, shift_id) in locks,
                    )
                )

    assigned_by_need = _assigned_counts(assignments, skills_by_employee)
    understaffing = []
    for key, (need, shortfall_var) in understaffing_vars.items():
        assigned_count = assigned_by_need[key]
        shortfall = 0
        if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            shortfall = int(solver.Value(shortfall_var))
        understaffing.append(
            UnderstaffingResult(
                day=need.day,
                shift_id=need.shift_id,
                skill_id=need.skill_id,
                required_count=need.required_count,
                assigned_count=assigned_count,
                shortfall=shortfall,
            )
        )

    objective_value = None
    if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        objective_value = solver.ObjectiveValue()

    return SolveResponse(
        status=SOLVER_STATUSES[status_code],
        objective_value=objective_value,
        runtime_ms=runtime_ms,
        assignments=assignments,
        understaffing=understaffing,
    )


def build_toy_request() -> SolveRequest:
    return SolveRequest.model_validate(
        {
            "employees": [
                {
                    "id": "e1",
                    "name": "Ada",
                    "max_weekly_hours": 40,
                    "employment_type": "full_time",
                    "skills": ["lead", "support"],
                },
                {
                    "id": "e2",
                    "name": "Ben",
                    "max_weekly_hours": 32,
                    "employment_type": "part_time",
                    "skills": ["support"],
                },
                {
                    "id": "e3",
                    "name": "Cara",
                    "max_weekly_hours": 32,
                    "employment_type": "part_time",
                    "skills": ["lead"],
                },
                {
                    "id": "e4",
                    "name": "Dev",
                    "max_weekly_hours": 24,
                    "employment_type": "casual",
                    "skills": ["support"],
                },
                {
                    "id": "e5",
                    "name": "Eli",
                    "max_weekly_hours": 24,
                    "employment_type": "casual",
                    "skills": ["support", "lead"],
                },
            ],
            "shifts": [
                {
                    "id": "day",
                    "name": "Day",
                    "start_time": "07:00",
                    "end_time": "15:00",
                    "hours": 8,
                },
                {
                    "id": "evening",
                    "name": "Evening",
                    "start_time": "15:00",
                    "end_time": "23:00",
                    "hours": 8,
                },
                {
                    "id": "night",
                    "name": "Night",
                    "start_time": "23:00",
                    "end_time": "07:00",
                    "hours": 8,
                },
            ],
            "days": [0, 1, 2, 3, 4, 5, 6],
            "coverage_needs": [
                {
                    "day": day,
                    "shift_id": shift_id,
                    "skill_id": "lead",
                    "required_count": 1,
                }
                for day in range(7)
                for shift_id in ["day", "evening", "night"]
            ],
            "availability": [
                {
                    "employee_id": "e2",
                    "day": 2,
                    "shift_id": "night",
                    "type": "unavailable",
                },
                {
                    "employee_id": "e4",
                    "day": 4,
                    "shift_id": "evening",
                    "type": "preferred",
                },
            ],
            "locks": [
                {"employee_id": "e1", "day": 0, "shift_id": "day"},
            ],
            "max_time_seconds": 10,
        }
    )


def _find_shift_id(request: SolveRequest, name: str) -> str | None:
    for shift in request.shifts:
        if shift.id.lower() == name or shift.name.lower() == name:
            return shift.id
    return None


def _average_target_hours(request: SolveRequest) -> int:
    total_required_hours = sum(
        need.required_count
        * next(
            (shift.hours for shift in request.shifts if shift.id == need.shift_id),
            0,
        )
        for need in request.coverage_needs
    )
    if not request.employees:
        return 0
    return total_required_hours // len(request.employees)


def _assigned_counts(
    assignments: list[AssignmentResult], skills_by_employee: dict[str, set[str]]
) -> dict[tuple[int, str, str], int]:
    counts: dict[tuple[int, str, str], int] = defaultdict(int)
    for assignment in assignments:
        for skill_id in skills_by_employee[assignment.employee_id]:
            counts[(assignment.day, assignment.shift_id, skill_id)] += 1
    return counts

