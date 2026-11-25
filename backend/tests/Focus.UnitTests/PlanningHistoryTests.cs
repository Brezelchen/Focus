using Focus.Application.Common;
using Focus.Application.Tasks;
using Focus.Application.Templates;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.UnitTests;

/// <summary>The "planned vs done" history is what the stats are built on, so its rules are tested end to end.</summary>
public sealed class PlanningHistoryTests : IDisposable
{
    private readonly TestApp _app = new();
    private DateOnly Today => _app.Clock.Today;

    public void Dispose() => _app.Dispose();

    [Fact]
    public async Task Planned_and_completed_tasks_count_for_the_day()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.CreateAsync(new CreateTaskRequest("B", PlannedDate: Today));
        await _app.Tasks.CompleteAsync(a.Id);

        var day = await _app.Days.GetDayAsync(Today);

        Assert.Equal(2, day.Planned);
        Assert.Equal(1, day.Done);
        Assert.Equal(["B", "A"], day.Tasks.Select(t => t.Title)); // open first, done last
    }

    [Fact]
    public async Task Moving_a_task_back_to_the_backlog_today_still_counts_as_planned()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.MoveAsync(a.Id, new MoveTaskRequest(null, 0));

        var day = await _app.Days.GetDayAsync(Today);

        Assert.Empty(day.Tasks);
        Assert.Equal(1, day.Planned);
        Assert.Equal(0, day.Done);
    }

    [Fact]
    public async Task Moving_a_task_off_a_future_day_leaves_no_trace()
    {
        var tomorrow = Today.AddDays(1);
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: tomorrow));
        await _app.Tasks.MoveAsync(a.Id, new MoveTaskRequest(null, 0));

        Assert.Equal(0, (await _app.Days.GetDayAsync(tomorrow)).Planned);
    }

    [Fact]
    public async Task Moving_back_and_forth_on_the_same_day_keeps_one_entry()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.MoveAsync(a.Id, new MoveTaskRequest(null, 0));
        await _app.Tasks.MoveAsync(a.Id, new MoveTaskRequest(Today, 0));
        await _app.Tasks.CompleteAsync(a.Id);

        var day = await _app.Days.GetDayAsync(Today);
        Assert.Equal((1, 1), (day.Planned, day.Done));
    }

    [Fact]
    public async Task Completing_a_backlog_task_moves_it_to_today()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A"));
        var done = await _app.Tasks.CompleteAsync(a.Id);

        Assert.Equal(Today, done.PlannedDate);
        Assert.Equal((1, 1), ((await _app.Days.GetDayAsync(Today)).Planned, (await _app.Days.GetDayAsync(Today)).Done));
    }

    [Fact]
    public async Task Reopening_a_task_undoes_the_completion()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.CompleteAsync(a.Id);
        await _app.Tasks.ReopenAsync(a.Id);

        var day = await _app.Days.GetDayAsync(Today);
        Assert.Equal((1, 0), (day.Planned, day.Done));
    }

    [Fact]
    public async Task Reordering_places_the_task_at_the_index()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.CreateAsync(new CreateTaskRequest("B", PlannedDate: Today));
        await _app.Tasks.CreateAsync(new CreateTaskRequest("C", PlannedDate: Today));

        await _app.Tasks.MoveAsync(a.Id, new MoveTaskRequest(Today, 2));

        Assert.Equal(["B", "C", "A"], (await _app.Days.GetDayAsync(Today)).Tasks.Select(t => t.Title));
    }

    [Fact]
    public async Task Rollover_returns_unfinished_tasks_to_the_top_of_the_backlog()
    {
        await _app.Tasks.CreateAsync(new CreateTaskRequest("Old backlog item"));
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("Done", PlannedDate: Today));
        await _app.Tasks.CreateAsync(new CreateTaskRequest("Unfinished", PlannedDate: Today));
        await _app.Tasks.CompleteAsync(a.Id);
        var yesterday = Today;

        _app.Clock.NextDay();
        var result = await _app.Days.RolloverAsync();

        Assert.Equal(new(yesterday, 2, 1), result.PreviousDay);
        var returned = Assert.Single(result.ReturnedTasks);
        Assert.Equal("Unfinished", returned.Title);
        Assert.Equal(1, returned.PostponedCount);

        var backlog = await _app.Tasks.GetBacklogAsync(null, null);
        Assert.Equal(["Unfinished", "Old backlog item"], backlog.Select(t => t.Title));

        // Yesterday's stats are unchanged by the rollover, and it is idempotent.
        Assert.Equal((2, 1), ((await _app.Days.GetDayAsync(yesterday)).Planned, (await _app.Days.GetDayAsync(yesterday)).Done));
        Assert.Empty((await _app.Days.RolloverAsync()).ReturnedTasks);
    }

    [Fact]
    public async Task Planning_in_the_past_is_rejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() =>
            _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today.AddDays(-1))));
    }

    [Fact]
    public async Task Deleting_a_task_removes_it_from_the_stats()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.DeleteAsync(a.Id);

        Assert.Equal(0, (await _app.Days.GetDayAsync(Today)).Planned);
        Assert.Equal(0, await _app.Db.DayPlanEntries.CountAsync());
    }

    [Fact]
    public async Task Templates_create_fresh_tasks_and_track_usage()
    {
        var template = await _app.Templates.CreateAsync(new SaveTemplateRequest("Gym", EstimateMinutes: 60));

        var t1 = await _app.Templates.InstantiateAsync(template.Id, new InstantiateTemplateRequest(Today));
        var t2 = await _app.Templates.InstantiateAsync(template.Id, new InstantiateTemplateRequest(Today, 0));

        Assert.NotEqual(t1.Id, t2.Id);
        Assert.Equal(["Gym", "Gym"], (await _app.Days.GetDayAsync(Today)).Tasks.Select(t => t.Title));
        Assert.Equal(0, (await _app.Tasks.GetAsync(t2.Id)).SortOrder);
        Assert.Equal(2, (await _app.Templates.GetAsync(template.Id)).UseCount);
        Assert.Equal(TaskItemStatus.Open, t1.Status);
    }

    [Fact]
    public async Task Stats_summary_reports_rates_and_streak()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.CompleteAsync(a.Id);
        _app.Clock.NextDay();
        await _app.Days.RolloverAsync();

        var summary = await _app.Stats.GetSummaryAsync(Today.AddDays(-6), Today, null);

        Assert.Equal(7, summary.Days.Count);
        Assert.Equal(1.0, summary.Totals.CompletionRate);
        Assert.Equal(1, summary.CurrentStreak);
    }
}
