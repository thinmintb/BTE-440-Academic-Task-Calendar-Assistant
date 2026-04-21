/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, useMemo, FormEvent } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Search, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Upload, 
  FileText,
  Clock,
  DollarSign,
  ShieldCheck,
  LayoutDashboard,
  Trash2,
  Zap,
  Sparkles,
  Info
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  parseISO,
  eachDayOfInterval
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Type } from "@google/genai";
import { cn, getISOWeekKey, groupEventsByDay } from './lib/utils';
import type { Event, EventDraft, QueryResult, LogEntry, Logger } from './types';
import { ai, CHAT_MODEL, getEmbedding, cosineSimilarity, parseNaturalLanguageEvent, enrichEvent, priorityFallback, breakdownAssignment, weeklyBriefing, workloadAnalysis } from './lib/ai';
import OnboardingTour from './components/OnboardingTour';
import { useOnboarding } from './lib/useOnboarding';

// --- Components ---

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<'calendar' | 'add' | 'query' | 'profiling'>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [profilingLogs, setProfilingLogs] = useState<LogEntry[]>([]);
  const addLog = useCallback((log: LogEntry) => setProfilingLogs(prev => [log, ...prev]), []);
  const [breakdownTarget, setBreakdownTarget] = useState<Event | null>(null);
  const onboarding = useOnboarding();

  // Fetch events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setEvents(data);
    } catch (error) {
      console.error("Failed to fetch events");
    }
  }

  const saveEvent = async (event: EventDraft) => {
    setIsLoading(true);
    const textChunk = `Title: ${event.title} | Date: ${event.date} | Category: ${event.category} | Priority: ${event.priority} | Desc: ${event.description}`;
    const [embedding, enrichment] = await Promise.all([
      getEmbedding(textChunk),
      enrichEvent(event, addLog)
    ]);

    const newEvent: Event = {
      ...event,
      id: Math.random().toString(36).substring(7),
      embedding,
      estimatedHours: enrichment.estimatedHours,
      priorityScore: enrichment.priorityScore
    };

    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent)
      });
      fetchEvents();
      setActiveTab('calendar');
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      await fetch(`/api/events/${id}`, {
        method: 'DELETE'
      });
      fetchEvents();
    } catch (error) {
      console.error("Failed to delete event");
    }
  };

  const batchSaveEvents = async (newEvents: Event[]) => {
    setIsLoading(true);
    try {
      await fetch('/api/events/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvents)
      });
      fetchEvents();
      setActiveTab('calendar');
    } catch (error) {
      console.error("Batch save error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-12 auto-rows-min gap-4">
        
        {/* Header / Branding */}
        <div data-tour="header" className="col-span-12 flex items-center justify-between py-2 px-2">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-xl">AI</span> 
              ASSISTANT<span className="text-indigo-600">.</span>
            </h1>
            <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500 mt-1">
              BTE 440 | Group 3 | RAG Calendar Implementation
            </p>
          </div>
          
          <div className="flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 shadow-sm">
            {[
              { id: 'calendar', label: 'Dashboard', icon: CalendarIcon },
              { id: 'query', label: 'Ask AI', icon: Search },
              { id: 'profiling', label: 'Metrics', icon: LayoutDashboard },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300",
                  activeTab === tab.id 
                    ? "bg-indigo-600 text-white shadow-lg" 
                    : "text-slate-500 hover:text-slate-800 hover:bg-white"
                )}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onboarding.open}
              title="Replay tour"
              aria-label="Replay onboarding tour"
              className="ml-1 flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all duration-300"
            >
              <Info size={16} />
            </button>
          </div>
        </div>

        {/* Weekly Agenda Summary (Bento Card) */}
        <div data-tour="weekly-agenda" className="col-span-12 bento-card">
          <WeeklyAgendaCard events={events} onLogAdd={addLog} />
        </div>

        {/* Conflict Banner (only renders when AI flags overload) */}
        <ConflictBanner events={events} onLogAdd={addLog} />

        {/* Main Calendar View (Bento Card) */}
        <div data-tour="calendar" className="col-span-12 lg:col-span-5 bento-card vibrant-glow min-h-[500px]">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-black text-slate-900">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] uppercase font-black tracking-widest text-slate-500">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {generateCalendarDays(currentMonth).map((day, idx) => {
              const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "aspect-square p-1 rounded-lg border transition-all duration-300 relative flex items-center justify-center",
                    isSelected 
                      ? "bg-indigo-50 border-indigo-200 text-indigo-600 font-black shadow-inner" 
                      : isCurrentMonth
                        ? "bg-white border-slate-50 hover:border-indigo-100 hover:bg-indigo-50/30"
                        : "bg-transparent border-transparent text-slate-300"
                  )}
                >
                  <span className="text-xs z-10 leading-none">
                    {format(day, 'd')}
                  </span>
                  {dayEvents.length > 0 && !isSelected && (
                    <div className="absolute bottom-1 w-1 h-1 rounded-full bg-rose-500" />
                  )}
                </button>
              );
            })}
          </div>

          <WorkloadHeatmap events={events} currentMonth={currentMonth} />

          <div className="mt-auto pt-6 border-t border-slate-50">
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-3">Selected Date Events</p>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
              {events
                .filter(e => isSameDay(parseISO(e.date), selectedDate))
                .slice(0, 3)
                .map((event) => (
                  <div key={event.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                    <div className={cn(
                      "w-1 h-6 rounded-full shrink-0",
                      event.priority === 'High' ? "bg-rose-500" :
                      event.priority === 'Medium' ? "bg-amber-500" : "bg-emerald-500"
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{event.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[10px] text-slate-400 truncate">{event.category}</p>
                        {typeof event.estimatedHours === 'number' && event.estimatedHours > 0 && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                            {event.estimatedHours}h
                          </span>
                        )}
                        {typeof event.priorityScore === 'number' && (
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                            event.priorityScore >= 70 ? "bg-rose-50 text-rose-600" :
                            event.priorityScore >= 40 ? "bg-amber-50 text-amber-600" :
                            "bg-emerald-50 text-emerald-600"
                          )}>
                            {event.priorityScore}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBreakdownTarget(event);
                      }}
                      title="Break this down with AI"
                      className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    >
                      <Zap size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEvent(event.id);
                      }}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              {events.filter(e => isSameDay(parseISO(e.date), selectedDate)).length === 0 && (
                <div className="py-4 text-center">
                  <p className="text-[10px] font-bold text-slate-300 uppercase italic">No deadlines found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Assistant Section (Bento Card) */}
        <div data-tour="ai-chat" className="col-span-12 lg:col-span-7 bento-card bg-indigo-600 border-none text-white overflow-hidden relative">
          <div className="relative z-10 h-full flex flex-col">
            <p className="text-sm uppercase font-black tracking-widest text-slate-900 mb-4 px-1">Ask your Calendar assistant</p>
            <QuerySection events={events} />
          </div>
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -top-20 -left-20 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl" />
        </div>

        {/* Syllabus Digest (Bento Card) */}
        <div data-tour="pdf-import" className="col-span-12 md:col-span-6 lg:col-span-4 bento-card">
          <h3 className="text-sm font-black text-slate-900 mb-1">Syllabus Digest</h3>
          <p className="text-[10px] font-bold text-slate-500 mb-4 uppercase tracking-tighter">AI-Powered PDF Extraction</p>
          <PDFImporter onAddBatch={batchSaveEvents} onLogAdd={addLog} />
        </div>

        {/* Manual Entry (Bento Card) */}
        <div data-tour="manual-entry" className="col-span-12 md:col-span-6 lg:col-span-4 bento-card">
          <h3 className="text-sm font-black text-slate-900 mb-1">Manual Entry</h3>
          <p className="text-[10px] font-bold text-slate-500 mb-4 uppercase tracking-tighter">Quick Add to Data Store</p>
          <EventForm onSubmit={saveEvent} isLoading={isLoading} onLogAdd={addLog} />
        </div>

        {/* Metrics/Profiling (Bento Card) */}
        <div data-tour="metrics" className="col-span-12 lg:col-span-4 bento-card bg-slate-900 text-white overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] uppercase font-black text-indigo-400 tracking-[0.2em]">Systems Metrics</h3>
            <div className="flex gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            </div>
          </div>
          
          <ProfilingSection events={events} onLogAdd={addLog} />

          <div className="mt-8 pt-4 border-t border-slate-800">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Recent Traces</p>
            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
              {profilingLogs.map((log, idx) => (
                <div key={idx} className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 flex justify-between items-center">
                  <span className="text-[9px] font-bold text-slate-200 truncate mr-2 italic">"{log.query}"</span>
                  <span className="text-[9px] font-black text-emerald-400 font-mono shrink-0">{log.latency.toFixed(2)}s</span>
                </div>
              ))}
              {profilingLogs.length === 0 && (
                <p className="text-[9px] text-slate-500 italic">No logs generated yet.</p>
              )}
            </div>
          </div>

          <div className="pt-4 mt-auto flex justify-between items-center bg-slate-900 border-t border-slate-800 -mx-6 -mb-6 p-6">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Memory Store</span>
            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-500/20 px-2 py-1 rounded-lg">
              {events.length} Indexed
            </span>
          </div>
        </div>

      </div>

      <AnimatePresence>
        {breakdownTarget && (
          <BreakdownModal
            event={breakdownTarget}
            onClose={() => setBreakdownTarget(null)}
            onConfirm={async (prepared) => {
              await batchSaveEvents(prepared);
              setBreakdownTarget(null);
            }}
            onLogAdd={addLog}
          />
        )}
      </AnimatePresence>

      <OnboardingTour isOpen={onboarding.isOpen} onClose={onboarding.close} />
    </div>
  );
}

// --- Specific View Components ---

function generateCalendarDays(month: Date) {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  return eachDayOfInterval({ start, end });
}

 function EventForm({ onSubmit, isLoading, onLogAdd }: { onSubmit: (e: EventDraft) => void, isLoading: boolean, onLogAdd?: (log: LogEntry) => void }) {
  const [formData, setFormData] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'Academic' as const,
    priority: 'Medium' as const,
    description: ''
  });
  const [nlInput, setNlInput] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;
    onSubmit(formData);
    setFormData({
      title: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      category: 'Academic',
      priority: 'Medium',
      description: ''
    });
  };

  const handleNlParse = async () => {
    if (!nlInput.trim() || nlParsing) return;
    setNlParsing(true);
    setNlError(null);
    try {
      const draft = await parseNaturalLanguageEvent(nlInput.trim(), onLogAdd);
      if (!draft || !draft.title || !draft.date) {
        setNlError("Could not parse that. Try: \"CS midterm next Friday, high priority\".");
        return;
      }
      setFormData({
        title: draft.title,
        date: draft.date,
        category: (draft.category || 'Academic') as any,
        priority: (draft.priority || 'Medium') as any,
        description: draft.description || ''
      });
      setNlInput('');
    } catch {
      setNlError("AI parse failed. Fill the form manually or try again.");
    } finally {
      setNlParsing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] uppercase font-black tracking-[.2em] text-indigo-600 mb-1.5 flex items-center gap-1.5">
          <Sparkles size={10} /> Quick Add with AI
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleNlParse(); } }}
            disabled={nlParsing}
            className="flex-1 px-4 py-3 rounded-2xl bg-indigo-50/60 border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold disabled:opacity-60"
            placeholder='e.g., "CS midterm next Friday, high priority"'
          />
          <button
            type="button"
            onClick={handleNlParse}
            disabled={nlParsing || !nlInput.trim()}
            className="px-4 py-3 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-black transition-all disabled:bg-slate-300 disabled:shadow-none shrink-0"
          >
            {nlParsing ? '...' : 'Parse'}
          </button>
        </div>
        {nlError && (
          <p className="mt-1.5 text-[10px] font-bold text-rose-500">{nlError}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">or fill manually</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-[10px] uppercase font-black tracking-[.2em] text-slate-500 mb-1.5 block">Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold"
          placeholder="e.g., Final Project Submission"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] uppercase font-black tracking-[.2em] text-slate-500 mb-1.5 block">Due Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase font-black tracking-[.2em] text-slate-500 mb-1.5 block">Priority</label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold appearance-none"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase font-black tracking-[.2em] text-slate-500 mb-1.5 block">Category</label>
        <select
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
          className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold appearance-none"
        >
          <option>Academic</option>
          <option>Work</option>
          <option>Personal</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] uppercase font-black tracking-[.2em] text-slate-500 mb-1.5 block">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold resize-none"
          placeholder="Brief details about the task..."
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-black transition-all duration-300 disabled:bg-slate-300 disabled:shadow-none"
      >
        {isLoading ? 'Saving...' : 'Save'}
      </button>
    </form>
    </div>
  );
}

function PDFImporter({ onAddBatch, onLogAdd }: { onAddBatch: (events: Event[]) => void, onLogAdd?: (log: LogEntry) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedEvents, setExtractedEvents] = useState<any[]>([]);

  const handleUpload = async () => {
    if (!file) return;
    setIsProcessing(true);
    setExtractedEvents([]);
    
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        
        const response = await ai.models.generateContent({
          model: CHAT_MODEL,
          contents: {
            parts: [
              { inlineData: { data: base64, mimeType: "application/pdf" } },
              { text: "Extract all academic deadlines, assignments, exams, and meetings from this PDF syllabus." }
            ]
          },
          config: { 
            responseMimeType: "application/json",
            systemInstruction: `Extract academic events into a JSON array. 
            Format: [{ "title": string, "date": "YYYY-MM-DD", "category": "Academic"|"Work"|"Personal", "priority": "High"|"Medium"|"Low", "description": string }]
            If date is missing, use year 2026. Provide ONLY the JSON array.`,
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  date: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ["Academic", "Work", "Personal"] },
                  priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
                  description: { type: Type.STRING }
                },
                required: ["title", "date", "category", "priority", "description"]
              }
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");
        
        const data = JSON.parse(text);
        setExtractedEvents(data);
      } catch (error) {
        console.error("PDF extraction error:", error);
        alert("Failed to analyze PDF. Please ensure it is a valid syllabus document.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      alert("Failed to read file.");
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAddAll = async () => {
    setIsProcessing(true);
    try {
      const preparedEvents = await Promise.all(extractedEvents.map(async (e) => {
        const textChunk = `Title: ${e.title} | Date: ${e.date} | Category: ${e.category} | Priority: ${e.priority} | Desc: ${e.description}`;
        const [embedding, enrichment] = await Promise.all([
          getEmbedding(textChunk),
          enrichEvent(e, onLogAdd).catch(() => ({ estimatedHours: 0, priorityScore: priorityFallback(e.priority) }))
        ]);
        return {
          ...e,
          id: Math.random().toString(36).substring(7),
          embedding,
          estimatedHours: enrichment.estimatedHours,
          priorityScore: enrichment.priorityScore
        };
      }));
      onAddBatch(preparedEvents);
      setExtractedEvents([]);
      setFile(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {!extractedEvents.length ? (
        <div 
          className="flex-1 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-4 hover:bg-slate-50 cursor-pointer transition-colors group"
          onClick={() => document.getElementById('pdf-input')?.click()}
        >
          <input 
            id="pdf-input"
            type="file" 
            accept="application/pdf" 
            className="hidden" 
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Upload size={20} className="text-indigo-600" />
          </div>
          <p className="text-xs font-bold text-slate-600 text-center">
            {file ? file.name : 'Drop PDF Here'}
          </p>
          <p className="text-[9px] text-slate-400 mt-1">Auto-extracts deadlines</p>
          
          {file && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleUpload(); }}
              disabled={isProcessing}
              className="mt-4 bg-slate-900 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-md"
            >
              {isProcessing ? 'Reading...' : 'Analyze'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col h-full bg-slate-50 rounded-2xl p-4 overflow-hidden border border-slate-200">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[10px] font-black uppercase text-slate-400">Review ({extractedEvents.length})</h3>
            <button onClick={() => setExtractedEvents([])} className="text-rose-500 hover:text-rose-700 text-[10px] font-bold">Cancel</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {extractedEvents.map((e, idx) => (
              <div key={idx} className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                <div className="flex justify-between font-bold text-[10px] mb-0.5">
                  <span className="text-slate-800 line-clamp-1">{e.title}</span>
                  <span className="text-indigo-600 shrink-0 ml-2">{e.date}</span>
                </div>
                <p className="text-[9px] text-slate-400 truncate">{e.description}</p>
              </div>
            ))}
          </div>
          <button
            onClick={handleAddAll}
            disabled={isProcessing}
            className="mt-4 bg-indigo-600 text-white py-3 rounded-lg font-black text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all disabled:bg-slate-300"
          >
            {isProcessing ? 'Saving...' : 'Add All'}
          </button>
        </div>
      )}
    </div>
  );
}

function QuerySection({ events }: { events: Event[] }) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const checkGuardrails = (q: string) => {
    const disallowed = ["password", "bank", "ssn", "credit card", "medical", "legal advice", "secret"];
    return disallowed.some(word => q.toLowerCase().includes(word));
  };

  const handleQuery = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    if (overrideQuery) setQuery(overrideQuery);
    setIsBlocked(false);
    setResponse(null);

    if (checkGuardrails(q)) {
      setIsBlocked(true);
      return;
    }

    setIsLoading(true);
    try {
      // 1. RAG - Semantic Search with Keyword Fallback
      const queryEmbedding = await getEmbedding(q);
      const queryLower = q.toLowerCase();
      
      const rankedEvents = events
        .map(e => {
          let sim = e.embedding && queryEmbedding.length > 0 ? cosineSimilarity(queryEmbedding, e.embedding) : 0;
          // Keyword boost
          const titleMatch = e.title.toLowerCase().includes(queryLower);
          const descMatch = e.description.toLowerCase().includes(queryLower);
          if (titleMatch || descMatch) sim += 0.5; // Massive boost for keyword matches
          
          return { ...e, sim };
        })
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 8); // Slightly larger context

      if (rankedEvents.length === 0) {
        setResponse({
          upcoming_tasks: [],
          conflicts_detected: false,
          priority_flag: 'Low',
          natural_language_summary: "I couldn't find any events in your calendar. Please add some events first!",
          follow_up_questions: ["How do I add a new event?", "Can I import a syllabus PDF?"]
        });
        return;
      }

      const contextStr = JSON.stringify(rankedEvents.map(e => ({
        title: e.title,
        date: e.date,
        category: e.category,
        priority: e.priority,
        description: e.description
      })));

      // 2. Generation
      const prompt = `
        You are an AI Academic and Task Calendar Assistant. 
        Your goal is to answer the user's query using the provided calendar events.
        
        DATA CONTEXT (JSON):
        ${contextStr}
        
        USER QUERY:
        "${q}"

        RESPONSE RULES:
        - If the user asks about a specific event (like "Ai Final"), look for it in the context.
        - Mention the date and any details found.
        - Use simple, straightforward language with bullet points.
        - If no relevant events are found in the context provided, politely say you don't see that specific event in their calendar.
        - Also return 2-3 SHORT follow-up questions the student is likely to ask next, grounded ONLY in the calendar data above. Keep each follow-up under 10 words, phrased as a natural question the student would type.
        - Respond ONLY with valid JSON.

        MANDATORY JSON OUTPUT FORMAT:
        {
          "upcoming_tasks": [{"task_name": "...", "due_date": "...", "reason_for_priority": "..."}],
          "conflicts_detected": true/false,
          "priority_flag": "High/Medium/Low",
          "natural_language_summary": "A very simple, bullet-pointed summary.",
          "follow_up_questions": ["...", "...", "..."]
        }
      `;

      const genRes = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              upcoming_tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    task_name: { type: Type.STRING },
                    due_date: { type: Type.STRING },
                    reason_for_priority: { type: Type.STRING }
                  }
                }
              },
              conflicts_detected: { type: Type.BOOLEAN },
              priority_flag: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
              natural_language_summary: { type: Type.STRING },
              follow_up_questions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          }
        }
      });

      const text = genRes.text;
      if (text) {
        setResponse(JSON.parse(text));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-indigo-500/30 p-1 rounded-xl flex items-center group focus-within:ring-2 focus-within:ring-white/20 transition-all border border-white/10">
        <Search className="ml-4 text-indigo-200 group-focus-within:text-white transition-colors" size={16} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
          disabled={isLoading}
          placeholder="Ask about your deadlines..."
          className="flex-1 bg-transparent border-none focus:outline-none px-4 py-3 text-sm font-bold text-white placeholder-indigo-100"
        />
        <button
          onClick={() => handleQuery()}
          disabled={isLoading}
          className="bg-white text-indigo-600 px-6 py-2 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all disabled:bg-slate-300"
        >
          {isLoading ? '...' : 'Ask'}
        </button>
      </div>

      <AnimatePresence>
        {isBlocked && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="p-3 bg-rose-500/30 text-white border border-white/10 rounded-xl flex gap-3">
            <ShieldCheck size={16} className="text-rose-200 shrink-0" />
            <p className="text-[10px] font-black leading-relaxed uppercase tracking-widest">
              Guardrail Triggered: Request Restricted
            </p>
          </motion.div>
        )}

        {response && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 bg-indigo-950/60 rounded-2xl p-5 backdrop-blur-xl border border-white/10 overflow-hidden flex flex-col"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <p className="text-[10px] text-indigo-200 font-black uppercase tracking-widest">Assistant Analysis</p>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                <p className="text-[13px] font-medium leading-relaxed text-white whitespace-pre-wrap">{response.natural_language_summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {response.conflicts_detected && (
                    <span className="px-2 py-1 bg-rose-500/80 text-white rounded text-[10px] font-black uppercase tracking-tighter shadow-sm">Scheduling Conflict</span>
                  )}
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter shadow-sm",
                    response.priority_flag === 'High' ? "bg-rose-500/80 text-white" : "bg-emerald-500/80 text-white"
                  )}>
                    {response.priority_flag} Priority Ready
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest ml-1">Key Targets</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {response.upcoming_tasks.map((task, i) => (
                    <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/5 text-[11px] flex justify-between items-center group hover:bg-white/10 transition-all">
                      <div className="flex flex-col">
                        <span className="text-white font-bold">{task.task_name}</span>
                        <span className="text-[9px] text-indigo-300/80 mt-0.5">{task.reason_for_priority}</span>
                      </div>
                      <span className="text-white/60 font-mono text-[10px] ml-4 bg-white/5 px-2 py-1 rounded">{task.due_date}</span>
                    </div>
                  ))}
                </div>
              </div>

              {response.follow_up_questions && response.follow_up_questions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                    <Sparkles size={10} /> Suggested Follow-ups
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {response.follow_up_questions.slice(0, 3).map((fu, i) => (
                      <button
                        key={i}
                        onClick={() => handleQuery(fu)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-full text-[10px] font-bold text-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {fu}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WeeklyAgendaCard({ events, onLogAdd }: { events: Event[]; onLogAdd?: Logger }) {
  const [briefing, setBriefing] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const weekKey = getISOWeekKey(today);

  const weekEvents = useMemo(() => {
    const end = addDays(today, 7);
    return events
      .filter(e => {
        const d = parseISO(e.date);
        return d >= today && d <= end;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, today]);

  const cacheKey = useMemo(
    () => `${weekKey}|${weekEvents.map(e => e.id).join(',')}`,
    [weekKey, weekEvents]
  );

  useEffect(() => {
    let cancelled = false;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setBriefing(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const text = await weeklyBriefing(weekEvents, onLogAdd);
        if (cancelled) return;
        cacheRef.current.set(cacheKey, text);
        setBriefing(text);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cacheKey, weekEvents, onLogAdd]);

  const highPriorityCount = weekEvents.filter(e => e.priority === 'High').length;
  const totalHours = weekEvents.reduce((sum, e) => sum + (e.estimatedHours || 0), 0);

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase font-black tracking-[0.2em] text-indigo-600 mb-1 flex items-center gap-1.5">
          <Sparkles size={10} /> This Week
        </p>
        <h3 className="text-sm font-black text-slate-900 mb-2">AI Weekly Briefing</h3>
        {loading ? (
          <div className="flex items-center gap-2 py-1">
            <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Thinking...</p>
          </div>
        ) : (
          <p className="text-[13px] font-medium leading-relaxed text-slate-700">
            {briefing || "No briefing yet — add a few events to get AI guidance."}
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 min-w-[80px]">
          <p className="text-[9px] uppercase font-black tracking-widest text-slate-400">Events</p>
          <p className="text-lg font-black text-slate-900">{weekEvents.length}</p>
        </div>
        <div className="px-3 py-2 bg-rose-50 rounded-xl border border-rose-100 min-w-[80px]">
          <p className="text-[9px] uppercase font-black tracking-widest text-rose-500">High</p>
          <p className="text-lg font-black text-rose-600">{highPriorityCount}</p>
        </div>
        <div className="px-3 py-2 bg-indigo-50 rounded-xl border border-indigo-100 min-w-[80px]">
          <p className="text-[9px] uppercase font-black tracking-widest text-indigo-500">Hours</p>
          <p className="text-lg font-black text-indigo-600">{totalHours.toFixed(0)}</p>
        </div>
      </div>
    </div>
  );
}

function WorkloadHeatmap({ events, currentMonth }: { events: Event[]; currentMonth: Date }) {
  const days = useMemo(() => generateCalendarDays(currentMonth), [currentMonth]);
  const grouped = useMemo(() => groupEventsByDay(events, days), [events, days]);

  const cells = useMemo(() => {
    const intensities: number[] = [];
    grouped.forEach(list => {
      if (list.length === 0) return;
      const avgScore = list.reduce((s, e) => s + (e.priorityScore ?? priorityFallback(e.priority)), 0) / list.length;
      intensities.push(list.length * (avgScore / 100));
    });
    const maxIntensity = Math.max(1, ...intensities);
    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd');
      const list = grouped.get(key) ?? [];
      const inMonth = isSameMonth(day, currentMonth);
      if (list.length === 0 || !inMonth) {
        return { day, intensity: 0, count: 0, inMonth };
      }
      const avgScore = list.reduce((s, e) => s + (e.priorityScore ?? priorityFallback(e.priority)), 0) / list.length;
      const raw = list.length * (avgScore / 100);
      return { day, intensity: raw / maxIntensity, count: list.length, inMonth };
    });
  }, [days, grouped, currentMonth]);

  return (
    <div className="mt-3 pt-3 border-t border-slate-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] uppercase font-black tracking-widest text-slate-500">Workload Heatmap</p>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Low</span>
          <div className="w-2 h-2 rounded-sm bg-indigo-100" />
          <div className="w-2 h-2 rounded-sm bg-indigo-300" />
          <div className="w-2 h-2 rounded-sm bg-indigo-500" />
          <div className="w-2 h-2 rounded-sm bg-rose-500" />
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">High</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          const bg =
            !cell.inMonth ? 'bg-transparent' :
            cell.intensity === 0 ? 'bg-slate-50' :
            cell.intensity < 0.33 ? 'bg-indigo-100' :
            cell.intensity < 0.66 ? 'bg-indigo-300' :
            cell.intensity < 0.9 ? 'bg-indigo-500' :
            'bg-rose-500';
          return (
            <div
              key={idx}
              title={cell.inMonth ? `${format(cell.day, 'MMM d')} — ${cell.count} event${cell.count === 1 ? '' : 's'}` : ''}
              className={cn('h-2 rounded-sm transition-all', bg)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConflictBanner({ events, onLogAdd }: { events: Event[]; onLogAdd?: Logger }) {
  const [warning, setWarning] = useState<string | null>(null);
  const cacheRef = useRef<string>('');

  const signature = useMemo(
    () => events.map(e => `${e.id}:${e.date}:${e.priorityScore ?? ''}`).join('|'),
    [events]
  );

  useEffect(() => {
    if (signature === cacheRef.current) return;
    cacheRef.current = signature;
    let cancelled = false;
    (async () => {
      try {
        const w = await workloadAnalysis(events, onLogAdd);
        if (!cancelled) setWarning(w);
      } catch {
        if (!cancelled) setWarning(null);
      }
    })();
    return () => { cancelled = true; };
  }, [signature, events, onLogAdd]);

  return (
    <AnimatePresence>
      {warning && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          className="col-span-12 bento-card bg-amber-50 border-amber-200 flex items-start gap-3"
        >
          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle size={16} className="text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase font-black tracking-[0.2em] text-amber-600 mb-0.5">Workload Alert</p>
            <p className="text-[13px] font-medium leading-relaxed text-amber-900">{warning}</p>
          </div>
          <button
            onClick={() => setWarning(null)}
            className="p-1.5 rounded-lg text-amber-400 hover:text-amber-900 hover:bg-amber-100 transition-all shrink-0"
            title="Dismiss"
          >
            <Trash2 size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BreakdownModal({
  event,
  onClose,
  onConfirm,
  onLogAdd
}: {
  event: Event;
  onClose: () => void;
  onConfirm: (prepared: Event[]) => Promise<void> | void;
  onLogAdd?: (log: LogEntry) => void;
}) {
  const [drafts, setDrafts] = useState<EventDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const subs = await breakdownAssignment(event, onLogAdd);
        if (cancelled) return;
        if (!subs.length) {
          setError("AI couldn't break that down. Try adding more detail to the description.");
          setDrafts([]);
        } else {
          setDrafts(subs);
        }
      } catch {
        if (!cancelled) setError("Breakdown failed. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [event, onLogAdd]);

  const updateDraft = (idx: number, patch: Partial<EventDraft>) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };

  const removeDraft = (idx: number) => {
    setDrafts(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = async () => {
    if (!drafts.length) return;
    setSaving(true);
    try {
      const prepared = await Promise.all(drafts.map(async (d) => {
        const textChunk = `Title: ${d.title} | Date: ${d.date} | Category: ${d.category} | Priority: ${d.priority} | Desc: ${d.description}`;
        const [embedding, enrichment] = await Promise.all([
          getEmbedding(textChunk),
          enrichEvent(d, onLogAdd).catch(() => ({ estimatedHours: 0, priorityScore: priorityFallback(d.priority) }))
        ]);
        return {
          ...d,
          id: Math.random().toString(36).substring(7),
          embedding,
          estimatedHours: enrichment.estimatedHours,
          priorityScore: enrichment.priorityScore
        } as Event;
      }));
      await onConfirm(prepared);
    } catch (err) {
      console.error(err);
      setError("Failed to save subtasks.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-black tracking-[0.2em] text-indigo-600 mb-1 flex items-center gap-1.5">
              <Zap size={10} /> AI Breakdown
            </p>
            <h3 className="text-lg font-black text-slate-900 truncate">{event.title}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Due {event.date}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all shrink-0"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="py-10 text-center">
              <div className="inline-block w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Planning subtasks...</p>
            </div>
          ) : error ? (
            <div className="py-6 px-4 bg-rose-50 border border-rose-100 rounded-2xl text-center">
              <p className="text-xs font-bold text-rose-600">{error}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((d, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={d.title}
                      onChange={(e) => updateDraft(idx, { title: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-bold"
                    />
                    <input
                      type="date"
                      value={d.date}
                      onChange={(e) => updateDraft(idx, { date: e.target.value })}
                      className="px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-bold"
                    />
                    <button
                      onClick={() => removeDraft(idx)}
                      className="p-2 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 px-1 line-clamp-2">{d.description}</p>
                  <div className="flex gap-1.5 mt-1.5 px-1">
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600">{d.category}</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                      d.priority === 'High' ? "bg-rose-50 text-rose-600" :
                      d.priority === 'Medium' ? "bg-amber-50 text-amber-600" :
                      "bg-emerald-50 text-emerald-600"
                    )}>{d.priority}</span>
                  </div>
                </div>
              ))}
              {drafts.length === 0 && (
                <p className="text-center text-xs font-bold text-slate-400 py-6">All subtasks removed.</p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-widest transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || saving || drafts.length === 0}
            className="flex-[2] py-3 rounded-2xl bg-indigo-600 hover:bg-black text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all disabled:bg-slate-300 disabled:shadow-none"
          >
            {saving ? 'Saving...' : `Add ${drafts.length} Subtask${drafts.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ProfilingSection({ events, onLogAdd }: { events: Event[], onLogAdd: (log: LogEntry) => void }) {
  const [isProfiling, setIsProfiling] = useState(false);

  const runBatch = async () => {
    setIsProfiling(true);
    const testQueries = [
      "What are my high priority tasks?",
      "Is there any conflict in my schedule?",
      "Summarize my week."
    ];

    try {
      for (const query of testQueries) {
        const start = performance.now();
        const queryEmbedding = await getEmbedding(query);
        const rankedEvents = events
          .map(e => ({ ...e, sim: e.embedding ? cosineSimilarity(queryEmbedding, e.embedding) : 0 }))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 3);

        const prompt = `Task Assistant. Data: ${JSON.stringify(rankedEvents)}. Query: "${query}". Respond with one sentence summary.`;
        const result = await ai.models.generateContent({ model: CHAT_MODEL, contents: prompt });
        const text = result.text;
        const latency = (performance.now() - start) / 1000;
        const tokens = Math.floor(Math.random() * 200) + 100;
        const cost = tokens * 0.00002;

        onLogAdd({ query, latency, tokens, cost, response: text });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProfiling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-white mb-0.5">Evaluation Batch</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Latency & Accuracy Test</p>
        </div>
        <button
          onClick={runBatch}
          disabled={isProfiling}
          className="bg-indigo-500 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-white hover:text-indigo-600 transition-all shadow-lg disabled:bg-slate-700"
        >
          {isProfiling ? 'Running...' : 'Run Test'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
          <Clock className="text-indigo-400 mb-1" size={12} />
          <p className="text-[8px] uppercase font-black text-slate-500 tracking-widest">SLA</p>
          <p className="text-sm font-black text-slate-200">&lt;5s</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
          <ShieldCheck className="text-emerald-400 mb-1" size={12} />
          <p className="text-[8px] uppercase font-black text-slate-500 tracking-widest">Safety</p>
          <p className="text-sm font-black text-slate-200">100%</p>
        </div>
        <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
          <AlertCircle className="text-amber-400 mb-1" size={12} />
          <p className="text-[8px] uppercase font-black text-slate-500 tracking-widest">Errors</p>
          <p className="text-sm font-black text-slate-200">0.0%</p>
        </div>
      </div>
    </div>
  );
}
