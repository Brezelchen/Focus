# Focus — Project Plan

> A cozy, modern todo app built to help you choose what matters **today**, do it in a calm focus space, and see how well your plans hold up over time.

**Tech stack:** Angular (frontend) · ASP.NET Core / C# (backend API) · SQLite via EF Core (storage)

---^^

## 1. Vision & Core Ideas

| Concept | What it means in Focus |
|---|---|
| **Today** | The main screen. A short, intentional list of what you plan to do today. |
| **Backlog** | Everything you'd like to do eventually. You drag items from here into *Today*. |
| **Templates** | Todos you do often (e.g. "Laundry", "Gym", "Inbox zero"). One click or one drag adds a fresh copy to Today. |
| **Focus Mode** | A full-screen, cozy lofi-style scene (a young girl with brown hair and her small brown dog). You drop todos into it, set a timer, and work. |
| **Stats** | How many of the todos you *planned* for a day did you actually finish? Trends, streaks, and patterns. |

Design principles:
- **Intentional over exhaustive** — Today should feel small and achievable.
- **Low friction** — drag & drop, keyboard shortcuts, quick add.
- **Delight** — gradients, soft glassmorphism, smooth animations, little celebrations.

---

## 2. Feature Specification

### 2.1 Today view (home)
- Shows tasks planned for the selected date (defaults to today), ordered manually.
- Drag & drop to reorder; drag in from Backlog or Templates; drag out back to Backlog.
- Check off a task → satisfying animation (strike-through sweep + small confetti burst).
- Progress ring at the top: `done / planned` with gradient fill.
- Date switcher (← yesterday / tomorrow →) to plan ahead or review past days.
- Optional **time estimate** per task; the header shows "≈ 3h 20m planned".

### 2.2 Backlog
- Side panel (desktop) / bottom sheet tab (mobile) listing all unscheduled todos.
- Filter by tag, search by text, sort by created / priority / age.
- Drag a backlog item onto Today (or onto a future day in a mini week strip).
- "Stale" indicator for items sitting in the backlog for a long time (e.g. > 30 days) with a gentle "still want this?" prompt.

### 2.3 Reusable todos (Templates)
- Any task can be "⭐ Save as template".
- Template shelf shows templates as colorful chips, sorted by most used.
- Click or drag a chip → creates a **new task instance** for today (templates are never consumed).
- Optional recurrence on a template (every N days, weekly on chosen weekdays, monthly on a day). On those days a copy is put on Today automatically (decided 2026-11-26, replacing "suggest only"). At most one open copy per series: an unfinished copy waiting in the backlog is moved onto Today instead of creating a duplicate. Missed days are not backfilled.
- Usage count + last-used tracked so the most useful ones float to the top.

### 2.4 Focus Mode
- Full-screen route (`/focus`) with the cozy lofi illustration as the background.
- A translucent "focus tray" where you drop the tasks you'll work on (dragged from Today before entering, or added from a picker inside focus mode).
- **Timer**: presets (15 / 25 / 45 / 60 min) + custom; large, soft countdown display; pause / resume / end early.
- Tick tasks off inside focus mode; finishing all tasks early offers to end the session.
- When the timer ends: gentle chime, scene reacts (e.g. the dog wags / stretches), summary card: "You finished 2 of 3 tasks in 25 min 🎉". Unfinished tasks stay on Today.
- Each session is stored (start, planned duration, actual duration, tasks attempted/completed) for stats.
- Uses the browser Fullscreen API + Screen Wake Lock API (screen stays on); `Esc` exits.

**The art** — must be *original*: our own girl + small brown dog in a warm room (desk, window, plants, mug, lamp). It must not imitate the existing "Lofi Girl" YouTube character or its style. Proposed approach:
- Layered illustration (background room / window sky / girl / dog / foreground props) as separate SVG or PNG layers so we can animate subtly with CSS:
  - steam rising from the mug, rain or drifting clouds outside the window, the dog's tail wagging / breathing, a soft lamp glow pulsing, occasional page turn.
- Time-of-day variants (morning / afternoon / evening / night) by swapping the window sky layer + color grading.
- See open question **Q1** about where the art comes from.

### 2.5 Stats
- **Daily completion rate** = completed planned tasks ÷ tasks planned for that day.
- Views:
  - Today summary card (progress ring).
  - Last 7 / 30 days bar chart (planned vs done).
  - Calendar heatmap (GitHub-style) coloured by completion rate.
  - Streak: consecutive days with ≥ X% completion (X configurable, default 80%).
  - Focus stats: total focus minutes per day/week, sessions completed vs abandoned.
  - Top templates used, most-postponed tasks ("this one has been carried over 6 times").
- Important detail: "planned for a day" must be captured as **history**, not derived from the current state — otherwise moving a task back to the backlog would silently erase that it was planned. See the `DayPlanEntry` table below.

---

## 3. Suggested Additional Features (my proposals)

Marked **[MVP]** if I'd include them in the first version, **[Later]** otherwise.

1. **Morning planning ritual [MVP]** — On first open each day: "Yesterday you finished 4/5. 1 unfinished task went back to the backlog — bring it to today?" Keeps stats honest and Today clean.
2. **Quick add with smart syntax [MVP]** — `Write report #work ~45m !high` → tag, estimate and priority parsed automatically. Global shortcut `N` to open.
3. **Overplanning nudge [Later]** — If today's estimates exceed your typical daily finished time (from history), show a soft hint: "You usually finish ~3h of tasks. Today has 6h planned."
4. **Ambient sounds in Focus Mode [MVP-lite]** — Rain, café, crackling fire, lofi beat loop; volume sliders, mixable. (Royalty-free / CC0 sources only.)
5. **Pomodoro cycles [Later]** — Optional auto-break after a focus block (scene switches: girl stretches, dog asks for a walk 🐕).
6. **Celebrations & micro-delight [MVP]** — Confetti on task completion, special animation when the day hits 100%, the dog in the corner of the Today view reacting to progress.
7. **Command palette (`Ctrl+K`) & keyboard shortcuts [Done]** — Move tasks, start focus, jump to dates without the mouse.
8. **Tags with colors [MVP]** — Simple categories (Work, Home, Health…) used for filtering and gradient accent colors.
9. **End-of-day reflection [Done]** — One-line note + mood emoji per day; shown in the stats calendar.
10. **Light / dark theme + "time-of-day" theme [MVP]** — Gradients shift from sunrise peach to night indigo automatically.
11. **Achievements [Dropped]** — Playful badges: "7-day streak", "100 focus sessions", "Backlog zero".
12. **PWA + offline-friendly [Done]** — Installable, works well as a desktop "app" window. Recent API reads are cached by the service worker, so the app opens offline with the last-seen data (writes need a connection).
13. **Subtasks / checklist inside a task [Done]** — Templates carry a checklist too.
14. **Export / import (JSON) [Later]** — Backup of your SQLite data.

---

## 4. Architecture

```
┌────────────────────────────┐        HTTP/JSON        ┌───────────────────────────────┐
│  Angular SPA (focus-web)   │  ───────────────────▶   │  ASP.NET Core API (Focus.Api) │
│  - Standalone components   │                         │  - Minimal APIs / endpoints   │
│  - Signals-based stores    │  ◀───────────────────   │  - Application services       │
│  - Angular CDK drag & drop │                         │  - EF Core                    │
└────────────────────────────┘                         └──────────────┬────────────────┘
                                                                      │
                                                               ┌──────▼──────┐
                                                               │ SQLite file │
                                                               │  focus.db   │
                                                               └─────────────┘
```

- **Single-user, local-first** to start (no login). The API runs on localhost; SQLite file lives next to the app. Auth can be added later (see Q3).
- In production build, the API can **serve the Angular build as static files**, so the whole app is one process / one `dotnet run`.

### 4.1 Repository layout

```
Focus/
├── PLAN.md
├── README.md
├── backend/
│   ├── Focus.sln
│   ├── src/
│   │   ├── Focus.Api/              # ASP.NET Core host, endpoints, DI, static file serving
│   │   ├── Focus.Application/      # services, DTOs, validation, stats calculations
│   │   ├── Focus.Domain/           # entities, enums, domain rules
│   │   └── Focus.Infrastructure/   # EF Core DbContext, migrations, SQLite config
│   └── tests/
│       ├── Focus.UnitTests/
│       └── Focus.IntegrationTests/ # WebApplicationFactory + in-memory SQLite
└── frontend/
    └── focus-web/                  # Angular workspace
        └── src/app/
            ├── core/               # api clients, interceptors, models
            ├── features/
            │   ├── today/
            │   ├── backlog/
            │   ├── templates/
            │   ├── focus-mode/
            │   └── stats/
            ├── shared/             # ui components (task-card, progress-ring, gradient-button…)
            └── styles/             # design tokens, gradients, animations
```

> If a 4-project backend feels heavy for a personal app, it can collapse into one `Focus.Api` project with folders — see Q6.

### 4.2 Backend (C# / ASP.NET Core)
- .NET (latest LTS), ASP.NET Core Minimal APIs grouped per feature (`MapGroup("/api/tasks")`).
- EF Core + `Microsoft.EntityFrameworkCore.Sqlite`, code-first migrations, applied on startup in dev.
- Validation with FluentValidation (or built-in data annotations).
- `TimeProvider` injected for testable "today" logic; dates stored as `DateOnly` for day plans, UTC `DateTime` for timestamps. The **client sends its local date** for "today" so time zones behave.
- OpenAPI document generated → used to generate the typed Angular client (e.g. via `openapi-typescript` / NSwag) so frontend and backend models stay in sync.
- Problem Details (RFC 7807) for errors.

### 4.3 Frontend (Angular)
- Latest Angular, standalone components, **signals** for state (one small store service per feature), `OnPush`/zoneless change detection.
- **Angular CDK Drag & Drop** with connected drop lists: `backlog ↔ today ↔ focus-tray`, templates as a copy-only source.
- Optimistic UI updates for drag/check actions, rolled back on API error.
- Charts: `ngx-echarts` (nice gradients & animations out of the box).
- Animations: CSS keyframes + Angular's enter/leave animation hooks; `canvas-confetti` for celebrations; respects `prefers-reduced-motion`.
- Styling: SCSS with design tokens (CSS custom properties), no heavy UI kit — custom components give the distinct look. Angular CDK for overlays/a11y.

---

## 5. Data Model (SQLite via EF Core)

```
Tag
  Id (int, PK)
  Name (text)
  Color (text, hex or gradient key)

TaskItem
  Id (int, PK)
  Title (text, required, ≤ 200)
  Notes (text, nullable)
  Status (enum: Open | Done | Archived)
  PlannedDate (date, nullable)        -- null = in backlog
  SortOrder (int)                     -- order within Today / Backlog
  EstimateMinutes (int, nullable)
  Priority (enum: Low | Normal | High)
  TagId (FK → Tag, nullable)
  TemplateId (FK → TaskTemplate, nullable)  -- if created from a template
  CreatedAt, UpdatedAt, CompletedAt (UTC datetime)

TaskTemplate
  Id (int, PK)
  Title, Notes, EstimateMinutes, Priority, TagId
  Icon (text, emoji)
  Checklist (JSON array of text)
  RepeatFrequency (enum: Daily | Weekly | Monthly, nullable = doesn't repeat)
  RepeatInterval (int, every N days/weeks/months), RepeatWeekdays (int bitmask), RepeatMonthDay (int, 31 = last day)
  RepeatStart (date, "every N" counts from here), RepeatLastRun (date, so each day is processed once)
  UseCount (int)
  LastUsedAt (datetime, nullable)
  IsArchived (bool)

DayPlanEntry                          -- history of "planned for a day" (powers stats)
  Id (int, PK)
  Date (date)
  TaskItemId (FK → TaskItem)
  AddedAt (datetime)
  RemovedAt (datetime, nullable)      -- moved away from that day
  Outcome (enum: Pending | Completed | NotCompleted)
  UNIQUE (Date, TaskItemId)
  -- deleting a task cascades to its entries, so deleted tasks never count

FocusSession
  Id (int, PK)
  StartedAt, EndedAt (datetime)
  PlannedMinutes (int)
  ActualMinutes (int)
  Status (enum: Running | Completed | EndedEarly | Abandoned)
  Ambience (text, nullable)

FocusSessionTask
  FocusSessionId (FK), TaskItemId (FK)  -- composite PK
  CompletedInSession (bool)

Subtask
  Id (int, PK)
  TaskItemId (FK → TaskItem, cascade)
  Title (text, ≤ 200), IsDone (bool), SortOrder (int)
  -- TaskTemplate.Checklist (JSON array of titles) is copied into new tasks, unticked

DayNote                               -- end-of-day reflection
  Date (date, PK), Mood (enum: Rough | Meh | Okay | Good | Great, nullable), Reflection (text ≤ 500, nullable), UpdatedAt

```

**Stats rule (definition to confirm, Q4):** A task counts as "planned" for day D if it had a `DayPlanEntry` for D that wasn't removed before the *planning cutoff* (default: added any time that day and not removed by hand before end of day). "Done" = Outcome `Completed`. Tasks added *and* finished the same day count as planned + done (alternative: track them as "bonus" separately).

---

## 6. API Sketch

As implemented. Every request carries `X-Local-Date: yyyy-MM-dd` so "today" follows the user's time zone. Errors are RFC 7807 problem details.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/days/{date}` | A day's tasks (open in order, then done) + planned/done counts |
| POST | `/api/days/rollover` | Return unfinished tasks of past days to the backlog; returns yesterday's recap |
| GET | `/api/tasks?tagId=&q=` | Backlog (open, unplanned tasks) with filter/search |
| POST | `/api/tasks` · `/api/tasks/quick` | Create a task (structured, or from quick-add text) |
| PUT | `/api/tasks/{id}` | Edit title, notes, estimate, priority, tag |
| POST | `/api/tasks/{id}/move` | `{ date \| null, index }`: plan for a day, send to backlog, or reorder (all drag & drop) |
| POST | `/api/tasks/{id}/complete` · `/reopen` | Toggle done |
| POST | `/api/tasks/{id}/save-as-template` | Turn a task into a reusable template |
| DELETE | `/api/tasks/{id}` | Delete |
| GET/POST/PUT/DELETE | `/api/templates` | Manage templates (sorted by use) |
| POST | `/api/templates/{id}/instantiate` | `{ date \| null, index? }`: create a fresh task from a template |
| PUT | `/api/tasks/{id}/repeat` | `{ repeat: { frequency, interval, weekdays?, monthDay?, startDate? } \| null }`: make a task repeat (it becomes a recurring template) or stop it. Templates take `repeat` in their POST/PUT body too. Due copies are placed by `POST /api/days/rollover` |
| GET/POST/PUT/DELETE | `/api/tags` | Tags |
| POST | `/api/focus-sessions` | Start a session (taskIds, plannedMinutes) |
| POST | `/api/focus-sessions/{id}/finish` | `{ status: completed \| endedEarly, actualSeconds }` |
| GET | `/api/stats/summary?from=&to=&threshold=` | Per-day planned/done/focus minutes, totals, current & best streak |
| GET | `/api/stats/insights` | Top templates, most-postponed tasks, best weekday, focus totals |
| POST | `/api/tasks/{id}/subtasks` | Add a checklist item (returns the task) |
| PATCH/DELETE | `/api/tasks/{id}/subtasks/{subtaskId}` | Rename / tick off, or remove a checklist item (returns the task). `PUT /api/tasks/{id}` can also replace the whole checklist |
| PUT/DELETE | `/api/days/{date}/note` | End-of-day reflection `{ mood, reflection }`; an empty note deletes it. Also returned in `GET /api/days/{date}` and per day in the stats summary |

---

## 7. UI / UX Design Direction

**Mood:** cozy, warm, playful — "lofi café at sunset" meets modern productivity app.

- **Palette (gradients):**
  - Sunrise: `#FFB199 → #FF8E9E → #C38BFF`
  - Daytime: `#89F7FE → #66A6FF`
  - Night: `#2B1B4B → #3A2D6B → #0F1B3D`
  - Accents per tag (mint, coral, lavender, honey).
- **Surfaces:** frosted-glass cards (`backdrop-filter: blur`) floating over a slowly animated mesh gradient background.
- **Typography:** rounded, friendly display font (e.g. *Nunito* / *Quicksand*) + clean UI font (*Inter*).
- **Motion:**
  - Cards lift and tilt slightly while dragging; drop zones glow with a gradient border.
  - Checkbox: elastic pop + strike-through sweep + mini confetti.
  - Progress ring animates its gradient stroke.
  - Page transitions via View Transitions API (fade/slide); entering Focus Mode = slow "dim the lights" fade into the scene.
  - All motion disabled/reduced under `prefers-reduced-motion`.
- **Layout (desktop):**
  ```
  ┌─────────────┬──────────────────────────────┬───────────────┐
  │  Nav        │   TODAY  (Wed, Nov 25)       │   BACKLOG     │
  │  ● Today    │   ◯ 3/5  ≈ 2h 40m planned    │   [search]    │
  │  ● Stats    │   ┌────────────────────────┐ │   ▢ task      │
  │  ● Focus ▶  │   │ ▢ Write report  #work  │ │   ▢ task      │
  │             │   │ ▢ Gym           #health│ │   ▢ task      │
  │  🐕 (mascot)│   └────────────────────────┘ │               │
  │             │   ⭐ Templates: [Laundry][Gym][Inbox]         │
  └─────────────┴──────────────────────────────┴───────────────┘
  ```
- **Mobile:** Today full-width; Backlog & Templates as swipe-up bottom sheet; long-press to drag.
- **Accessibility:** every drag action has a keyboard/button alternative ("Move to today", "Move up"), sufficient contrast on gradients (text on glass cards, not directly on gradients), focus rings.

---

## 8. Milestones

| # | Milestone | Contents | Status |
|---|---|---|---|
| 0 | **Scaffolding** | Solution + Angular workspace, EF Core + SQLite + first migration, dev proxy (`proxy.conf.json`), README run instructions. | ✅ (typed client is hand-written, not generated) |
| 1 | **Tasks & Today** | Task CRUD, backlog list, Today list, drag backlog ↔ today, reorder, complete, `DayPlanEntry` tracking, quick add. | ✅ |
| 2 | **Templates** | Save as template, template shelf, instantiate by click/drag, usage counts. | ✅ |
| 3 | **Visual polish pass 1** | Design tokens, gradients, glass cards, drag animations, confetti, theming (light/dark/time-of-day). | ✅ |
| 4 | **Focus Mode** | Full-screen route, art layers + CSS animations, focus tray, timer, session persistence, summary card, ambient sounds. | ✅ |
| 5 | **Stats** | Summary endpoint, progress ring, 7/30-day chart, heatmap, streaks, focus minutes. | ✅ |
| 6 | **Daily rhythm** | Morning rollover ritual ✅, stale backlog badges ✅, repeating tasks placed on Today automatically ✅. | ✅ |
| 7 | **Hardening** | Unit + integration tests ✅, automated e2e tests for drag flows, a11y audit, production build served by the API ✅. | Partly |
| 8 | **Later** | Command palette ✅, reflections ✅, checklists ✅, offline-friendly PWA ✅. Still open: Pomodoro, export/import, overplanning nudge, auth/multi-user. | Partly |

PWA (manifest, icons, service worker) shipped with the MVP; offline reads, install button and update prompt came with milestone 8.

---

## 9. Testing Strategy
- **Backend:** xUnit unit tests for stats/rollover/recurrence logic (with fake `TimeProvider`); integration tests via `WebApplicationFactory` with a temp SQLite DB.
- **Frontend:** component tests for stores and key components; Playwright e2e for: plan a task by drag, complete it, start a focus session, verify stats update.

---

## 10. Decisions (answered 2026-11-25)

| # | Question | Decision |
|---|---|---|
| Q1 | Focus Mode art | Original **layered SVG illustration built in code**, animated with CSS. Swappable later. |
| Q2 | Platform | **Installable PWA** (manifest + service worker). |
| Q3 | Users | **Local only**, single user, no login. |
| Q4 | Stats definition | Every task that was on a day's list **counts as planned**, including tasks added later that day. No bonus category, no cutoff. |
| Q5 | Unfinished tasks at day end | **Return to backlog** automatically. On first open, the morning ritual shows what went back, with a one-click "bring back to today". |
| Q6 | Backend structure | **Clean-architecture multi-project solution** (Api / Application / Domain / Infrastructure + tests). |
| Q7 | Language | **English** only. |
| Q8 | Sounds | Yes. Ambient sounds and a lofi-style music loop in Focus Mode, plus a timer-end chime. Generated in the browser with the Web Audio API so no third-party audio files are needed. |
| Q9 | First version scope | Everything marked **[MVP]** in section 3. |

### Stats rule (final)
- **Planned(D)** = tasks with a `DayPlanEntry` for day D. A task deleted entirely doesn't count. Moving a task back to the backlog by hand during the day still counts it as planned-not-done; moving it off a *future* day leaves no trace.
- **Done(D)** = entries for D with outcome `Completed`. Completing a backlog task moves it onto today.
- At rollover, every `Pending` entry of a past day becomes `NotCompleted` and its task goes to the top of the backlog.
- **Streak** = consecutive days with ≥ 80% done. Days with nothing planned are neutral (rest days don't break it); today only counts once it hits the goal.
