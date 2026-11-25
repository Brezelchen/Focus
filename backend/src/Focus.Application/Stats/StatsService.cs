using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Application.Days;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Stats;

public sealed record DayStat(DateOnly Date, int Planned, int Done, int FocusMinutes);

public sealed record StatsTotals(int Planned, int Done, double CompletionRate, int FocusMinutes, int Sessions);

/// <param name="Days">One entry per calendar day in the range (days without activity included, with zeros).</param>
/// <param name="Threshold">Completion rate a day needs to count towards a streak.</param>
public sealed record StatsSummary(
    DateOnly From,
    DateOnly To,
    IReadOnlyList<DayStat> Days,
    StatsTotals Totals,
    int CurrentStreak,
    int BestStreak,
    double Threshold);

public sealed record WeekdayRate(DayOfWeek Day, double CompletionRate, int DaysCounted);

public sealed record StatsInsights(
    IReadOnlyList<TemplateDto> TopTemplates,
    IReadOnlyList<TaskDto> MostPostponed,
    WeekdayRate? BestWeekday,
    int TotalDone,
    int TotalFocusMinutes,
    int SessionsCompleted,
    int SessionsEndedEarly);

public sealed class StatsService(IFocusDbContext db, IClock clock)
{
    public const double DefaultThreshold = 0.8;
    public const int MaxRangeDays = 400;

    public async Task<StatsSummary> GetSummaryAsync(DateOnly? from, DateOnly? to, double? threshold, CancellationToken ct = default)
    {
        var end = to ?? clock.Today;
        var start = from ?? end.AddDays(-6);
        if (start > end) throw new ValidationException("'from' must be on or before 'to'.");
        if (end.DayNumber - start.DayNumber >= MaxRangeDays) throw new ValidationException($"The range can span at most {MaxRangeDays} days.");
        var goal = threshold ?? DefaultThreshold;
        if (goal is <= 0 or > 1) throw new ValidationException("Threshold must be greater than 0 and at most 1.");

        // All-time per-day counts are needed for streaks; the data is one row per planned task-day, so this stays small.
        var allDays = await PlanCountsAsync(null, null, ct);
        var focus = await db.FocusSessions.AsNoTracking()
            .Where(s => s.Date >= start && s.Date <= end && s.Status != FocusSessionStatus.Running)
            .GroupBy(s => s.Date)
            .Select(g => new { Date = g.Key, Seconds = g.Sum(s => s.ActualSeconds), Count = g.Count() })
            .ToDictionaryAsync(x => x.Date, ct);

        var byDate = allDays.ToDictionary(d => d.Date);
        var days = new List<DayStat>();
        for (var d = start; d <= end; d = d.AddDays(1))
        {
            byDate.TryGetValue(d, out var counts);
            focus.TryGetValue(d, out var f);
            days.Add(new DayStat(d, counts?.Planned ?? 0, counts?.Done ?? 0, (f?.Seconds ?? 0) / 60));
        }

        var planned = days.Sum(d => d.Planned);
        var done = days.Sum(d => d.Done);
        var totals = new StatsTotals(
            planned,
            done,
            planned == 0 ? 0 : Math.Round((double)done / planned, 3),
            focus.Values.Sum(f => f.Seconds) / 60,
            focus.Values.Sum(f => f.Count));

        var (current, best) = StreakCalculator.Compute(allDays, clock.Today, goal);
        return new StatsSummary(start, end, days, totals, current, best, goal);
    }

    public async Task<StatsInsights> GetInsightsAsync(CancellationToken ct = default)
    {
        var topTemplates = await db.Templates.AsNoTracking()
            .Where(t => t.UseCount > 0)
            .OrderByDescending(t => t.UseCount).ThenByDescending(t => t.LastUsedAt)
            .Take(5)
            .Select(Projections.Template)
            .ToListAsync(ct);

        var mostPostponed = await db.Tasks.AsNoTracking()
            .Where(t => t.Status == TaskItemStatus.Open
                && t.PlanEntries.Count(e => e.Outcome == PlanOutcome.NotCompleted) >= 2)
            .OrderByDescending(t => t.PlanEntries.Count(e => e.Outcome == PlanOutcome.NotCompleted))
            .Take(5)
            .Select(Projections.Task)
            .ToListAsync(ct);

        var today = clock.Today;
        var pastDays = (await PlanCountsAsync(null, today.AddDays(-1), ct)).Where(d => d.Planned > 0).ToList();
        var bestWeekday = pastDays
            .GroupBy(d => d.Date.DayOfWeek)
            .Where(g => g.Count() >= 2)
            .Select(g => new WeekdayRate(g.Key, Math.Round(g.Average(d => (double)d.Done / d.Planned), 3), g.Count()))
            .OrderByDescending(w => w.CompletionRate).ThenByDescending(w => w.DaysCounted)
            .FirstOrDefault();

        var sessions = await db.FocusSessions.AsNoTracking()
            .Where(s => s.Status != FocusSessionStatus.Running)
            .GroupBy(s => s.Status)
            .Select(g => new { Status = g.Key, Count = g.Count(), Seconds = g.Sum(s => s.ActualSeconds) })
            .ToListAsync(ct);

        var totalDone = await db.DayPlanEntries.CountAsync(e => e.Outcome == PlanOutcome.Completed, ct);

        return new StatsInsights(
            topTemplates,
            mostPostponed,
            bestWeekday,
            totalDone,
            sessions.Sum(s => s.Seconds) / 60,
            sessions.FirstOrDefault(s => s.Status == FocusSessionStatus.Completed)?.Count ?? 0,
            sessions.FirstOrDefault(s => s.Status == FocusSessionStatus.EndedEarly)?.Count ?? 0);
    }

    private async Task<List<DaySummary>> PlanCountsAsync(DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var query = db.DayPlanEntries.AsNoTracking();
        if (from is { } f) query = query.Where(e => e.Date >= f);
        if (to is { } t) query = query.Where(e => e.Date <= t);

        return await query
            .GroupBy(e => e.Date)
            .OrderBy(g => g.Key)
            .Select(g => new DaySummary(g.Key, g.Count(), g.Count(e => e.Outcome == PlanOutcome.Completed)))
            .ToListAsync(ct);
    }
}

public static class StreakCalculator
{
    /// <summary>
    /// A day "hits" when something was planned and at least <paramref name="threshold"/> of it got done.
    /// Days with nothing planned are neutral (rest days don't break a streak). Today only counts once it hits,
    /// so an in-progress day never breaks the current streak.
    /// </summary>
    public static (int Current, int Best) Compute(IEnumerable<DaySummary> days, DateOnly today, double threshold)
    {
        var planned = days
            .Where(d => d.Planned > 0 && d.Date <= today)
            .OrderBy(d => d.Date)
            .Select(d => (d.Date, Hit: (double)d.Done / d.Planned >= threshold - 1e-9))
            .Where(d => d.Date < today || d.Hit)
            .ToList();

        int best = 0, run = 0;
        foreach (var day in planned)
        {
            run = day.Hit ? run + 1 : 0;
            best = Math.Max(best, run);
        }

        return (run, best);
    }
}
