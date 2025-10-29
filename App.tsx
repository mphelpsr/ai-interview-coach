import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { InterviewState, QuestionData, Feedback, FinalReport, HistoryItem, VocabularyItem } from './types';
import * as geminiService from './services/geminiService';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useSpeechToText } from './hooks/useSpeechToText';
import { SpeakerIcon, LoadingSpinner, MicrophoneIcon, StopIcon } from './components/icons';

const App: React.FC = () => {
    const [appState, setAppState] = useState<InterviewState>(InterviewState.CONTEXT_SELECTION);
    const [context, setContext] = useState('');
    const [questions, setQuestions] = useState<QuestionData[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
    const { playAudio, isPlaying: isAudioPlaying } = useAudioPlayer();
    const { isRecording, transcript, startTranscription, stopTranscription } = useSpeechToText();

    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (transcript) {
        setCurrentAnswer(transcript);
      }
    }, [transcript]);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [history, finalReport]);

    const handleStartSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!context.trim()) return;

        setIsLoading(true);
        setError(null);
        try {
            const fetchedQuestions = await geminiService.generateQuestions(context);
            setQuestions(fetchedQuestions);
            setCurrentQuestionIndex(0);
            setHistory([]);
            setAppState(InterviewState.SESSION_ACTIVE);
            await fetchQuestionData(fetchedQuestions[0]);
        } catch (err) {
            setError('Failed to start session. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchQuestionData = async (questionData: QuestionData) => {
        setCurrentImageUrl(null);
        // Play question audio
        geminiService.generateSpeech(questionData.question).then(playAudio);
        // Generate image
        geminiService.generateImage(questionData.imagePrompt)
            .then(setCurrentImageUrl)
            .catch(err => console.error("Image generation failed:", err));
    };

    const handleAnswerSubmit = async () => {
        if (!currentAnswer.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            const questionData = questions[currentQuestionIndex];
            const feedback = await geminiService.evaluateAnswer(questionData.question, currentAnswer);
            
            const newHistoryItem: HistoryItem = {
                questionData,
                answer: currentAnswer,
                feedback,
                imageUrl: currentImageUrl ?? undefined,
            };
            
            const updatedHistory = [...history, newHistoryItem];
            setHistory(updatedHistory);

            // Play feedback audio
            const feedbackSpeech = `Your fluency band is ${feedback.fluencyBand}. Here's a tip: ${feedback.improvementTip}. A more native-like version would be: ${feedback.nativeLikeExample}`;
            geminiService.generateSpeech(feedbackSpeech).then(playAudio);

            setCurrentAnswer('');
            
            if (currentQuestionIndex < questions.length - 1) {
                const nextIndex = currentQuestionIndex + 1;
                setCurrentQuestionIndex(nextIndex);
                await fetchQuestionData(questions[nextIndex]);
            } else {
                // End of session, generate report
                const report = await geminiService.generateFinalReport(updatedHistory);
                setFinalReport(report);
                setAppState(InterviewState.FINAL_REPORT);
                geminiService.generateSpeech("Congratulations, you've completed the session. Here is your final report.").then(playAudio);
            }

        } catch (err) {
            setError('Failed to evaluate answer. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewSession = () => {
        setAppState(InterviewState.CONTEXT_SELECTION);
        setContext('');
        setQuestions([]);
        setCurrentQuestionIndex(0);
        setCurrentAnswer('');
        setHistory([]);
        setFinalReport(null);
        setError(null);
        setCurrentImageUrl(null);
    };

    const renderContextSelection = () => (
        <div className="w-full max-w-lg mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4 text-gray-900">AI Fluency Coach</h1>
            <p className="text-lg text-gray-600 mb-8">Practice your English speaking skills in any context.</p>
            <form onSubmit={handleStartSession} className="flex flex-col sm:flex-row gap-4">
                <input
                    type="text"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="E.g., 'Immigration Interview at the US embassy'"
                    className="flex-grow p-4 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className="bg-blue-600 text-white font-bold py-4 px-8 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
                    disabled={isLoading}
                >
                    {isLoading ? <LoadingSpinner className="w-6 h-6" /> : "Start Session"}
                </button>
            </form>
        </div>
    );
    
    const renderSessionActive = () => {
        const currentQuestion = questions[currentQuestionIndex];
        const lastHistoryItem = history.length > 0 ? history[history.length-1] : null;

        return (
            <div className="w-full max-w-6xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-center text-gray-800">Context: <span className="text-blue-600">{context}</span></h1>
                <p className="text-center text-gray-500">Question {currentQuestionIndex + 1} of {questions.length}</p>
                
                {history.length > 0 && lastHistoryItem && (
                    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                        <h3 className="font-bold text-lg mb-4 text-gray-800">Your Previous Answer & Feedback</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Left part: Image and Question */}
                            <div className="md:col-span-1 space-y-2">
                                {lastHistoryItem.imageUrl && (
                                    <img src={lastHistoryItem.imageUrl} alt={lastHistoryItem.questionData.imagePrompt} className="w-full object-cover rounded-lg" />
                                )}
                                <p className="font-semibold text-gray-700 text-sm">{lastHistoryItem.questionData.question}</p>
                            </div>
                    
                            {/* Right part: Answer and Feedback */}
                            <div className="md:col-span-2 space-y-4">
                                <p className="italic text-gray-600">Your answer: "{lastHistoryItem.answer}"</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                                    <div className="bg-blue-50 p-3 rounded sm:col-span-1">
                                        <p className="font-bold text-blue-800 text-sm">IELTS-Like Fluency Band</p>
                                        <p className="text-2xl font-light">{lastHistoryItem.feedback.fluencyBand.toFixed(1)} / 9.0</p>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded sm:col-span-2">
                                        <p className="font-bold text-green-800 text-sm">Improvement Tip</p>
                                        <p className="text-sm">{lastHistoryItem.feedback.improvementTip}</p>
                                    </div>
                                </div>
                                <div className="bg-indigo-50 p-3 rounded">
                                    <p className="font-bold text-indigo-800 text-sm">Native-like Example</p>
                                    <p className="italic text-sm">"{lastHistoryItem.feedback.nativeLikeExample}"</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Image & Question */}
                    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-4">
                        <div className="w-full aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                            {currentImageUrl ? 
                                <img src={currentImageUrl} alt={currentQuestion.imagePrompt} className="w-full h-full object-cover rounded-lg" /> :
                                <LoadingSpinner className="w-10 h-10 text-gray-400"/>
                            }
                        </div>
                        <div className="flex items-start justify-between space-x-3">
                            <h2 className="text-xl font-semibold text-gray-900">{currentQuestion.question}</h2>
                            <button onClick={() => geminiService.generateSpeech(currentQuestion.question).then(playAudio)} disabled={isAudioPlaying} className="p-2 rounded-full hover:bg-gray-200 disabled:text-gray-400 flex-shrink-0">
                                {isAudioPlaying ? <LoadingSpinner className="w-6 h-6"/> : <SpeakerIcon className="w-6 h-6"/>}
                            </button>
                        </div>
                    </div>

                    {/* Right Column: Vocabulary & Answer */}
                    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                        <h3 className="font-bold mb-2 text-gray-800">Key Vocabulary</h3>
                        <ul className="space-y-2 mb-4">
                           {currentQuestion.vocabulary.map((item, index) => (
                               <li key={index} className="flex items-baseline justify-between">
                                   <div>
                                       <span className="font-semibold text-gray-800">{item.word}</span>: <span className="text-gray-600">{item.definition}</span>
                                   </div>
                                   <span className="text-sm font-medium bg-gray-200 text-gray-800 px-2 py-1 rounded-full">{item.level}</span>
                               </li>
                           ))}
                        </ul>
                        <div className="relative">
                            <textarea
                                value={currentAnswer}
                                onChange={(e) => setCurrentAnswer(e.target.value)}
                                placeholder="Speak or type your answer here..."
                                className="w-full p-4 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 h-40 resize-none"
                                disabled={isLoading || isRecording}
                            />
                            <div className="absolute bottom-3 right-3 flex items-center gap-2">
                                <button
                                  onClick={isRecording ? stopTranscription : startTranscription}
                                  className={`p-3 rounded-full text-white shadow-md transition-transform transform hover:scale-110 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-600'}`}
                                  disabled={isLoading}
                                >
                                  {isRecording ? <StopIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={handleAnswerSubmit}
                            className="w-full mt-4 bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center"
                            disabled={isLoading || !currentAnswer.trim() || isRecording}
                        >
                            {isLoading ? <LoadingSpinner className="w-6 h-6"/> : 'Submit Answer'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderFinalReport = () => (
        <div className="w-full max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-2xl border">
            <h1 className="text-3xl font-bold text-center mb-6 text-gray-900">Session Report</h1>
            <h2 className="text-xl font-semibold mb-2 text-gray-800">Context: <span className="font-normal text-blue-600">{context}</span></h2>

            <div className="space-y-6">
                <div>
                    <h3 className="font-bold text-green-700 text-lg mb-2">✅ Top Strengths</h3>
                    <ul className="list-disc list-inside bg-green-50 p-4 rounded-md">
                        {finalReport?.topStrengths.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
                <div>
                    <h3 className="font-bold text-yellow-700 text-lg mb-2">📈 Improvement Areas</h3>
                    <ul className="list-disc list-inside bg-yellow-50 p-4 rounded-md">
                        {finalReport?.improvementAreas.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
                <div>
                    <h3 className="font-bold text-indigo-700 text-lg mb-2">📚 Expressions to Review</h3>
                    <ul className="list-disc list-inside bg-indigo-50 p-4 rounded-md">
                        {finalReport?.expressionsToReview.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
                <div>
                    <h3 className="font-bold text-blue-700 text-lg mb-2">🚀 Next Recommended Context</h3>
                    <p className="bg-blue-50 p-4 rounded-md italic">"{finalReport?.nextRecommendedContext}"</p>
                </div>
            </div>

            <button
                onClick={handleNewSession}
                className="w-full mt-8 bg-blue-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-blue-700"
            >
                Start New Session
            </button>
        </div>
    );

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
            {appState === InterviewState.CONTEXT_SELECTION && renderContextSelection()}
            {appState === InterviewState.SESSION_ACTIVE && renderSessionActive()}
            {appState === InterviewState.FINAL_REPORT && renderFinalReport()}
            <div ref={bottomRef} />
        </main>
    );
};

export default App;