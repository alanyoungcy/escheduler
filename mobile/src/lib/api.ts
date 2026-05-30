export type ApiSolveResponse = {
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

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function runToySolve(): Promise<ApiSolveResponse> {
  const response = await fetch(`${API_URL}/phase0/toy-solve`);
  if (!response.ok) {
    throw new Error(`Toy solve failed: ${response.status}`);
  }
  return response.json();
}

