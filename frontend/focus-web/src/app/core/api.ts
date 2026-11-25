import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { todayIso } from './dates';
import {
  Day,
  FocusSession,
  FocusSessionStatus,
  IsoDate,
  RolloverResult,
  StatsInsights,
  StatsSummary,
  Tag,
  TagColor,
  Task,
  TaskInput,
  Template,
  TemplateInput,
} from './models';

/** Tells the API the user's local calendar date, so "today" follows the user's time zone. */
export const localDateInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.url.startsWith('/api') ? req.clone({ setHeaders: { 'X-Local-Date': todayIso() } }) : req);

/** Typed client for the Focus API. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  // Days
  day(date: IsoDate): Observable<Day> {
    return this.http.get<Day>(`/api/days/${date}`);
  }
  rollover(): Observable<RolloverResult> {
    return this.http.post<RolloverResult>('/api/days/rollover', {});
  }

  // Tasks
  backlog(): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks');
  }
  quickAdd(text: string, plannedDate: IsoDate | null): Observable<Task> {
    return this.http.post<Task>('/api/tasks/quick', { text, plannedDate });
  }
  updateTask(id: number, input: TaskInput): Observable<Task> {
    return this.http.put<Task>(`/api/tasks/${id}`, input);
  }
  complete(id: number): Observable<Task> {
    return this.http.post<Task>(`/api/tasks/${id}/complete`, {});
  }
  reopen(id: number): Observable<Task> {
    return this.http.post<Task>(`/api/tasks/${id}/reopen`, {});
  }
  move(id: number, date: IsoDate | null, index: number): Observable<Task> {
    return this.http.post<Task>(`/api/tasks/${id}/move`, { date, index });
  }
  deleteTask(id: number): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${id}`);
  }
  saveAsTemplate(id: number): Observable<Template> {
    return this.http.post<Template>(`/api/tasks/${id}/save-as-template`, {});
  }

  // Templates
  templates(): Observable<Template[]> {
    return this.http.get<Template[]>('/api/templates');
  }
  updateTemplate(id: number, input: TemplateInput): Observable<Template> {
    return this.http.put<Template>(`/api/templates/${id}`, input);
  }
  deleteTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`/api/templates/${id}`);
  }
  instantiate(id: number, date: IsoDate | null, index: number | null): Observable<Task> {
    return this.http.post<Task>(`/api/templates/${id}/instantiate`, { date, index });
  }

  // Tags
  tags(): Observable<Tag[]> {
    return this.http.get<Tag[]>('/api/tags');
  }
  createTag(name: string, color?: TagColor): Observable<Tag> {
    return this.http.post<Tag>('/api/tags', { name, color });
  }

  // Focus sessions
  startSession(taskIds: number[], plannedMinutes: number): Observable<FocusSession> {
    return this.http.post<FocusSession>('/api/focus-sessions', { taskIds, plannedMinutes });
  }
  finishSession(id: number, status: Exclude<FocusSessionStatus, 'running'>, actualSeconds: number): Observable<FocusSession> {
    return this.http.post<FocusSession>(`/api/focus-sessions/${id}/finish`, { status, actualSeconds });
  }

  // Stats
  statsSummary(from: IsoDate, to: IsoDate): Observable<StatsSummary> {
    return this.http.get<StatsSummary>('/api/stats/summary', { params: { from, to } });
  }
  statsInsights(): Observable<StatsInsights> {
    return this.http.get<StatsInsights>('/api/stats/insights');
  }
}

/** Human-readable message from an API error (RFC 7807 problem details) or a network failure. */
export function errorMessage(err: unknown): string {
  const e = err as { status?: number; error?: { detail?: string; title?: string } };
  if (e?.status === 0) return "Can't reach the Focus server. Is it running?";
  return e?.error?.detail ?? e?.error?.title ?? 'Something went wrong.';
}
