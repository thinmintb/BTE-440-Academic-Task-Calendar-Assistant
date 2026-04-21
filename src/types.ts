export interface Event {
  id: string;
  title: string;
  date: string;
  category: 'Academic' | 'Work' | 'Personal';
  priority: 'High' | 'Medium' | 'Low';
  description: string;
  embedding?: number[];
  estimatedHours?: number;
  priorityScore?: number;
}

export type EventDraft = Omit<Event, 'id' | 'embedding'>;

export interface QueryResult {
  upcoming_tasks: { task_name: string; due_date: string; reason_for_priority: string }[];
  conflicts_detected: boolean;
  priority_flag: 'High' | 'Medium' | 'Low';
  natural_language_summary: string;
  follow_up_questions?: string[];
}

export interface LogEntry {
  query: string;
  latency: number;
  tokens: number;
  cost: number;
  response: string;
}

export type Logger = (log: LogEntry) => void;
