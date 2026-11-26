using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Application.Tasks;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Templates;

/// <param name="Weekdays">Weekly only. Empty = the start date's weekday.</param>
/// <param name="MonthDay">Monthly only. Null = the start date's day of the month.</param>
/// <param name="StartDate">"Every N" counts from here. Null = the task's planned day, or today.</param>
public sealed record RecurrenceInput(
    RepeatFrequency Frequency,
    int Interval = 1,
    IReadOnlyList<DayOfWeek>? Weekdays = null,
    int? MonthDay = null,
    DateOnly? StartDate = null);

/// <summary>Sets or (with null) stops the repeat rule of a task's series.</summary>
public sealed record SetRepeatRequest(RecurrenceInput? Repeat);

/// <summary>
/// Recurring tasks. A repeat rule lives on a template (the "series"); on each day the rule matches, the series
/// gets a copy on Today. There is at most one open copy per series: an unfinished copy that went back to the
/// backlog is moved onto Today instead of creating a duplicate. Missed days are not backfilled.
/// </summary>
public sealed class RecurrenceService(IFocusDbContext db, IClock clock, TaskService tasks)
{
    /// <summary>Makes a task repeat (turning it into a series if needed), or stops its series repeating.</summary>
    public async Task<TaskDto> SetTaskRepeatAsync(int taskId, SetRepeatRequest request, CancellationToken ct = default)
    {
        var task = await db.Tasks.Include(t => t.Template).Include(t => t.Subtasks).FirstOrDefaultAsync(t => t.Id == taskId, ct)
            ?? throw new NotFoundException("Task", taskId);

        if (request.Repeat is null)
        {
            task.Template?.ClearRepeat();
            await db.SaveChangesAsync(ct);
            return await tasks.GetAsync(taskId, ct);
        }

        var template = task.Template;
        if (template is null)
        {
            template = TemplateFactory.FromTask(task, clock.UtcNow);
            db.Templates.Add(template);
            task.Template = template;
        }

        Apply(template, request.Repeat, task.PlannedDate ?? clock.Today);
        await db.SaveChangesAsync(ct);
        await RunTodayAsync(template, ct);
        return await tasks.GetAsync(taskId, ct);
    }

    /// <summary>
    /// Validates and stores a repeat rule on a template (null clears it). Does not save.
    /// Changing the rule lets it run again today.
    /// </summary>
    internal static void Apply(TaskTemplate template, RecurrenceInput? input, DateOnly defaultStart)
    {
        if (input is null)
        {
            template.ClearRepeat();
            return;
        }

        if (!Enum.IsDefined(input.Frequency)) throw new ValidationException("Unknown repeat frequency.");
        if (input.Interval is < 1 or > Recurrence.MaxInterval)
            throw new ValidationException($"Repeat every 1 to {Recurrence.MaxInterval}.");

        var start = input.StartDate ?? defaultStart;
        var weekdays = 0;
        int? monthDay = null;
        switch (input.Frequency)
        {
            case RepeatFrequency.Weekly:
                weekdays = Recurrence.ToMask(input.Weekdays is { Count: > 0 } days ? days : [start.DayOfWeek]);
                break;
            case RepeatFrequency.Monthly:
                monthDay = input.MonthDay ?? start.Day;
                if (monthDay is < 1 or > 31) throw new ValidationException("The day of the month must be between 1 and 31.");
                break;
        }

        var changed = template.RepeatFrequency != input.Frequency
            || template.RepeatInterval != input.Interval
            || template.RepeatWeekdays != weekdays
            || template.RepeatMonthDay != monthDay
            || template.RepeatStart != start;

        template.RepeatFrequency = input.Frequency;
        template.RepeatInterval = input.Interval;
        template.RepeatWeekdays = weekdays;
        template.RepeatMonthDay = monthDay;
        template.RepeatStart = start;
        if (changed) template.RepeatLastRun = null;
    }

    /// <summary>Applies every repeat rule that hasn't run today yet. Returns the tasks it put on today.</summary>
    public async Task<IReadOnlyList<int>> RunAllForTodayAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var due = await db.Templates
            .Where(t => t.RepeatFrequency != null && (t.RepeatLastRun == null || t.RepeatLastRun < today))
            .ToListAsync(ct);

        var placed = new List<int>();
        foreach (var template in due)
        {
            if (await RunTodayAsync(template, ct) is { } id) placed.Add(id);
        }
        return placed;
    }

    /// <summary>
    /// If the series occurs today and has no copy on today (or an open one planned later), puts one on today:
    /// the open copy waiting in the backlog if there is one, otherwise a fresh copy. Returns that task's id.
    /// </summary>
    internal async Task<int?> RunTodayAsync(TaskTemplate template, CancellationToken ct)
    {
        var today = clock.Today;
        if (template.RepeatLastRun == today) return null;
        template.RepeatLastRun = today;

        int? placed = null;
        if (template.OccursOn(today))
        {
            var copies = await db.Tasks.Include(t => t.PlanEntries)
                .Where(t => t.TemplateId == template.Id)
                .ToListAsync(ct);

            var alreadyPlanned = copies.Any(c => c.PlannedDate == today)
                || copies.Any(c => c.Status == TaskItemStatus.Open && c.PlannedDate > today);

            if (!alreadyPlanned)
            {
                var waiting = copies
                    .Where(c => c.Status == TaskItemStatus.Open && c.PlannedDate == null)
                    .OrderByDescending(c => c.UpdatedAt)
                    .FirstOrDefault();

                if (waiting is not null)
                {
                    await tasks.MoveToAsync(waiting, today, int.MaxValue, ct);
                    placed = waiting.Id;
                }
                else
                {
                    var task = TemplateFactory.NewTask(template);
                    await tasks.AddAsync(task, today, ct); // saves
                    placed = task.Id;
                }
            }
        }

        await db.SaveChangesAsync(ct);
        return placed;
    }
}
