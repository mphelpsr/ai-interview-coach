
import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Blob, LiveServerMessage } from '@google/genai';

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const useSpeechToText = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    
    // Using 'any' as LiveSession is not an exported type.
    const sessionRef = useRef<any | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const fullTranscriptRef = useRef('');
    const currentTurnTranscriptRef = useRef('');

    const stopTranscription = useCallback(() => {
        if (!isRecording) return;
        setIsRecording(false);
        
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());

        // Use a timeout to allow final messages to process
        setTimeout(() => {
            audioContextRef.current?.close();
            sessionRef.current?.close();
            
            processorRef.current = null;
            sourceRef.current = null;
            mediaStreamRef.current = null;
            audioContextRef.current = null;
            sessionRef.current = null;
        }, 500);

    }, [isRecording]);


    const startTranscription = useCallback(async () => {
        if (isRecording) return;
        
        setTranscript('');
        fullTranscriptRef.current = '';
        currentTurnTranscriptRef.current = '';
        setIsRecording(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => console.log('Transcription session opened.'),
                    onmessage: (message: LiveServerMessage) => {
                        // Fix: The `isFinal` property does not exist on `inputTranscription`.
                        // Use `turnComplete` to determine when an utterance is complete.
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            currentTurnTranscriptRef.current += text;
                            setTranscript(fullTranscriptRef.current + currentTurnTranscriptRef.current);
                        }
                        if (message.serverContent?.turnComplete) {
                            fullTranscriptRef.current += currentTurnTranscriptRef.current + ' ';
                            currentTurnTranscriptRef.current = '';
                            setTranscript(fullTranscriptRef.current);
                        }
                    },
                    onerror: (e) => {
                        console.error('Transcription session error:', e);
                        stopTranscription();
                    },
                    onclose: () => {
                        console.log('Transcription session closed.');
                        // Ensure recording state is false if closed unexpectedly
                        if (isRecording) {
                            stopTranscription();
                        }
                    }
                },
                config: {
                    inputAudioTranscription: {},
                }
            });
            
            sessionRef.current = await sessionPromise;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            audioContextRef.current = context;
            
            const source = context.createMediaStreamSource(stream);
            sourceRef.current = source;
            const processor = context.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromise.then((session) => {
                    if (session) {
                       session.sendRealtimeInput({ media: pcmBlob });
                    }
                }).catch(err => {
                    console.error("Failed to send audio data:", err);
                    stopTranscription();
                });
            };

            source.connect(processor);
            processor.connect(context.destination);

        } catch (error) {
            console.error('Failed to start transcription:', error);
            setIsRecording(false);
            alert(`Could not start recording. Please ensure microphone permissions are granted. Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [isRecording, stopTranscription]);

    return { isRecording, transcript, startTranscription, stopTranscription };
};
