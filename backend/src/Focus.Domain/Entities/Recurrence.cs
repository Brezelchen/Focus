namespace Focus.Domain.Entities;

public enum RepeatFrequency
{
    /// <summary>Every <c>Interval</c> days, counted from the start date.</summary>
    Daily = 0,

    /// <summary>On the chosen weekdays, every <c>Interval</c> weeks (weeks start on Monday).</summary>
    Weekly = 1,

    /// <summary>On a day of the month, every <c>Interval</c> months. Day 31 means the last day in shorter months.</summary>
    Monthly = 2,
}

/// <summary>Repeat rules for recurring templates. Pure functions so they're easy to test.</summary>
public static class Recurrence
{
    public const int MaxInterval = 365;

    public static int WeekdayBit(DayOfWeek day) => 1 << (int)day;

    public static int ToMask(IEnumerable<DayOfWeek> days) => days.Aggregate(0, (mask, d) => mask | WeekdayBit(d));

    /// <summary>Weekdays in a mask, Monday first.</summary>
    public static IReadOnlyList<DayOfWeek> FromMask(int mask) =>
        Enumerable.Range(1, 7).Select(i => (DayOfWeek)(i % 7)).Where(d => (mask & WeekdayBit(d)) != 0).ToList();

    /// <summary>Whether a rule that started on <paramref name="start"/> has an occurrence on <paramref name="date"/>.</summary>
    public static bool Occurs(RepeatFrequency frequency, int interval, int weekdayMask, int? monthDay, DateOnly start, DateOnly date)
    {
        if (date < start) return false;
        interval = Math.Max(1, interval);

        switch (frequency)
        {
            case RepeatFrequency.Daily:
                return (date.DayNumber - start.DayNumber) % interval == 0;

            case RepeatFrequency.Weekly:
                if ((weekdayMask & WeekdayBit(date.DayOfWeek)) == 0) return false;
                var weeks = (MondayOf(date).DayNumber - MondayOf(start).DayNumber) / 7;
                return weeks % interval == 0;

            case RepeatFrequency.Monthly:
                var months = (date.Year * 12 + date.Month) - (start.Year * 12 + start.Month);
                if (months % interval != 0) return false;
                var day = Math.Min(monthDay ?? start.Day, DateTime.DaysInMonth(date.Year, date.Month));
                return date.Day == day;

            default:
                return false;
        }
    }

    private static DateOnly MondayOf(DateOnly date) => date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
}
