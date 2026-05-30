export const employees = [
  {
    id: "e1",
    name: "Ada Wong",
    skills: ["Lead", "Triage"],
    scheduledHours: 40,
    maxHours: 40
  },
  {
    id: "e2",
    name: "Ben Ho",
    skills: ["Support"],
    scheduledHours: 28,
    maxHours: 32
  },
  {
    id: "e3",
    name: "Cara Lim",
    skills: ["Lead", "Night"],
    scheduledHours: 32,
    maxHours: 32
  },
  {
    id: "e4",
    name: "Dev Singh",
    skills: ["Support", "Evening"],
    scheduledHours: 16,
    maxHours: 24
  },
  {
    id: "e5",
    name: "Eli Chan",
    skills: ["Lead", "Support"],
    scheduledHours: 24,
    maxHours: 24
  }
];

export const shifts = [
  { id: "day", name: "Day", time: "07:00-15:00", color: "#3e5847" },
  { id: "evening", name: "Evening", time: "15:00-23:00", color: "#c47f2c" },
  { id: "night", name: "Night", time: "23:00-07:00", color: "#3d4c7c" }
];

export const scheduleDays = [
  {
    id: "mon",
    label: "Monday",
    date: "Jun 01",
    assignments: [
      { shiftId: "day", employeeId: "e1", employeeName: "Ada Wong", skill: "Lead" },
      { shiftId: "evening", employeeId: "e4", employeeName: "Dev Singh", skill: "Support" },
      { shiftId: "night", employeeId: "e3", employeeName: "Cara Lim", skill: "Lead" }
    ]
  },
  {
    id: "tue",
    label: "Tuesday",
    date: "Jun 02",
    assignments: [
      { shiftId: "day", employeeId: "e5", employeeName: "Eli Chan", skill: "Lead" },
      { shiftId: "evening", employeeId: "e2", employeeName: "Ben Ho", skill: "Support" }
    ]
  },
  {
    id: "wed",
    label: "Wednesday",
    date: "Jun 03",
    assignments: [
      { shiftId: "day", employeeId: "e1", employeeName: "Ada Wong", skill: "Lead" },
      { shiftId: "night", employeeId: "e3", employeeName: "Cara Lim", skill: "Lead" }
    ]
  }
];

export const coverageNeeds = [
  { id: "mon-day", label: "Monday Day", skill: "Lead", assigned: 1, required: 1, short: 0 },
  { id: "mon-evening", label: "Monday Evening", skill: "Support", assigned: 1, required: 1, short: 0 },
  { id: "tue-night", label: "Tuesday Night", skill: "Lead", assigned: 0, required: 1, short: 1 },
  { id: "wed-evening", label: "Wednesday Evening", skill: "Support", assigned: 0, required: 1, short: 1 }
];

