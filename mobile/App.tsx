import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { coverageNeeds, employees, scheduleDays, shifts } from "./src/data/mock";

const tabs = ["Schedule", "Staff", "Coverage"] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Schedule");
  const [lockedAssignments, setLockedAssignments] = useState<string[]>(["mon-day-e1"]);

  const totalHours = useMemo(
    () => employees.reduce((sum, employee) => sum + employee.scheduledHours, 0),
    []
  );

  function toggleLock(id: string) {
    setLockedAssignments((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>ATSolution</Text>
          <Text style={styles.title}>EScheduler</Text>
        </View>
        <Pressable style={styles.solveButton}>
          <Ionicons name="sparkles" size={18} color="#f7f3e8" />
          <Text style={styles.solveButtonText}>Solve</Text>
        </Pressable>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="Staff" value={String(employees.length)} icon="people" />
        <Metric label="Hours" value={String(totalHours)} icon="time" />
        <Metric label="Short" value="2" icon="warning" tone="alert" />
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "Schedule" && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {scheduleDays.map((day) => (
            <View key={day.id} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{day.label}</Text>
                <Text style={styles.dayDate}>{day.date}</Text>
              </View>
              {shifts.map((shift) => {
                const assignment = day.assignments.find((item) => item.shiftId === shift.id);
                const lockId = `${day.id}-${shift.id}-${assignment?.employeeId ?? "empty"}`;
                const isLocked = lockedAssignments.includes(lockId);
                return (
                  <View key={shift.id} style={styles.shiftRow}>
                    <View style={[styles.shiftStripe, { backgroundColor: shift.color }]} />
                    <View style={styles.shiftBody}>
                      <Text style={styles.shiftName}>{shift.name}</Text>
                      <Text style={styles.shiftTime}>{shift.time}</Text>
                    </View>
                    <View style={styles.assignmentBlock}>
                      <Text style={styles.assignmentName}>{assignment?.employeeName ?? "Unfilled"}</Text>
                      <Text style={styles.assignmentSkill}>{assignment?.skill ?? "Needs lead"}</Text>
                    </View>
                    <Pressable onPress={() => toggleLock(lockId)} style={styles.iconButton}>
                      <Ionicons
                        name={isLocked ? "lock-closed" : "lock-open-outline"}
                        size={18}
                        color={isLocked ? "#121712" : "#6c726a"}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === "Staff" && (
        <FlatList
          contentContainerStyle={styles.content}
          data={employees}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.staffRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
              </View>
              <View style={styles.staffBody}>
                <Text style={styles.staffName}>{item.name}</Text>
                <Text style={styles.staffMeta}>{item.skills.join(" · ")}</Text>
              </View>
              <Text style={styles.hours}>{item.scheduledHours}/{item.maxHours}h</Text>
            </View>
          )}
        />
      )}

      {activeTab === "Coverage" && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {coverageNeeds.map((need) => (
            <View key={need.id} style={styles.coverageRow}>
              <View>
                <Text style={styles.coverageTitle}>{need.label}</Text>
                <Text style={styles.coverageMeta}>{need.skill} coverage</Text>
              </View>
              <View style={[styles.coverageBadge, need.short > 0 && styles.coverageBadgeAlert]}>
                <Text style={[styles.coverageBadgeText, need.short > 0 && styles.coverageBadgeTextAlert]}>
                  {need.assigned}/{need.required}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
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
  shell: {
    flex: 1,
    backgroundColor: "#f7f3e8"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14
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
    backgroundColor: "#fffdf7",
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
    paddingBottom: 36
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
    backgroundColor: "#fffdf7",
    borderColor: "#ded8c7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    minHeight: 72,
    overflow: "hidden"
  },
  shiftStripe: {
    alignSelf: "stretch",
    width: 6
  },
  shiftBody: {
    paddingHorizontal: 12,
    width: 92
  },
  shiftName: {
    color: "#121712",
    fontSize: 15,
    fontWeight: "800"
  },
  shiftTime: {
    color: "#687064",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  assignmentBlock: {
    flex: 1
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
  iconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginRight: 8,
    width: 44
  },
  staffRow: {
    alignItems: "center",
    backgroundColor: "#fffdf7",
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
    backgroundColor: "#fffdf7",
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
  coverageBadge: {
    backgroundColor: "#d9eadf",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  coverageBadgeAlert: {
    backgroundColor: "#f4d5c9"
  },
  coverageBadgeText: {
    color: "#1e4f34",
    fontSize: 14,
    fontWeight: "900"
  },
  coverageBadgeTextAlert: {
    color: "#9d3d22"
  }
});

