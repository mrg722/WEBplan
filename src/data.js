export const EMPTY_DATA = {
  schemaVersion: 2,
  meta: { updatedAt: new Date().toISOString() },
  tasks: [],
  nonNegotiables: [],
  priorities: [],
  habits: [],
  training: [],
  goals: [],
  days: {},
  weekly: {},
  settings: {
    waterGoal: 2,
    studyGoalMinutes: 120,
    sleepGoalMinutes: 480,
    stepsGoal: 10000
  },
  notifications: {
    enabled: false,
    leadMinutes: 15,
    overdue: true,
    morning: false,
    morningTime: "08:00"
  },
  sync: {
    enabled: false,
    endpoint: "",
    token: "",
    lastSync: null
  }
};

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}