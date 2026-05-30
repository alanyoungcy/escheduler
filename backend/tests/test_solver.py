from app.solver import build_toy_request, solve_schedule


def test_toy_solver_returns_schedule_with_locked_assignment() -> None:
    response = solve_schedule(build_toy_request())

    assert response.status in {"optimal", "feasible"}
    assert response.assignments
    assert any(
        assignment.employee_id == "e1"
        and assignment.day == 0
        and assignment.shift_id == "day"
        and assignment.locked
        for assignment in response.assignments
    )


def test_toy_solver_reports_understaffing_shape() -> None:
    response = solve_schedule(build_toy_request())

    assert response.understaffing
    assert all(item.required_count >= 0 for item in response.understaffing)
    assert all(item.assigned_count >= 0 for item in response.understaffing)
    assert all(item.shortfall >= 0 for item in response.understaffing)
