
import { GoogleGenAI, Type, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function generateQuestions(): Promise<string[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      // Fix: Updated prompt to match the responseSchema for better reliability.
      contents: "You are an English-speaking interview coach specialized in technical leadership roles. Generate 10 behavioral questions based on the STAR method. Return them as a JSON object with a single key 'questions' which contains an array of strings.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              }
            }
          }
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

export async function evaluateAnswer(question: string, answer: string): Promise<string> {
  const prompt = `
    You are an English-speaking interview coach specialized in technical leadership roles.
    The user is practicing for an interview and has a B1-B2 English level.

    The interview question was:
    "${question}"

    The user's answer was:
    "${answer}"

    Please provide constructive feedback in four distinct sections, using markdown for formatting (e.g., using '**' for bold titles).
    1.  **Grammar:** Briefly comment on any grammatical errors. If there are none, say so.
    2.  **Clarity:** Evaluate how clear and easy to understand the answer was.
    3.  **Professional Tone:** Assess the tone of the response for a professional setting.
    4.  **Suggestions for Fluency:** Provide a revised version of their answer or specific phrases to make it sound more natural and fluent for a B1-B2 speaker. Keep it encouraging.

    Your entire response should be a single markdown string. Do not use JSON.
    `;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error evaluating answer:", error);
    throw new Error("Failed to evaluate the answer.");
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
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data received from API.");
    }
    return base64Audio;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw new Error("Failed to generate audio.");
  }
}
