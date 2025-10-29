export enum InterviewState {
  NOT_STARTED = 'NOT_STARTED',
  GENERATING_QUESTIONS = 'GENERATING_QUESTIONS',
  ASKING_QUESTION = 'ASKING_QUESTION',
  AWAITING_ANSWER = 'AWAITING_ANSWER',
  EVALUATING_ANSWER = 'EVALUATING_ANSWER',
  SHOWING_FEEDBACK = 'SHOWING_FEEDBACK',
  GENERATING_REPORT = 'GENERATING_REPORT',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface Feedback {
  fluency: number;
  tip: string;
  nativeExample: string;
}

export interface FinalReport {
  topStrengths: string;
  improvementAreas: string;
  expressionsToReview: string[];
  nextRecommendedContext: string;
}

export interface HistoryItem {
  question: string;
  answer: string;
  feedback: Feedback;
}
