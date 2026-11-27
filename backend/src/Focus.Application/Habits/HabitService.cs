using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Application.Templates;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Habits;

/// <param name="Month">Null = the base list (every month); otherwise the 1st of the month it belongs to.</param>
/// <param name="ArchivedAt">First day the habit no longer applies, if archived.</param>
public sealed record HabitDto(
    int Id,
    string Title,
    string Icon,
    DateOnly? Month,
    RecurrenceDto Repeat,
    int? Target,
    string? Unit,
    HabitKind Kind,
    HabitTimeOfDay TimeOfDay,
    bool CountsFocusMinutes,
    int SortOrder,
    DateOnly? ArchivedAt)
{
    internal static HabitDto From(Habit h) => new(
        h.Id, h.Title, h.Icon, h.Month,
        RecurrenceDto.From(h.RepeatFrequency, h.RepeatInterval, h.RepeatWeekdays, h.RepeatMonthDay, h.RepeatStart)!,
        h.Target, h.Unit, h.Kind, h.TimeOfDay, h.CountsFocusMinutes, h.SortOrder, h.ArchivedAt);
}

/// <param name="Month">Null = the base list. Any day in the month works; it's stored as the 1st.</param>
/// <param name="Repeat">Null = every day.</param>
/// <param name="Target">Null = a simple tick; otherwise the count to reach (or the limit, for avoid habits).</param>
public sealed record SaveHabitRequest(
    string Title,
    string? Icon = null,
    DateOnly? Month = null,
    RecurrenceInput? Repeat = null,
    int? Target = null,
    string? Unit = null,
    HabitKind Kind = HabitKind.Build,
    HabitTimeOfDay TimeOfDay = HabitTimeOfDay.Anytime,
    bool CountsFocusMinutes = false);

/// <param name="MissedYesterday">Was due yesterday and not done: today is the "never miss twice" day.</param>
public sealed record HabitDayItemDto(HabitDto Habit, int Count, bool Skipped, bool Done, bool MissedYesterday);

/// <param name="Items">Habits scheduled that day (skipped ones included), base list first.</param>
/// <param name="Due">Scheduled and not skipped.</param>
public sealed record HabitDayDto(DateOnly Date, IReadOnlyList<HabitDayItemDto> Items, int Due, int Done, HabitMonthNoteDto? MonthNote);

/// <param name="Skipped">Mark the day as a rest day (keeps the streak). The count is ignored while skipped.</param>
public sealed record SetCheckInRequest(int Count, bool Skipped = false);

public enum HabitCellState
{
    NotDue = 0,
    Open = 1,
    Partial = 2,
    Done = 3,
    Skipped = 4,
    Future = 5,
    Missed = 6,
}

public sealed record HabitCellDto(DateOnly Date, HabitCellState State, int Count);

/// <param name="Rate">Done / due over the days of the range up to today; null when nothing was due yet.</param>
public sealed record HabitRowDto(HabitDto Habit, IReadOnlyList<HabitCellDto> Cells, double? Rate, int CurrentStreak, int BestStreak, int Total);

public sealed record HabitMonthDto(DateOnly Month, HabitMonthNoteDto? Note, IReadOnlyList<HabitRowDto> Rows);

/// <summary>One habit's history over a longer range ("year in pixels").</summary>
public sealed record HabitHistoryDto(HabitRowDto Row, DateOnly From, DateOnly To);

public sealed record HabitMonthNoteDto(DateOnly Month, string? Word, string? Emoji);

public sealed record SaveMonthNoteRequest(string? Word, string? Emoji);

public sealed record ReorderHabitsRequest(IReadOnlyList<int> Ids);

/// <param name="HabitIds">Month habits of <paramref name="From"/> to carry over; null = all of them.</param>
public sealed record CopyMonthRequest(DateOnly From, DateOnly To, IReadOnlyList<int>? HabitIds = null);

/// <summary>
/// Habits: a base list that applies every month plus extra habits for a single month. Each has a repeat rule;
/// whether it's due on a day is computed from the rule, and check-ins record what was done.
/// </summary>
public sealed class HabitService(IFocusDbContext db, IClock clock)
{
    public const int MaxCount = 9999;

    // ---- Managing habits ------------------------------------------------------------------------

    /// <summary>The base list plus (when given) that month's habits, archived ones included.</summary>
    public async Task<IReadOnlyList<HabitDto>> ListAsync(DateOnly? month, CancellationToken ct = default)
    {
        var first = month is { } m ? FirstOfMonth(m) : (DateOnly?)null;
        var habits = await db.Habits.AsNoTracking()
            .Where(h => h.Month == null || h.Month == first)
            .OrderBy(h => h.Month).ThenBy(h => h.SortOrder).ThenBy(h => h.Id)
            .ToListAsync(ct);
        return habits.Select(HabitDto.From).ToList();
    }

    public async Task<HabitDto> GetAsync(int id, CancellationToken ct = default) =>
        HabitDto.From(await db.Habits.AsNoTracking().FirstOrDefaultAsync(h => h.Id == id, ct) ?? throw new NotFoundException("Habit", id));

    public async Task<HabitDto> CreateAsync(SaveHabitRequest request, CancellationToken ct = default)
    {
        var month = request.Month is { } m ? FirstOfMonth(m) : (DateOnly?)null;
        var habit = new Habit { Title = "", CreatedAt = clock.UtcNow, Month = month };
        Apply(habit, request);
        habit.SortOrder = (await db.Habits.Where(h => h.Month == month).MaxAsync(h => (int?)h.SortOrder, ct) ?? -1) + 1;
        db.Habits.Add(habit);
        await db.SaveChangesAsync(ct);
        return HabitDto.From(habit);
    }

    /// <summary>Updates a habit. Moving it to another list puts it at the end of that list.</summary>
    public async Task<HabitDto> UpdateAsync(int id, SaveHabitRequest request, CancellationToken ct = default)
    {
        var habit = await LoadAsync(id, ct);
        var month = request.Month is { } m ? FirstOfMonth(m) : (DateOnly?)null;
        if (month != habit.Month)
        {
            habit.Month = month;
            habit.SortOrder = (await db.Habits.Where(h => h.Month == month && h.Id != id).MaxAsync(h => (int?)h.SortOrder, ct) ?? -1) + 1;
        }
        Apply(habit, request);
        await db.SaveChangesAsync(ct);
        return HabitDto.From(habit);
    }

    /// <summary>Stops the habit from today on. Earlier days keep their history.</summary>
    public async Task<HabitDto> ArchiveAsync(int id, CancellationToken ct = default)
    {
        var habit = await LoadAsync(id, ct);
        habit.ArchivedAt ??= clock.Today;
        await db.SaveChangesAsync(ct);
        return HabitDto.From(habit);
    }

    public async Task<HabitDto> UnarchiveAsync(int id, CancellationToken ct = default)
    {
        var habit = await LoadAsync(id, ct);
        habit.ArchivedAt = null;
        await db.SaveChangesAsync(ct);
        return HabitDto.From(habit);
    }

    /// <summary>Deletes the habit and its history.</summary>
    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        db.Habits.Remove(await LoadAsync(id, ct));
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Sets the order of habits within a list: the given ids, in that order.</summary>
    public async Task ReorderAsync(ReorderHabitsRequest request, CancellationToken ct = default)
    {
        var ids = request.Ids.Distinct().ToList();
        var habits = await db.Habits.Where(h => ids.Contains(h.Id)).ToDictionaryAsync(h => h.Id, ct);
        if (habits.Count != ids.Count) throw new ValidationException("Some habits don't exist.");
        if (habits.Values.Select(h => h.Month).Distinct().Count() > 1) throw new ValidationException("Reorder one list at a time.");
        for (var i = 0; i < ids.Count; i++) habits[ids[i]].SortOrder = i;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Carries month habits over to another month (the month review's "keep"). Habits whose title the target
    /// month already has are skipped. Returns the target month's habits.
    /// </summary>
    public async Task<IReadOnlyList<HabitDto>> CopyMonthAsync(CopyMonthRequest request, CancellationToken ct = default)
    {
        var from = FirstOfMonth(request.From);
        var to = FirstOfMonth(request.To);
        if (from == to) throw new ValidationException("Pick two different months.");

        var source = await db.Habits.AsNoTracking().Where(h => h.Month == from && h.ArchivedAt == null)
            .OrderBy(h => h.SortOrder).ThenBy(h => h.Id).ToListAsync(ct);
        if (request.HabitIds is { } keep) source = source.Where(h => keep.Contains(h.Id)).ToList();

        var existing = await db.Habits.Where(h => h.Month == to).ToListAsync(ct);
        var titles = existing.Select(h => h.Title).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var order = existing.Select(h => h.SortOrder).DefaultIfEmpty(-1).Max() + 1;
        var start = LaterOf(to, clock.Today);

        foreach (var h in source.Where(h => titles.Add(h.Title)))
        {
            db.Habits.Add(new Habit
            {
                Title = h.Title, Icon = h.Icon, Month = to, SortOrder = order++,
                // Keep the rule's shape; "every N" counts from the new month.
                RepeatFrequency = h.RepeatFrequency, RepeatInterval = h.RepeatInterval, RepeatWeekdays = h.RepeatWeekdays,
                RepeatMonthDay = h.RepeatMonthDay, RepeatStart = start,
                Target = h.Target, Unit = h.Unit, Kind = h.Kind, TimeOfDay = h.TimeOfDay,
                CountsFocusMinutes = h.CountsFocusMinutes, CreatedAt = clock.UtcNow,
            });
        }
        await db.SaveChangesAsync(ct);
        return (await ListAsync(to, ct)).Where(h => h.Month == to).ToList();
    }

    // ---- Month intention -------------------------------------------------------------------------

    /// <summary>Saves a month's intention; empty word and emoji delete it (returns null).</summary>
    public async Task<HabitMonthNoteDto?> SaveMonthNoteAsync(DateOnly month, SaveMonthNoteRequest request, CancellationToken ct = default)
    {
        var first = FirstOfMonth(month);
        var word = Clean(request.Word);
        var emoji = Clean(request.Emoji);
        if (word?.Length > HabitMonthNote.WordMaxLength)
            throw new ValidationException($"The intention can be at most {HabitMonthNote.WordMaxLength} characters.");
        if (emoji?.Length > 16) throw new ValidationException("Pick a single emoji.");

        var note = await db.HabitMonthNotes.FirstOrDefaultAsync(n => n.Month == first, ct);
        if (word is null && emoji is null)
        {
            if (note is not null)
            {
                db.HabitMonthNotes.Remove(note);
                await db.SaveChangesAsync(ct);
            }
            return null;
        }

        if (note is null)
        {
            note = new HabitMonthNote { Month = first };
            db.HabitMonthNotes.Add(note);
        }
        note.Word = word;
        note.Emoji = emoji;
        await db.SaveChangesAsync(ct);
        return new HabitMonthNoteDto(first, word, emoji);
    }

    // ---- Days, check-ins, grids ------------------------------------------------------------------

    /// <summary>The habits scheduled on a day, with what was done.</summary>
    public async Task<HabitDayDto> GetDayAsync(DateOnly date, CancellationToken ct = default)
    {
        var yesterday = date.AddDays(-1);
        var habits = await HabitLedger.HabitsForRangeAsync(db, yesterday, date, ct);
        var ledger = await HabitLedger.LoadAsync(db, habits, yesterday, date, ct);

        var items = new List<HabitDayItemDto>();
        foreach (var habit in habits)
        {
            var day = ledger.On(habit, date);
            if (!day.Scheduled) continue;
            var before = ledger.On(habit, yesterday);
            var missed = before.Due && !before.Done && yesterday < clock.Today;
            items.Add(new HabitDayItemDto(HabitDto.From(habit), day.Count, day.Skipped, day.Done, missed));
        }

        return new HabitDayDto(date, items, items.Count(i => !i.Skipped), items.Count(i => i.Done), await MonthNoteAsync(date, ct));
    }

    /// <summary>Records what was done for a habit on today or an earlier day. Count 0 (not skipped) clears the day.</summary>
    public async Task<HabitDayItemDto> SetCheckInAsync(int habitId, DateOnly date, SetCheckInRequest request, CancellationToken ct = default)
    {
        var habit = await LoadAsync(habitId, ct);
        if (date > clock.Today) throw new ValidationException("You can't check in on a future day.");
        if (!habit.IsDueOn(date)) throw new ValidationException($"\"{habit.Title}\" isn't scheduled on that day.");
        if (request.Count is < 0 or > MaxCount) throw new ValidationException($"The count must be between 0 and {MaxCount}.");
        if (!request.Skipped)
        {
            // 0 just clears a rest day; the count itself comes from focus sessions.
            if (habit.CountsFocusMinutes && request.Count > 0) throw new ValidationException("This habit counts your focus minutes automatically.");
            if (habit.Target is null && request.Count > 1) throw new ValidationException("This habit is a simple tick.");
        }

        var checkIn = await db.HabitCheckIns.FirstOrDefaultAsync(c => c.HabitId == habitId && c.Date == date, ct);
        var count = request.Skipped ? 0 : request.Count;
        if (count == 0 && !request.Skipped)
        {
            if (checkIn is not null) db.HabitCheckIns.Remove(checkIn);
        }
        else
        {
            if (checkIn is null)
            {
                checkIn = new HabitCheckIn { HabitId = habitId, Date = date };
                db.HabitCheckIns.Add(checkIn);
            }
            checkIn.Count = count;
            checkIn.Skipped = request.Skipped;
            checkIn.UpdatedAt = clock.UtcNow;
        }
        await db.SaveChangesAsync(ct);

        var yesterday = date.AddDays(-1);
        var ledger = await HabitLedger.LoadAsync(db, [habit], yesterday, date, ct);
        var day = ledger.On(habit, date);
        var before = ledger.On(habit, yesterday);
        return new HabitDayItemDto(HabitDto.From(habit), day.Count, day.Skipped, day.Done, before.Due && !before.Done && yesterday < clock.Today);
    }

    /// <summary>The month grid: one row per habit that applies in the month, one cell per day.</summary>
    public async Task<HabitMonthDto> GetMonthAsync(DateOnly month, CancellationToken ct = default)
    {
        var first = FirstOfMonth(month);
        var last = first.AddMonths(1).AddDays(-1);
        var habits = await HabitLedger.HabitsForRangeAsync(db, first, last, ct);

        // Streaks need history before the month too.
        var historyFrom = habits.Count == 0 ? first : habits.Min(h => h.RepeatStart);
        var until = LaterOf(last, clock.Today);
        var ledger = await HabitLedger.LoadAsync(db, habits, historyFrom, until, ct);

        var rows = habits
            .Select(h => Row(ledger, h, first, last))
            .Where(r => r.Cells.Any(c => c.State != HabitCellState.NotDue))
            .ToList();
        return new HabitMonthDto(first, await MonthNoteAsync(first, ct), rows);
    }

    /// <summary>One habit's history between two dates (default: the last 365 days), for the "year in pixels" view.</summary>
    public async Task<HabitHistoryDto> GetHistoryAsync(int habitId, DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var habit = await db.Habits.AsNoTracking().FirstOrDefaultAsync(h => h.Id == habitId, ct) ?? throw new NotFoundException("Habit", habitId);
        var end = to ?? clock.Today;
        var start = from ?? end.AddDays(-364);
        if (start > end) throw new ValidationException("'from' must be on or before 'to'.");
        if (end.DayNumber - start.DayNumber > 400) throw new ValidationException("The range can span at most 400 days.");

        // Load from the habit's start so the streak sees all of its history.
        var ledger = await HabitLedger.LoadAsync(db, [habit], habit.RepeatStart, LaterOf(end, clock.Today), ct);
        return new HabitHistoryDto(Row(ledger, habit, start, end), start, end);
    }

    private HabitRowDto Row(HabitLedger ledger, Habit habit, DateOnly from, DateOnly to)
    {
        var today = clock.Today;
        var cells = new List<HabitCellDto>();
        int due = 0, done = 0, total = 0;
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var day = ledger.On(habit, d);
            var state = CellState(habit, day, d, today);
            cells.Add(new HabitCellDto(d, state, day.Count));
            if (d > today || !day.Due) continue;
            if (d < today || day.Done) due++; // today only counts once it's done
            if (day.Done) done++;
            total += habit.Target is null ? (day.Done ? 1 : 0) : day.Count;
        }

        var (current, best) = ledger.Streak(habit, habit.RepeatStart, today);
        return new HabitRowDto(HabitDto.From(habit), cells, due == 0 ? null : (double)done / due, current, best, total);
    }

    private static HabitCellState CellState(Habit habit, HabitDay day, DateOnly date, DateOnly today)
    {
        if (!day.Scheduled) return HabitCellState.NotDue;
        if (date > today) return HabitCellState.Future;
        if (day.Skipped) return HabitCellState.Skipped;
        if (day.Done) return HabitCellState.Done;
        if (habit.IsLimit) return HabitCellState.Missed; // over the limit
        if (day.Count > 0) return HabitCellState.Partial;
        return date < today ? HabitCellState.Missed : HabitCellState.Open;
    }

    // ---- Helpers ---------------------------------------------------------------------------------

    private void Apply(Habit habit, SaveHabitRequest request)
    {
        habit.Title = Guard.Title(request.Title);
        if (habit.Title.Length > Habit.TitleMaxLength)
            throw new ValidationException($"Title must be at most {Habit.TitleMaxLength} characters.");
        habit.Icon = Clean(request.Icon) ?? "✅";
        if (habit.Icon.Length > 16) throw new ValidationException("Pick a single emoji as the icon.");

        if (!Enum.IsDefined(request.Kind)) throw new ValidationException("Unknown habit kind.");
        if (!Enum.IsDefined(request.TimeOfDay)) throw new ValidationException("Unknown time of day.");
        if (request.Target is < 1 or > Habit.MaxTarget) throw new ValidationException($"The target must be between 1 and {Habit.MaxTarget}.");
        if (request.CountsFocusMinutes && request.Target is null) throw new ValidationException("Set a target in minutes to count focus time.");
        if (request.CountsFocusMinutes && request.Kind == HabitKind.Avoid) throw new ValidationException("Focus time can only count towards a habit to build.");

        var unit = Clean(request.Unit);
        if (unit?.Length > Habit.UnitMaxLength) throw new ValidationException($"The unit can be at most {Habit.UnitMaxLength} characters.");

        habit.Target = request.Target;
        habit.Unit = request.Target is null ? null : request.CountsFocusMinutes ? "min" : unit;
        habit.Kind = request.Kind;
        habit.TimeOfDay = request.TimeOfDay;
        habit.CountsFocusMinutes = request.CountsFocusMinutes;

        // A month habit starts with its month at the earliest; a base habit today (unless told otherwise).
        var defaultStart = habit.Month is { } m ? LaterOf(m, clock.Today) : clock.Today;
        if (habit.Id != 0 && request.Repeat?.StartDate is null) defaultStart = habit.RepeatStart;
        var rule = RecurrenceRules.Normalize(request.Repeat ?? new RecurrenceInput(RepeatFrequency.Daily), defaultStart);
        habit.RepeatFrequency = rule.Frequency;
        habit.RepeatInterval = rule.Interval;
        habit.RepeatWeekdays = rule.Weekdays;
        habit.RepeatMonthDay = rule.MonthDay;
        habit.RepeatStart = rule.Start;
    }

    private async Task<Habit> LoadAsync(int id, CancellationToken ct) =>
        await db.Habits.FirstOrDefaultAsync(h => h.Id == id, ct) ?? throw new NotFoundException("Habit", id);

    private async Task<HabitMonthNoteDto?> MonthNoteAsync(DateOnly date, CancellationToken ct)
    {
        var first = FirstOfMonth(date);
        return await db.HabitMonthNotes.AsNoTracking().Where(n => n.Month == first)
            .Select(n => new HabitMonthNoteDto(n.Month, n.Word, n.Emoji)).FirstOrDefaultAsync(ct);
    }

    internal static DateOnly FirstOfMonth(DateOnly d) => new(d.Year, d.Month, 1);

    private static DateOnly LaterOf(DateOnly a, DateOnly b) => a > b ? a : b;

    private static string? Clean(string? s)
    {
        var t = s?.Trim();
        return string.IsNullOrEmpty(t) ? null : t;
    }
}
