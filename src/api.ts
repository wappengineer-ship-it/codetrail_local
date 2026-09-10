import { mockBootstrap } from './mockData';
import type { BootstrapData, CodingSession, DashboardData, Goal, LearningSession, Project } from './types';

const STORAGE_KEY = 'codetrail.local.v1';

type LocalStore = {
  bootstrap: BootstrapData;
  codingSessions: CodingSession[];
  learningSessions: LearningSession[];
};

export class ApiError extends Error {
  constructor(public status: number) {
    super(`Request failed: ${status}`);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
}

function writeStore(store: LocalStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function readStore(): LocalStore {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored) as LocalStore;

  const initial = {
    bootstrap: clone(mockBootstrap),
    codingSessions: clone(mockBootstrap.recentCoding),
    learningSessions: clone(mockBootstrap.recentLearning),
  };
  writeStore(initial);
  return initial;
}

function dateKey(date: string) {
  return date.slice(0, 10);
}

function isInRange(date: string, range: string) {
  const today = new Date();
  const candidate = new Date(`${date}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (range === 'today') return candidate.getTime() === start.getTime();
  const days = range === 'month' ? 30 : range === 'all' ? Infinity : 7;
  return (start.getTime() - candidate.getTime()) / 86400000 < days && candidate <= start;
}

function buildDashboard(store: LocalStore, range: string): DashboardData {
  const sessions = [
    ...store.codingSessions.map((session) => ({ ...session, kind: 'coding' as const })),
    ...store.learningSessions.map((session) => ({ ...session, kind: 'learning' as const })),
  ];
  const today = dateKey(new Date().toISOString());
  const inRange = sessions.filter((session) => isInRange(dateKey(session.sessionDate), range));
  const codingMinutesToday = store.codingSessions.filter((session) => dateKey(session.sessionDate) === today).reduce((sum, session) => sum + session.minutes, 0);
  const learningMinutesToday = store.learningSessions.filter((session) => dateKey(session.sessionDate) === today).reduce((sum, session) => sum + session.minutes, 0);
  const codingRange = inRange.filter((session) => session.kind === 'coding').reduce((sum, session) => sum + session.minutes, 0);
  const learningRange = inRange.filter((session) => session.kind === 'learning').reduce((sum, session) => sum + session.minutes, 0);
  const days = Array.from({ length: range === 'today' ? 1 : range === 'all' ? 14 : range === 'month' ? 30 : 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const key = dateKey(date.toISOString());
    const daySessions = sessions.filter((session) => dateKey(session.sessionDate) === key);
    const codingHours = daySessions.filter((session) => session.kind === 'coding').reduce((sum, session) => sum + session.minutes, 0) / 60;
    const learningHours = daySessions.filter((session) => session.kind === 'learning').reduce((sum, session) => sum + session.minutes, 0) / 60;
    return { date: key, codingHours, learningHours, totalHours: codingHours + learningHours };
  });
  const technologyTotals = new Map<string, { name: string; color: string; minutes: number }>();
  inRange.forEach((session) => session.technologies.forEach(({ technology }) => {
    const existing = technologyTotals.get(technology.id) ?? { name: technology.name, color: technology.color, minutes: 0 };
    existing.minutes += session.minutes;
    technologyTotals.set(technology.id, existing);
  }));

  return {
    stats: {
      codingHoursToday: codingMinutesToday / 60,
      learningHoursToday: learningMinutesToday / 60,
      totalHoursToday: (codingMinutesToday + learningMinutesToday) / 60,
      rangeCodingHours: codingRange / 60,
      rangeLearningHours: learningRange / 60,
      rangeTotalHours: (codingRange + learningRange) / 60,
      rangeLabel: range === 'today' ? 'Today' : range === 'month' ? 'Last 30 days' : range === 'all' ? 'All time' : 'This week',
      codingHoursThisWeek: sessions.filter((session) => session.kind === 'coding' && isInRange(dateKey(session.sessionDate), 'week')).reduce((sum, session) => sum + session.minutes, 0) / 60,
      learningHoursThisWeek: sessions.filter((session) => session.kind === 'learning' && isInRange(dateKey(session.sessionDate), 'week')).reduce((sum, session) => sum + session.minutes, 0) / 60,
      totalHoursLast30Days: sessions.filter((session) => isInRange(dateKey(session.sessionDate), 'month')).reduce((sum, session) => sum + session.minutes, 0) / 60,
      streakDays: days.filter((day) => day.totalHours > 0).length,
      activeGoalCount: store.bootstrap.goals.filter((goal) => goal.status === 'ACTIVE').length,
    },
    chart: days.slice().reverse().map((day) => ({ date: day.date, hours: day.totalHours })),
    history: days,
    technologies: [...technologyTotals.values()].map((technology) => ({ ...technology, hours: technology.minutes / 60 })).sort((a, b) => b.minutes - a.minutes),
    insights: ['Your activity is stored locally in this browser.', 'Keep logging focused sessions to make your trends more useful.', 'Use Projects and Goals to give your work a clear shape.'],
  };
}

export async function loadBootstrap() {
  const store = readStore();
  return clone({ ...store.bootstrap, recentCoding: store.codingSessions.slice(-8).reverse(), recentLearning: store.learningSessions.slice(-8).reverse() });
}

export async function loadDashboard(range = 'week') {
  return buildDashboard(readStore(), range);
}

export async function loadCurrentUser() {
  return { user: readStore().bootstrap.user };
}

export async function login(payload: { email: string; password: string }) {
  const store = readStore();
  store.bootstrap.user = { ...store.bootstrap.user, email: payload.email };
  writeStore(store);
  return { user: store.bootstrap.user };
}

export async function register(payload: { email: string; name: string; password: string }) {
  const store = readStore();
  store.bootstrap.user = { ...store.bootstrap.user, email: payload.email, name: payload.name || 'Local Developer' };
  writeStore(store);
  return { user: store.bootstrap.user };
}

export async function loginDemo() {
  return { user: readStore().bootstrap.user };
}

export async function logout() {}

type SessionPayload = { type: 'CODING' | 'LEARNING'; title: string; topic?: string; source?: string; minutes: number; notes?: string; projectId?: string; technologyIds?: FormDataEntryValue[] };

export async function createSession(payload: SessionPayload) {
  const store = readStore();
  const technologyIds = payload.technologyIds?.filter((id): id is string => typeof id === 'string') ?? [];
  const technologies = store.bootstrap.technologies.filter((technology) => technologyIds.includes(technology.id)).map((technology) => ({ technology }));
  if (payload.type === 'CODING') {
    const session: CodingSession = { id: createId('coding'), title: payload.title, notes: payload.notes, minutes: payload.minutes, focusScore: 4, sessionDate: new Date().toISOString(), projectId: payload.projectId, project: store.bootstrap.projects.find((project) => project.id === payload.projectId), technologies };
    store.codingSessions.push(session);
    writeStore(store);
    return session;
  }
  const session: LearningSession = { id: createId('learning'), topic: payload.topic || payload.title, source: payload.source || 'Self study', notes: payload.notes, minutes: payload.minutes, confidence: 4, sessionDate: new Date().toISOString(), technologies };
  store.learningSessions.push(session);
  writeStore(store);
  return session;
}

function refreshRecent(store: LocalStore) {
  store.bootstrap.recentCoding = store.codingSessions.slice(-8).reverse();
  store.bootstrap.recentLearning = store.learningSessions.slice(-8).reverse();
  writeStore(store);
}

export async function deleteSession(type: 'CODING' | 'LEARNING', id: string) {
  const store = readStore();
  if (type === 'CODING') store.codingSessions = store.codingSessions.filter((session) => session.id !== id);
  else store.learningSessions = store.learningSessions.filter((session) => session.id !== id);
  refreshRecent(store);
}

export async function updateSession(type: 'CODING' | 'LEARNING', id: string, payload: { title: string; minutes: number }) {
  const store = readStore();
  if (type === 'CODING') store.codingSessions = store.codingSessions.map((session) => session.id === id ? { ...session, ...payload } : session);
  else store.learningSessions = store.learningSessions.map((session) => session.id === id ? { ...session, topic: payload.title, minutes: payload.minutes } : session);
  refreshRecent(store);
}

export async function createTechnology(payload: { category: string; color: string; name: string }) {
  const store = readStore();
  const technology = { id: createId('technology'), ...payload };
  store.bootstrap.technologies.push(technology);
  writeStore(store);
  return technology;
}

export async function updateTechnology(id: string, payload: { category: string; color: string; name: string }) {
  const store = readStore();
  store.bootstrap.technologies = store.bootstrap.technologies.map((technology) => technology.id === id ? { ...technology, ...payload } : technology);
  store.codingSessions = store.codingSessions.map((session) => ({ ...session, technologies: session.technologies.map(({ technology }) => ({ technology: technology.id === id ? { ...technology, ...payload } : technology })) }));
  store.learningSessions = store.learningSessions.map((session) => ({ ...session, technologies: session.technologies.map(({ technology }) => ({ technology: technology.id === id ? { ...technology, ...payload } : technology })) }));
  writeStore(store);
  return store.bootstrap.technologies.find((technology) => technology.id === id);
}

export async function deleteTechnology(id: string) {
  const store = readStore();
  store.bootstrap.technologies = store.bootstrap.technologies.filter((technology) => technology.id !== id);
  store.bootstrap.projects = store.bootstrap.projects.map((project) => ({ ...project, technologies: project.technologies.filter(({ technology }) => technology.id !== id) }));
  store.codingSessions = store.codingSessions.map((session) => ({ ...session, technologies: session.technologies.filter(({ technology }) => technology.id !== id) }));
  store.learningSessions = store.learningSessions.map((session) => ({ ...session, technologies: session.technologies.filter(({ technology }) => technology.id !== id) }));
  writeStore(store);
}

type ProjectPayload = { description: string; liveUrl?: string; name: string; repository?: string; startedAt?: string; status: string; technologyIds: string[] };
function projectFromPayload(store: LocalStore, payload: ProjectPayload, id: string): Project {
  return { id, name: payload.name, description: payload.description, liveUrl: payload.liveUrl, repository: payload.repository, startedAt: payload.startedAt, status: payload.status, technologies: store.bootstrap.technologies.filter((technology) => payload.technologyIds.includes(technology.id)).map((technology) => ({ technology })) };
}

export async function createProject(payload: ProjectPayload) {
  const store = readStore();
  const project = projectFromPayload(store, payload, createId('project'));
  store.bootstrap.projects.push(project);
  writeStore(store);
  return project;
}

export async function updateProject(id: string, payload: ProjectPayload) {
  const store = readStore();
  store.bootstrap.projects = store.bootstrap.projects.map((project) => project.id === id ? projectFromPayload(store, payload, id) : project);
  writeStore(store);
  return store.bootstrap.projects.find((project) => project.id === id);
}

export async function deleteProject(id: string) {
  const store = readStore();
  store.bootstrap.projects = store.bootstrap.projects.filter((project) => project.id !== id);
  writeStore(store);
}

type GoalPayload = { cadence: Goal['cadence']; currentValue: number; description?: string; dueDate?: string; projectId?: string; status: Goal['status']; targetValue: number; title: string; unit: string };
export async function createGoal(payload: GoalPayload) {
  const store = readStore();
  const goal: Goal = { id: createId('goal'), ...payload };
  store.bootstrap.goals.push(goal);
  writeStore(store);
  return goal;
}

export async function updateGoal(id: string, payload: GoalPayload) {
  const store = readStore();
  store.bootstrap.goals = store.bootstrap.goals.map((goal) => goal.id === id ? { id, ...payload } : goal);
  writeStore(store);
  return store.bootstrap.goals.find((goal) => goal.id === id);
}

export async function deleteGoal(id: string) {
  const store = readStore();
  store.bootstrap.goals = store.bootstrap.goals.filter((goal) => goal.id !== id);
  writeStore(store);
}

export async function generateWeeklySummary() {
  const dashboard = await loadDashboard('week');
  return { content: `This week you logged ${dashboard.stats.rangeTotalHours.toFixed(1)} hours: ${dashboard.stats.rangeCodingHours.toFixed(1)} in work and ${dashboard.stats.rangeLearningHours.toFixed(1)} in learning. Keep the next focused block small and visible.` };
}