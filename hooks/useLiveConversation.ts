import { useState, useRef, useCallback } from 'react';
// Fix: Removed non-exported 'LiveSession' type and added 'Modality' for config.
import { GoogleGenAI, Blob, LiveServerMessage, Modality } from '@google/genai';

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

export const useLiveConversation = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    
    // Fix: 'LiveSession' is not an exported type. Using 'any' as a workaround.
    const sessionRef = useRef<any | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const stopRecording = useCallback(() => {
        if (!isRecording) return;
        setIsRecording(false);
        
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        
        // Use a timeout to allow the last audio chunks to be processed
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


    const startRecording = useCallback(async () => {
        if (isRecording) return;
        
        setTranscript('');
        setIsRecording(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => console.log('Live session opened.'),
                    onmessage: (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            setTranscript(prev => prev + text);
                        }
                    },
                    onerror: (e) => {
                        console.error('Live session error:', e);
                        stopRecording();
                    },
                    onclose: () => {
                        console.log('Live session closed.');
                    }
                },
                config: {
                    inputAudioTranscription: {},
                    // Fix: Added required 'responseModalities' as per Gemini API guidelines for Live API.
                    responseModalities: [Modality.AUDIO],
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
                    session.sendRealtimeInput({ media: pcmBlob });
                });
            };

            source.connect(processor);
            processor.connect(context.destination);

        } catch (error) {
            console.error('Failed to start recording:', error);
            setIsRecording(false);
            // Let the user know permission was denied or another error occurred.
            alert(`Could not start recording. Please ensure microphone permissions are granted. Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [isRecording, stopRecording]);

    return { isRecording, transcript, startRecording, stopRecording };
};