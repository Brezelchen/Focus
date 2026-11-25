using Focus.Application.Days;
using Focus.Application.Stats;

namespace Focus.UnitTests;

public class StreakCalculatorTests
{
    private static readonly DateOnly Today = new(2026, 11, 25);

    private static DaySummary Day(int daysAgo, int planned, int done) => new(Today.AddDays(-daysAgo), planned, done);

    [Fact]
    public void Counts_consecutive_days_meeting_the_threshold()
    {
        var days = new[] { Day(3, 5, 5), Day(2, 5, 4), Day(1, 4, 4) };
        Assert.Equal((3, 3), StreakCalculator.Compute(days, Today, 0.8));
    }

    [Fact]
    public void A_missed_day_resets_the_current_streak_but_keeps_the_best()
    {
        var days = new[] { Day(4, 2, 2), Day(3, 2, 2), Day(2, 5, 1), Day(1, 1, 1) };
        Assert.Equal((1, 2), StreakCalculator.Compute(days, Today, 0.8));
    }

    [Fact]
    public void Days_without_a_plan_do_not_break_the_streak()
    {
        // Nothing planned 2 days ago (no entry at all) - a rest day.
        var days = new[] { Day(3, 3, 3), Day(1, 2, 2) };
        Assert.Equal((2, 2), StreakCalculator.Compute(days, Today, 0.8));
    }

    [Fact]
    public void Today_in_progress_does_not_break_the_streak_but_counts_once_hit()
    {
        var yesterday = Day(1, 2, 2);
        Assert.Equal((1, 1), StreakCalculator.Compute([yesterday, Day(0, 4, 1)], Today, 0.8));
        Assert.Equal((2, 2), StreakCalculator.Compute([yesterday, Day(0, 4, 4)], Today, 0.8));
    }

    [Fact]
    public void Threshold_is_inclusive()
    {
        Assert.Equal((1, 1), StreakCalculator.Compute([Day(1, 5, 4)], Today, 0.8));
        Assert.Equal((0, 0), StreakCalculator.Compute([Day(1, 5, 3)], Today, 0.8));
    }
}
