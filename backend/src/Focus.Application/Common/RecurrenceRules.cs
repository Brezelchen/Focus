using Focus.Application.Templates;
using Focus.Domain.Entities;

namespace Focus.Application.Common;

/// <summary>A validated repeat rule, ready to store in an entity's repeat columns.</summary>
internal readonly record struct NormalizedRecurrence(RepeatFrequency Frequency, int Interval, int Weekdays, int? MonthDay, DateOnly Start);

internal static class RecurrenceRules
{
    /// <summary>
    /// Validates a repeat rule and fills in defaults: weekly without days uses the start date's weekday,
    /// monthly without a day uses the start date's day of the month.
    /// </summary>
    public static NormalizedRecurrence Normalize(RecurrenceInput input, DateOnly defaultStart)
    {
        if (!Enum.IsDefined(input.Frequency)) throw new ValidationException("Unknown repeat frequency.");
        if (input.Interval is < 1 or > Recurrence.MaxInterval)
            throw new ValidationException($"Repeat every 1 to {Recurrence.MaxInterval}.");

        var start = input.StartDate ?? defaultStart;
        var weekdays = 0;
        int? monthDay = null;
        switch (input.Frequency)
        {
            case RepeatFrequency.Weekly:
                if (input.Weekdays?.Any(d => !Enum.IsDefined(d)) == true) throw new ValidationException("Unknown weekday.");
                weekdays = Recurrence.ToMask(input.Weekdays is { Count: > 0 } days ? days : [start.DayOfWeek]);
                break;
            case RepeatFrequency.Monthly:
                monthDay = input.MonthDay ?? start.Day;
                if (monthDay is < 1 or > 31) throw new ValidationException("The day of the month must be between 1 and 31.");
                break;
        }

        return new NormalizedRecurrence(input.Frequency, input.Interval, weekdays, monthDay, start);
    }
}
