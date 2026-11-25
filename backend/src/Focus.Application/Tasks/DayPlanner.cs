using Focus.Domain.Entities;

namespace Focus.Application.Tasks;

/// <summary>
/// Keeps <see cref="DayPlanEntry"/> history in sync when a task joins or leaves a day.
/// Requires <see cref="TaskItem.PlanEntries"/> to be loaded.
/// </summary>
internal static class DayPlanner
{
    /// <summary>Records that <paramref name="task"/> is on the list for <paramref name="date"/>.</summary>
    public static void Join(TaskItem task, DateOnly date, DateTime now)
    {
        var outcome = task.Status == TaskItemStatus.Done ? PlanOutcome.Completed : PlanOutcome.Pending;
        var entry = task.PlanEntries.FirstOrDefault(e => e.Date == date);
        if (entry is null)
        {
            task.PlanEntries.Add(new DayPlanEntry { Date = date, AddedAt = now, Outcome = outcome });
        }
        else
        {
            entry.RemovedAt = null;
            entry.Outcome = outcome;
        }
    }

    /// <summary>
    /// Records that <paramref name="task"/> left <paramref name="date"/> unfinished.
    /// Leaving a future day erases the entry (plans for the future aren't history yet);
    /// leaving today or a past day keeps it as "planned but not completed".
    /// </summary>
    public static void Leave(TaskItem task, DateOnly date, DateOnly today, DateTime now)
    {
        var entry = task.PlanEntries.FirstOrDefault(e => e.Date == date);
        if (entry is null) return;

        if (date > today)
        {
            task.PlanEntries.Remove(entry);
            return;
        }

        entry.RemovedAt = now;
        entry.Outcome = PlanOutcome.NotCompleted;
    }

    /// <summary>Updates the entry for the task's current day after it was completed or reopened.</summary>
    public static void SyncOutcome(TaskItem task, DateTime now)
    {
        if (task.PlannedDate is not { } date) return;
        Join(task, date, now);
    }
}
