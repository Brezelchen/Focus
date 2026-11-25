using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Application.Tasks;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Days;

/// <param name="Tasks">Open tasks in manual order, followed by done tasks in completion order.</param>
/// <param name="Planned">Everything that was on this day's list (including tasks that left it unfinished).</param>
/// <param name="Done">Planned tasks that were completed.</param>
/// <param name="RemainingEstimateMinutes">Sum of estimates of the open tasks.</param>
public sealed record DayDto(DateOnly Date, IReadOnlyList<TaskDto> Tasks, int Planned, int Done, int RemainingEstimateMinutes);

public sealed record DaySummary(DateOnly Date, int Planned, int Done);

/// <param name="PreviousDay">The most recent earlier day that had a plan, if any.</param>
/// <param name="ReturnedTasks">Unfinished tasks this rollover moved back to the backlog.</param>
public sealed record RolloverResult(DaySummary? PreviousDay, IReadOnlyList<TaskDto> ReturnedTasks);

public sealed class DayService(IFocusDbContext db, IClock clock)
{
    public async Task<DayDto> GetDayAsync(DateOnly date, CancellationToken ct = default)
    {
        var tasks = await db.Tasks.AsNoTracking()
            .Where(t => t.PlannedDate == date)
            .Select(Projections.Task)
            .ToListAsync(ct);

        var ordered = tasks.Where(t => t.Status == TaskItemStatus.Open).OrderBy(t => t.SortOrder).ThenBy(t => t.Id)
            .Concat(tasks.Where(t => t.Status == TaskItemStatus.Done).OrderBy(t => t.CompletedAt))
            .ToList();

        var (planned, done) = await CountAsync(date, ct);
        var remaining = ordered.Where(t => t.Status == TaskItemStatus.Open).Sum(t => t.EstimateMinutes ?? 0);
        return new DayDto(date, ordered, planned, done, remaining);
    }

    /// <summary>
    /// Sends every unfinished task from past days back to the backlog (top of the backlog, oldest day first),
    /// recording them as "planned but not completed". Idempotent: calling it again the same day returns no tasks.
    /// </summary>
    public async Task<RolloverResult> RolloverAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var now = clock.UtcNow;

        var leftovers = await db.Tasks
            .Include(t => t.PlanEntries)
            .Where(t => t.Status == TaskItemStatus.Open && t.PlannedDate != null && t.PlannedDate < today)
            .OrderBy(t => t.PlannedDate).ThenBy(t => t.SortOrder)
            .ToListAsync(ct);

        if (leftovers.Count > 0)
        {
            var backlog = await db.Tasks
                .Where(t => t.PlannedDate == null && t.Status == TaskItemStatus.Open)
                .OrderBy(t => t.SortOrder).ThenBy(t => t.Id)
                .ToListAsync(ct);

            foreach (var task in leftovers)
            {
                DayPlanner.Leave(task, task.PlannedDate!.Value, today, now);
                task.PlannedDate = null;
                task.UpdatedAt = now;
            }

            var order = 0;
            foreach (var task in leftovers.Concat(backlog)) task.SortOrder = order++;
            await db.SaveChangesAsync(ct);
        }

        var previousDate = await db.DayPlanEntries
            .Where(e => e.Date < today)
            .OrderByDescending(e => e.Date)
            .Select(e => (DateOnly?)e.Date)
            .FirstOrDefaultAsync(ct);

        DaySummary? previous = null;
        if (previousDate is { } date)
        {
            var (planned, done) = await CountAsync(date, ct);
            previous = new DaySummary(date, planned, done);
        }

        var ids = leftovers.Select(t => t.Id).ToList();
        var returned = await db.Tasks.AsNoTracking().Where(t => ids.Contains(t.Id))
            .OrderBy(t => t.SortOrder).Select(Projections.Task).ToListAsync(ct);

        return new RolloverResult(previous, returned);
    }

    private async Task<(int Planned, int Done)> CountAsync(DateOnly date, CancellationToken ct)
    {
        var counts = await db.DayPlanEntries
            .Where(e => e.Date == date)
            .GroupBy(_ => 1)
            .Select(g => new { Planned = g.Count(), Done = g.Count(e => e.Outcome == PlanOutcome.Completed) })
            .FirstOrDefaultAsync(ct);
        return (counts?.Planned ?? 0, counts?.Done ?? 0);
    }
}
