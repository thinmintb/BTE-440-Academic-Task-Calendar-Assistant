import { GoogleGenAI, Type } from "@google/genai";
import type { Event, EventDraft, Logger } from "../types";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
export const EMBEDDING_MODEL = "gemini-embedding-2-preview";
export const CHAT_MODEL = "gemini-3-flash-preview";

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
    });
    return result.embeddings[0].values;
  } catch (error) {
    console.error("Embedding error:", error);
    return [];
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

function logCall(logger: Logger | undefined, query: string, start: number, response: string) {
  if (!logger) return;
  const latency = (performance.now() - start) / 1000;
  const tokens = Math.max(50, Math.floor((response?.length || 0) / 4));
  logger({ query, latency, tokens, cost: tokens * 0.00002, response });
}

const EVENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    date: { type: Type.STRING, description: "YYYY-MM-DD" },
    category: { type: Type.STRING, enum: ["Academic", "Work", "Personal"] },
    priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
    description: { type: Type.STRING }
  },
  required: ["title", "date", "category", "priority", "description"]
};

export async function parseNaturalLanguageEvent(input: string, logger?: Logger): Promise<EventDraft | null> {
  const start = performance.now();
  const today = new Date().toISOString().split('T')[0];
  try {
    const res = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: `Today is ${today}. Parse this sentence into a single calendar event: "${input}"`,
      config: {
        responseMimeType: "application/json",
        systemInstruction: `You convert natural language into a single academic calendar event. Resolve relative dates like "next Friday" or "in two weeks" against today's date. If priority is not stated, infer from context (exam/final/midterm -> High; routine reading -> Low). Default category is Academic. Respond with JSON matching the schema.`,
        responseSchema: EVENT_SCHEMA
      }
    });
    const text = res.text;
    logCall(logger, `NL parse: "${input.slice(0, 40)}"`, start, text || '');
    if (!text) return null;
    return JSON.parse(text) as EventDraft;
  } catch (err) {
    console.error("NL parse error:", err);
    return null;
  }
}

export async function breakdownAssignment(event: Event, logger?: Logger): Promise<EventDraft[]> {
  const start = performance.now();
  const today = new Date().toISOString().split('T')[0];
  try {
    const res = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: `Today is ${today}. Break this assignment into 3-5 actionable subtasks. Space the subtask dates evenly between today and the due date (${event.date}), and keep the final subtask at or just before the due date.\n\nAssignment:\nTitle: ${event.title}\nDue: ${event.date}\nCategory: ${event.category}\nPriority: ${event.priority}\nDescription: ${event.description}`,
      config: {
        responseMimeType: "application/json",
        systemInstruction: `Return a JSON array of subtask events. Each date MUST be between today and the due date (inclusive). Titles should start with a verb (e.g., "Read", "Draft", "Review"). Keep category consistent with the parent event.`,
        responseSchema: { type: Type.ARRAY, items: EVENT_SCHEMA }
      }
    });
    const text = res.text || '[]';
    logCall(logger, `Breakdown: ${event.title}`, start, text);
    return JSON.parse(text) as EventDraft[];
  } catch (err) {
    console.error("Breakdown error:", err);
    return [];
  }
}

export async function enrichEvent(event: EventDraft, logger?: Logger): Promise<{ estimatedHours: number; priorityScore: number }> {
  const start = performance.now();
  const today = new Date().toISOString().split('T')[0];
  try {
    const res = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: `Today: ${today}. Event: ${JSON.stringify(event)}. Estimate hours of effort this will take a typical undergraduate, and a 0-100 priority score that blends due-date proximity, category weight (Academic > Work > Personal), stated priority, and description complexity.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            estimatedHours: { type: Type.NUMBER },
            priorityScore: { type: Type.NUMBER }
          },
          required: ["estimatedHours", "priorityScore"]
        }
      }
    });
    const text = res.text || '{}';
    logCall(logger, `Enrich: ${event.title}`, start, text);
    const parsed = JSON.parse(text);
    return {
      estimatedHours: Math.max(0, Number(parsed.estimatedHours) || 0),
      priorityScore: Math.max(0, Math.min(100, Number(parsed.priorityScore) || 50))
    };
  } catch (err) {
    console.error("Enrich error:", err);
    return { estimatedHours: 0, priorityScore: priorityFallback(event.priority) };
  }
}

export function priorityFallback(priority: Event['priority']): number {
  return priority === 'High' ? 80 : priority === 'Medium' ? 50 : 20;
}

export async function weeklyBriefing(events: Event[], logger?: Logger): Promise<string> {
  if (events.length === 0) return "Nothing on the calendar for the next seven days — good time to plan ahead.";
  const start = performance.now();
  try {
    const res = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: `Write a 2-3 sentence student-focused briefing for the upcoming week based on these events. Mention what to focus on first and why. Plain prose, no markdown, no bullets.\n\nEvents: ${JSON.stringify(events.map(e => ({ title: e.title, date: e.date, priority: e.priority, category: e.category, priorityScore: e.priorityScore, estimatedHours: e.estimatedHours })))}`
    });
    const text = res.text || '';
    logCall(logger, `Weekly briefing (${events.length} events)`, start, text);
    return text.trim();
  } catch (err) {
    console.error("Briefing error:", err);
    return "Briefing unavailable right now.";
  }
}

export async function workloadAnalysis(events: Event[], logger?: Logger): Promise<string | null> {
  if (events.length < 3) return null;
  const start = performance.now();
  try {
    const res = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: `Scan these events for overloaded days (3+ high-priority items on one day) or stacked deadlines in one week. Return JSON {"warning": string | null}. Warning should be a single sentence; null if load is reasonable.\n\nEvents: ${JSON.stringify(events.map(e => ({ title: e.title, date: e.date, priority: e.priority, priorityScore: e.priorityScore, estimatedHours: e.estimatedHours })))}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            warning: { type: Type.STRING }
          }
        }
      }
    });
    const text = res.text || '{}';
    logCall(logger, `Workload analysis`, start, text);
    const parsed = JSON.parse(text);
    const warning = typeof parsed.warning === 'string' ? parsed.warning.trim() : '';
    return warning.length > 3 ? warning : null;
  } catch (err) {
    console.error("Workload error:", err);
    return null;
  }
}
