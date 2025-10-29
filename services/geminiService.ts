import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Feedback, FinalReport, HistoryItem } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const modelConfig = {
  model: "gemini-2.5-pro",
};

const fluencyCoachSystemInstruction = `You are a Language Coach AI specialized in contextual English fluency, acting as an examiner for tests like IELTS. Your role is to simulate real-world conversations and interviews based on a chosen context. You help users speak with confidence in real scenarios through active practice, correction, and detailed feedback aligned with international proficiency standards.
Your goal is not just to teach grammar, but to lead the user to functional, contextual fluency through deep linguistic learning: repetition, feedback, and active use.
Maintain an encouraging but professional and strict examiner tone. Use clear, natural language. Focus on fluency, coherence, lexical resource, and grammatical accuracy. The user is practicing and likely has a B1-B2 English level, but you should score them accurately based on their performance in each answer.`;

export async function generateQuestions(context: string): Promise<string[]> {
  try {
    const response = await ai.models.generateContent({
      ...modelConfig,
      contents: `The user wants to practice the context: "${context}".
      Generate 10 progressive, situational questions adapted to this context.
      - Start with simple questions (A2–B1 level) and evolve to more challenging ones (B2–C1).
      - The questions should be realistic, practical, and contextualized.
      - For technical topics, use appropriate professional jargon.
      Return them as a JSON object with a single key 'questions' which is an array of strings.`,
      config: {
        systemInstruction: fluencyCoachSystemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          },
        },
      },
    });

    const jsonString = response.text;
    const parsed = JSON.parse(jsonString);
    return parsed.questions || [];
  } catch (error) {
    console.error("Error generating questions:", error);
    throw new Error("Failed to generate interview questions.");
  }
}

export async function evaluateAnswer(
  question: string,
  answer: string,
  context: string
): Promise<Feedback> {
  const prompt = `
    Context: "${context}"
    The interview question was: "${question}"
    The user's answer was: "${answer}"

    Please provide feedback as a JSON object. Your evaluation should be strict and aligned with international English proficiency standards like IELTS.
    `;
  try {
    const response = await ai.models.generateContent({
      ...modelConfig,
      contents: prompt,
      config: {
        systemInstruction: fluencyCoachSystemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fluency: {
              type: Type.NUMBER,
              description: "A fluency score based on the IELTS band descriptors, from 1 (non-user) to 9 (expert user). The score can be a decimal (e.g., 7.5). It should assess fluency, coherence, lexical resource, grammatical range, and accuracy.",
            },
            tip: {
              type: Type.STRING,
              description: "A brief, actionable tip on how the response could sound more natural and achieve a higher band score.",
            },
            nativeExample: {
              type: Type.STRING,
              description: "A rewritten version of the user's answer that would be typical of a Band 9 speaker.",
            },
          },
          required: ["fluency", "tip", "nativeExample"],
        },
      },
    });
    
    const jsonString = response.text;
    return JSON.parse(jsonString) as Feedback;
  } catch (error) {
    console.error("Error evaluating answer:", error);
    throw new Error("Failed to evaluate the answer.");
  }
}

export async function generateFinalReport(
  context: string,
  history: HistoryItem[]
): Promise<FinalReport> {
  // Stringify history, but keep it concise to avoid token limits
  const historySummary = history.map(item => ({
      question: item.question,
      answer: item.answer,
      fluency: item.feedback.fluency
  }));

  const prompt = `The user has completed a practice session for the context: "${context}".
  Here is a summary of their performance. The fluency score is an IELTS-like band score from 1-9.
  ${JSON.stringify(historySummary, null, 2)}

  Based on this session, generate a personalized final report as a JSON object. Analyze their performance across all answers to provide holistic feedback.`;
  try {
    const response = await ai.models.generateContent({
      ...modelConfig,
      contents: prompt,
      config: {
        systemInstruction: fluencyCoachSystemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                topStrengths: { type: Type.STRING, description: "The user's key strengths, like clear reasoning or confident tone." },
                improvementAreas: { type: Type.STRING, description: "Aspects to improve with practical tips, e.g., using more connectors." },
                expressionsToReview: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 to 5 recommended expressions or vocabulary to master." },
                nextRecommendedContext: { type: Type.STRING, description: "A new practice scenario based on the user's profile." }
            },
            required: ["topStrengths", "improvementAreas", "expressionsToReview", "nextRecommendedContext"],
        }
      },
    });

    const jsonString = response.text;
    return JSON.parse(jsonString) as FinalReport;
  } catch (error)
  {
    console.error("Error generating final report:", error);
    throw new Error("Failed to generate the final report.");
  }
}


export async function textToSpeech(text: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data received from API.");
    }
    return base64Audio;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw new Error("Failed to generate audio.");
  }
}