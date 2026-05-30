import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  createSchedule,
  getCoverageNeeds,
  getEmployees,
  getScheduleDetail,
  getSchedules,
  getShiftTemplates,
  getSkills,
  getSolveRuns,
  patchAssignment,
  publishSchedule,
  putCoverageNeeds,
  resolveSchedule,
  solveSchedule,
  type CoverageNeed,
  type Employee,
  type Schedule,
  type ScheduleDetail,
  type ShiftTemplate,
  type Skill,
  type SolveRun,
  type SolveResponse,
  type StoredAssignment
} from "./src/lib/api";

const tabs = ["Schedule", "Staff", "Coverage", "Runs"] as const;
type Tab = (typeof tabs)[number];

type SelectedAssignment = {
  assignment: StoredAssignment | null;
  date: string;
  shift: ShiftTemplate;
};

const shiftColors: Record<string, string> = {
  Day: "#2f6f63",
  Evening: "#be7d29",
  Night: "#4b5f96"
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Schedule");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [scheduleDetail, setScheduleDetail] = useState<ScheduleDetail | null>(null);
  const [coverageNeeds, setCoverageNeeds] = useState<CoverageNeed[]>([]);
  const [solveRuns, setSolveRuns] = useState<SolveRun[]>([]);
  const [lastSolve, setLastSolve] = useState<SolveResponse | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<SelectedAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedScheduleId) {
      return;
    }
    void refreshSchedule(selectedScheduleId);
  }, [selectedScheduleId]);

  const metrics = useMemo(() => {
    const totalHours = scheduleDetail?.assignments.reduce((sum, assignment) => {
      const shift = shiftTemplates.find((item) => item.id === assignment.shift_template_id);
      return sum + (shift?.hours ?? 0);
    }, 0) ?? 0;
    const locked = scheduleDetail?.assignments.filter((assignment) => assignment.locked).length ?? 0;
    const shortCount = lastSolve?.understaffing.filter((item) => item.shortfall > 0).length ?? 0;
    return {
      staff: employees.length,
      totalHours,
      shortCount,
      locked
    };
  }, [employees.length, lastSolve, scheduleDetail, shiftTemplates]);

  const groupedDays = useMemo(() => {
    if (!scheduleDetail) {
      return [] as Array<{ date: string; assignments: StoredAssignment[] }>;
    }
    const byDate = new Map<string, StoredAssignment[]>();
    for (const assignment of scheduleDetail.assignments) {
      const current = byDate.get(assignment.date) ?? [];
      current.push(assignment);
      byDate.set(assignment.date, current);
    }
    return Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, assignments]) => ({
        date,
        assignments: assignments.sort((a, b) => a.shift_name.localeCompare(b.shift_name))
      }));
  }, [scheduleDetail]);

  async function bootstrap() {
    try {
      setLoading(true);
      const [employeesData, skillsData, shiftData, scheduleData] = await Promise.all([
        getEmployees(),
        getSkills(),
        getShiftTemplates(),
        getSchedules()
      ]);
      setEmployees(employeesData);
      setSkills(skillsData);
      setShiftTemplates(shiftData);
      let activeScheduleId = scheduleData[0]?.id ?? null;

      if (!activeScheduleId) {
        const created = await createSchedule("2026-05-20", "2026-05-26");
        activeScheduleId = created.id;
        setSchedules([created]);
      } else {
        setSchedules(scheduleData);
      }
      setSelectedScheduleId(activeScheduleId);
      if (activeScheduleId) {
        await refreshSchedule(activeScheduleId);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load app data");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSchedule(scheduleId: string) {
    const [detail, runs] = await Promise.all([
      getScheduleDetail(scheduleId),
      getSolveRuns(scheduleId)
    ]);
    setScheduleDetail(detail);
    setSolveRuns(runs);
    setLastSolve(null);
    await refreshCoverage(detail.period_start, detail.period_end);
  }

  async function refreshCoverage(start: string, end: string) {
    const coverage = await getCoverageNeeds(start, end);
    setCoverageNeeds(coverage);
  }

  async function handleSolve(mode: "solve" | "resolve") {
    if (!selectedScheduleId) {
      return;
    }
    try {
      setBusyAction(mode);
      const response = mode === "solve" ? await solveSchedule(selectedScheduleId) : await resolveSchedule(selectedScheduleId);
      setLastSolve(response);
      await refreshSchedule(selectedScheduleId);
      setActiveTab("Schedule");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Failed to ${mode}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleLock(assignment: StoredAssignment) {
    try {
      setBusyAction(assignment.id);
      await patchAssignment(assignment.id, { locked: !assignment.locked });
      if (selectedScheduleId) {
        await refreshSchedule(selectedScheduleId);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update assignment");
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublish() {
    if (!selectedScheduleId) {
      return;
    }
    try {
      setBusyAction("publish");
      await publishSchedule(selectedScheduleId);
      await refreshSchedule(selectedScheduleId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to publish schedule");
    } finally {
      setBusyAction(null);
    }
  }

  async function bumpCoverage(need: CoverageNeed, delta: number) {
    const nextValue = Math.max(0, need.required_count + delta);
    const payload = coverageNeeds.map((item) =>
      item.date === need.date && item.shift_template_id === need.shift_template_id && item.skill_id === need.skill_id
        ? { ...item, required_count: nextValue }
        : item
    );
    setCoverageNeeds(payload);
    try {
      setBusyAction("coverage");
      const saved = await putCoverageNeeds(payload);
      setCoverageNeeds(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update coverage");
    } finally {
      setBusyAction(null);
    }
  }

  function candidateStaff() {
    if (!selectedAssignment) {
      return [] as Array<{ employee: Employee; state: "valid" | "warn"; reason: string }>;
    }
    const neededSkill = coverageNeeds.find(
      (item) => item.date === selectedAssignment.date && item.shift_template_id === selectedAssignment.shift.id
    )?.skill_id;
    return employees.map((employee) => {
      const hasSkill = neededSkill ? employee.skills.includes(neededSkill) : true;
      return {
        employee,
        state: hasSkill ? "valid" : "warn",
        reason: hasSkill ? "Matches current skill need" : `Missing ${neededSkill ?? "required"} skill`
      };
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingShell}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#2f6f63" />
        <Text style={styles.loadingText}>Loading scheduling workspace</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{scheduleDetail ? `${scheduleDetail.period_start} to ${scheduleDetail.period_end}` : "No period"}</Text>
          <Text style={styles.title}>Schedule</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.secondaryButton} onPress={() => void handlePublish()}>
            <Ionicons name="checkmark-done" size={17} color="#12241d" />
          </Pressable>
          <Pressable style={styles.solveButton} onPress={() => void handleSolve("solve")}>
            <Ionicons name="sparkles" size={18} color="#f7f3e8" />
            <Text style={styles.solveButtonText}>{busyAction === "solve" ? "Solving" : "Solve"}</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.bannerError}>
          <Text style={styles.bannerErrorTitle}>API issue</Text>
          <Text style={styles.bannerErrorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.metricsRow}>
        <Metric label="Staff" value={String(metrics.staff)} icon="people" />
        <Metric label="Hours" value={String(metrics.totalHours)} icon="time" />
        <Metric label="Short" value={String(metrics.shortCount)} icon="warning" tone="alert" />
        <Metric label="Locked" value={String(metrics.locked)} icon="lock-closed" />
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.activeTab]}>
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "Schedule" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerInfoTitle}>Live database-backed schedule</Text>
            <Text style={styles.bannerInfoText}>Assignments, solve runs, and coverage all write to the current period in Supabase.</Text>
          </View>

          {groupedDays.map((day) => (
            <View key={day.date} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{formatDay(day.date)}</Text>
                <Text style={styles.dayDate}>{day.date}</Text>
              </View>
              {shiftTemplates.map((shift) => {
                const assignment = day.assignments.find((item) => item.shift_template_id === shift.id);
                const shortage = lastSolve?.understaffing.find(
                  (item) => item.day === dayIndex(scheduleDetail?.period_start ?? day.date, day.date) && item.shift_id === shift.id
                );
                const shiftColor = shiftColors[shift.name] ?? "#3c4f70";
                return (
                  <Pressable
                    key={`${day.date}-${shift.id}`}
                    style={[styles.shiftRow, shortage?.shortfall ? styles.shiftShort : null, assignment?.locked ? styles.shiftLocked : null]}
                    onPress={() => setSelectedAssignment({ assignment: assignment ?? null, date: day.date, shift })}
                  >
                    <View style={[styles.shiftGlyph, { backgroundColor: shiftColor }]}>
                      <Text style={styles.shiftGlyphText}>{shift.name.slice(0, 1)}</Text>
                    </View>
                    <View style={styles.assignmentBlock}>
                      <Text style={styles.assignmentName}>{assignment?.employee_name ?? "Unfilled"}</Text>
                      <Text style={styles.assignmentSkill}>{shift.name} · {shift.start_time}-{shift.end_time}</Text>
                      {shortage?.shortfall ? <Text style={styles.assignmentFlag}>Short {shortage.shortfall}</Text> : null}
                    </View>
                    <Pressable
                      style={styles.iconButton}
                      disabled={!assignment}
                      onPress={() => assignment && void handleToggleLock(assignment)}
                    >
                      <Ionicons
                        name={assignment?.locked ? "lock-closed" : "lock-open-outline"}
                        size={18}
                        color={assignment?.locked ? "#2f6f63" : "#6c726a"}
                      />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.actionsRow}> 
            <Pressable style={styles.secondaryWideButton} onPress={() => void handleSolve("resolve")}>
              <Text style={styles.secondaryWideText}>{busyAction === "resolve" ? "Re-solving" : "Re-solve with locks"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}

      {activeTab === "Staff" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {employees.map((employee) => (
            <View key={employee.id} style={styles.staffRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(employee.name)}</Text>
              </View>
              <View style={styles.staffBody}>
                <Text style={styles.staffName}>{employee.name}</Text>
                <Text style={styles.staffMeta}>{employee.skills.join(" · ") || "No skills"}</Text>
              </View>
              <Text style={styles.hours}>{employee.max_weekly_hours}h</Text>
            </View>
          ))}

          {selectedAssignment ? (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Eligible staff</Text>
                <Text style={styles.panelMeta}>{selectedAssignment.shift.name}</Text>
              </View>
              {candidateStaff().map(({ employee, state, reason }) => (
                <View key={employee.id} style={styles.candidateRow}>
                  <View>
                    <Text style={styles.candidateName}>{employee.name}</Text>
                    <Text style={styles.candidateReason}>{reason}</Text>
                  </View>
                  <View style={[styles.pill, state === "valid" ? styles.pillValid : styles.pillWarn]}>
                    <Text style={[styles.pillText, state === "valid" ? styles.pillTextValid : styles.pillTextWarn]}>
                      {state === "valid" ? "Valid" : "Warn"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {activeTab === "Coverage" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {coverageNeeds.map((need) => {
            const shift = shiftTemplates.find((item) => item.id === need.shift_template_id);
            const skill = skills.find((item) => item.id === need.skill_id);
            return (
              <View key={`${need.date}-${need.shift_template_id}-${need.skill_id}`} style={styles.coverageRow}>
                <View>
                  <Text style={styles.coverageTitle}>{formatDay(need.date)}</Text>
                  <Text style={styles.coverageMeta}>{shift?.name ?? need.shift_template_id} · {skill?.name ?? need.skill_id}</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable style={styles.stepperButton} onPress={() => void bumpCoverage(need, -1)}>
                    <Text style={styles.stepperButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.stepperValue}>{need.required_count}</Text>
                  <Pressable style={styles.stepperButton} onPress={() => void bumpCoverage(need, 1)}>
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {activeTab === "Runs" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {solveRuns.map((run) => (
            <View key={run.id} style={styles.runRow}>
              <View>
                <Text style={styles.runTitle}>{run.id.slice(0, 8)} · {run.status}</Text>
                <Text style={styles.runMeta}>Objective {run.objective_value ?? "-"} · Runtime {run.runtime_ms ?? 0}ms</Text>
              </View>
              <Text style={styles.runTime}>{new Date(run.created_at).toLocaleDateString()}</Text>
            </View>
          ))}
          {lastSolve ? (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Last solve report</Text>
                <Text style={styles.panelMeta}>{lastSolve.status}</Text>
              </View>
              {lastSolve.understaffing.map((item) => (
                <View key={`${item.day}-${item.shift_id}-${item.skill_id}`} style={styles.issueRow}>
                  <Text style={styles.issueTitle}>Day {item.day + 1} · {item.shift_id}</Text>
                  <Text style={styles.issueMeta}>{item.skill_id} shortfall {item.shortfall}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {selectedAssignment ? (
        <View style={styles.sheetWrap}>
          <View style={styles.sheetBackdrop} />
          <View style={styles.sheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{selectedAssignment.assignment?.employee_name ?? "Open assignment"}</Text>
                <Text style={styles.sheetSubtitle}>{selectedAssignment.date} · {selectedAssignment.shift.name}</Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => setSelectedAssignment(null)}>
                <Ionicons name="close" size={18} color="#12241d" />
              </Pressable>
            </View>
            <Text style={styles.sheetBodyText}>
              Tap the lock on the schedule row to pin this assignment. Coverage and run history are already wired to the live backend.
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "normal"
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "normal" | "alert";
}) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={tone === "alert" ? "#9d3d22" : "#3e5847"} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f1e6",
    gap: 14
  },
  loadingText: {
    color: "#4f584f",
    fontSize: 14,
    fontWeight: "700"
  },
  shell: {
    flex: 1,
    backgroundColor: "#f4f1e6"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  secondaryButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7d1bf",
    backgroundColor: "#fffdf7",
    alignItems: "center",
    justifyContent: "center"
  },
  kicker: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: "#121712",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0
  },
  solveButton: {
    alignItems: "center",
    backgroundColor: "#121712",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  solveButtonText: {
    color: "#f7f3e8",
    fontSize: 15,
    fontWeight: "800"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20
  },
  metric: {
    backgroundColor: "#fffef9",
    borderColor: "#ded8c7",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 12
  },
  metricValue: {
    color: "#121712",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 8
  },
  metricLabel: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase"
  },
  tabs: {
    backgroundColor: "#e6dfce",
    borderRadius: 8,
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 16,
    padding: 4
  },
  tab: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    paddingVertical: 9
  },
  activeTab: {
    backgroundColor: "#fffdf7"
  },
  tabText: {
    color: "#687064",
    fontSize: 14,
    fontWeight: "800"
  },
  activeTabText: {
    color: "#121712"
  },
  content: {
    padding: 20,
    paddingBottom: 120,
    gap: 14
  },
  bannerInfo: {
    borderWidth: 1,
    borderColor: "#bfd5cd",
    backgroundColor: "#eef6f2",
    borderRadius: 16,
    padding: 12
  },
  bannerInfoTitle: {
    color: "#183f34",
    fontSize: 13,
    fontWeight: "800"
  },
  bannerInfoText: {
    color: "#476056",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18
  },
  bannerError: {
    marginHorizontal: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#dfb8ac",
    borderRadius: 16,
    backgroundColor: "#f7e6e0",
    padding: 12
  },
  bannerErrorTitle: {
    color: "#8f351d",
    fontSize: 13,
    fontWeight: "800"
  },
  bannerErrorText: {
    color: "#8f351d",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18
  },
  daySection: {
    marginBottom: 18
  },
  dayHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  dayName: {
    color: "#121712",
    fontSize: 18,
    fontWeight: "800"
  },
  dayDate: {
    color: "#687064",
    fontSize: 13,
    fontWeight: "700"
  },
  shiftRow: {
    alignItems: "center",
    backgroundColor: "#fffef9",
    borderColor: "#ded8c7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    minHeight: 72,
    overflow: "hidden"
  },
  shiftShort: {
    backgroundColor: "#fbefeb",
    borderColor: "#e4c4bb"
  },
  shiftLocked: {
    backgroundColor: "#eef6f2",
    borderColor: "#bfd5cd"
  },
  shiftGlyph: {
    width: 42,
    height: 42,
    borderRadius: 14,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  shiftGlyphText: {
    color: "#fffef9",
    fontSize: 16,
    fontWeight: "900"
  },
  assignmentBlock: {
    flex: 1,
    paddingHorizontal: 12
  },
  assignmentName: {
    color: "#121712",
    fontSize: 15,
    fontWeight: "800"
  },
  assignmentSkill: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  assignmentFlag: {
    color: "#9d3d22",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6
  },
  iconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginRight: 8,
    width: 44
  },
  staffRow: {
    alignItems: "center",
    backgroundColor: "#fffef9",
    borderColor: "#ded8c7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 12
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#d9eadf",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  avatarText: {
    color: "#1e4f34",
    fontSize: 18,
    fontWeight: "900"
  },
  staffBody: {
    flex: 1,
    marginLeft: 12
  },
  staffName: {
    color: "#121712",
    fontSize: 16,
    fontWeight: "800"
  },
  staffMeta: {
    color: "#687064",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4
  },
  hours: {
    color: "#121712",
    fontSize: 15,
    fontWeight: "800"
  },
  coverageRow: {
    alignItems: "center",
    backgroundColor: "#fffef9",
    borderColor: "#ded8c7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 14
  },
  coverageTitle: {
    color: "#121712",
    fontSize: 16,
    fontWeight: "800"
  },
  coverageMeta: {
    color: "#687064",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ded8c7",
    backgroundColor: "#fffdf7",
    alignItems: "center",
    justifyContent: "center"
  },
  stepperButtonText: {
    color: "#12241d",
    fontSize: 14,
    fontWeight: "900"
  },
  stepperValue: {
    minWidth: 18,
    textAlign: "center",
    color: "#12241d",
    fontSize: 15,
    fontWeight: "900"
  },
  runRow: {
    borderWidth: 1,
    borderColor: "#ded8c7",
    borderRadius: 14,
    backgroundColor: "#fffef9",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  runTitle: {
    color: "#12241d",
    fontSize: 14,
    fontWeight: "800"
  },
  runMeta: {
    color: "#687064",
    fontSize: 12,
    marginTop: 4
  },
  runTime: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700"
  },
  panel: {
    borderWidth: 1,
    borderColor: "#ded8c7",
    borderRadius: 16,
    backgroundColor: "#fffef9",
    padding: 12,
    marginTop: 8
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  panelTitle: {
    color: "#12241d",
    fontSize: 14,
    fontWeight: "800"
  },
  panelMeta: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700"
  },
  candidateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#ede7d8"
  },
  candidateName: {
    color: "#12241d",
    fontSize: 14,
    fontWeight: "800"
  },
  candidateReason: {
    color: "#687064",
    fontSize: 12,
    marginTop: 3,
    maxWidth: 220
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  pillValid: {
    backgroundColor: "#d9eadf"
  },
  pillWarn: {
    backgroundColor: "#f4d5c9"
  },
  pillText: {
    fontSize: 11,
    fontWeight: "800"
  },
  pillTextValid: {
    color: "#1e4f34"
  },
  pillTextWarn: {
    color: "#9d3d22"
  },
  issueRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#ede7d8"
  },
  issueTitle: {
    color: "#12241d",
    fontSize: 13,
    fontWeight: "800"
  },
  issueMeta: {
    color: "#687064",
    fontSize: 12,
    marginTop: 4
  },
  actionsRow: {
    marginTop: 4
  },
  secondaryWideButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d7d1bf",
    backgroundColor: "#fffdf7",
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryWideText: {
    color: "#12241d",
    fontSize: 14,
    fontWeight: "800"
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "flex-end"
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 24, 19, 0.2)"
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#fffef9",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#ded8c7"
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#ded8c7",
    marginBottom: 12
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sheetTitle: {
    color: "#12241d",
    fontSize: 20,
    fontWeight: "800"
  },
  sheetSubtitle: {
    color: "#687064",
    fontSize: 13,
    marginTop: 4
  },
  sheetBodyText: {
    color: "#495249",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14
  }
});

function formatDay(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function dayIndex(periodStart: string, currentDate: string) {
  const start = new Date(periodStart);
  const current = new Date(currentDate);
  return Math.round((current.getTime() - start.getTime()) / 86400000);
}
