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
  TextInput,
  View
} from "react-native";

import {
  createEmployee,
  createSchedule,
  createShiftTemplate,
  createSkill,
  getCoverageNeeds,
  getEmployeeAvailability,
  getEmployees,
  getScheduleDetail,
  getSchedules,
  getShiftTemplates,
  getSkills,
  getSolveRuns,
  patchAssignment,
  publishSchedule,
  putCoverageNeeds,
  putEmployeeAvailability,
  replaceEmployeeSkills,
  resolveSchedule,
  solveSchedule,
  updateEmployee,
  type AvailabilityEntry,
  type CoverageNeed,
  type Employee,
  type EmployeeCreate,
  type Schedule,
  type ScheduleDetail,
  type ShiftTemplate,
  type ShiftTemplateCreate,
  type Skill,
  type SolveRun,
  type SolveResponse,
  type StoredAssignment
} from "./src/lib/api";
import { clearSession, loadStoredSession, signInWithEmail, signUpWithEmail, type AuthSession } from "./src/lib/auth";

const tabs = ["Schedule", "Staff", "Coverage", "Setup", "Runs"] as const;
type Tab = (typeof tabs)[number];
type EmploymentType = EmployeeCreate["employment_type"];
type AvailabilityType = AvailabilityEntry["type"];

type SelectedAssignment = {
  assignment: StoredAssignment | null;
  date: string;
  shift: ShiftTemplate;
};

type StaffForm = {
  name: string;
  maxWeeklyHours: string;
  employmentType: EmploymentType;
};

type ShiftForm = {
  name: string;
  startTime: string;
  endTime: string;
  hours: string;
};

type AvailabilityForm = {
  dayOfWeek: string;
  date: string;
  startTime: string;
  endTime: string;
  type: AvailabilityType;
};

type ScheduleForm = {
  periodStart: string;
  periodEnd: string;
};

const shiftColors: Record<string, string> = {
  Day: "#2f6f63",
  Evening: "#be7d29",
  Night: "#4b5f96"
};

const defaultStaffForm: StaffForm = {
  name: "",
  maxWeeklyHours: "40",
  employmentType: "full_time"
};

const defaultShiftForm: ShiftForm = {
  name: "",
  startTime: "09:00",
  endTime: "17:00",
  hours: "8"
};

const defaultAvailabilityForm: AvailabilityForm = {
  dayOfWeek: "",
  date: "",
  startTime: "09:00",
  endTime: "17:00",
  type: "available"
};

const defaultScheduleForm: ScheduleForm = {
  periodStart: "2026-06-01",
  periodEnd: "2026-06-07"
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Schedule");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [scheduleDetail, setScheduleDetail] = useState<ScheduleDetail | null>(null);
  const [coverageNeeds, setCoverageNeeds] = useState<CoverageNeed[]>([]);
  const [employeeAvailability, setEmployeeAvailability] = useState<AvailabilityEntry[]>([]);
  const [solveRuns, setSolveRuns] = useState<SolveRun[]>([]);
  const [lastSolve, setLastSolve] = useState<SolveResponse | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<SelectedAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [session, setSession] = useState<AuthSession | null>(null);

  const [staffForm, setStaffForm] = useState<StaffForm>(defaultStaffForm);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [availabilityForm, setAvailabilityForm] = useState<AvailabilityForm>(defaultAvailabilityForm);
  const [shiftForm, setShiftForm] = useState<ShiftForm>(defaultShiftForm);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(defaultScheduleForm);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!selectedScheduleId) {
      setScheduleDetail(null);
      setCoverageNeeds([]);
      setSolveRuns([]);
      return;
    }
    void refreshSchedule(selectedScheduleId);
  }, [selectedScheduleId]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployeeAvailability([]);
      setSelectedSkillIds([]);
      setStaffForm(defaultStaffForm);
      setEditingEmployeeId(null);
      return;
    }
    const employee = employees.find((item) => item.id === selectedEmployeeId);
    if (!employee) {
      return;
    }
    setEditingEmployeeId(employee.id);
    setStaffForm({
      name: employee.name,
      maxWeeklyHours: String(employee.max_weekly_hours),
      employmentType: employee.employment_type
    });
    setSelectedSkillIds(
      skills.filter((skill) => employee.skills.includes(skill.name)).map((skill) => skill.id)
    );
    void refreshEmployeeAvailability(employee.id);
  }, [selectedEmployeeId, employees, skills]);

  const metrics = useMemo(() => {
    const totalHours = scheduleDetail?.assignments.reduce((sum, assignment) => {
      const shift = shiftTemplates.find((item) => item.id === assignment.shift_template_id);
      return sum + (shift?.hours ?? 0);
    }, 0) ?? 0;
    const locked = scheduleDetail?.assignments.filter((assignment) => assignment.locked).length ?? 0;
    const shortCount = lastSolve?.understaffing.filter((item) => item.shortfall > 0).length ?? 0;
    return {
      staff: employees.length,
      shifts: shiftTemplates.length,
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

  async function initialize() {
    try {
      const stored = await loadStoredSession();
      setSession(stored);
      if (!stored) {
        setLoading(false);
        return;
      }
      await bootstrap();
    } catch (caught) {
      setError(messageOf(caught, "Failed to initialize auth"));
      setLoading(false);
    }
  }

  async function bootstrap() {
    try {
      setLoading(true);
      setError(null);
      const [employeesData, skillsData, shiftData, scheduleData] = await Promise.all([
        getEmployees(),
        getSkills(),
        getShiftTemplates(),
        getSchedules()
      ]);
      setEmployees(employeesData);
      setSkills(skillsData);
      setShiftTemplates(shiftData);
      setSchedules(scheduleData);
      const nextScheduleId = scheduleData[0]?.id ?? null;
      setSelectedScheduleId(nextScheduleId);
      const nextEmployeeId = employeesData[0]?.id ?? null;
      setSelectedEmployeeId(nextEmployeeId);
      if (nextEmployeeId) {
        await refreshEmployeeAvailability(nextEmployeeId);
      }
      if (nextScheduleId) {
        await refreshSchedule(nextScheduleId);
      }
    } catch (caught) {
      setError(messageOf(caught, "Failed to load app data"));
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

  async function refreshEmployeeAvailability(employeeId: string) {
    const availability = await getEmployeeAvailability(employeeId);
    setEmployeeAvailability(availability);
  }

  async function handleEmailAuth(mode: "signin" | "signup") {
    setError(null);
    setAuthMessage(null);
    if (!authEmail.trim() || authPassword.length < 6) {
      setError("Enter an email and a password with at least 6 characters.");
      return;
    }
    try {
      setBusyAction(mode);
      if (mode === "signin") {
        const nextSession = await signInWithEmail(authEmail, authPassword);
        setSession(nextSession);
        await bootstrap();
        return;
      }
      const result = await signUpWithEmail(authEmail, authPassword);
      if (result.session) {
        setSession(result.session);
        await bootstrap();
        return;
      }
      setAuthMessage(result.message ?? "Account created. Check your email before signing in.");
    } catch (caught) {
      setError(messageOf(caught, `Failed to ${mode === "signin" ? "sign in" : "create account"}`));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateSchedule() {
    if (!scheduleForm.periodStart || !scheduleForm.periodEnd) {
      setError("Enter a schedule start and end date.");
      return;
    }
    try {
      setBusyAction("create-schedule");
      setError(null);
      const created = await createSchedule(scheduleForm.periodStart, scheduleForm.periodEnd);
      const nextSchedules = [created, ...schedules];
      setSchedules(nextSchedules);
      setSelectedScheduleId(created.id);
      setNotice(`Created schedule for ${created.period_start} to ${created.period_end}.`);
      setActiveTab("Coverage");
    } catch (caught) {
      setError(messageOf(caught, "Failed to create schedule"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateShift() {
    if (!shiftForm.name.trim()) {
      setError("Enter a shift name.");
      return;
    }
    try {
      setBusyAction("create-shift");
      setError(null);
      const created = await createShiftTemplate({
        name: shiftForm.name.trim(),
        start_time: shiftForm.startTime,
        end_time: shiftForm.endTime,
        hours: Number(shiftForm.hours)
      });
      setShiftTemplates([...shiftTemplates, created].sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setShiftForm(defaultShiftForm);
      setNotice(`Added shift ${created.name}.`);
    } catch (caught) {
      setError(messageOf(caught, "Failed to create shift"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateSkill() {
    if (!skillDraft.trim()) {
      setError("Enter a skill name.");
      return;
    }
    try {
      setBusyAction("create-skill");
      setError(null);
      const created = await createSkill({ name: skillDraft.trim() });
      setSkills([...skills, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSkillDraft("");
      setNotice(`Added skill ${created.name}.`);
    } catch (caught) {
      setError(messageOf(caught, "Failed to create skill"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveEmployee() {
    if (!staffForm.name.trim()) {
      setError("Enter a staff member name.");
      return;
    }
    const payload: EmployeeCreate = {
      name: staffForm.name.trim(),
      max_weekly_hours: Number(staffForm.maxWeeklyHours),
      employment_type: staffForm.employmentType
    };
    try {
      setBusyAction("save-employee");
      setError(null);
      let saved: Employee;
      if (editingEmployeeId) {
        saved = await updateEmployee(editingEmployeeId, payload);
      } else {
        saved = await createEmployee(payload);
      }
      await replaceEmployeeSkills(saved.id, selectedSkillIds);
      const employeesData = await getEmployees();
      setEmployees(employeesData);
      setSelectedEmployeeId(saved.id);
      setEditingEmployeeId(saved.id);
      setNotice(`${saved.name} saved.`);
      if (!employeeAvailability.length) {
        setActiveTab("Staff");
      }
    } catch (caught) {
      setError(messageOf(caught, "Failed to save employee"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveAvailability() {
    if (!selectedEmployeeId) {
      setError("Select a staff member first.");
      return;
    }
    if (!availabilityForm.startTime || !availabilityForm.endTime) {
      setError("Enter availability start and end times.");
      return;
    }
    const entry: AvailabilityEntry = {
      day_of_week: availabilityForm.dayOfWeek ? Number(availabilityForm.dayOfWeek) : null,
      date: availabilityForm.date || null,
      start_time: availabilityForm.startTime,
      end_time: availabilityForm.endTime,
      type: availabilityForm.type
    };
    try {
      setBusyAction("save-availability");
      setError(null);
      const saved = await putEmployeeAvailability(selectedEmployeeId, [...employeeAvailability, entry]);
      setEmployeeAvailability(saved);
      setAvailabilityForm(defaultAvailabilityForm);
      setNotice("Availability saved.");
    } catch (caught) {
      setError(messageOf(caught, "Failed to save availability"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSolve(mode: "solve" | "resolve") {
    if (!selectedScheduleId) {
      setError("Create or select a schedule first.");
      return;
    }
    try {
      setBusyAction(mode);
      setError(null);
      const response = mode === "solve" ? await solveSchedule(selectedScheduleId) : await resolveSchedule(selectedScheduleId);
      setLastSolve(response);
      await refreshSchedule(selectedScheduleId);
      setActiveTab("Schedule");
    } catch (caught) {
      setError(messageOf(caught, `Failed to ${mode}`));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleLock(assignment: StoredAssignment) {
    try {
      setBusyAction(assignment.id);
      setError(null);
      await patchAssignment(assignment.id, { locked: !assignment.locked });
      if (selectedScheduleId) {
        await refreshSchedule(selectedScheduleId);
      }
    } catch (caught) {
      setError(messageOf(caught, "Failed to update assignment"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublish() {
    if (!selectedScheduleId) {
      setError("Create or select a schedule first.");
      return;
    }
    try {
      setBusyAction("publish");
      setError(null);
      await publishSchedule(selectedScheduleId);
      await refreshSchedule(selectedScheduleId);
      setNotice("Schedule published.");
    } catch (caught) {
      setError(messageOf(caught, "Failed to publish schedule"));
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
      setError(null);
      const saved = await putCoverageNeeds(payload);
      setCoverageNeeds(saved);
    } catch (caught) {
      setError(messageOf(caught, "Failed to update coverage"));
    } finally {
      setBusyAction(null);
    }
  }

  function handleStartNewEmployee() {
    setSelectedEmployeeId(null);
    setEditingEmployeeId(null);
    setSelectedSkillIds([]);
    setEmployeeAvailability([]);
    setStaffForm(defaultStaffForm);
    setAvailabilityForm(defaultAvailabilityForm);
  }

  function toggleSkill(skillId: string) {
    setSelectedSkillIds((current) =>
      current.includes(skillId) ? current.filter((item) => item !== skillId) : [...current, skillId]
    );
  }

  function candidateStaff() {
    if (!selectedAssignment) {
      return [] as Array<{ employee: Employee; state: "valid" | "warn"; reason: string }>;
    }
    const neededSkill = coverageNeeds.find(
      (item) => item.date === selectedAssignment.date && item.shift_template_id === selectedAssignment.shift.id
    )?.skill_id;
    return employees.map((employee) => {
      const hasSkill = neededSkill
        ? skills.find((skill) => skill.id === neededSkill && employee.skills.includes(skill.name)) !== undefined
        : true;
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

  if (!session) {
    return (
      <SafeAreaView style={styles.loadingShell}>
        <StatusBar style="dark" />
        <View style={styles.authCard}>
          <Text style={styles.authKicker}>Supabase Auth</Text>
          <Text style={styles.authTitle}>Manager sign-in required</Text>
          <Text style={styles.authText}>Sign in with a manager account or create one with email and password.</Text>
          <TextInput
            style={styles.authInput}
            value={authEmail}
            onChangeText={setAuthEmail}
            placeholder="Email"
            placeholderTextColor="#858b80"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
          />
          <TextInput
            style={styles.authInput}
            value={authPassword}
            onChangeText={setAuthPassword}
            placeholder="Password"
            placeholderTextColor="#858b80"
            autoCapitalize="none"
            autoComplete="password"
            secureTextEntry
          />
          {error ? <Text style={styles.authError}>{error}</Text> : null}
          {authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}
          <Pressable style={styles.authButton} onPress={() => void handleEmailAuth("signin")}>
            <Ionicons name="log-in-outline" size={18} color="#fffdf7" />
            <Text style={styles.authButtonText}>{busyAction === "signin" ? "Signing in" : "Sign in"}</Text>
          </Pressable>
          <Pressable style={styles.authSecondaryButton} onPress={() => void handleEmailAuth("signup")}>
            <Ionicons name="person-add-outline" size={18} color="#12241d" />
            <Text style={styles.authSecondaryButtonText}>{busyAction === "signup" ? "Creating account" : "Create account"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.kicker}>{scheduleDetail ? `${scheduleDetail.period_start} to ${scheduleDetail.period_end}` : "No active schedule"}</Text>
          <Text style={styles.title}>EScheduler</Text>
          <Text style={styles.userLine}>{session.user.email ?? session.user.name ?? "Signed in"}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              void clearSession();
              setSession(null);
            }}
          >
            <Ionicons name="log-out-outline" size={17} color="#12241d" />
          </Pressable>
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
          <Text style={styles.bannerErrorTitle}>Issue</Text>
          <Text style={styles.bannerErrorText}>{error}</Text>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerInfoTitle}>Updated</Text>
          <Text style={styles.bannerInfoText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.metricsRow}>
        <Metric label="Staff" value={String(metrics.staff)} icon="people" />
        <Metric label="Shifts" value={String(metrics.shifts)} icon="time" />
        <Metric label="Hours" value={String(metrics.totalHours)} icon="calendar" />
        <Metric label="Short" value={String(metrics.shortCount)} icon="warning" tone="alert" />
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.activeTab]}>
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "Setup" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SectionCard
            title="Schedule Period"
            subtitle="Create a schedule window before entering coverage or solving."
            action={
              <Pressable style={styles.primaryInlineButton} onPress={() => void handleCreateSchedule()}>
                <Text style={styles.primaryInlineButtonText}>{busyAction === "create-schedule" ? "Saving" : "Create"}</Text>
              </Pressable>
            }
          >
            <FieldRow label="Start">
              <TextInput style={styles.input} value={scheduleForm.periodStart} onChangeText={(value) => setScheduleForm((current) => ({ ...current, periodStart: value }))} />
            </FieldRow>
            <FieldRow label="End">
              <TextInput style={styles.input} value={scheduleForm.periodEnd} onChangeText={(value) => setScheduleForm((current) => ({ ...current, periodEnd: value }))} />
            </FieldRow>
            <View style={styles.chipRow}>
              {schedules.map((schedule) => (
                <Pressable key={schedule.id} style={[styles.choiceChip, selectedScheduleId === schedule.id && styles.choiceChipActive]} onPress={() => setSelectedScheduleId(schedule.id)}>
                  <Text style={[styles.choiceChipText, selectedScheduleId === schedule.id && styles.choiceChipTextActive]}>{schedule.period_start}</Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>

          <SectionCard
            title="Shift Templates"
            subtitle="Define named shifts that can be staffed during each day."
            action={
              <Pressable style={styles.primaryInlineButton} onPress={() => void handleCreateShift()}>
                <Text style={styles.primaryInlineButtonText}>{busyAction === "create-shift" ? "Saving" : "Add shift"}</Text>
              </Pressable>
            }
          >
            <FieldRow label="Name">
              <TextInput style={styles.input} value={shiftForm.name} onChangeText={(value) => setShiftForm((current) => ({ ...current, name: value }))} placeholder="Day" />
            </FieldRow>
            <View style={styles.inlineFields}>
              <MiniField label="Start" value={shiftForm.startTime} onChange={(value) => setShiftForm((current) => ({ ...current, startTime: value }))} />
              <MiniField label="End" value={shiftForm.endTime} onChange={(value) => setShiftForm((current) => ({ ...current, endTime: value }))} />
              <MiniField label="Hours" value={shiftForm.hours} onChange={(value) => setShiftForm((current) => ({ ...current, hours: value }))} />
            </View>
            {shiftTemplates.map((shift) => (
              <ListRow key={shift.id} title={shift.name} meta={`${shift.start_time} - ${shift.end_time} · ${shift.hours}h`} />
            ))}
          </SectionCard>

          <SectionCard
            title="Skill Library"
            subtitle="Create the skills that coverage and staff qualification depend on."
            action={
              <Pressable style={styles.primaryInlineButton} onPress={() => void handleCreateSkill()}>
                <Text style={styles.primaryInlineButtonText}>{busyAction === "create-skill" ? "Saving" : "Add skill"}</Text>
              </Pressable>
            }
          >
            <TextInput style={styles.input} value={skillDraft} onChangeText={setSkillDraft} placeholder="RN, Cashier, Supervisor" />
            <View style={styles.chipRow}>
              {skills.map((skill) => (
                <View key={skill.id} style={styles.staticChip}>
                  <Text style={styles.staticChipText}>{skill.name}</Text>
                </View>
              ))}
            </View>
          </SectionCard>
        </ScrollView>
      ) : null}

      {activeTab === "Staff" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SectionCard
            title="Staff Directory"
            subtitle="Create staff, assign skills, and record availability before solving."
            action={
              <Pressable style={styles.secondaryInlineButton} onPress={handleStartNewEmployee}>
                <Text style={styles.secondaryInlineButtonText}>New</Text>
              </Pressable>
            }
          >
            <FieldRow label="Name">
              <TextInput style={styles.input} value={staffForm.name} onChangeText={(value) => setStaffForm((current) => ({ ...current, name: value }))} placeholder="Alex Morgan" />
            </FieldRow>
            <View style={styles.inlineFields}>
              <MiniField label="Weekly hours" value={staffForm.maxWeeklyHours} onChange={(value) => setStaffForm((current) => ({ ...current, maxWeeklyHours: value }))} />
              <MiniField label="Type" value={staffForm.employmentType} onChange={(value) => setStaffForm((current) => ({ ...current, employmentType: value as EmploymentType }))} />
            </View>
            <Text style={styles.subLabel}>Skills</Text>
            <View style={styles.chipRow}>
              {skills.map((skill) => {
                const active = selectedSkillIds.includes(skill.id);
                return (
                  <Pressable key={skill.id} style={[styles.choiceChip, active && styles.choiceChipActive]} onPress={() => toggleSkill(skill.id)}>
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{skill.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.primaryWideButton} onPress={() => void handleSaveEmployee()}>
              <Text style={styles.primaryWideButtonText}>{busyAction === "save-employee" ? "Saving" : editingEmployeeId ? "Update staff" : "Add staff"}</Text>
            </Pressable>
          </SectionCard>

          <SectionCard title="Availability" subtitle="Add repeating day-of-week or date-specific availability for the selected person.">
            <Text style={styles.subLabel}>Selected staff</Text>
            <View style={styles.chipRow}>
              {employees.map((employee) => {
                const active = selectedEmployeeId === employee.id;
                return (
                  <Pressable key={employee.id} style={[styles.choiceChip, active && styles.choiceChipActive]} onPress={() => setSelectedEmployeeId(employee.id)}>
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{employee.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.inlineFields}>
              <MiniField label="Day 0-6" value={availabilityForm.dayOfWeek} onChange={(value) => setAvailabilityForm((current) => ({ ...current, dayOfWeek: value }))} />
              <MiniField label="Date" value={availabilityForm.date} onChange={(value) => setAvailabilityForm((current) => ({ ...current, date: value }))} />
            </View>
            <View style={styles.inlineFields}>
              <MiniField label="Start" value={availabilityForm.startTime} onChange={(value) => setAvailabilityForm((current) => ({ ...current, startTime: value }))} />
              <MiniField label="End" value={availabilityForm.endTime} onChange={(value) => setAvailabilityForm((current) => ({ ...current, endTime: value }))} />
              <MiniField label="Type" value={availabilityForm.type} onChange={(value) => setAvailabilityForm((current) => ({ ...current, type: value as AvailabilityType }))} />
            </View>
            <Pressable style={styles.primaryWideButton} onPress={() => void handleSaveAvailability()}>
              <Text style={styles.primaryWideButtonText}>{busyAction === "save-availability" ? "Saving" : "Add availability"}</Text>
            </Pressable>
            {employeeAvailability.map((entry, index) => (
              <ListRow
                key={`${entry.date ?? entry.day_of_week ?? index}-${entry.start_time}`}
                title={`${entry.type} · ${entry.start_time}-${entry.end_time}`}
                meta={entry.date ? entry.date : `day ${entry.day_of_week ?? "any"}`}
              />
            ))}
          </SectionCard>

          <SectionCard title="Current Staff" subtitle="Saved staff records from the live backend.">
            {employees.map((employee) => (
              <Pressable key={employee.id} style={styles.staffRow} onPress={() => setSelectedEmployeeId(employee.id)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(employee.name)}</Text>
                </View>
                <View style={styles.staffBody}>
                  <Text style={styles.staffName}>{employee.name}</Text>
                  <Text style={styles.staffMeta}>{employee.skills.join(" · ") || "No skills assigned"}</Text>
                </View>
                <Text style={styles.hours}>{employee.max_weekly_hours}h</Text>
              </Pressable>
            ))}
          </SectionCard>
        </ScrollView>
      ) : null}

      {activeTab === "Coverage" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SectionCard title="Coverage Targets" subtitle="Set required counts per date, shift, and skill for the active schedule.">
            {selectedScheduleId ? null : <Text style={styles.emptyText}>Create a schedule period in Setup first.</Text>}
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
            {!coverageNeeds.length && selectedScheduleId ? <Text style={styles.emptyText}>No coverage rows exist yet for this period. Seed them in the database or add a backend helper for bulk generation.</Text> : null}
          </SectionCard>
        </ScrollView>
      ) : null}

      {activeTab === "Schedule" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SectionCard title="Assignments" subtitle="Solve against the configured schedule, coverage, and staff data.">
            {!selectedScheduleId ? <Text style={styles.emptyText}>Create a schedule in Setup before solving.</Text> : null}
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
                      <Pressable style={styles.iconButton} disabled={!assignment} onPress={() => assignment && void handleToggleLock(assignment)}>
                        <Ionicons name={assignment?.locked ? "lock-closed" : "lock-open-outline"} size={18} color={assignment?.locked ? "#2f6f63" : "#6c726a"} />
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
          </SectionCard>

          {selectedAssignment ? (
            <SectionCard title="Eligible Staff" subtitle={`${selectedAssignment.date} · ${selectedAssignment.shift.name}`}>
              {candidateStaff().map(({ employee, state, reason }) => (
                <View key={employee.id} style={styles.candidateRow}>
                  <View>
                    <Text style={styles.candidateName}>{employee.name}</Text>
                    <Text style={styles.candidateReason}>{reason}</Text>
                  </View>
                  <View style={[styles.pill, state === "valid" ? styles.pillValid : styles.pillWarn]}>
                    <Text style={[styles.pillText, state === "valid" ? styles.pillTextValid : styles.pillTextWarn]}>{state === "valid" ? "Valid" : "Warn"}</Text>
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}
        </ScrollView>
      ) : null}

      {activeTab === "Runs" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SectionCard title="Solver Runs" subtitle="Review runtime and shortfall outcomes for the active schedule.">
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
          </SectionCard>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderText}>
          <Text style={styles.panelTitle}>{title}</Text>
          <Text style={styles.panelSubTitle}>{subtitle}</Text>
        </View>
        {action ?? null}
      </View>
      {children}
    </View>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.miniField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} />
    </View>
  );
}

function ListRow({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.listRow}>
      <Text style={styles.listRowTitle}>{title}</Text>
      <Text style={styles.listRowMeta}>{meta}</Text>
    </View>
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

function messageOf(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: "long" });
}

function dayIndex(start: string, current: string) {
  const left = new Date(start);
  const right = new Date(current);
  return Math.round((right.getTime() - left.getTime()) / 86400000);
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
  authCard: {
    width: "88%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#d7d1bf",
    backgroundColor: "#fffef9",
    borderRadius: 18,
    padding: 20
  },
  authKicker: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  authTitle: {
    color: "#12241d",
    fontSize: 26,
    fontWeight: "800",
    marginTop: 8
  },
  authText: {
    color: "#4f584f",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10
  },
  authInput: {
    width: "100%",
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7d1bf",
    backgroundColor: "#f8f5eb",
    color: "#12241d",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 12,
    paddingHorizontal: 14
  },
  authError: {
    color: "#9d3d22",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10
  },
  authMessage: {
    color: "#2f6f63",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10
  },
  authButton: {
    marginTop: 16,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#12241d",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  authButtonText: {
    color: "#fffdf7",
    fontSize: 14,
    fontWeight: "800"
  },
  authSecondaryButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cfc8b6",
    backgroundColor: "#fffef9",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  authSecondaryButtonText: {
    color: "#12241d",
    fontSize: 14,
    fontWeight: "800"
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16
  },
  headerTextBlock: {
    flex: 1
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start"
  },
  kicker: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#121712",
    fontSize: 28,
    fontWeight: "800"
  },
  userLine: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
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
    marginHorizontal: 20,
    marginTop: 10,
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
  panel: {
    borderWidth: 1,
    borderColor: "#ded8c7",
    borderRadius: 16,
    backgroundColor: "#fffef9",
    padding: 14,
    gap: 12
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  panelHeaderText: {
    flex: 1
  },
  panelTitle: {
    color: "#12241d",
    fontSize: 16,
    fontWeight: "800"
  },
  panelSubTitle: {
    color: "#687064",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18
  },
  panelMeta: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700"
  },
  fieldRow: {
    gap: 6
  },
  fieldLabel: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d7d1bf",
    backgroundColor: "#f8f5eb",
    color: "#12241d",
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "700"
  },
  inlineFields: {
    flexDirection: "row",
    gap: 10
  },
  miniField: {
    flex: 1,
    gap: 6
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choiceChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d0c8b7",
    backgroundColor: "#fffef9",
    alignItems: "center",
    justifyContent: "center"
  },
  choiceChipActive: {
    backgroundColor: "#12241d",
    borderColor: "#12241d"
  },
  choiceChipText: {
    color: "#12241d",
    fontSize: 12,
    fontWeight: "800"
  },
  choiceChipTextActive: {
    color: "#fffef9"
  },
  staticChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#ece6d7",
    alignItems: "center",
    justifyContent: "center"
  },
  staticChipText: {
    color: "#3f493f",
    fontSize: 12,
    fontWeight: "800"
  },
  subLabel: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  primaryInlineButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: "#12241d",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primaryInlineButtonText: {
    color: "#fffef9",
    fontSize: 13,
    fontWeight: "800"
  },
  secondaryInlineButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d0c8b7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  secondaryInlineButtonText: {
    color: "#12241d",
    fontSize: 13,
    fontWeight: "800"
  },
  primaryWideButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#12241d",
    alignItems: "center",
    justifyContent: "center"
  },
  primaryWideButtonText: {
    color: "#fffef9",
    fontSize: 14,
    fontWeight: "800"
  },
  listRow: {
    borderTopWidth: 1,
    borderTopColor: "#ece6d7",
    paddingTop: 10
  },
  listRowTitle: {
    color: "#12241d",
    fontSize: 14,
    fontWeight: "800"
  },
  listRowMeta: {
    color: "#687064",
    fontSize: 12,
    marginTop: 4
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
  staffRow: {
    alignItems: "center",
    backgroundColor: "#fffef9",
    borderColor: "#ded8c7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
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
  emptyText: {
    color: "#687064",
    fontSize: 13,
    lineHeight: 20
  }
});
