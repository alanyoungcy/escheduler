import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.solver import build_toy_request, solve_schedule


if __name__ == "__main__":
    response = solve_schedule(build_toy_request())
    print(f"status={response.status}")
    print(f"objective={response.objective_value}")
    print(f"runtime_ms={response.runtime_ms}")
    print(f"assignments={len(response.assignments)}")
    shortfalls = [item for item in response.understaffing if item.shortfall > 0]
    print(f"shortfalls={len(shortfalls)}")
