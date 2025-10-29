import { GoogleGenAI, Type, Modality } from "@google/genai";
import { QuestionData, Feedback, FinalReport, HistoryItem } from "../types";

const SYSTEM_INSTRUCTION = `You are a world-class, strict but fair English language examiner, specializing in fluency for proficiency tests like IELTS.
Your goal is to help the user achieve confidence and fluency in specific, real-world contexts.
Your persona is encouraging, professional, and highly focused on practical, actionable feedback.
You will evaluate answers based on official proficiency standards for fluency, coherence, lexical resource (vocabulary), and grammatical range and accuracy.`;

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateQuestions = async (context: string): Promise<QuestionData[]> => {
  const ai = getAi();
  const model = "gemini-2.5-flash";

  const response = await ai.models.generateContent({
    model,
    contents: `Generate 10 progressive, situational questions for a user practicing English in the context of "${context}".
      The questions should start at a B1 level and move towards a C1/C2 level. They must be practical and realistic.
      For each question, also provide:
      1. A simple, descriptive prompt (max 10 words) for an AI image generator to create a relevant, photorealistic scene.
      2. A list of 3-5 key vocabulary words from the question, with their CEFR level (A1-C2) and a simple definition.`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  level: { type: Type.STRING },
                  definition: { type: Type.STRING },
                },
                required: ["word", "level", "definition"],
              },
            },
          },
          required: ["question", "imagePrompt", "vocabulary"],
        },
      },
    }
  });

  const jsonText = response.text.trim();
  return JSON.parse(jsonText) as QuestionData[];
};

export const evaluateAnswer = async (question: string, answer: string): Promise<Feedback> => {
    const ai = getAi();
    const model = 'gemini-2.5-pro';

    const response = await ai.models.generateContent({
        model,
        contents: `As a strict IELTS examiner, evaluate the user's answer based on the question.
        Question: "${question}"
        User's Answer: "${answer}"
        Provide feedback on fluency, coherence, vocabulary, and grammar. The band score must be a number between 1.0 and 9.0.
        The improvement tip must be concise and actionable.
        The native-like example must be a natural-sounding alternative.`,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    fluencyBand: { type: Type.NUMBER, description: "An IELTS-like fluency band score from 1.0 to 9.0." },
                    improvementTip: { type: Type.STRING, description: "A brief, actionable tip for sounding more natural." },
                    nativeLikeExample: { type: Type.STRING, description: "The user's answer rewritten to sound like a native speaker." }
                },
                required: ["fluencyBand", "improvementTip", "nativeLikeExample"]
            }
        }
    });
    
    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as Feedback;
};

export const generateFinalReport = async (history: HistoryItem[]): Promise<FinalReport> => {
    const ai = getAi();
    const model = 'gemini-2.5-pro';

    const conversationRundown = history.map(item => 
        `Q: ${item.questionData.question}\nA: ${item.answer}\nFluency Band: ${item.feedback.fluencyBand}`
    ).join('\n\n');

    const response = await ai.models.generateContent({
        model,
        contents: `Based on the following session history, generate a final personalized report.
        ${conversationRundown}
        The report should include top strengths, areas for improvement, 3-5 key expressions to review, and a logical next recommended context for practice.`,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    topStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                    improvementAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
                    expressionsToReview: { type: Type.ARRAY, items: { type: Type.STRING } },
                    nextRecommendedContext: { type: Type.STRING }
                },
                required: ["topStrengths", "improvementAreas", "expressionsToReview", "nextRecommendedContext"]
            }
        }
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as FinalReport;
};


export const generateImage = async (prompt: string): Promise<string> => {
    const ai = getAi();
    const augmentedPrompt = `${prompt}. Photorealistic style. Ensure any text in the image has very high contrast against its background, like dark text on a light background. Avoid white text on light colors.`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [{ text: augmentedPrompt }],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:image/png;base64,${base64ImageBytes}`;
        }
    }
    throw new Error("No image was generated.");
};

export const generateSpeech = async (text: string): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        return base64Audio;
    }
    throw new Error("No audio was generated.");
};