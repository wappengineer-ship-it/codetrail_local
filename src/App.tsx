import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, SubmitEvent } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUp, BookOpen, Brain, Code2, Flame, Goal, Loader2, LogOut, Pencil, Play, Plus, RotateCcw, Settings, Sparkles, Square, TimerReset, Trash2 } from 'lucide-react';
import {
  ApiError,
  createGoal,
  createProject,
  createSession,
  createTechnology,
  deleteGoal,
  deleteProject,
  deleteSession,
  deleteTechnology,
  generateWeeklySummary,
  loadBootstrap,
  loadCurrentUser,
  loadDashboard,
  login,
  loginDemo,
  logout,
  register,
  updateSession,
  updateGoal,
  updateProject,
  updateTechnology,
} from './api';
import type { BootstrapData, CodingSession, DashboardData, Goal as GoalData, LearningSession, Project, Technology } from './types';

type SessionMode = 'CODING' | 'LEARNING';
type DashboardRange = 'today' | 'week' | 'month' | 'all';
type AuthMode = 'login' | 'register';
type TechnologyForm = Pick<Technology, 'category' | 'color' | 'name'>;
type ProjectForm = {
  description: string;
  liveUrl: string;
  name: string;
  repository: string;
  startedAt: string;
  status: string;
  technologyIds: string[];
};
type GoalForm = {
  cadence: GoalData['cadence'];
  currentValue: string;
  description: string;
  dueDate: string;
  projectId: string;
  status: GoalData['status'];
  targetValue: string;
  title: string;
  unit: string;
};
const TIMER_STORAGE_KEY = 'codetrail.timer.v1';
const QUICK_LOG_STORAGE_KEY = 'codetrail.quick-log.v1';
const WORK_TITLE_STORAGE_KEY = 'codetrail.work-titles.v1';
const MAX_WORK_TITLES_PER_PROJECT = 8;
const dashboardRangeOptions: { label: string; value: DashboardRange }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'All', value: 'all' },
];

type StoredTimer = {
  elapsedBeforeStart: number;
  elapsedSeconds: number;
  isRunning: boolean;
  manualMinutes: string;
  mode: SessionMode;
  startedAt: number | null;
};

type QuickLogDraft = {
  detailsOpen: boolean;
  mode: SessionMode;
  notes: string;
  projectId: string;
  projectTitles: Record<string, string>;
  source: string;
  technologyIds: string[];
  title: string;
};

type StoredQuickLog = {
  drafts: Record<SessionMode, QuickLogDraft>;
  mode: SessionMode;
};

type StoredWorkTitles = Record<string, string[]>;

const defaultWorkDraft: QuickLogDraft = {
  detailsOpen: false,
  mode: 'CODING',
  notes: '',
  projectId: '',
  projectTitles: {},
  source: 'Docs and practice',
  technologyIds: [],
  title: 'Work session',
};

const defaultLearningDraft: QuickLogDraft = {
  detailsOpen: false,
  mode: 'LEARNING',
  notes: '',
  projectId: '',
  projectTitles: {},
  source: 'Docs and practice',
  technologyIds: [],
  title: 'Learning session',
};

const defaultQuickLogDrafts: Record<SessionMode, QuickLogDraft> = {
  CODING: defaultWorkDraft,
  LEARNING: defaultLearningDraft,
};
const defaultTechnologyForm: TechnologyForm = {
  category: 'Frontend',
  color: '#2f80ed',
  name: '',
};
const defaultProjectForm: ProjectForm = {
  description: '',
  liveUrl: '',
  name: '',
  repository: '',
  startedAt: '',
  status: 'active',
  technologyIds: [],
};
const defaultGoalForm: GoalForm = {
  cadence: 'WEEKLY',
  currentValue: '0',
  description: '',
  dueDate: '',
  projectId: '',
  status: 'ACTIVE',
  targetValue: '12',
  title: '',
  unit: 'hours',
};
const rateLimitMessage = 'Too many attempts. Please wait a bit and try again.';

export function App() {
  const [storedQuickLog] = useState(readStoredQuickLog);
  const [workTitlesByProject, setWorkTitlesByProject] = useState<StoredWorkTitles>(readStoredWorkTitles);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'guest'>('checking');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>('week');
  const [quickLogDrafts, setQuickLogDrafts] = useState<Record<SessionMode, QuickLogDraft>>(() => storedQuickLog?.drafts ?? defaultQuickLogDrafts);
  const [mode, setMode] = useState<SessionMode>(() => storedQuickLog?.mode ?? 'CODING');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{
    id: string;
    title: string;
    type: SessionMode;
    minutes: number;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
    type: SessionMode;
  } | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimerStorageReady, setIsTimerStorageReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [manualMinutes, setManualMinutes] = useState('60');
  const [summary, setSummary] = useState('');
  const [technologyForm, setTechnologyForm] = useState<TechnologyForm>(defaultTechnologyForm);
  const [editingTechnologyId, setEditingTechnologyId] = useState<string | null>(null);
  const [isTechnologySaving, setIsTechnologySaving] = useState(false);
  const [deletingTechnologyId, setDeletingTechnologyId] = useState<string | null>(null);
  const [technologyMessage, setTechnologyMessage] = useState('');
  const [projectForm, setProjectForm] = useState<ProjectForm>(defaultProjectForm);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isProjectSaving, setIsProjectSaving] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectMessage, setProjectMessage] = useState('');
  const [goalForm, setGoalForm] = useState<GoalForm>(defaultGoalForm);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [isGoalSaving, setIsGoalSaving] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [goalMessage, setGoalMessage] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const timerStartedAt = useRef<number | null>(null);
  const elapsedBeforeStart = useRef(0);

  const refresh = useCallback(
    async (range = dashboardRange) => {
      try {
        const [bootstrapData, dashboardData] = await Promise.all([loadBootstrap(), loadDashboard(range)]);
        setBootstrap(bootstrapData);
        setDashboard(dashboardData);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setAuthStatus('guest');
          setBootstrap(null);
          setDashboard(null);
        }
      }
    },
    [dashboardRange],
  );

  useEffect(() => {
    let isCurrent = true;

    async function checkAuth() {
      try {
        await loadCurrentUser();
        if (isCurrent) setAuthStatus('authenticated');
      } catch {
        if (isCurrent) setAuthStatus('guest');
      }
    }

    checkAuth();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      refresh();
    }
  }, [authStatus, refresh]);

  useEffect(() => {
    const restoredTimer = readStoredTimer();
    if (!restoredTimer) {
      setIsTimerStorageReady(true);
      return;
    }

    elapsedBeforeStart.current = restoredTimer.elapsedBeforeStart;
    timerStartedAt.current = restoredTimer.startedAt;
    setMode(restoredTimer.mode);
    setManualMinutes(restoredTimer.manualMinutes);

    if (restoredTimer.isRunning && restoredTimer.startedAt !== null) {
      const secondsSinceStart = Math.floor((Date.now() - restoredTimer.startedAt) / 1000);
      const restoredElapsed = restoredTimer.elapsedBeforeStart + Math.max(0, secondsSinceStart);
      setElapsedSeconds(restoredElapsed);
      setManualMinutes(String(Math.max(5, Math.ceil(restoredElapsed / 60))));
      setIsTimerRunning(true);
    } else {
      setElapsedSeconds(restoredTimer.elapsedSeconds);
      setIsTimerRunning(false);
    }

    setIsTimerStorageReady(true);
  }, []);

  useEffect(() => {
    if (!isTimerRunning || timerStartedAt.current === null) return;

    const intervalId = window.setInterval(() => {
      const secondsSinceStart = Math.floor((Date.now() - timerStartedAt.current!) / 1000);
      setElapsedSeconds(elapsedBeforeStart.current + secondsSinceStart);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isTimerRunning]);

  useEffect(() => {
    if (!isTimerStorageReady) return;

    if (!isTimerRunning && elapsedSeconds === 0 && manualMinutes === '60') {
      removeStoredTimer();
      return;
    }

    writeStoredTimer({
      elapsedBeforeStart: elapsedBeforeStart.current,
      elapsedSeconds,
      isRunning: isTimerRunning,
      manualMinutes,
      mode,
      startedAt: timerStartedAt.current,
    });
  }, [elapsedSeconds, isTimerRunning, isTimerStorageReady, manualMinutes, mode]);

  useEffect(() => {
    writeStoredQuickLog({ drafts: quickLogDrafts, mode });
  }, [mode, quickLogDrafts]);

  useEffect(() => {
    writeStoredWorkTitles(workTitlesByProject);
  }, [workTitlesByProject]);

  useEffect(() => {
    if (!pendingDelete && !pendingEdit) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPendingDelete(null);
        setPendingEdit(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingDelete, pendingEdit]);

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 420);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const firstProject = bootstrap?.projects[0];
  const quickLogDraft = quickLogDrafts[mode];

  function handleModeChange(nextMode: SessionMode) {
    setMode(nextMode);
  }

  function updateQuickLogDraft(patch: Partial<QuickLogDraft>) {
    setQuickLogDrafts((drafts) => ({
      ...drafts,
      [mode]: { ...drafts[mode], ...patch, mode },
    }));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bootstrap) return;

    const form = new FormData(event.currentTarget);
    const finalElapsedSeconds = getCurrentElapsedSeconds();
    const minutes = isTimerRunning ? Math.max(5, Math.ceil(finalElapsedSeconds / 60)) : Number(form.get('minutes'));
    const title = String(form.get('title'));
    const notes = String(form.get('notes') ?? '');
    const projectId = String(form.get('projectId') ?? '');
    const source = String(form.get('source') ?? '');

    if (mode === 'CODING' && projectId) {
      setWorkTitlesByProject((titles) => addWorkTitle(titles, projectId, title));
    }

    if (isTimerRunning) {
      stopTimer();
    }

    setSummary('');
    setIsSaving(true);
    try {
      try {
        const createdSession = await createSession({
          type: mode,
          title,
          topic: title,
          source: source || 'Self study',
          minutes,
          notes: notes || undefined,
          projectId: mode === 'CODING' ? projectId || undefined : undefined,
          technologyIds: form.getAll('technologyIds'),
        });
        applyCreatedSession(mode, createdSession);
      } catch {
        setSummary('The local API is not connected yet, so this session stayed in the browser preview. Once PostgreSQL is configured, saves will persist.');
        return;
      }

      try {
        await refresh();
        setSummary('');
      } catch {
        setSummary('Session saved. Refresh the page if the dashboard does not update right away.');
      }
    } finally {
      resetTimer();
      setManualMinutes('60');
      setIsSaving(false);
    }
  }

  function applyCreatedSession(type: SessionMode, session: CodingSession | LearningSession | { ok: boolean; persisted: false; reason: string }) {
    if (!('id' in session)) return;

    applyCreatedSessionToDashboard(type, session);

    setBootstrap((current) => {
      if (!current) return current;

      if (type === 'CODING') {
        return {
          ...current,
          goals: advanceVisibleGoals(current.goals, session.minutes),
          recentCoding: [session as CodingSession, ...current.recentCoding.filter((item) => item.id !== session.id)].slice(0, 8),
        };
      }

      return {
        ...current,
        goals: advanceVisibleGoals(current.goals, session.minutes),
        recentLearning: [session as LearningSession, ...current.recentLearning.filter((item) => item.id !== session.id)].slice(0, 8),
      };
    });
  }

  function applyCreatedSessionToDashboard(type: SessionMode, session: CodingSession | LearningSession) {
    const sessionDate = session.sessionDate.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const isToday = sessionDate === today;
    const isInSelectedRange = isDateInRange(sessionDate, dashboardRange);

    setDashboard((current) => {
      if (!current) return current;

      const codingMinutes = type === 'CODING' ? session.minutes : 0;
      const learningMinutes = type === 'LEARNING' ? session.minutes : 0;
      const totalMinutes = codingMinutes + learningMinutes;
      const history = isInSelectedRange ? upsertHistoryDay(current.history, sessionDate, codingMinutes, learningMinutes) : current.history;
      const technologies = updateTechnologyFocus(current.technologies, session.technologies, session.minutes);

      return {
        ...current,
        stats: {
          ...current.stats,
          codingHoursToday: isToday ? addMinutesToHours(current.stats.codingHoursToday, codingMinutes) : current.stats.codingHoursToday,
          learningHoursToday: isToday ? addMinutesToHours(current.stats.learningHoursToday, learningMinutes) : current.stats.learningHoursToday,
          totalHoursToday: isToday ? addMinutesToHours(current.stats.totalHoursToday, totalMinutes) : current.stats.totalHoursToday,
          rangeCodingHours: isInSelectedRange ? addMinutesToHours(current.stats.rangeCodingHours, codingMinutes) : current.stats.rangeCodingHours,
          rangeLearningHours: isInSelectedRange ? addMinutesToHours(current.stats.rangeLearningHours, learningMinutes) : current.stats.rangeLearningHours,
          rangeTotalHours: isInSelectedRange ? addMinutesToHours(current.stats.rangeTotalHours, totalMinutes) : current.stats.rangeTotalHours,
          codingHoursThisWeek: isDateInRange(sessionDate, 'week')
            ? addMinutesToHours(current.stats.codingHoursThisWeek, codingMinutes)
            : current.stats.codingHoursThisWeek,
          learningHoursThisWeek: isDateInRange(sessionDate, 'week')
            ? addMinutesToHours(current.stats.learningHoursThisWeek, learningMinutes)
            : current.stats.learningHoursThisWeek,
          totalHoursLast30Days: isWithinLastDays(sessionDate, 30)
            ? addMinutesToHours(current.stats.totalHoursLast30Days, totalMinutes)
            : current.stats.totalHoursLast30Days,
          streakDays: isToday && current.stats.streakDays === 0 ? 1 : current.stats.streakDays,
        },
        chart: isInSelectedRange ? history.slice().reverse().map((day) => ({ date: day.date, hours: day.totalHours })) : current.chart,
        history,
        technologies,
      };
    });
  }

  function startTimer() {
    elapsedBeforeStart.current = elapsedSeconds;
    timerStartedAt.current = Date.now();
    setIsTimerRunning(true);
  }

  function getCurrentElapsedSeconds() {
    if (!isTimerRunning || timerStartedAt.current === null) {
      return elapsedSeconds;
    }

    const secondsSinceStart = Math.floor((Date.now() - timerStartedAt.current) / 1000);
    return elapsedBeforeStart.current + secondsSinceStart;
  }

  function stopTimer() {
    const totalSeconds = getCurrentElapsedSeconds();
    setElapsedSeconds(totalSeconds);
    setManualMinutes(String(Math.max(5, Math.ceil(totalSeconds / 60))));
    elapsedBeforeStart.current = totalSeconds;

    timerStartedAt.current = null;
    setIsTimerRunning(false);
  }

  function resetTimer() {
    timerStartedAt.current = null;
    elapsedBeforeStart.current = 0;
    setElapsedSeconds(0);
    setIsTimerRunning(false);
    removeStoredTimer();
  }

  async function handleSummary() {
    setIsGeneratingSummary(true);
    try {
      const result = await generateWeeklySummary();
      setSummary(result.content);
    } catch {
      setSummary(
        'This week has a strong foundation: keep logging sessions, protect one deep-work block, and ship the next visible slice of your flagship project.',
      );
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  async function confirmDeleteSession(activity: { id: string; title: string; type: SessionMode }) {
    if (!bootstrap) return;

    setDeletingSessionId(activity.id);
    const previousBootstrap = bootstrap;
    setPendingDelete(null);
    setBootstrap({
      ...bootstrap,
      recentCoding: activity.type === 'CODING' ? bootstrap.recentCoding.filter((session) => session.id !== activity.id) : bootstrap.recentCoding,
      recentLearning: activity.type === 'LEARNING' ? bootstrap.recentLearning.filter((session) => session.id !== activity.id) : bootstrap.recentLearning,
    });

    try {
      await deleteSession(activity.type, activity.id);
      await refresh();
    } catch {
      setBootstrap(previousBootstrap);
      setSummary('Could not delete that session. Please try again.');
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function handleEditSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingEdit) return;

    const form = new FormData(event.currentTarget);
    const title = String(form.get('title'));
    const minutes = Number(form.get('minutes'));

    setSavingEditId(pendingEdit.id);
    try {
      await updateSession(pendingEdit.type, pendingEdit.id, { title, minutes });
      setPendingEdit(null);
      await refresh();
    } catch {
      setSummary('Could not update that session. Please check the values and try again.');
    } finally {
      setSavingEditId(null);
    }
  }

  async function handleAuthSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '');

    try {
      if (authMode === 'register') {
        await register({ email, name, password });
      } else {
        await login({ email, password });
      }
      setAuthStatus('authenticated');
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setAuthError(rateLimitMessage);
      } else {
        setAuthError(error instanceof ApiError && error.status === 409 ? 'That email already has an account.' : 'Could not sign in. Check your details and try again.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleDemoLogin() {
    setAuthError('');
    setIsAuthLoading(true);

    try {
      await loginDemo();
      setAuthStatus('authenticated');
    } catch (error) {
      setAuthError(error instanceof ApiError && error.status === 429 ? rateLimitMessage : 'The demo account is not ready yet. Try running the seed script.');
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    setAuthStatus('guest');
    setBootstrap(null);
    setDashboard(null);
    setSummary('');
  }

  function startEditingTechnology(technology: Technology) {
    setEditingTechnologyId(technology.id);
    setTechnologyForm({
      category: technology.category,
      color: technology.color,
      name: technology.name,
    });
    setTechnologyMessage('');
  }

  function resetTechnologyForm() {
    setEditingTechnologyId(null);
    setTechnologyForm(defaultTechnologyForm);
  }

  async function handleTechnologySubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setTechnologyMessage('');
    setIsTechnologySaving(true);

    try {
      if (editingTechnologyId) {
        await updateTechnology(editingTechnologyId, technologyForm);
      } else {
        await createTechnology(technologyForm);
      }
      resetTechnologyForm();
      await refresh();
    } catch (error) {
      setTechnologyMessage(error instanceof ApiError && error.status === 409 ? 'That technology already exists.' : 'Could not save this technology.');
    } finally {
      setIsTechnologySaving(false);
    }
  }

  async function handleDeleteTechnology(technology: Technology) {
    setTechnologyMessage('');
    setDeletingTechnologyId(technology.id);

    try {
      await deleteTechnology(technology.id);
      if (editingTechnologyId === technology.id) resetTechnologyForm();
      await refresh();
    } catch (error) {
      setTechnologyMessage(
        error instanceof ApiError && error.status === 409
          ? 'That technology is already used by projects or sessions, so it cannot be deleted yet.'
          : 'Could not delete this technology.',
      );
    } finally {
      setDeletingTechnologyId(null);
    }
  }

  function startEditingProject(project: Project) {
    setEditingProjectId(project.id);
    setProjectForm({
      description: project.description,
      liveUrl: project.liveUrl ?? '',
      name: project.name,
      repository: project.repository ?? '',
      startedAt: toDateInput(project.startedAt),
      status: project.status,
      technologyIds: project.technologies.map(({ technology }) => technology.id),
    });
    setProjectMessage('');
  }

  function resetProjectForm() {
    setEditingProjectId(null);
    setProjectForm(defaultProjectForm);
  }

  function toggleProjectTechnology(technologyId: string, checked: boolean) {
    setProjectForm((form) => ({
      ...form,
      technologyIds: checked ? [...form.technologyIds, technologyId] : form.technologyIds.filter((id) => id !== technologyId),
    }));
  }

  async function handleProjectSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectMessage('');
    setIsProjectSaving(true);

    const payload = {
      ...projectForm,
      liveUrl: projectForm.liveUrl || undefined,
      repository: projectForm.repository || undefined,
      startedAt: projectForm.startedAt ? new Date(`${projectForm.startedAt}T00:00:00.000Z`).toISOString() : undefined,
    };

    try {
      if (editingProjectId) {
        await updateProject(editingProjectId, payload);
      } else {
        await createProject(payload);
      }
      resetProjectForm();
      await refresh();
    } catch {
      setProjectMessage('Could not save this project. Check the fields and try again.');
    } finally {
      setIsProjectSaving(false);
    }
  }

  async function handleDeleteProject(project: Project) {
    setProjectMessage('');
    setDeletingProjectId(project.id);

    try {
      await deleteProject(project.id);
      if (editingProjectId === project.id) resetProjectForm();
      await refresh();
    } catch {
      setProjectMessage('Could not delete this project.');
    } finally {
      setDeletingProjectId(null);
    }
  }

  function startEditingGoal(goal: GoalData) {
    setEditingGoalId(goal.id);
    setGoalForm({
      cadence: goal.cadence,
      currentValue: String(goal.currentValue),
      description: goal.description ?? '',
      dueDate: toDateInput(goal.dueDate),
      projectId: goal.projectId ?? '',
      status: goal.status,
      targetValue: String(goal.targetValue),
      title: goal.title,
      unit: goal.unit,
    });
    setGoalMessage('');
  }

  function resetGoalForm() {
    setEditingGoalId(null);
    setGoalForm(defaultGoalForm);
  }

  async function handleGoalSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setGoalMessage('');
    setIsGoalSaving(true);

    const payload = {
      cadence: goalForm.cadence,
      currentValue: Number(goalForm.currentValue),
      description: goalForm.description || undefined,
      dueDate: goalForm.dueDate ? new Date(`${goalForm.dueDate}T00:00:00.000Z`).toISOString() : undefined,
      projectId: goalForm.projectId || undefined,
      status: goalForm.status,
      targetValue: Number(goalForm.targetValue),
      title: goalForm.title,
      unit: goalForm.unit,
    };

    try {
      if (editingGoalId) {
        await updateGoal(editingGoalId, payload);
      } else {
        await createGoal(payload);
      }
      resetGoalForm();
      await refresh();
    } catch {
      setGoalMessage('Could not save this goal. Check the fields and try again.');
    } finally {
      setIsGoalSaving(false);
    }
  }

  async function handleDeleteGoal(goal: GoalData) {
    setGoalMessage('');
    setDeletingGoalId(goal.id);

    try {
      await deleteGoal(goal.id);
      if (editingGoalId === goal.id) resetGoalForm();
      await refresh();
    } catch {
      setGoalMessage('Could not delete this goal.');
    } finally {
      setDeletingGoalId(null);
    }
  }

  const recentActivity = useMemo(() => {
    if (!bootstrap) return [];
    return [
      ...bootstrap.recentCoding.map((session) => ({
        id: session.id,
        kind: 'Work',
        type: 'CODING' as const,
        title: session.title,
        minutes: session.minutes,
        date: session.sessionDate,
      })),
      ...bootstrap.recentLearning.map((session) => ({
        id: session.id,
        kind: 'Learning',
        type: 'LEARNING' as const,
        title: session.topic,
        minutes: session.minutes,
        date: session.sessionDate,
      })),
    ]
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 6);
  }, [bootstrap]);

  if (authStatus === 'checking') {
    return (
      <main className="loading">
        <Loader2 className="spin" size={28} />
        <span>Checking your session</span>
      </main>
    );
  }

  if (authStatus === 'guest') {
    return (
      <AuthScreen
        authError={authError}
        authMode={authMode}
        isAuthLoading={isAuthLoading}
        onDemoLogin={handleDemoLogin}
        onModeChange={setAuthMode}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  if (!bootstrap || !dashboard) {
    return (
      <main className="loading">
        <Loader2 className="spin" size={28} />
        <span>Loading CodeTrail</span>
      </main>
    );
  }

  const todayCodingHours = dashboard.stats.codingHoursToday ?? 0;
  const todayLearningHours = dashboard.stats.learningHoursToday ?? 0;
  const todayTotalHours = dashboard.stats.totalHoursToday ?? todayCodingHours + todayLearningHours;
  const activeHourGoal = bootstrap.goals.find((goal) => goal.status === 'ACTIVE' && goal.unit.toLowerCase() === 'hours');
  const activeHourGoalPercent = activeHourGoal ? Math.min(100, Math.round((activeHourGoal.currentValue / activeHourGoal.targetValue) * 100)) : 0;

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="CodeTrail navigation">
        <div className="brand">
          <div className="brand-mark">CT</div>
          <div>
            <strong>CodeTrail</strong>
            <span>Developer progress OS</span>
          </div>
        </div>

        <nav>
          <a className="active" href="#dashboard">
            <TimerReset size={18} /> Dashboard
          </a>
          <a href="#sessions">
            <Code2 size={18} /> Sessions
          </a>
          <a href="#goals">
            <Goal size={18} /> Goals
          </a>
          <a href="#insights">
            <Brain size={18} /> Insights
          </a>
          <a href="#settings">
            <Settings size={18} /> Settings
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>{bootstrap.user.name}</h1>
          </div>
          <button type="button" className="secondary-button compact-button" onClick={handleLogout}>
            <LogOut size={16} />
            Sign out
          </button>
        </header>

        <section className="daily-grid">
          <section className="today-summary" aria-label="Today summary">
            <div>
              <p className="eyebrow">Total today</p>
              <strong>{formatHours(todayTotalHours)}h</strong>
            </div>
            <dl>
              <div>
                <dt>Work</dt>
                <dd>{formatHours(todayCodingHours)}h</dd>
              </div>
              <div>
                <dt>Learning</dt>
                <dd>{formatHours(todayLearningHours)}h</dd>
              </div>
            </dl>
          </section>

          <div className="daily-overview">
            <section id="dashboard" className="stats-grid">
              <Metric
                icon={<Goal />}
                label={activeHourGoal ? `${formatGoalValue(activeHourGoal.targetValue)}h goal` : '12h goal'}
                value={
                  activeHourGoal
                    ? `${formatGoalValue(activeHourGoal.currentValue)}/${formatGoalValue(activeHourGoal.targetValue)}h`
                    : 'No goal'
                }
                detail={activeHourGoal ? `${activeHourGoalPercent}% complete` : undefined}
              />
              <Metric icon={<Flame />} label="Current streak" value={`${dashboard.stats.streakDays}d`} />
            </section>

            <article className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">History</p>
                  <h2>Daily totals</h2>
                </div>
                <div className="range-tabs" aria-label="Dashboard range">
                  {dashboardRangeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={dashboardRange === option.value ? 'selected' : ''}
                      onClick={() => setDashboardRange(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <RangeChart
                chart={dashboard.chart}
                codingHours={dashboard.stats.rangeCodingHours}
                learningHours={dashboard.stats.rangeLearningHours}
                totalHours={dashboard.stats.rangeTotalHours}
              />
            </article>
          </div>

          <QuickLogPanel
            bootstrap={bootstrap}
            draft={quickLogDraft}
            elapsedSeconds={elapsedSeconds}
            firstProject={firstProject}
            isSaving={isSaving}
            isTimerRunning={isTimerRunning}
            manualMinutes={manualMinutes}
            mode={mode}
            workTitlesByProject={workTitlesByProject}
            onDraftChange={updateQuickLogDraft}
            onModeChange={handleModeChange}
            onResetTimer={resetTimer}
            onStartTimer={startTimer}
            onStopTimer={stopTimer}
            onSubmit={handleSubmit}
            onMinutesChange={setManualMinutes}
          />
        </section>

        <section className="main-grid">
          <article className="panel recent-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Timeline</p>
                <h2>Recent activity</h2>
              </div>
            </div>
            <div className="activity-list">
              {recentActivity.map((activity) => (
                <div key={`${activity.kind}-${activity.id}`} className="activity-row">
                  <span>{activity.kind}</span>
                  <strong>{activity.title}</strong>
                  <time>{Math.round((activity.minutes / 60) * 10) / 10}h</time>
                  <button
                    type="button"
                    className="edit-activity"
                    onClick={() => setPendingEdit(activity)}
                    disabled={savingEditId === activity.id || deletingSessionId === activity.id}
                    aria-label={`Edit ${activity.title}`}
                    title="Edit session"
                  >
                    {savingEditId === activity.id ? <Loader2 className="spin" size={15} /> : <Pencil size={15} />}
                  </button>
                  <button
                    type="button"
                    className="delete-activity"
                    onClick={() => setPendingDelete(activity)}
                    disabled={deletingSessionId === activity.id}
                    aria-label={`Delete ${activity.title}`}
                    title="Delete session"
                  >
                    {deletingSessionId === activity.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                  </button>
                </div>
              ))}
            </div>
          </article>

          <article id="goals" className="panel goals-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Targets</p>
                <h2>Active goals</h2>
              </div>
            </div>
            <div className="goal-list">
              {bootstrap.goals.map((goal) => {
                const percent = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
                return (
                  <div className="goal-item" key={goal.id}>
                    <div>
                      <strong>{goal.title}</strong>
                      <span>
                        {formatGoalValue(goal.currentValue)}/{formatGoalValue(goal.targetValue)} {goal.unit}
                      </span>
                    </div>
                    <div className="progress" aria-label={`${percent}% complete`}>
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel tech-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Skill signal</p>
                <h2>Technology focus</h2>
              </div>
            </div>
            {dashboard.technologies.length > 0 ? (
              <ChartSurface height={230} className="compact">
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={dashboard.technologies} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d7dde8" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={82} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="hours" fill="#3a8f5a" radius={[0, 6, 6, 0]} />
                  </BarChart>
                )}
              </ChartSurface>
            ) : (
              <div className="empty-chart">
                <strong>No technology focus yet</strong>
                <span>Tag a Work or Learning session to build this chart.</span>
              </div>
            )}
          </article>

          <article id="insights" className="panel insight-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Readout</p>
                <h2>Insights</h2>
              </div>
            </div>
            <section className="ai-summary-card" aria-label="Weekly AI summary">
              <div>
                <Sparkles size={18} />
                <div>
                  <strong>Weekly AI summary</strong>
                  {summary ? <p>{summary}</p> : <p>Generate a short coaching note from your latest work, learning, and goals.</p>}
                </div>
              </div>
              <button type="button" className="secondary-button" onClick={handleSummary} disabled={isGeneratingSummary}>
                {isGeneratingSummary ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                {summary ? 'Refresh' : 'Generate'}
              </button>
            </section>
            <ul className="insight-list">
              {dashboard.insights.map((insight) => (
                <li key={insight}>
                  <Brain size={17} />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </article>

          <article id="settings" className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Workspace data</h2>
              </div>
            </div>

            <details className="settings-section">
              <summary className="settings-section-heading">
                <h3>Projects</h3>
                <span>{bootstrap.projects.length}</span>
              </summary>
              <form className="settings-form project-form" onSubmit={handleProjectSubmit}>
                <label>
                  <span>Name</span>
                  <input value={projectForm.name} onChange={(event) => setProjectForm((form) => ({ ...form, name: event.target.value }))} required />
                </label>
                <label>
                  <span>Status</span>
                  <input value={projectForm.status} onChange={(event) => setProjectForm((form) => ({ ...form, status: event.target.value }))} required />
                </label>
                <label>
                  <span>Started</span>
                  <input type="date" value={projectForm.startedAt} onChange={(event) => setProjectForm((form) => ({ ...form, startedAt: event.target.value }))} />
                </label>
                <label className="wide-field">
                  <span>Description</span>
                  <textarea value={projectForm.description} onChange={(event) => setProjectForm((form) => ({ ...form, description: event.target.value }))} required />
                </label>
                <label>
                  <span>Repository</span>
                  <input type="url" value={projectForm.repository} onChange={(event) => setProjectForm((form) => ({ ...form, repository: event.target.value }))} />
                </label>
                <label>
                  <span>Live URL</span>
                  <input type="url" value={projectForm.liveUrl} onChange={(event) => setProjectForm((form) => ({ ...form, liveUrl: event.target.value }))} />
                </label>
                <fieldset className="wide-field">
                  <legend>Technologies</legend>
                  <div className="tech-picker">
                    {bootstrap.technologies.map((technology) => (
                      <label key={technology.id} style={{ borderColor: technology.color }}>
                        <input
                          type="checkbox"
                          checked={projectForm.technologyIds.includes(technology.id)}
                          onChange={(event) => toggleProjectTechnology(technology.id, event.target.checked)}
                        />
                        {technology.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <button type="submit" className="primary-button" disabled={isProjectSaving}>
                  {isProjectSaving ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  {editingProjectId ? 'Save project' : 'Add project'}
                </button>
                {editingProjectId && (
                  <button type="button" className="secondary-button" onClick={resetProjectForm}>
                    Cancel
                  </button>
                )}
              </form>
              {projectMessage && <p className="settings-message">{projectMessage}</p>}
              <div className="settings-list">
                {bootstrap.projects.map((project) => (
                  <div className="settings-row" key={project.id}>
                    <div>
                      <strong>{project.name}</strong>
                      <span>{project.status}</span>
                    </div>
                    <button type="button" className="edit-activity" onClick={() => startEditingProject(project)} title="Edit project" aria-label={`Edit ${project.name}`}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="delete-activity"
                      onClick={() => handleDeleteProject(project)}
                      disabled={deletingProjectId === project.id}
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                    >
                      {deletingProjectId === project.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            </details>

            <details className="settings-section">
              <summary className="settings-section-heading">
                <h3>Goals</h3>
                <span>{bootstrap.goals.length}</span>
              </summary>
              <form className="settings-form goal-form" onSubmit={handleGoalSubmit}>
                <label className="wide-field">
                  <span>Title</span>
                  <input value={goalForm.title} onChange={(event) => setGoalForm((form) => ({ ...form, title: event.target.value }))} required />
                </label>
                <label>
                  <span>Cadence</span>
                  <select value={goalForm.cadence} onChange={(event) => setGoalForm((form) => ({ ...form, cadence: event.target.value as GoalData['cadence'] }))}>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="MILESTONE">Milestone</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={goalForm.status} onChange={(event) => setGoalForm((form) => ({ ...form, status: event.target.value as GoalData['status'] }))}>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </label>
                <label>
                  <span>Current</span>
                  <input type="number" min="0" step="0.1" value={goalForm.currentValue} onChange={(event) => setGoalForm((form) => ({ ...form, currentValue: event.target.value }))} required />
                </label>
                <label>
                  <span>Target</span>
                  <input type="number" min="1" step="0.1" value={goalForm.targetValue} onChange={(event) => setGoalForm((form) => ({ ...form, targetValue: event.target.value }))} required />
                </label>
                <label>
                  <span>Unit</span>
                  <input value={goalForm.unit} onChange={(event) => setGoalForm((form) => ({ ...form, unit: event.target.value }))} required />
                </label>
                <label>
                  <span>Due date</span>
                  <input type="date" value={goalForm.dueDate} onChange={(event) => setGoalForm((form) => ({ ...form, dueDate: event.target.value }))} />
                </label>
                <label>
                  <span>Project</span>
                  <select value={goalForm.projectId} onChange={(event) => setGoalForm((form) => ({ ...form, projectId: event.target.value }))}>
                    <option value="">No project</option>
                    {bootstrap.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wide-field">
                  <span>Description</span>
                  <textarea value={goalForm.description} onChange={(event) => setGoalForm((form) => ({ ...form, description: event.target.value }))} />
                </label>
                <button type="submit" className="primary-button" disabled={isGoalSaving}>
                  {isGoalSaving ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  {editingGoalId ? 'Save goal' : 'Add goal'}
                </button>
                {editingGoalId && (
                  <button type="button" className="secondary-button" onClick={resetGoalForm}>
                    Cancel
                  </button>
                )}
              </form>
              {goalMessage && <p className="settings-message">{goalMessage}</p>}
              <div className="settings-list">
                {bootstrap.goals.map((goal) => (
                  <div className="settings-row" key={goal.id}>
                    <div>
                      <strong>{goal.title}</strong>
                      <span>
                        {goal.status.toLowerCase()} - {formatGoalValue(goal.currentValue)}/{formatGoalValue(goal.targetValue)} {goal.unit}
                      </span>
                    </div>
                    <button type="button" className="edit-activity" onClick={() => startEditingGoal(goal)} title="Edit goal" aria-label={`Edit ${goal.title}`}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="delete-activity"
                      onClick={() => handleDeleteGoal(goal)}
                      disabled={deletingGoalId === goal.id}
                      title="Delete goal"
                      aria-label={`Delete ${goal.title}`}
                    >
                      {deletingGoalId === goal.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            </details>

            <details className="settings-section">
              <summary className="settings-section-heading">
                <h3>Technologies</h3>
                <span>{bootstrap.technologies.length}</span>
              </summary>
              <form className="technology-form" onSubmit={handleTechnologySubmit}>
                <label>
                  <span>Name</span>
                  <input
                    name="name"
                    value={technologyForm.name}
                    onChange={(event) => setTechnologyForm((form) => ({ ...form, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Category</span>
                  <input
                    name="category"
                    value={technologyForm.category}
                    onChange={(event) => setTechnologyForm((form) => ({ ...form, category: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Color</span>
                  <input
                    name="color"
                    type="color"
                    value={technologyForm.color}
                    onChange={(event) => setTechnologyForm((form) => ({ ...form, color: event.target.value }))}
                    required
                  />
                </label>
                <button type="submit" className="primary-button" disabled={isTechnologySaving}>
                  {isTechnologySaving ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  {editingTechnologyId ? 'Save technology' : 'Add technology'}
                </button>
                {editingTechnologyId && (
                  <button type="button" className="secondary-button" onClick={resetTechnologyForm}>
                    Cancel
                  </button>
                )}
              </form>

              {technologyMessage && <p className="settings-message">{technologyMessage}</p>}

              <div className="technology-list">
                {bootstrap.technologies.map((technology) => (
                  <div className="technology-row" key={technology.id}>
                    <span className="technology-swatch" style={{ background: technology.color }} />
                    <div>
                      <strong>{technology.name}</strong>
                      <span>{technology.category}</span>
                    </div>
                    <button type="button" className="edit-activity" onClick={() => startEditingTechnology(technology)} title="Edit technology" aria-label={`Edit ${technology.name}`}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="delete-activity"
                      onClick={() => handleDeleteTechnology(technology)}
                      disabled={deletingTechnologyId === technology.id}
                      title="Delete technology"
                      aria-label={`Delete ${technology.name}`}
                    >
                      {deletingTechnologyId === technology.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            </details>
          </article>
        </section>
      </section>

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPendingDelete(null)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <p className="eyebrow">Delete session</p>
              <h2 id="delete-dialog-title">Remove this log?</h2>
              <p id="delete-dialog-description">This will delete "{pendingDelete.title}" and update your totals.</p>
            </div>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={() => confirmDeleteSession(pendingDelete)}>
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingEdit && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPendingEdit(null)}>
          <form
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={handleEditSubmit}
          >
            <div>
              <p className="eyebrow">Edit session</p>
              <h2 id="edit-dialog-title">{pendingEdit.type === 'CODING' ? 'Work log' : 'Learning log'}</h2>
            </div>
            <div className="edit-fields">
              <label>
                <span>{pendingEdit.type === 'CODING' ? 'Title' : 'Topic'}</span>
                <input name="title" defaultValue={pendingEdit.title} minLength={2} required />
              </label>
              <label>
                <span>Minutes</span>
                <input name="minutes" type="number" min="5" max="1440" defaultValue={pendingEdit.minutes} required />
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setPendingEdit(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={savingEditId === pendingEdit.id}>
                {savingEditId === pendingEdit.id ? <Loader2 className="spin" size={16} /> : <Pencil size={16} />}
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {showBackToTop && (
        <button
          type="button"
          className="back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Back to top"
        >
          <ArrowUp size={20} />
        </button>
      )}
    </main>
  );
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, '0')).join(':');
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function formatGoalValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function toDateInput(value?: string) {
  return value ? value.slice(0, 10) : '';
}

function advanceVisibleGoals(goals: BootstrapData['goals'], minutes: number) {
  const hours = Math.round((minutes / 60) * 10) / 10;

  return goals.map((goal) => {
    const isHourGoal = goal.status === 'ACTIVE' && goal.unit.toLowerCase() === 'hours';
    if (!isHourGoal) return goal;

    return {
      ...goal,
      currentValue: Math.min(goal.targetValue, Math.round((goal.currentValue + hours) * 10) / 10),
    };
  });
}

function addMinutesToHours(hours: number, minutes: number) {
  return Math.round(((Math.round(hours * 60) + minutes) / 60) * 10) / 10;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
}

function isDateInRange(date: string, range: DashboardRange) {
  if (range === 'all') return true;
  if (range === 'today') return date === dateKey(new Date());
  if (range === 'week') return date >= dateKey(startOfUtcWeek());

  const now = new Date();
  return date >= dateKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

function isWithinLastDays(date: string, days: number) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return date >= dateKey(start);
}

function upsertHistoryDay(history: DashboardData['history'], date: string, codingMinutes: number, learningMinutes: number) {
  const existingDay = history.find((day) => day.date === date);
  const updatedDay = {
    date,
    codingHours: addMinutesToHours(existingDay?.codingHours ?? 0, codingMinutes),
    learningHours: addMinutesToHours(existingDay?.learningHours ?? 0, learningMinutes),
    totalHours: addMinutesToHours(existingDay?.totalHours ?? 0, codingMinutes + learningMinutes),
  };

  return [updatedDay, ...history.filter((day) => day.date !== date)].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function updateTechnologyFocus(
  currentTechnologies: DashboardData['technologies'],
  sessionTechnologies: CodingSession['technologies'] | LearningSession['technologies'],
  minutes: number,
) {
  const technologies = new Map(currentTechnologies.map((technology) => [technology.name, { ...technology }]));

  sessionTechnologies.forEach(({ technology }) => {
    const current = technologies.get(technology.name) ?? {
      name: technology.name,
      color: technology.color,
      hours: 0,
      minutes: 0,
    };
    const nextMinutes = current.minutes + minutes;
    technologies.set(technology.name, {
      ...current,
      color: technology.color,
      minutes: nextMinutes,
      hours: Math.round((nextMinutes / 60) * 10) / 10,
    });
  });

  return [...technologies.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6);
}

function AuthScreen({
  authError,
  authMode,
  isAuthLoading,
  onDemoLogin,
  onModeChange,
  onSubmit,
}: {
  authError: string;
  authMode: AuthMode;
  isAuthLoading: boolean;
  onDemoLogin: () => void;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  const isRegistering = authMode === 'register';

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <div className="brand-mark">CT</div>
          <div>
            <strong>CodeTrail</strong>
            <span>Developer progress OS</span>
          </div>
        </div>

        <div>
          <p className="eyebrow">Track the work</p>
          <h1>{isRegistering ? 'Create your account' : 'Welcome back'}</h1>
          <p className="auth-copy">Log focused work, learning time, goals, streaks, and weekly AI coaching from one private dashboard.</p>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {isRegistering && (
            <label>
              <span>Name</span>
              <input name="name" type="text" minLength={2} maxLength={80} required />
            </label>
          )}
          <label>
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" minLength={8} autoComplete={isRegistering ? 'new-password' : 'current-password'} required />
          </label>

          {authError && <p className="auth-error">{authError}</p>}

          <button type="submit" className="primary-button" disabled={isAuthLoading}>
            {isAuthLoading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            {isRegistering ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-actions">
          <button type="button" className="secondary-button" onClick={onDemoLogin} disabled={isAuthLoading}>
            Try demo
          </button>
          <button type="button" className="text-button" onClick={() => onModeChange(isRegistering ? 'login' : 'register')}>
            {isRegistering ? 'I already have an account' : 'Create an account'}
          </button>
        </div>
      </section>
    </main>
  );
}

function RangeChart({
  chart,
  codingHours,
  learningHours,
  totalHours,
}: {
  chart: DashboardData['chart'];
  codingHours: number;
  learningHours: number;
  totalHours: number;
}) {
  return (
    <>
      <dl className="history-summary" aria-label="Selected range totals">
        <div>
          <dt>Total</dt>
          <dd>{formatHours(totalHours)}h</dd>
        </div>
        <div>
          <dt>Work</dt>
          <dd>{formatHours(codingHours)}h</dd>
        </div>
        <div>
          <dt>Learning</dt>
          <dd>{formatHours(learningHours)}h</dd>
        </div>
      </dl>

      {chart.length === 0 ? (
        <p className="empty-history">No sessions logged for this range yet.</p>
      ) : (
        <ChartSurface height={290}>
          {({ width, height }) => (
            <AreaChart width={width} height={height} data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d7dde8" />
              <XAxis dataKey="date" tickFormatter={(date) => date.slice(5)} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={32} />
              <Tooltip />
              <Area type="monotone" dataKey="hours" stroke="#2f80ed" fill="#b9d7ff" strokeWidth={2} />
            </AreaChart>
          )}
        </ChartSurface>
      )}
    </>
  );
}

function readStoredTimer() {
  try {
    const rawTimer = window.localStorage.getItem(TIMER_STORAGE_KEY);
    if (!rawTimer) return null;

    const parsed = JSON.parse(rawTimer) as Partial<StoredTimer>;
    if (parsed.mode !== 'CODING' && parsed.mode !== 'LEARNING') return null;

    return {
      elapsedBeforeStart: Number(parsed.elapsedBeforeStart ?? 0),
      elapsedSeconds: Number(parsed.elapsedSeconds ?? 0),
      isRunning: Boolean(parsed.isRunning),
      manualMinutes: String(parsed.manualMinutes ?? '60'),
      mode: parsed.mode,
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : null,
    } satisfies StoredTimer;
  } catch {
    removeStoredTimer();
    return null;
  }
}

function writeStoredTimer(timer: StoredTimer) {
  try {
    window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  } catch {
    // Timer persistence is a convenience; tracking should still work without storage.
  }
}

function removeStoredTimer() {
  try {
    window.localStorage.removeItem(TIMER_STORAGE_KEY);
  } catch {
    // Ignore storage failures so reset/save never breaks the logging flow.
  }
}

function readStoredQuickLog() {
  try {
    const rawDraft = window.localStorage.getItem(QUICK_LOG_STORAGE_KEY);
    if (!rawDraft) return null;

    const parsed = JSON.parse(rawDraft) as Partial<StoredQuickLog & QuickLogDraft>;
    const mode = parsed.mode === 'LEARNING' ? 'LEARNING' : 'CODING';

    if (parsed.drafts) {
      return {
        drafts: {
          CODING: normalizeQuickLogDraft(parsed.drafts.CODING, 'CODING'),
          LEARNING: normalizeQuickLogDraft(parsed.drafts.LEARNING, 'LEARNING'),
        },
        mode,
      } satisfies StoredQuickLog;
    }

    const migratedDraft = normalizeQuickLogDraft(parsed, mode);
    return {
      drafts: {
        ...defaultQuickLogDrafts,
        [mode]: migratedDraft,
      },
      mode,
    } satisfies StoredQuickLog;
  } catch {
    removeStoredQuickLog();
    return null;
  }
}

function normalizeQuickLogDraft(draft: Partial<QuickLogDraft> | undefined, mode: SessionMode) {
  const defaults = defaultQuickLogDrafts[mode];

  return {
    detailsOpen: Boolean(draft?.detailsOpen ?? defaults.detailsOpen),
    mode,
    notes: String(draft?.notes ?? defaults.notes),
    projectId: String(draft?.projectId ?? defaults.projectId),
    projectTitles: normalizeProjectTitles(draft?.projectTitles),
    source: String(draft?.source ?? defaults.source),
    technologyIds: Array.isArray(draft?.technologyIds) ? draft.technologyIds.map(String) : defaults.technologyIds,
    title: draft?.title === 'Coding session' ? 'Work session' : String(draft?.title ?? defaults.title),
  } satisfies QuickLogDraft;
}

function normalizeProjectTitles(projectTitles: unknown) {
  if (!projectTitles || typeof projectTitles !== 'object' || Array.isArray(projectTitles)) return {};

  return Object.fromEntries(
    Object.entries(projectTitles)
      .map(([projectId, title]) => [projectId, String(title).trim()])
      .filter(([, title]) => title),
  ) as Record<string, string>;
}

function writeStoredQuickLog(draft: StoredQuickLog) {
  try {
    window.localStorage.setItem(QUICK_LOG_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Form persistence should never block logging a session.
  }
}

function removeStoredQuickLog() {
  try {
    window.localStorage.removeItem(QUICK_LOG_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the form can still work without persistence.
  }
}

function readStoredWorkTitles() {
  try {
    const rawTitles = window.localStorage.getItem(WORK_TITLE_STORAGE_KEY);
    if (!rawTitles) return {};

    const parsed = JSON.parse(rawTitles);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).map(([projectId, titles]) => [
        projectId,
        Array.isArray(titles) ? titles.map(String).map((title) => title.trim()).filter(Boolean).slice(0, MAX_WORK_TITLES_PER_PROJECT) : [],
      ]),
    ) as StoredWorkTitles;
  } catch {
    removeStoredWorkTitles();
    return {};
  }
}

function writeStoredWorkTitles(titles: StoredWorkTitles) {
  try {
    window.localStorage.setItem(WORK_TITLE_STORAGE_KEY, JSON.stringify(titles));
  } catch {
    // Recent title suggestions are helpful, but logging should not depend on them.
  }
}

function removeStoredWorkTitles() {
  try {
    window.localStorage.removeItem(WORK_TITLE_STORAGE_KEY);
  } catch {
    // Ignore storage failures; suggestions can rebuild as the app is used.
  }
}

function addWorkTitle(titles: StoredWorkTitles, projectId: string, title: string) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle === defaultWorkDraft.title) return titles;

  const currentTitles = titles[projectId] ?? [];
  const nextTitles = [trimmedTitle, ...currentTitles.filter((item) => item.toLowerCase() !== trimmedTitle.toLowerCase())].slice(0, MAX_WORK_TITLES_PER_PROJECT);

  return {
    ...titles,
    [projectId]: nextTitles,
  };
}

function QuickLogPanel({
  bootstrap,
  draft,
  elapsedSeconds,
  firstProject,
  isSaving,
  isTimerRunning,
  manualMinutes,
  mode,
  workTitlesByProject,
  onModeChange,
  onDraftChange,
  onMinutesChange,
  onResetTimer,
  onStartTimer,
  onStopTimer,
  onSubmit,
}: {
  bootstrap: BootstrapData;
  draft: QuickLogDraft;
  elapsedSeconds: number;
  firstProject?: BootstrapData['projects'][number];
  isSaving: boolean;
  isTimerRunning: boolean;
  manualMinutes: string;
  mode: SessionMode;
  workTitlesByProject: StoredWorkTitles;
  onModeChange: (mode: SessionMode) => void;
  onDraftChange: (patch: Partial<QuickLogDraft>) => void;
  onMinutesChange: (minutes: string) => void;
  onResetTimer: () => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  const selectedProjectId = draft.projectId || firstProject?.id || '';
  const titleSuggestions = selectedProjectId ? workTitlesByProject[selectedProjectId] ?? [] : [];

  function handleTechnologyChange(technologyId: string, checked: boolean) {
    onDraftChange({
      technologyIds: checked ? [...draft.technologyIds, technologyId] : draft.technologyIds.filter((id) => id !== technologyId),
    });
  }

  function handleTitleChange(title: string) {
    onDraftChange({
      title,
      projectTitles:
        mode === 'CODING' && selectedProjectId
          ? {
              ...draft.projectTitles,
              [selectedProjectId]: title,
            }
          : draft.projectTitles,
    });
  }

  function handleProjectChange(projectId: string) {
    const project = bootstrap.projects.find((item) => item.id === projectId);

    onDraftChange({
      projectId,
      title: draft.projectTitles[projectId] ?? defaultWorkDraft.title,
      technologyIds: project?.technologies.map(({ technology }) => technology.id) ?? [],
    });
  }

  return (
    <article id="sessions" className="panel log-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Quick log</p>
          <h2>Add a session</h2>
        </div>
        <div className="segmented" aria-label="Session type">
          <button type="button" className={mode === 'CODING' ? 'selected' : ''} onClick={() => onModeChange('CODING')}>
            <Code2 size={16} /> Work
          </button>
          <button type="button" className={mode === 'LEARNING' ? 'selected' : ''} onClick={() => onModeChange('LEARNING')}>
            <BookOpen size={16} /> Learn
          </button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="session-form">
        <div className="timer-card">
          <div>
            <span>Timer</span>
            <strong>{formatDuration(elapsedSeconds)}</strong>
          </div>
          <div className="timer-actions">
            <button type="button" className="icon-button start" onClick={onStartTimer} disabled={isTimerRunning} aria-label="Start timer" title="Start timer">
              <Play size={16} />
            </button>
            <button
              type="button"
              className="icon-button stop"
              onClick={onStopTimer}
              disabled={!isTimerRunning && elapsedSeconds === 0}
              aria-label="Stop timer"
              title="Stop timer"
            >
              <Square size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onResetTimer}
              disabled={elapsedSeconds === 0 && !isTimerRunning}
              aria-label="Reset timer"
              title="Reset timer"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        <label>
          <span>Minutes</span>
          <input name="minutes" type="number" min="5" max="1440" value={manualMinutes} onChange={(event) => onMinutesChange(event.target.value)} required />
        </label>

        <details className="optional-details" open={draft.detailsOpen} onToggle={(event) => onDraftChange({ detailsOpen: event.currentTarget.open })}>
          <summary>Details</summary>
          <div className="details-fields">
            <label>
              <span>{mode === 'CODING' ? 'Work title' : 'Topic'}</span>
              <input name="title" value={draft.title} onChange={(event) => handleTitleChange(event.target.value)} required />
            </label>
            {mode === 'CODING' && titleSuggestions.length > 0 && (
              <div className="title-suggestions" aria-label="Recent work titles">
                {titleSuggestions.map((title) => (
                  <button key={title} type="button" onClick={() => handleTitleChange(title)}>
                    {title}
                  </button>
                ))}
              </div>
            )}

            <div className="form-row">
              {mode === 'CODING' ? (
                <label>
                  <span>Project</span>
                  <select name="projectId" value={selectedProjectId} onChange={(event) => handleProjectChange(event.target.value)}>
                    {bootstrap.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  <span>Source</span>
                  <input name="source" value={draft.source} onChange={(event) => onDraftChange({ source: event.target.value })} />
                </label>
              )}
            </div>

            <fieldset>
              <legend>Technologies</legend>
              <div className="tech-picker">
                {bootstrap.technologies.map((technology) => (
                  <label key={technology.id} style={{ borderColor: technology.color }}>
                    <input
                      type="checkbox"
                      name="technologyIds"
                      value={technology.id}
                      checked={draft.technologyIds.includes(technology.id)}
                      onChange={(event) => handleTechnologyChange(technology.id, event.target.checked)}
                    />
                    {technology.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <label>
              <span>Notes</span>
              <textarea
                name="notes"
                rows={3}
                placeholder="What moved forward? What felt sticky?"
                value={draft.notes}
                onChange={(event) => onDraftChange({ notes: event.target.value })}
              />
            </label>
          </div>
        </details>

        <button className="primary-button" disabled={isSaving}>
          {isSaving ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
          Save session
        </button>
      </form>
    </article>
  );
}

function ChartSurface({
  children,
  className = '',
  height,
}: {
  children: (size: { width: number; height: number }) => ReactNode;
  className?: string;
  height: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    function updateWidth() {
      setWidth(Math.floor(frameRef.current?.getBoundingClientRect().width ?? 0));
    }

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    const frame = frameRef.current;
    if (frame) observer.observe(frame);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className={`chart-frame ${className}`} style={{ height }}>
      {width > 0 ? children({ width, height }) : null}
    </div>
  );
}

function Metric({ detail, icon, label, value }: { detail?: string; icon: ReactNode; label: string; value: string }) {
  return (
    <article className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
