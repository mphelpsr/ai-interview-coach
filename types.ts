export enum InterviewState {
  CONTEXT_SELECTION,
  SESSION_ACTIVE,
  FINAL_REPORT,
}

export interface Feedback {
  fluencyBand: number;
  improvementTip: string;
  nativeLikeExample: string;
}

export interface VocabularyItem {
  word: string;
  level: string; // e.g., A1, B2, C1
  definition: string;
}

export interface QuestionData {
  question: string;
  imagePrompt: string;
  vocabulary: VocabularyItem[];
}


export interface FinalReport {
  topStrengths: string[];
  improvementAreas: string[];
  expressionsToReview: string[];
  nextRecommendedContext: string;
}

export interface HistoryItem {
  questionData: QuestionData;
  answer: string;
  feedback: Feedback;
  imageUrl?: string;
}