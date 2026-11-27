using Focus.Application.Common;
using Focus.Application.Days;
using Focus.Application.FocusSessions;
using Focus.Application.Habits;
using Focus.Application.Templates;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.UnitTests;

/// <summary>Habits: due days come from the rule, check-ins record what was done. Today is Wed 2026-11-25.</summary>
public sealed class HabitTests : IDisposable
{
    private readonly TestApp _app = new();
    private DateOnly Today => _app.Clock.Today;

    public void Dispose() => _app.Dispose();

    private static RecurrenceInput DailyFrom(DateOnly start) => new(RepeatFrequency.Daily, StartDate: start);

    private Task<HabitDto> Base(string title, int? target = null, RecurrenceInput? repeat = null, HabitKind kind = HabitKind.Build, bool focus = false) =>
        _app.Habits.CreateAsync(new SaveHabitRequest(title, Repeat: repeat ?? DailyFrom(Today.AddDays(-30)), Target: target, Kind: kind, CountsFocusMinutes: focus));

    private Task<HabitDayItemDto> Tick(HabitDto h, DateOnly date, int count = 1, bool skipped = false) =>
        _app.Habits.SetCheckInAsync(h.Id, date, new SetCheckInRequest(count, skipped));

    [Fact]
    public async Task Base_habits_are_due_every_day_and_month_habits_only_in_their_month()
    {
        await Base("Make bed");
        var december = await _app.Habits.CreateAsync(new SaveHabitRequest("No sugar", Month: new DateOnly(2026, 12, 15)));

        Assert.Equal(new DateOnly(2026, 12, 1), december.Month);
        Assert.Equal(new DateOnly(2026, 12, 1), december.Repeat.StartDate); // starts with its month
        Assert.Equal(["Make bed"], (await _app.Habits.GetDayAsync(Today)).Items.Select(i => i.Habit.Title));
        Assert.Equal(["Make bed", "No sugar"], (await _app.Habits.GetDayAsync(new DateOnly(2026, 12, 31))).Items.Select(i => i.Habit.Title));
        Assert.Equal(["Make bed"], (await _app.Habits.GetDayAsync(new DateOnly(2027, 1, 1))).Items.Select(i => i.Habit.Title));

        Assert.Single(await _app.Habits.ListAsync(null));
        Assert.Equal(2, (await _app.Habits.ListAsync(new DateOnly(2026, 12, 1))).Count);
    }

    [Fact]
    public async Task Repeat_rules_decide_the_due_days()
    {
        var start = new DateOnly(2026, 11, 2); // a Monday
        await Base("Walk", repeat: new RecurrenceInput(RepeatFrequency.Weekly, Weekdays: [DayOfWeek.Monday, DayOfWeek.Friday], StartDate: start));
        await Base("Plants", repeat: new RecurrenceInput(RepeatFrequency.Daily, Interval: 3, StartDate: start));
        await Base("Budget", repeat: new RecurrenceInput(RepeatFrequency.Monthly, MonthDay: 31, StartDate: start));

        async Task<string[]> On(int y, int m, int d) =>
            (await _app.Habits.GetDayAsync(new DateOnly(y, m, d))).Items.Select(i => i.Habit.Title).ToArray();

        Assert.Equal(["Walk", "Plants"], await On(2026, 11, 2));
        Assert.Equal(["Plants"], await On(2026, 11, 5));
        Assert.Equal(["Walk"], await On(2026, 11, 6));
        Assert.Equal(["Budget"], await On(2027, 2, 28)); // "31st" = last day of a shorter month (a Sunday)
    }

    [Fact]
    public async Task Ticks_and_counts_mark_habits_done()
    {
        var bed = await Base("Make bed");
        var water = await Base("Water", target: 8);

        Assert.True((await Tick(bed, Today)).Done);
        var partial = await Tick(water, Today, 5);
        Assert.False(partial.Done);
        Assert.Equal(5, partial.Count);
        Assert.True((await Tick(water, Today, 9)).Done); // above target is fine

        var day = await _app.Habits.GetDayAsync(Today);
        Assert.Equal((2, 2), (day.Due, day.Done));

        await Tick(bed, Today, 0);
        Assert.Equal(1, (await _app.Habits.GetDayAsync(Today)).Done);
        Assert.Equal(1, await _app.Db.HabitCheckIns.CountAsync()); // count 0 removes the row
    }

    [Fact]
    public async Task Check_ins_are_validated()
    {
        var bed = await Base("Make bed");
        var walk = await Base("Walk", repeat: new RecurrenceInput(RepeatFrequency.Weekly, Weekdays: [DayOfWeek.Monday], StartDate: Today.AddDays(-30)));
        var deep = await Base("Deep work", target: 120, focus: true);

        Assert.True((await Tick(bed, Today.AddDays(-3))).Done); // past days are fine
        await Assert.ThrowsAsync<ValidationException>(() => Tick(bed, Today.AddDays(1)));
        await Assert.ThrowsAsync<ValidationException>(() => Tick(walk, Today)); // Wednesday
        await Assert.ThrowsAsync<ValidationException>(() => Tick(bed, Today, 2)); // a simple tick
        await Assert.ThrowsAsync<ValidationException>(() => Tick(deep, Today, 30)); // filled automatically
        await Assert.ThrowsAsync<ValidationException>(() => _app.Habits.CreateAsync(new SaveHabitRequest(" ")));
        await Assert.ThrowsAsync<ValidationException>(() => _app.Habits.CreateAsync(new SaveHabitRequest("Big", Target: 1000)));
    }

    [Fact]
    public async Task Archiving_keeps_history_but_stops_the_habit()
    {
        var bed = await Base("Make bed");
        await Tick(bed, Today.AddDays(-1));
        await _app.Habits.ArchiveAsync(bed.Id);

        Assert.Empty((await _app.Habits.GetDayAsync(Today)).Items);
        var yesterday = await _app.Habits.GetDayAsync(Today.AddDays(-1));
        Assert.True(Assert.Single(yesterday.Items).Done);

        await _app.Habits.UnarchiveAsync(bed.Id);
        Assert.Single((await _app.Habits.GetDayAsync(Today)).Items);
    }

    [Fact]
    public async Task Month_grid_shows_states_rate_and_streaks()
    {
        var bed = await Base("Make bed", repeat: DailyFrom(new DateOnly(2026, 11, 20)));
        foreach (var d in new[] { 20, 21, 23, 24 }) await Tick(bed, new DateOnly(2026, 11, d));
        await Tick(bed, new DateOnly(2026, 11, 22), skipped: true);

        var month = await _app.Habits.GetMonthAsync(new DateOnly(2026, 11, 1));
        var row = Assert.Single(month.Rows);
        HabitCellState State(int day) => row.Cells[day - 1].State;

        Assert.Equal(30, row.Cells.Count);
        Assert.Equal(HabitCellState.NotDue, State(19));
        Assert.Equal(HabitCellState.Done, State(20));
        Assert.Equal(HabitCellState.Skipped, State(22));
        Assert.Equal(HabitCellState.Open, State(25)); // today, not done yet
        Assert.Equal(HabitCellState.Future, State(26));
        Assert.Equal(1.0, row.Rate); // today doesn't count until it's done
        Assert.Equal((4, 4), (row.CurrentStreak, row.BestStreak)); // the skipped day doesn't break it
        Assert.Equal(4, row.Total);

        _app.Clock.NextDay();
        _app.Clock.NextDay(); // 25th missed
        row = Assert.Single((await _app.Habits.GetMonthAsync(new DateOnly(2026, 11, 1))).Rows);
        Assert.Equal(HabitCellState.Missed, row.Cells[24].State);
        Assert.Equal((0, 4), (row.CurrentStreak, row.BestStreak));
    }

    [Fact]
    public async Task Missing_yesterday_is_flagged_for_never_miss_twice()
    {
        await Base("Make bed");
        Assert.True(Assert.Single((await _app.Habits.GetDayAsync(Today)).Items).MissedYesterday);
    }

    [Fact]
    public async Task Avoid_habits_and_limits()
    {
        var sugar = await Base("No sugar", kind: HabitKind.Avoid);
        var coffee = await Base("Coffee", target: 2, kind: HabitKind.Avoid);

        Assert.False((await _app.Habits.GetDayAsync(Today)).Items.Single(i => i.Habit.Id == sugar.Id).Done); // needs a tick
        Assert.True((await Tick(sugar, Today)).Done);
        Assert.True((await Tick(coffee, Today, 2)).Done);
        Assert.False((await Tick(coffee, Today, 3)).Done); // over the limit

        var row = (await _app.Habits.GetMonthAsync(Today)).Rows.Single(r => r.Habit.Id == coffee.Id);
        Assert.Equal(HabitCellState.Missed, row.Cells[Today.Day - 1].State);
    }

    [Fact]
    public async Task Focus_habits_count_completed_focus_minutes()
    {
        var deep = await Base("Deep work", target: 60, focus: true);
        Assert.Equal("min", deep.Unit);

        _app.Db.FocusSessions.AddRange(
            new FocusSession { Date = Today, StartedAt = _app.Clock.UtcNow, ActualSeconds = 45 * 60, Status = FocusSessionStatus.Completed },
            new FocusSession { Date = Today, StartedAt = _app.Clock.UtcNow, ActualSeconds = 20 * 60, Status = FocusSessionStatus.EndedEarly },
            new FocusSession { Date = Today, StartedAt = _app.Clock.UtcNow, ActualSeconds = 90 * 60, Status = FocusSessionStatus.Running },
            new FocusSession { Date = Today.AddDays(-1), StartedAt = _app.Clock.UtcNow, ActualSeconds = 30 * 60, Status = FocusSessionStatus.Completed });
        await _app.Db.SaveChangesAsync();

        var item = Assert.Single((await _app.Habits.GetDayAsync(Today)).Items);
        Assert.Equal(65, item.Count); // running sessions and other days don't count
        Assert.True(item.Done);
    }

    [Fact]
    public async Task Copying_a_month_keeps_chosen_habits_and_skips_duplicates()
    {
        var nov = new DateOnly(2026, 11, 1);
        var dec = new DateOnly(2026, 12, 1);
        var sugar = await _app.Habits.CreateAsync(new SaveHabitRequest("No sugar", Month: nov, Kind: HabitKind.Avoid));
        var read = await _app.Habits.CreateAsync(new SaveHabitRequest("Read", Month: nov, Target: 20, Unit: "pages"));
        await _app.Habits.CreateAsync(new SaveHabitRequest("Stretch", Month: nov));
        await _app.Habits.CreateAsync(new SaveHabitRequest("read", Month: dec));

        var december = await _app.Habits.CopyMonthAsync(new CopyMonthRequest(nov, dec, [sugar.Id, read.Id]));

        Assert.Equal(["read", "No sugar"], december.Select(h => h.Title));
        var copy = december[1];
        Assert.Equal((HabitKind.Avoid, dec), (copy.Kind, copy.Repeat.StartDate));
        await Assert.ThrowsAsync<ValidationException>(() => _app.Habits.CopyMonthAsync(new CopyMonthRequest(nov, nov)));
    }

    [Fact]
    public async Task Month_intention_is_saved_and_cleared()
    {
        var note = await _app.Habits.SaveMonthNoteAsync(new DateOnly(2026, 12, 9), new SaveMonthNoteRequest(" Calm ", "🌙"));
        Assert.Equal(new HabitMonthNoteDto(new DateOnly(2026, 12, 1), "Calm", "🌙"), note);
        Assert.Equal("Calm", (await _app.Habits.GetMonthAsync(new DateOnly(2026, 12, 1))).Note?.Word);

        Assert.Null(await _app.Habits.SaveMonthNoteAsync(new DateOnly(2026, 12, 1), new SaveMonthNoteRequest("", null)));
        Assert.Equal(0, await _app.Db.HabitMonthNotes.CountAsync());
    }

    [Fact]
    public async Task Reordering_sets_the_order_within_a_list()
    {
        var a = await Base("A");
        var b = await Base("B");
        await _app.Habits.ReorderAsync(new ReorderHabitsRequest([b.Id, a.Id]));
        Assert.Equal(["B", "A"], (await _app.Habits.ListAsync(null)).Select(h => h.Title));
    }

    [Fact]
    public async Task Stats_include_habits_without_changing_todo_numbers()
    {
        var bed = await Base("Make bed");
        await Base("Walk");
        await Tick(bed, Today);
        var task = await _app.Tasks.CreateAsync(new Focus.Application.Tasks.CreateTaskRequest("A", PlannedDate: Today));
        await _app.Tasks.CompleteAsync(task.Id);

        var summary = await _app.Stats.GetSummaryAsync(Today, Today, null);
        var day = Assert.Single(summary.Days);
        Assert.Equal((1, 1), (day.Planned, day.Done));
        Assert.Equal((2, 1), (day.HabitsDue, day.HabitsDone));
        Assert.Equal(0.5, summary.Totals.HabitRate);
        Assert.Equal(1.0, summary.Totals.CompletionRate);

        var insights = await _app.Stats.GetInsightsAsync();
        Assert.Equal("Make bed", insights.HabitStreaks![0].Title);
    }

    [Fact]
    public async Task Mood_insight_needs_enough_days_and_a_real_difference()
    {
        var walk = await Base("Walk");
        var start = Today.AddDays(-12);
        for (var i = 0; i < 12; i++)
        {
            var date = start.AddDays(i);
            var walked = i % 2 == 0;
            if (walked) await Tick(walk, date);
            await _app.Days.SaveNoteAsync(date, new SaveDayNoteRequest(walked ? Mood.Great : Mood.Meh, null));
        }

        var insight = Assert.Single((await _app.Stats.GetInsightsAsync()).HabitMoods!);
        Assert.Equal((1.0, 0.0, 6, 6), (insight.GoodRateWith, insight.GoodRateWithout, insight.DaysWith, insight.DaysWithout));

        // With too few days there's nothing to say.
        await _app.Habits.DeleteAsync(walk.Id);
        var fresh = await Base("Read", repeat: DailyFrom(Today.AddDays(-3)));
        await Tick(fresh, Today.AddDays(-1));
        Assert.Empty((await _app.Stats.GetInsightsAsync()).HabitMoods!);
    }
}
