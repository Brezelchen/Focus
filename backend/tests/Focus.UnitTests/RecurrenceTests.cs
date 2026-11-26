using Focus.Application.Common;
using Focus.Application.Tasks;
using Focus.Application.Templates;
using Focus.Domain.Entities;

namespace Focus.UnitTests;

public sealed class RecurrenceRuleTests
{
    private static readonly DateOnly Wed = new(2026, 11, 25);

    private static bool Occurs(RepeatFrequency f, int interval, DateOnly date, DayOfWeek[]? days = null, int? monthDay = null, DateOnly? start = null) =>
        Recurrence.Occurs(f, interval, Recurrence.ToMask(days ?? []), monthDay, start ?? Wed, date);

    [Fact]
    public void Every_n_days_counts_from_the_start()
    {
        Assert.True(Occurs(RepeatFrequency.Daily, 2, Wed));
        Assert.False(Occurs(RepeatFrequency.Daily, 2, Wed.AddDays(1)));
        Assert.True(Occurs(RepeatFrequency.Daily, 2, Wed.AddDays(2)));
        Assert.True(Occurs(RepeatFrequency.Daily, 1, Wed.AddDays(17)));
        Assert.False(Occurs(RepeatFrequency.Daily, 1, Wed.AddDays(-1))); // before the start
    }

    [Fact]
    public void Weekly_on_chosen_weekdays()
    {
        DayOfWeek[] monFri = [DayOfWeek.Monday, DayOfWeek.Friday];
        Assert.False(Occurs(RepeatFrequency.Weekly, 1, Wed, monFri));
        Assert.True(Occurs(RepeatFrequency.Weekly, 1, new DateOnly(2026, 11, 27), monFri)); // Fri
        Assert.True(Occurs(RepeatFrequency.Weekly, 1, new DateOnly(2026, 11, 30), monFri)); // Mon
    }

    [Fact]
    public void Every_other_week_skips_alternate_weeks()
    {
        DayOfWeek[] mon = [DayOfWeek.Monday];
        // Started on a Wednesday: that week's Monday is week 0, so Nov 30 is week 1 (off) and Dec 7 week 2 (on).
        Assert.False(Occurs(RepeatFrequency.Weekly, 2, new DateOnly(2026, 11, 30), mon));
        Assert.True(Occurs(RepeatFrequency.Weekly, 2, new DateOnly(2026, 12, 7), mon));
        Assert.False(Occurs(RepeatFrequency.Weekly, 2, new DateOnly(2026, 12, 14), mon));
    }

    [Fact]
    public void Monthly_on_a_day_of_the_month()
    {
        Assert.True(Occurs(RepeatFrequency.Monthly, 1, new DateOnly(2026, 12, 1), monthDay: 1));
        Assert.False(Occurs(RepeatFrequency.Monthly, 1, new DateOnly(2026, 12, 2), monthDay: 1));
        Assert.True(Occurs(RepeatFrequency.Monthly, 1, new DateOnly(2027, 1, 1), monthDay: 1));
    }

    [Fact]
    public void Day_31_means_the_last_day_in_shorter_months()
    {
        Assert.True(Occurs(RepeatFrequency.Monthly, 1, new DateOnly(2027, 2, 28), monthDay: 31));
        Assert.True(Occurs(RepeatFrequency.Monthly, 1, new DateOnly(2026, 11, 30), monthDay: 31));
        Assert.True(Occurs(RepeatFrequency.Monthly, 1, new DateOnly(2026, 12, 31), monthDay: 31));
        Assert.False(Occurs(RepeatFrequency.Monthly, 1, new DateOnly(2026, 12, 30), monthDay: 31));
    }

    [Fact]
    public void Every_three_months()
    {
        var start = new DateOnly(2026, 11, 1);
        Assert.True(Occurs(RepeatFrequency.Monthly, 3, start, monthDay: 1, start: start));
        Assert.False(Occurs(RepeatFrequency.Monthly, 3, new DateOnly(2026, 12, 1), monthDay: 1, start: start));
        Assert.True(Occurs(RepeatFrequency.Monthly, 3, new DateOnly(2027, 2, 1), monthDay: 1, start: start));
    }

    [Fact]
    public void Weekday_masks_round_trip_monday_first()
    {
        var mask = Recurrence.ToMask([DayOfWeek.Sunday, DayOfWeek.Monday]);
        Assert.Equal([DayOfWeek.Monday, DayOfWeek.Sunday], Recurrence.FromMask(mask));
    }
}

/// <summary>Recurring tasks end to end: series, auto-placement on today, no duplicates.</summary>
public sealed class RecurringTaskTests : IDisposable
{
    private readonly TestApp _app = new();
    private DateOnly Today => _app.Clock.Today;

    public void Dispose() => _app.Dispose();

    private async Task<IReadOnlyList<TaskDto>> TodayTasks() => (await _app.Days.GetDayAsync(Today)).Tasks;

    private async Task NextDay()
    {
        _app.Clock.NextDay();
        await _app.Days.RolloverAsync();
    }

    [Fact]
    public async Task Making_a_task_repeat_turns_it_into_a_series_and_shows_the_rule()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Gym", PlannedDate: Today, Subtasks: ["Stretch"]));

        var updated = await _app.Recurrence.SetTaskRepeatAsync(task.Id, new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Daily, 2)));

        Assert.NotNull(updated.TemplateId);
        Assert.Equal(RepeatFrequency.Daily, updated.Repeat?.Frequency);
        Assert.Equal(2, updated.Repeat?.Interval);
        Assert.Equal(Today, updated.Repeat?.StartDate); // counts from the task's day
        Assert.Single(await TodayTasks()); // the task itself is today's copy

        var template = Assert.Single(await _app.Templates.GetAllAsync());
        Assert.Equal(["Stretch"], template.Checklist);
        Assert.NotNull(template.Repeat);
    }

    [Fact]
    public async Task A_copy_lands_on_today_on_each_matching_day_only()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Water plants", PlannedDate: Today, Subtasks: ["Kitchen"]));
        await _app.Recurrence.SetTaskRepeatAsync(task.Id, new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Daily, 2)));
        await _app.Tasks.CompleteAsync(task.Id);

        await NextDay(); // day 1: not a repeat day
        Assert.Empty(await TodayTasks());

        await NextDay(); // day 2: repeat day
        var copy = Assert.Single(await TodayTasks());
        Assert.Equal("Water plants", copy.Title);
        Assert.NotEqual(task.Id, copy.Id);
        Assert.Equal(TaskItemStatus.Open, copy.Status);
        Assert.Equal(["Kitchen"], copy.Subtasks.Select(s => s.Title));
        Assert.All(copy.Subtasks, s => Assert.False(s.IsDone));
    }

    [Fact]
    public async Task Rollover_is_idempotent_and_a_deleted_copy_does_not_come_back_the_same_day()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Journal", PlannedDate: Today));
        await _app.Recurrence.SetTaskRepeatAsync(task.Id, new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Daily)));
        await _app.Tasks.CompleteAsync(task.Id);

        await NextDay();
        var copy = Assert.Single(await TodayTasks());
        await _app.Days.RolloverAsync();
        Assert.Single(await TodayTasks());

        await _app.Tasks.DeleteAsync(copy.Id);
        await _app.Days.RolloverAsync();
        Assert.Empty(await TodayTasks());
    }

    [Fact]
    public async Task An_unfinished_copy_comes_back_instead_of_piling_up()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Gym", PlannedDate: Today));
        await _app.Recurrence.SetTaskRepeatAsync(task.Id, new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Daily)));

        await NextDay(); // not done yesterday
        var today = Assert.Single(await TodayTasks());
        Assert.Equal(task.Id, today.Id); // the same task, moved back onto today
        Assert.Equal(1, today.PostponedCount);
        Assert.Empty(await _app.Tasks.GetBacklogAsync(null, null));

        var result = await _app.Days.RolloverAsync();
        Assert.Empty(result.ReturnedTasks); // not reported as "went back to the backlog"
    }

    [Fact]
    public async Task Weekly_series_skips_other_days_and_unfinished_copies_wait_in_the_backlog()
    {
        // Wednesday today; repeats on Mondays.
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Plan the week", PlannedDate: Today));
        await _app.Recurrence.SetTaskRepeatAsync(task.Id,
            new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Weekly, Weekdays: [DayOfWeek.Monday])));

        await NextDay(); // Thursday: yesterday's unfinished copy goes to the backlog
        Assert.Empty(await TodayTasks());
        Assert.Single(await _app.Tasks.GetBacklogAsync(null, null));

        for (var i = 0; i < 4; i++) await NextDay(); // ... Monday
        Assert.Equal(DayOfWeek.Monday, Today.DayOfWeek);
        Assert.Equal(task.Id, Assert.Single(await TodayTasks()).Id);
        Assert.Empty(await _app.Tasks.GetBacklogAsync(null, null));
    }

    [Fact]
    public async Task Monthly_on_the_first()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Pay rent"));
        await _app.Recurrence.SetTaskRepeatAsync(task.Id,
            new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Monthly, MonthDay: 1)));
        Assert.Empty(await TodayTasks()); // Nov 25: not the 1st; the task stays in the backlog

        while (Today.Day != 1) await NextDay();
        Assert.Equal(new DateOnly(2026, 12, 1), Today);
        Assert.Equal(task.Id, Assert.Single(await TodayTasks()).Id); // waiting backlog copy moved onto today
    }

    [Fact]
    public async Task Setting_a_rule_that_matches_today_moves_a_backlog_task_onto_today()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Stretch"));
        var updated = await _app.Recurrence.SetTaskRepeatAsync(task.Id,
            new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Weekly, Weekdays: [DayOfWeek.Wednesday])));

        Assert.Equal(Today, updated.PlannedDate);
    }

    [Fact]
    public async Task A_task_planned_for_a_later_day_is_not_duplicated()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Read", PlannedDate: Today.AddDays(2)));
        await _app.Recurrence.SetTaskRepeatAsync(task.Id,
            new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Daily, StartDate: Today)));

        Assert.Empty(await TodayTasks());
        await NextDay();
        Assert.Empty(await TodayTasks());
    }

    [Fact]
    public async Task Stopping_the_repeat_keeps_the_template_but_no_more_copies()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Gym", PlannedDate: Today));
        await _app.Recurrence.SetTaskRepeatAsync(task.Id, new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Daily)));
        await _app.Tasks.CompleteAsync(task.Id);

        var stopped = await _app.Recurrence.SetTaskRepeatAsync(task.Id, new SetRepeatRequest(null));
        Assert.Null(stopped.Repeat);
        Assert.Single(await _app.Templates.GetAllAsync());

        await NextDay();
        Assert.Empty(await TodayTasks());
    }

    [Fact]
    public async Task Templates_can_repeat_too_and_deleting_the_template_ends_the_series()
    {
        var template = await _app.Templates.CreateAsync(new SaveTemplateRequest("Inbox zero",
            Repeat: new RecurrenceInput(RepeatFrequency.Daily)));
        Assert.NotNull(template.Repeat);
        var first = Assert.Single(await TodayTasks()); // created and due today
        await _app.Tasks.CompleteAsync(first.Id);

        await _app.Templates.DeleteAsync(template.Id);
        await NextDay();
        Assert.Empty(await TodayTasks());
    }

    [Fact]
    public async Task Weekly_without_weekdays_uses_the_start_day_and_invalid_rules_are_rejected()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Call mom", PlannedDate: Today));
        var weekly = await _app.Recurrence.SetTaskRepeatAsync(task.Id, new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Weekly)));
        Assert.Equal([DayOfWeek.Wednesday], weekly.Repeat!.Weekdays);

        await Assert.ThrowsAsync<ValidationException>(() => _app.Recurrence.SetTaskRepeatAsync(task.Id,
            new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Daily, Interval: 0))));
        await Assert.ThrowsAsync<ValidationException>(() => _app.Recurrence.SetTaskRepeatAsync(task.Id,
            new SetRepeatRequest(new RecurrenceInput(RepeatFrequency.Monthly, MonthDay: 32))));
    }
}
