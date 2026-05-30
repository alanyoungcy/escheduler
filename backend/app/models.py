from datetime import date
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class AvailabilityType(str, Enum):
    available = "available"
    preferred = "preferred"
    unavailable = "unavailable"


class Employee(BaseModel):
    id: str
    name: str
    max_weekly_hours: int = Field(gt=0)
    employment_type: Literal["full_time", "part_time", "casual"]
    skills: list[str] = Field(default_factory=list)


class ShiftTemplate(BaseModel):
    id: str
    name: str
    start_time: str
    end_time: str
    hours: int = Field(gt=0)


class CoverageNeed(BaseModel):
    day: int = Field(ge=0)
    shift_id: str
    skill_id: str
    required_count: int = Field(ge=0)


class AvailabilityRule(BaseModel):
    employee_id: str
    day: int = Field(ge=0)
    shift_id: str
    type: AvailabilityType


class LockedAssignment(BaseModel):
    employee_id: str
    day: int = Field(ge=0)
    shift_id: str


class SolveRequest(BaseModel):
    employees: list[Employee]
    shifts: list[ShiftTemplate]
    days: list[int]
    coverage_needs: list[CoverageNeed]
    availability: list[AvailabilityRule] = Field(default_factory=list)
    locks: list[LockedAssignment] = Field(default_factory=list)
    max_time_seconds: int = Field(default=25, gt=0, le=120)


class AssignmentResult(BaseModel):
    employee_id: str
    employee_name: str
    day: int
    shift_id: str
    shift_name: str
    locked: bool = False


class UnderstaffingResult(BaseModel):
    day: int
    shift_id: str
    skill_id: str
    required_count: int
    assigned_count: int
    shortfall: int


class SolveResponse(BaseModel):
    status: str
    objective_value: float | None
    runtime_ms: int
    assignments: list[AssignmentResult]
    understaffing: list[UnderstaffingResult]


class ScheduleCreateRequest(BaseModel):
    period_start: date
    period_end: date


class ScheduleCreateResponse(BaseModel):
    id: str
    period_start: date
    period_end: date
    status: str

