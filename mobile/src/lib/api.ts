export type Employee = {
  id: string;
  name: string;
  max_weekly_hours: number;
  employment_type: "full_time" | "part_time" | "casual";
  skills: string[];
};

export type Skill = {
  id: string;
  name: string;
};

export type ShiftTemplate = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  hours: number;
};

export type CoverageNeed = {
  date: string;
  shift_template_id: string;
  skill_id: string;
  required_count: number;
};

export type StoredAssignment = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  shift_template_id: string;
  shift_name: string;
  locked: boolean;
};

export type Schedule = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
};

export type ScheduleDetail = Schedule & {
  assignments: StoredAssignment[];
};

export type SolveResponse = {
  status: string;
  objective_value: number | null;
  runtime_ms: number;
  assignments: Array<{
    employee_id: string;
    employee_name: string;
    day: number;
    shift_id: string;
    shift_name: string;
    locked: boolean;
  }>;
  understaffing: Array<{
    day: number;
    shift_id: string;
    skill_id: string;
    required_count: number;
    assigned_count: number;
    shortfall: number;
  }>;
};

export type SolveRun = {
  id: string;
  schedule_id: string;
  status: string;
  objective_value: number | null;
  runtime_ms: number | null;
  created_at: string;
};

export type AssignmentPatch = {
  employee_id?: string;
  date?: string;
  shift_template_id?: string;
  locked?: boolean;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getEmployees(): Promise<Employee[]> {
  return request<Employee[]>('/employees');
}

export function getSkills(): Promise<Skill[]> {
  return request<Skill[]>('/skills');
}

export function getShiftTemplates(): Promise<ShiftTemplate[]> {
  return request<ShiftTemplate[]>('/shift-templates');
}

export function getSchedules(): Promise<Schedule[]> {
  return request<Schedule[]>('/schedules');
}

export function createSchedule(period_start: string, period_end: string): Promise<Schedule> {
  return request<Schedule>('/schedules', {
    method: 'POST',
    body: JSON.stringify({ period_start, period_end })
  });
}

export function getScheduleDetail(scheduleId: string): Promise<ScheduleDetail> {
  return request<ScheduleDetail>(`/schedules/${scheduleId}`);
}

export function solveSchedule(scheduleId: string): Promise<SolveResponse> {
  return request<SolveResponse>(`/schedules/${scheduleId}/solve`, {
    method: 'POST'
  });
}

export function resolveSchedule(scheduleId: string): Promise<SolveResponse> {
  return request<SolveResponse>(`/schedules/${scheduleId}/resolve`, {
    method: 'POST'
  });
}

export function getCoverageNeeds(start: string, end: string): Promise<CoverageNeed[]> {
  return request<CoverageNeed[]>(`/coverage-needs?start=${start}&end=${end}`);
}

export function putCoverageNeeds(needs: CoverageNeed[]): Promise<CoverageNeed[]> {
  return request<CoverageNeed[]>('/coverage-needs', {
    method: 'PUT',
    body: JSON.stringify(needs)
  });
}

export function patchAssignment(assignmentId: string, patch: AssignmentPatch): Promise<StoredAssignment> {
  return request<StoredAssignment>(`/assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export function getSolveRuns(scheduleId: string): Promise<SolveRun[]> {
  return request<SolveRun[]>(`/schedules/${scheduleId}/solve-runs`);
}

export function publishSchedule(scheduleId: string): Promise<Schedule> {
  return request<Schedule>(`/schedules/${scheduleId}/publish`, {
    method: 'POST'
  });
}
