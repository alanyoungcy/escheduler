from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from psycopg import Connection

from .models import (
    AssignmentPatchRequest,
    AssignmentResult,
    AvailabilityEntryCreate,
    AvailabilityEntryResponse,
    AvailabilityRule,
    CoverageNeed,
    CoverageNeedUpsert,
    EmployeeCreate,
    EmployeeResponse,
    LockedAssignment,
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


def list_employees(conn: Connection) -> list[EmployeeResponse]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select e.id::text as id, e.name, e.max_weekly_hours, e.employment_type,
                   coalesce(array_agg(s.name order by s.name) filter (where s.name is not null), '{}') as skills
            from employees e
            left join employee_skills es on es.employee_id = e.id
            left join skills s on s.id = es.skill_id
            group by e.id
            order by e.created_at, e.name
            """
        )
        return [EmployeeResponse.model_validate(row) for row in cur.fetchall()]


def create_employee(conn: Connection, payload: EmployeeCreate) -> EmployeeResponse:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into employees (name, max_weekly_hours, employment_type)
            values (%s, %s, %s)
            returning id::text as id, name, max_weekly_hours, employment_type
            """,
            (payload.name, payload.max_weekly_hours, payload.employment_type),
        )
        row = cur.fetchone()
        conn.commit()
        return EmployeeResponse.model_validate({**row, "skills": []})


def update_employee(conn: Connection, employee_id: str, payload: EmployeeCreate) -> EmployeeResponse | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update employees
            set name = %s,
                max_weekly_hours = %s,
                employment_type = %s
            where id = %s::uuid
            returning id::text as id, name, max_weekly_hours, employment_type
            """,
            (payload.name, payload.max_weekly_hours, payload.employment_type, employee_id),
        )
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return None
        cur.execute(
            """
            select coalesce(array_agg(s.name order by s.name), '{}') as skills
            from employee_skills es
            join skills s on s.id = es.skill_id
            where es.employee_id = %s::uuid
            """,
            (employee_id,),
        )
        skills_row = cur.fetchone()
        conn.commit()
        return EmployeeResponse.model_validate({**row, "skills": skills_row["skills"]})


def list_skills(conn: Connection) -> list[SkillResponse]:
    with conn.cursor() as cur:
        cur.execute("select id::text as id, name from skills order by name")
        return [SkillResponse.model_validate(row) for row in cur.fetchall()]


def create_skill(conn: Connection, payload: SkillCreate) -> SkillResponse:
    with conn.cursor() as cur:
        cur.execute(
            "insert into skills (name) values (%s) returning id::text as id, name",
            (payload.name,),
        )
        row = cur.fetchone()
        conn.commit()
        return SkillResponse.model_validate(row)


def replace_employee_skills(conn: Connection, employee_id: str, skill_ids: list[str]) -> EmployeeResponse | None:
    with conn.cursor() as cur:
        cur.execute("select 1 from employees where id = %s::uuid", (employee_id,))
        if cur.fetchone() is None:
            conn.rollback()
            return None
        cur.execute("delete from employee_skills where employee_id = %s::uuid", (employee_id,))
        if skill_ids:
            values = [(employee_id, skill_id) for skill_id in skill_ids]
            cur.executemany(
                "insert into employee_skills (employee_id, skill_id) values (%s::uuid, %s::uuid)",
                values,
            )
        conn.commit()
    return get_employee(conn, employee_id)


def get_employee(conn: Connection, employee_id: str) -> EmployeeResponse | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select e.id::text as id, e.name, e.max_weekly_hours, e.employment_type,
                   coalesce(array_agg(s.name order by s.name) filter (where s.name is not null), '{}') as skills
            from employees e
            left join employee_skills es on es.employee_id = e.id
            left join skills s on s.id = es.skill_id
            where e.id = %s::uuid
            group by e.id
            """,
            (employee_id,),
        )
        row = cur.fetchone()
        return EmployeeResponse.model_validate(row) if row else None


def replace_employee_availability(
    conn: Connection, employee_id: str, payload: list[AvailabilityEntryCreate]
) -> list[AvailabilityEntryResponse] | None:
    with conn.cursor() as cur:
        cur.execute("select 1 from employees where id = %s::uuid", (employee_id,))
        if cur.fetchone() is None:
            conn.rollback()
            return None
        cur.execute("delete from availability where employee_id = %s::uuid", (employee_id,))
        for entry in payload:
            cur.execute(
                """
                insert into availability (employee_id, day_of_week, date, start_time, end_time, type)
                values (%s::uuid, %s, %s, %s, %s, %s)
                """,
                (
                    employee_id,
                    entry.day_of_week,
                    entry.date,
                    entry.start_time,
                    entry.end_time,
                    entry.type,
                ),
            )
        conn.commit()
    return list_employee_availability(conn, employee_id)


def list_employee_availability(conn: Connection, employee_id: str) -> list[AvailabilityEntryResponse]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id::text as id, employee_id::text as employee_id, day_of_week, date,
                   start_time::text as start_time, end_time::text as end_time, type
            from availability
            where employee_id = %s::uuid
            order by coalesce(date::text, ''), coalesce(day_of_week, -1), start_time
            """,
            (employee_id,),
        )
        return [AvailabilityEntryResponse.model_validate(row) for row in cur.fetchall()]


def list_shift_templates(conn: Connection) -> list[ShiftTemplate]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id::text as id, name, start_time::text as start_time,
                   end_time::text as end_time, hours::int as hours
            from shift_templates
            order by start_time, name
            """
        )
        return [ShiftTemplate.model_validate(row) for row in cur.fetchall()]


def create_shift_template(conn: Connection, payload: ShiftTemplateCreate) -> ShiftTemplate:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into shift_templates (name, start_time, end_time, hours)
            values (%s, %s, %s, %s)
            returning id::text as id, name, start_time::text as start_time,
                      end_time::text as end_time, hours::int as hours
            """,
            (payload.name, payload.start_time, payload.end_time, payload.hours),
        )
        row = cur.fetchone()
        conn.commit()
        return ShiftTemplate.model_validate(row)


def upsert_coverage_needs(conn: Connection, payload: list[CoverageNeedUpsert]) -> list[CoverageNeedUpsert]:
    with conn.cursor() as cur:
        for item in payload:
            cur.execute(
                """
                insert into coverage_needs (date, shift_template_id, skill_id, required_count)
                values (%s, %s::uuid, %s::uuid, %s)
                on conflict (date, shift_template_id, skill_id)
                do update set required_count = excluded.required_count
                """,
                (item.date, item.shift_template_id, item.skill_id, item.required_count),
            )
        conn.commit()
    return list_coverage_needs(conn, payload[0].date, payload[-1].date) if payload else []


def list_coverage_needs(conn: Connection, start_date: date, end_date: date) -> list[CoverageNeedUpsert]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select date, shift_template_id::text as shift_template_id,
                   skill_id::text as skill_id, required_count
            from coverage_needs
            where date between %s and %s
            order by date, shift_template_id, skill_id
            """,
            (start_date, end_date),
        )
        return [CoverageNeedUpsert.model_validate(row) for row in cur.fetchall()]


def create_schedule(conn: Connection, payload: ScheduleCreateRequest) -> ScheduleSummaryResponse:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into schedules (period_start, period_end, status)
            values (%s, %s, 'draft')
            returning id::text as id, period_start, period_end, status
            """,
            (payload.period_start, payload.period_end),
        )
        row = cur.fetchone()
        conn.commit()
        return ScheduleSummaryResponse.model_validate(row)


def list_schedules(conn: Connection) -> list[ScheduleSummaryResponse]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id::text as id, period_start, period_end, status
            from schedules
            order by period_start desc, created_at desc
            """
        )
        return [ScheduleSummaryResponse.model_validate(row) for row in cur.fetchall()]


def get_schedule(conn: Connection, schedule_id: str) -> ScheduleDetailResponse | None:
    with conn.cursor() as cur:
        cur.execute(
            "select id::text as id, period_start, period_end, status from schedules where id = %s::uuid",
            (schedule_id,),
        )
        schedule = cur.fetchone()
        if schedule is None:
            return None
        cur.execute(
            """
            select a.id::text as id, a.employee_id::text as employee_id, e.name as employee_name,
                   a.date, a.shift_template_id::text as shift_template_id, st.name as shift_name, a.locked
            from assignments a
            join employees e on e.id = a.employee_id
            join shift_templates st on st.id = a.shift_template_id
            where a.schedule_id = %s::uuid
            order by a.date, st.start_time, e.name
            """,
            (schedule_id,),
        )
        assignments = cur.fetchall()
        return ScheduleDetailResponse.model_validate({**schedule, "assignments": assignments})


def create_solve_run(conn: Connection, schedule_id: str) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "insert into solve_runs (schedule_id, status) values (%s::uuid, 'running') returning id::text as id",
            (schedule_id,),
        )
        row = cur.fetchone()
        cur.execute("update schedules set status = 'solving' where id = %s::uuid", (schedule_id,))
        conn.commit()
        return row["id"]


def complete_solve_run(
    conn: Connection, schedule_id: str, solve_run_id: str, response: SolveResponse
) -> None:
    with conn.cursor() as cur:
        cur.execute("delete from assignments where schedule_id = %s::uuid and locked = false", (schedule_id,))
        for assignment in response.assignments:
            cur.execute(
                """
                insert into assignments (schedule_id, employee_id, date, shift_template_id, locked)
                values (%s::uuid, %s::uuid, %s, %s::uuid, %s)
                on conflict (schedule_id, date, shift_template_id, employee_id)
                do update set locked = excluded.locked
                """,
                (
                    schedule_id,
                    assignment.employee_id,
                    _date_for_day_index(conn, schedule_id, assignment.day),
                    assignment.shift_id,
                    assignment.locked,
                ),
            )
        cur.execute(
            """
            update solve_runs
            set status = %s,
                objective_value = %s,
                runtime_ms = %s,
                log = %s::jsonb
            where id = %s::uuid
            """,
            (
                "done" if response.status in {"optimal", "feasible"} else response.status,
                response.objective_value,
                response.runtime_ms,
                _understaffing_json(response),
                solve_run_id,
            ),
        )
        cur.execute(
            "update schedules set status = %s where id = %s::uuid",
            ("draft" if response.status in {"optimal", "feasible"} else "draft", schedule_id),
        )
        conn.commit()


def mark_solve_run_failed(conn: Connection, schedule_id: str, solve_run_id: str, message: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update solve_runs set status = 'failed', log = jsonb_build_object('error', %s) where id = %s::uuid",
            (message, solve_run_id),
        )
        cur.execute("update schedules set status = 'draft' where id = %s::uuid", (schedule_id,))
        conn.commit()


def get_solve_run(conn: Connection, solve_run_id: str) -> SolveRunResponse | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id::text as id, schedule_id::text as schedule_id, status,
                   objective_value, runtime_ms, log, created_at
            from solve_runs
            where id = %s::uuid
            """,
            (solve_run_id,),
        )
        row = cur.fetchone()
        return SolveRunResponse.model_validate(row) if row else None


def list_solve_runs(conn: Connection, schedule_id: str) -> list[SolveRunListItem]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id::text as id, schedule_id::text as schedule_id, status,
                   objective_value, runtime_ms, created_at
            from solve_runs
            where schedule_id = %s::uuid
            order by created_at desc
            """,
            (schedule_id,),
        )
        return [SolveRunListItem.model_validate(row) for row in cur.fetchall()]


def publish_schedule(conn: Connection, schedule_id: str) -> SchedulePublishResponse | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update schedules
            set status = 'published'
            where id = %s::uuid
            returning id::text as id, period_start, period_end, status
            """,
            (schedule_id,),
        )
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return None
        conn.commit()
        return SchedulePublishResponse.model_validate(row)


def patch_assignment(conn: Connection, assignment_id: str, payload: AssignmentPatchRequest) -> dict[str, Any] | None:
    updates = []
    values: list[Any] = []
    if payload.employee_id is not None:
        updates.append("employee_id = %s::uuid")
        values.append(payload.employee_id)
    if payload.date is not None:
        updates.append("date = %s")
        values.append(payload.date)
    if payload.shift_template_id is not None:
        updates.append("shift_template_id = %s::uuid")
        values.append(payload.shift_template_id)
    if payload.locked is not None:
        updates.append("locked = %s")
        values.append(payload.locked)
    if not updates:
        return get_assignment(conn, assignment_id)
    values.append(assignment_id)
    with conn.cursor() as cur:
        cur.execute(
            f"update assignments set {', '.join(updates)} where id = %s::uuid returning id::text as id",
            values,
        )
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return None
        conn.commit()
    return get_assignment(conn, assignment_id)


def get_assignment(conn: Connection, assignment_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select a.id::text as id, a.schedule_id::text as schedule_id, a.employee_id::text as employee_id,
                   e.name as employee_name, a.date, a.shift_template_id::text as shift_template_id,
                   st.name as shift_name, a.locked
            from assignments a
            join employees e on e.id = a.employee_id
            join shift_templates st on st.id = a.shift_template_id
            where a.id = %s::uuid
            """,
            (assignment_id,),
        )
        return cur.fetchone()


def build_solve_request(conn: Connection, schedule_id: str, max_time_seconds: int) -> tuple[SolveRequest, list[date]]:
    with conn.cursor() as cur:
        cur.execute(
            "select period_start, period_end from schedules where id = %s::uuid",
            (schedule_id,),
        )
        schedule = cur.fetchone()
        if schedule is None:
            raise ValueError("schedule not found")
        period_start = schedule["period_start"]
        period_end = schedule["period_end"]
        dates = [period_start + timedelta(days=offset) for offset in range((period_end - period_start).days + 1)]

        employees = list_employees(conn)
        shifts = list_shift_templates(conn)
        cur.execute(
            """
            select cn.date, cn.shift_template_id::text as shift_id, s.name as skill_name,
                   cn.required_count
            from coverage_needs cn
            join skills s on s.id = cn.skill_id
            where cn.date between %s and %s
            order by cn.date, cn.shift_template_id
            """,
            (period_start, period_end),
        )
        needs = []
        for row in cur.fetchall():
            day_index = (row["date"] - period_start).days
            needs.append(
                CoverageNeed(
                    day=day_index,
                    shift_id=row["shift_id"],
                    skill_id=row["skill_name"],
                    required_count=row["required_count"],
                )
            )

        cur.execute(
            """
            select employee_id::text as employee_id, day_of_week, date,
                   start_time, end_time, type
            from availability
            where date between %s and %s or day_of_week is not null
            """,
            (period_start, period_end),
        )
        availability_rows = cur.fetchall()

        cur.execute(
            """
            select employee_id::text as employee_id, date, shift_template_id::text as shift_id
            from assignments
            where schedule_id = %s::uuid and locked = true
            """,
            (schedule_id,),
        )
        locks = []
        for row in cur.fetchall():
            locks.append(
                LockedAssignment(
                    employee_id=row["employee_id"],
                    day=(row["date"] - period_start).days,
                    shift_id=row["shift_id"],
                )
            )

    availability_rules = _build_availability_rules(dates, shifts, availability_rows)
    request = SolveRequest(
        employees=employees,
        shifts=shifts,
        days=list(range(len(dates))),
        coverage_needs=needs,
        availability=availability_rules,
        locks=locks,
        max_time_seconds=max_time_seconds,
    )
    return request, dates


def _build_availability_rules(
    dates: list[date], shifts: list[ShiftTemplate], availability_rows: list[dict[str, Any]]
) -> list[AvailabilityRule]:
    rules = []
    for row in availability_rows:
        for day_index, current_date in enumerate(dates):
            if row["date"] is not None and row["date"] != current_date:
                continue
            if row["date"] is None and row["day_of_week"] is not None and row["day_of_week"] != current_date.weekday():
                continue
            for shift in shifts:
                if _times_overlap(row["start_time"], row["end_time"], shift.start_time, shift.end_time):
                    rules.append(
                        AvailabilityRule(
                            employee_id=row["employee_id"],
                            day=day_index,
                            shift_id=shift.id,
                            type=row["type"],
                        )
                    )
    return rules


def _times_overlap(start_a: time, end_a: time, start_b: str, end_b: str) -> bool:
    a_start = datetime.combine(date(2000, 1, 1), start_a)
    a_end = datetime.combine(date(2000, 1, 1), end_a)
    if a_end <= a_start:
        a_end += timedelta(days=1)
    b_start_time = time.fromisoformat(start_b)
    b_end_time = time.fromisoformat(end_b)
    b_start = datetime.combine(date(2000, 1, 1), b_start_time)
    b_end = datetime.combine(date(2000, 1, 1), b_end_time)
    if b_end <= b_start:
        b_end += timedelta(days=1)
    return max(a_start, b_start) < min(a_end, b_end)


def _date_for_day_index(conn: Connection, schedule_id: str, day_index: int) -> date:
    with conn.cursor() as cur:
        cur.execute("select period_start from schedules where id = %s::uuid", (schedule_id,))
        row = cur.fetchone()
    return row["period_start"] + timedelta(days=day_index)


def _understaffing_json(response: SolveResponse) -> str:
    payload = [item.model_dump() for item in response.understaffing]
    import json

    return json.dumps({"understaffing": payload})
