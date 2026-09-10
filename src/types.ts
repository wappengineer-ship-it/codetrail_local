export type Technology = {
  id: string;
  name: string;
  category: string;
  color: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  repository?: string;
  liveUrl?: string;
  startedAt?: string;
  technologies: { technology: Technology }[];
};

export type Goal = {
  id: string;
  projectId?: string;
  title: string;
  description?: string;
  cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MILESTONE';
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
  targetValue: number;
  currentValue: number;
  unit: string;
  dueDate?: string;
};

export type CodingSession = {
  id: string;
  projectId?: string;
  title: string;
  notes?: string;
  minutes: number;
  focusScore: number;
  sessionDate: string;
  project?: Project;
  technologies: { technology: Technology }[];
};

export type LearningSession = {
  id: string;
  topic: string;
  source: string;
  notes?: string;
  minutes: number;
  confidence: number;
  sessionDate: string;
  technologies: { technology: Technology }[];
};

export type BootstrapData = {
  user: AuthUser;
  technologies: Technology[];
  projects: Project[];
  goals: Goal[];
  recentCoding: CodingSession[];
  recentLearning: LearningSession[];
};

export type DashboardData = {
  stats: {
    codingHoursToday: number;
    learningHoursToday: number;
    totalHoursToday: number;
    rangeCodingHours: number;
    rangeLearningHours: number;
    rangeTotalHours: number;
    rangeLabel: string;
    codingHoursThisWeek: number;
    learningHoursThisWeek: number;
    totalHoursLast30Days: number;
    streakDays: number;
    activeGoalCount: number;
  };
  chart: { date: string; hours: number }[];
  history: {
    date: string;
    codingHours: number;
    learningHours: number;
    totalHours: number;
  }[];
  technologies: {
    name: string;
    color: string;
    minutes: number;
    hours: number;
  }[];
  insights: string[];
};
