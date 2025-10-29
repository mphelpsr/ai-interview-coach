
import React, { useState, useCallback, useEffect } from 'react';
import { InterviewState } from './types';
import * as geminiService from './services/geminiService';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { SpeakerIcon, LoadingSpinner } from './components/icons';

const App: React.FC = () => {
  const [interviewState, setInterviewState] = useState<InterviewState>(InterviewState.NOT_STARTED);
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const { playAudio, isPlaying } = useAudioPlayer();

  const handleStartInterview = useCallback(async () => {
    setInterviewState(InterviewState.GENERATING_QUESTIONS);
    setError('');
    try {
      const fetchedQuestions = await geminiService.generateQuestions();
      if (fetchedQuestions.length === 0) {
        throw new Error("No questions were generated.");
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
  }, [playAudio]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!currentAnswer.trim()) return;
    setInterviewState(InterviewState.EVALUATING_ANSWER);
    setError('');
    try {
      const currentQuestion = questions[currentQuestionIndex];
      const evaluation = await geminiService.evaluateAnswer(currentQuestion, currentAnswer);
      setFeedback(evaluation);
      setInterviewState(InterviewState.SHOWING_FEEDBACK);
      const audioData = await geminiService.textToSpeech(`Here is your feedback. ${evaluation}`);
      await playAudio(audioData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setInterviewState(InterviewState.ERROR);
    }
  }, [currentAnswer, questions, currentQuestionIndex, playAudio]);

  const handleNextQuestion = useCallback(async () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setCurrentAnswer('');
      setFeedback('');
      setInterviewState(InterviewState.ASKING_QUESTION);
      const audioData = await geminiService.textToSpeech(questions[nextIndex]);
      await playAudio(audioData);
      setInterviewState(InterviewState.AWAITING_ANSWER);
    } else {
      setInterviewState(InterviewState.COMPLETED);
    }
  }, [currentQuestionIndex, questions, playAudio]);

  const handleRestart = () => {
    setInterviewState(InterviewState.NOT_STARTED);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer('');
    setFeedback('');
    setError('');
  };

  const renderFeedback = (text: string) => {
    // Fix: Replaced a simple string replace with a more robust markdown-like
    // parser for bold text. This correctly handles various formatting cases and
    // also resolves the original `replaceAll` compatibility issue.
    return text.split('\n').map((line, index) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <p key={index} className="mb-2">
          {parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </p>
      );
    });
  };
  
  const isLoading = [
    InterviewState.GENERATING_QUESTIONS,
    InterviewState.ASKING_QUESTION,
    InterviewState.EVALUATING_ANSWER,
  ].includes(interviewState);

  return (
    <div className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-cyan-400">AI Interview Coach</h1>
          <p className="text-slate-400 mt-2">Technical Leadership Edition</p>
        </header>

        <main className="bg-slate-800 rounded-lg shadow-2xl p-6 md:p-8 min-h-[24rem] flex flex-col justify-between transition-all duration-300">
          {interviewState === InterviewState.NOT_STARTED && (
            <div className="text-center flex flex-col items-center justify-center h-full">
              <h2 className="text-2xl font-semibold mb-4">Ready to practice?</h2>
              <p className="text-slate-300 mb-6">You'll be asked 10 behavioral questions. After each answer, you'll receive AI-powered feedback.</p>
              <button onClick={handleStartInterview} className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105">
                Start Interview
              </button>
            </div>
          )}

          {interviewState === InterviewState.GENERATING_QUESTIONS && (
            <div className="text-center flex flex-col items-center justify-center h-full">
              <LoadingSpinner className="w-12 h-12 text-cyan-400" />
              <p className="mt-4 text-slate-300">Preparing your interview questions...</p>
            </div>
          )}

          {(interviewState === InterviewState.AWAITING_ANSWER || interviewState === InterviewState.EVALUATING_ANSWER || interviewState === InterviewState.ASKING_QUESTION) && questions.length > 0 && (
            <div>
              <p className="text-sm text-cyan-400 font-semibold mb-2">Question {currentQuestionIndex + 1} of {questions.length}</p>
              <h3 className="text-xl md:text-2xl font-semibold text-slate-100 mb-4">{questions[currentQuestionIndex]}</h3>
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="Type your answer here..."
                className="w-full h-40 bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition"
                disabled={isLoading}
              />
            </div>
          )}
          
          {interviewState === InterviewState.SHOWING_FEEDBACK && (
            <div>
              <h3 className="text-2xl font-semibold text-cyan-400 mb-4">Feedback</h3>
              <div className="bg-slate-900/50 p-4 rounded-lg text-slate-300 space-y-2 prose prose-invert max-w-none">
                {renderFeedback(feedback)}
              </div>
            </div>
          )}

          {interviewState === InterviewState.COMPLETED && (
            <div className="text-center flex flex-col items-center justify-center h-full">
              <h2 className="text-3xl font-bold text-cyan-400 mb-4">Interview Complete!</h2>
              <p className="text-slate-300 mb-6">Great job practicing. Keep it up!</p>
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
              <button onClick={handleSubmitAnswer} disabled={!currentAnswer.trim() || isLoading} className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105 w-full sm:w-auto">
                Submit Answer
              </button>
            )}
            {isLoading && interviewState !== InterviewState.GENERATING_QUESTIONS && (
              <div className="flex justify-center items-center gap-2">
                 <LoadingSpinner className="w-6 h-6 text-cyan-400" />
                 <span className="text-slate-300">
                    {interviewState === InterviewState.EVALUATING_ANSWER ? 'Evaluating...' : 'Loading...'}
                 </span>
              </div>
            )}
            {interviewState === InterviewState.SHOWING_FEEDBACK && (
              <button onClick={handleNextQuestion} className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105 w-full sm:w-auto">
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Interview'}
              </button>
            )}
             {(interviewState === InterviewState.COMPLETED || interviewState === InterviewState.ERROR) && (
              <button onClick={handleRestart} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105 w-full sm:w-auto">
                Start Over
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
