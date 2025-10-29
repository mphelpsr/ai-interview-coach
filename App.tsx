import React, { useState, useCallback, useEffect } from 'react';
import { InterviewState, Feedback, FinalReport, HistoryItem } from './types';
import * as geminiService from './services/geminiService';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useLiveConversation } from './hooks/useLiveConversation';
import { SpeakerIcon, LoadingSpinner, MicrophoneIcon, StopIcon } from './components/icons';

const App: React.FC = () => {
  const [interviewState, setInterviewState] = useState<InterviewState>(InterviewState.NOT_STARTED);
  const [context, setContext] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [sessionHistory, setSessionHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState('');
  
  const { playAudio, isPlaying } = useAudioPlayer();
  const { isRecording, transcript, startRecording, stopRecording } = useLiveConversation();

  useEffect(() => {
    setCurrentAnswer(transcript);
  }, [transcript]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);
  
  const handleStartSession = useCallback(async () => {
    if (!context.trim()) {
      setError("Please enter a context to practice.");
      // A little shake animation for the input would be nice, but for now, an error is fine.
      setTimeout(() => setError(''), 3000);
      return;
    }
    setInterviewState(InterviewState.GENERATING_QUESTIONS);
    setError('');
    try {
      const fetchedQuestions = await geminiService.generateQuestions(context);
      if (fetchedQuestions.length === 0) {
        throw new Error("No questions were generated for this context.");
      }
      setQuestions(fetchedQuestions);
      setCurrentQuestionIndex(0);
      setInterviewState(InterviewState.ASKING_QUESTION);
      const audioData = await geminiService.textToSpeech(fetchedQuestions[0]);
      await playAudio(audioData);
      setInterviewState(InterviewState.AWAITING_ANSWER);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setInterviewState(InterviewState.ERROR);
    }
  }, [context, playAudio]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!currentAnswer.trim()) return;
    setInterviewState(InterviewState.EVALUATING_ANSWER);
    setError('');
    try {
      const currentQuestion = questions[currentQuestionIndex];
      const evaluation = await geminiService.evaluateAnswer(currentQuestion, currentAnswer, context);
      setFeedback(evaluation);
      setSessionHistory(prev => [...prev, { question: currentQuestion, answer: currentAnswer, feedback: evaluation }]);
      setInterviewState(InterviewState.SHOWING_FEEDBACK);
      const feedbackIntro = `Here is your feedback. Your estimated IELTS fluency band is ${evaluation.fluency.toFixed(1)}. ${evaluation.tip}. A native-like version would be: ${evaluation.nativeExample}`;
      const audioData = await geminiService.textToSpeech(feedbackIntro);
      await playAudio(audioData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setInterviewState(InterviewState.ERROR);
    }
  }, [currentAnswer, questions, currentQuestionIndex, context, playAudio]);

  const handleNextQuestion = useCallback(async () => {
    setFeedback(null);
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setCurrentAnswer('');
      setInterviewState(InterviewState.ASKING_QUESTION);
      const audioData = await geminiService.textToSpeech(questions[nextIndex]);
      await playAudio(audioData);
      setInterviewState(InterviewState.AWAITING_ANSWER);
    } else {
      setInterviewState(InterviewState.GENERATING_REPORT);
      try {
        const report = await geminiService.generateFinalReport(context, sessionHistory);
        setFinalReport(report);
        setInterviewState(InterviewState.COMPLETED);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        setInterviewState(InterviewState.ERROR);
      }
    }
  }, [currentQuestionIndex, questions, context, sessionHistory, playAudio]);

  const handleRestart = () => {
    setInterviewState(InterviewState.NOT_STARTED);
    setContext('');
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer('');
    setFeedback(null);
    setFinalReport(null);
    setSessionHistory([]);
    setError('');
  };

  const handleStartRecording = () => {
    setCurrentAnswer('');
    startRecording();
  };
  
  const isLoading = [
    InterviewState.GENERATING_QUESTIONS,
    InterviewState.ASKING_QUESTION,
    InterviewState.EVALUATING_ANSWER,
    InterviewState.GENERATING_REPORT,
  ].includes(interviewState);

  const loadingText = () => {
    switch (interviewState) {
      case InterviewState.GENERATING_QUESTIONS: return 'Preparing your questions...';
      case InterviewState.EVALUATING_ANSWER: return 'Evaluating your answer...';
      case InterviewState.GENERATING_REPORT: return 'Generating your final report...';
      default: return 'Loading...';
    }
  };

  return (
    <div className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-cyan-400">Contextual Fluency Coach</h1>
          <p className="text-slate-400 mt-2">Practice English for any real-world scenario.</p>
        </header>

        <main className="bg-slate-800 rounded-lg shadow-2xl p-6 md:p-8 min-h-[24rem] flex flex-col justify-between transition-all duration-300">
          {interviewState === InterviewState.NOT_STARTED && (
            <div className="text-center flex flex-col items-center justify-center h-full">
              <h2 className="text-2xl font-semibold mb-2">What context would you like to practice today?</h2>
              <p className="text-slate-300 mb-6">e.g., "At a restaurant", "Job interview for a React developer", "US immigration interview"</p>
              <input 
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Enter a context..."
                className="w-full max-w-md bg-slate-700 border border-slate-600 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition"
              />
              <button onClick={handleStartSession} className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105">
                Start Session
              </button>
            </div>
          )}

          {(isLoading && interviewState !== InterviewState.ASKING_QUESTION) && (
            <div className="text-center flex flex-col items-center justify-center h-full">
              <LoadingSpinner className="w-12 h-12 text-cyan-400" />
              <p className="mt-4 text-slate-300">{loadingText()}</p>
            </div>
          )}

          {(interviewState === InterviewState.AWAITING_ANSWER || interviewState === InterviewState.EVALUATING_ANSWER || interviewState === InterviewState.ASKING_QUESTION) && questions.length > 0 && (
            <div>
              <p className="text-sm text-cyan-400 font-semibold mb-2">Question {currentQuestionIndex + 1} of {questions.length} | Context: {context}</p>
              <h3 className="text-xl md:text-2xl font-semibold text-slate-100 mb-4">{questions[currentQuestionIndex]}</h3>
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="Type or record your answer here..."
                className="w-full h-40 bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition"
                disabled={isLoading || isRecording}
              />
            </div>
          )}
          
          {interviewState === InterviewState.SHOWING_FEEDBACK && feedback && (
            <div className="space-y-4">
                <h3 className="text-2xl font-semibold text-cyan-400 mb-4">Feedback</h3>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                    <p className="text-sm font-bold text-slate-400">🧩 IELTS-LIKE FLUENCY BAND</p>
                    <p className="text-2xl font-bold text-white">{feedback.fluency.toFixed(1)}</p>
                </div>
                 <div className="bg-slate-900/50 p-4 rounded-lg">
                    <p className="text-sm font-bold text-slate-400">🗣️ IMPROVEMENT TIP</p>
                    <p className="text-slate-300 mt-1">{feedback.tip}</p>
                </div>
                 <div className="bg-slate-900/50 p-4 rounded-lg">
                    <p className="text-sm font-bold text-slate-400">💬 NATIVE-LIKE EXAMPLE</p>
                    <p className="text-slate-300 mt-1 italic">"{feedback.nativeExample}"</p>
                </div>
            </div>
          )}

          {interviewState === InterviewState.COMPLETED && finalReport && (
            <div>
                <h2 className="text-3xl font-bold text-cyan-400 mb-4 text-center">Session Report</h2>
                <div className="space-y-3">
                    <div className="bg-slate-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-slate-300">Top Strengths</h4>
                        <p className="text-slate-400">{finalReport.topStrengths}</p>
                    </div>
                     <div className="bg-slate-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-slate-300">Improvement Areas</h4>
                        <p className="text-slate-400">{finalReport.improvementAreas}</p>
                    </div>
                     <div className="bg-slate-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-slate-300">Expressions to Review</h4>
                        <ul className="list-disc list-inside text-slate-400">
                            {finalReport.expressionsToReview.map((exp, i) => <li key={i}>{exp}</li>)}
                        </ul>
                    </div>
                     <div className="bg-slate-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-slate-300">Next Recommended Context</h4>
                        <p className="text-slate-400">{finalReport.nextRecommendedContext}</p>
                    </div>
                </div>
            </div>
          )}

          {interviewState === InterviewState.ERROR && (
            <div className="text-center flex flex-col items-center justify-center h-full">
              <h2 className="text-2xl font-semibold text-red-500 mb-4">An Error Occurred</h2>
              <p className="text-slate-300 bg-red-900/50 p-4 rounded">{error}</p>
            </div>
          )}


          <div className="mt-6 text-center">
            {interviewState === InterviewState.AWAITING_ANSWER && (
               <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={isRecording ? stopRecording : handleStartRecording}
                  disabled={isLoading}
                  className={`font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 flex items-center justify-center gap-2 w-full sm:w-auto ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                      : 'bg-slate-600 hover:bg-slate-500 text-white'
                  } disabled:bg-slate-700 disabled:cursor-not-allowed`}
                >
                  {isRecording ? <StopIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
                  <span>{isRecording ? 'Stop Recording' : 'Record Answer'}</span>
                </button>
                <button 
                  onClick={handleSubmitAnswer} 
                  disabled={!currentAnswer.trim() || isLoading || isRecording} 
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105 w-full sm:w-auto"
                >
                  Submit Answer
                </button>
              </div>
            )}
            {(isLoading && (interviewState === InterviewState.EVALUATING_ANSWER || interviewState === InterviewState.ASKING_QUESTION)) && (
              <div className="flex justify-center items-center gap-2">
                 <LoadingSpinner className="w-6 h-6 text-cyan-400" />
                 <span className="text-slate-300">{loadingText()}</span>
              </div>
            )}
            {interviewState === InterviewState.SHOWING_FEEDBACK && (
              <button onClick={handleNextQuestion} className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105 w-full sm:w-auto">
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish & View Report'}
              </button>
            )}
             {(interviewState === InterviewState.COMPLETED || interviewState === InterviewState.ERROR) && (
              <button onClick={handleRestart} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105 w-full sm:w-auto">
                Start New Session
              </button>
            )}
          </div>
        </main>
        
        <footer className="text-center text-slate-500 mt-8 text-sm">
          <p>Powered by Google Gemini</p>
          {isPlaying && (
              <div className="fixed bottom-5 right-5 bg-slate-700 p-3 rounded-full shadow-lg flex items-center gap-2">
                  <SpeakerIcon className="w-6 h-6 text-cyan-400 animate-pulse" />
                  <span className="text-sm">Playing audio...</span>
              </div>
          )}
        </footer>
      </div>
    </div>
  );
};

export default App;