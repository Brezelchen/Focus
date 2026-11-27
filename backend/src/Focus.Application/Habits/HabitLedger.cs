using Focus.Application.Abstractions;
using Focus.Application.Days;
using Focus.Application.Stats;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Habits;

/// <summary>What a habit looked like on one day.</summary>
/// <param name="Due">The rule matched and the day wasn't skipped.</param>
internal readonly record struct HabitDay(bool Scheduled, bool Due, bool Skipped, int Count, bool Done);

/// <summary>
/// An in-memory snapshot of habits, their check-ins and daily focus minutes over a date range, so day views,
/// month grids, streaks and stats are all computed the same way from a fixed number of queries.
/// </summary>
internal sealed class HabitLedger
{
    private readonly Dictionary<(int HabitId, DateOnly Date), HabitCheckIn> _checkIns;
    private readonly Dictionary<DateOnly, int> _focusMinutes;

    private HabitLedger(IReadOnlyList<Habit> habits, Dictionary<(int, DateOnly), HabitCheckIn> checkIns, Dictionary<DateOnly, int> focusMinutes)
    {
        Habits = habits;
        _checkIns = checkIns;
        _focusMinutes = focusMinutes;
    }

    public IReadOnlyList<Habit> Habits { get; }

    /// <summary>Loads the given habits (untracked) with their check-ins and focus minutes between the dates.</summary>
    public static async Task<HabitLedger> LoadAsync(IFocusDbContext db, IReadOnlyList<Habit> habits, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var ids = habits.Select(h => h.Id).ToList();
        var checkIns = await db.HabitCheckIns.AsNoTracking()
            .Where(c => ids.Contains(c.HabitId) && c.Date >= from && c.Date <= to)
            .ToDictionaryAsync(c => (c.HabitId, c.Date), ct);

        var focus = new Dictionary<DateOnly, int>();
        if (habits.Any(h => h.CountsFocusMinutes))
        {
            focus = await db.FocusSessions.AsNoTracking()
                .Where(s => s.Date >= from && s.Date <= to && s.Status != FocusSessionStatus.Running)
                .GroupBy(s => s.Date)
                .Select(g => new { Date = g.Key, Seconds = g.Sum(s => s.ActualSeconds) })
                .ToDictionaryAsync(x => x.Date, x => x.Seconds / 60, ct);
        }

        return new HabitLedger(habits, checkIns, focus);
    }

    /// <summary>All habits (archived included) that could matter for the range, ordered base list first.</summary>
    public static Task<List<Habit>> HabitsForRangeAsync(IFocusDbContext db, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var firstMonth = new DateOnly(from.Year, from.Month, 1);
        return db.Habits.AsNoTracking()
            .Where(h => h.RepeatStart <= to && (h.ArchivedAt == null || h.ArchivedAt > from)
                && (h.Month == null || (h.Month >= firstMonth && h.Month <= to)))
            .OrderBy(h => h.Month).ThenBy(h => h.SortOrder).ThenBy(h => h.Id)
            .ToListAsync(ct);
    }

    public HabitDay On(Habit habit, DateOnly date)
    {
        var scheduled = habit.IsDueOn(date);
        _checkIns.TryGetValue((habit.Id, date), out var checkIn);
        var skipped = scheduled && checkIn?.Skipped == true;
        var count = habit.CountsFocusMinutes ? _focusMinutes.GetValueOrDefault(date) : checkIn?.Count ?? 0;
        var due = scheduled && !skipped;
        return new HabitDay(scheduled, due, skipped, count, due && habit.IsMet(count));
    }

    /// <summary>Current and best streak of due days that were done. Skipped and not-scheduled days don't count either way.</summary>
    public (int Current, int Best) Streak(Habit habit, DateOnly from, DateOnly today)
    {
        var days = new List<DaySummary>();
        for (var d = Max(from, habit.RepeatStart); d <= today; d = d.AddDays(1))
        {
            var day = On(habit, d);
            if (day.Due) days.Add(new DaySummary(d, 1, day.Done ? 1 : 0));
        }
        return StreakCalculator.Compute(days, today, 1.0);
    }

    /// <summary>Due and done habits per day.</summary>
    public (int Due, int Done) Totals(DateOnly date)
    {
        int due = 0, done = 0;
        foreach (var habit in Habits)
        {
            var day = On(habit, date);
            if (!day.Due) continue;
            due++;
            if (day.Done) done++;
        }
        return (due, done);
    }

    public static DateOnly Max(DateOnly a, DateOnly b) => a > b ? a : b;
}
