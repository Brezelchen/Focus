using System.Globalization;
using System.Text.RegularExpressions;
using Focus.Domain.Entities;

namespace Focus.Application.Tasks;

public sealed record QuickAddResult(string Title, string? TagName, int? EstimateMinutes, Priority? Priority, DateOnly? DueDate = null);

/// <summary>
/// Parses quick-add text such as <c>Write report #work ~45m !high</c>.
/// <list type="bullet">
/// <item><c>#name</c> — tag (first one wins)</item>
/// <item><c>~45m</c>, <c>~45</c>, <c>~1h</c>, <c>~1.5h</c>, <c>~1h30m</c>, <c>~1h30</c> — estimate</item>
/// <item><c>!high</c>/<c>!h</c>/<c>!!</c>, <c>!low</c>/<c>!l</c>, <c>!normal</c>/<c>!n</c> — priority</item>
/// <item><c>@today</c>, <c>@tomorrow</c>/<c>@tmr</c>, <c>@fri</c>/<c>@friday</c> (next such day, today included),
/// <c>@nextweek</c> (next Monday), <c>@24.12</c>, <c>@24.12.2026</c>, <c>@2026-12-24</c> — due date</item>
/// </list>
/// Everything else becomes the title. Tokens that don't parse are kept in the title.
/// </summary>
public static partial class QuickAddParser
{
    [GeneratedRegex(@"^#([\p{L}\p{N}_-]{1,40})$")]
    private static partial Regex TagToken();

    [GeneratedRegex(@"^~(?:(?<h>\d+(?:[.,]\d+)?)h(?:(?<hm>\d{1,2})m?)?|(?<m>\d+)m?)$", RegexOptions.IgnoreCase)]
    private static partial Regex EstimateToken();

    public static QuickAddResult Parse(string text) => Parse(text, DateOnly.FromDateTime(DateTime.Today));

    public static QuickAddResult Parse(string text, DateOnly today)
    {
        string? tag = null;
        int? estimate = null;
        Priority? priority = null;
        DateOnly? due = null;
        var titleParts = new List<string>();

        foreach (var token in text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (due is null && TryParseDue(token, today, out var date))
            {
                due = date;
                continue;
            }

            if (tag is null && TagToken().Match(token) is { Success: true } tm)
            {
                tag = tm.Groups[1].Value;
                continue;
            }

            if (estimate is null && TryParseEstimate(token, out var minutes))
            {
                estimate = minutes;
                continue;
            }

            if (priority is null && TryParsePriority(token, out var p))
            {
                priority = p;
                continue;
            }

            titleParts.Add(token);
        }

        return new QuickAddResult(string.Join(' ', titleParts), tag, estimate, priority, due);
    }

    private static readonly string[] Weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    private static bool TryParseDue(string token, DateOnly today, out DateOnly date)
    {
        date = default;
        if (token.Length < 2 || token[0] != '@') return false;
        var v = token[1..].ToLowerInvariant();

        switch (v)
        {
            case "today":
                date = today;
                return true;
            case "tomorrow" or "tmr":
                date = today.AddDays(1);
                return true;
            case "nextweek":
                var toMonday = ((int)DayOfWeek.Monday - (int)today.DayOfWeek + 7) % 7;
                date = today.AddDays(toMonday == 0 ? 7 : toMonday); // always the *next* Monday
                return true;
        }

        // Weekday names: full or at least 3 letters ("fri", "friday").
        if (v.Length >= 3)
        {
            for (var d = 0; d < 7; d++)
            {
                if (Weekdays[d].StartsWith(v, StringComparison.Ordinal))
                {
                    date = today.AddDays((d - (int)today.DayOfWeek + 7) % 7);
                    return true;
                }
            }
        }

        if (DateOnly.TryParseExact(v, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date)) return true;
        if (DateOnly.TryParseExact(v, ["d.M.yyyy", "d.M.yy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out date)) return true;
        if (DateOnly.TryParseExact(v.TrimEnd('.') + "." + today.Year, "d.M.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
        {
            // Day.month without a year means the next such date.
            if (date < today) date = date.AddYears(1);
            return true;
        }

        return false;
    }

    private static bool TryParseEstimate(string token, out int minutes)
    {
        minutes = 0;
        var m = EstimateToken().Match(token);
        if (!m.Success) return false;

        double total;
        if (m.Groups["h"].Success)
        {
            var hours = double.Parse(m.Groups["h"].Value.Replace(',', '.'), CultureInfo.InvariantCulture);
            total = hours * 60 + (m.Groups["hm"].Success ? int.Parse(m.Groups["hm"].Value, CultureInfo.InvariantCulture) : 0);
        }
        else
        {
            total = int.Parse(m.Groups["m"].Value, CultureInfo.InvariantCulture);
        }

        minutes = (int)Math.Round(total);
        return minutes is > 0 and <= 24 * 60;
    }

    private static bool TryParsePriority(string token, out Priority priority)
    {
        priority = Priority.Normal;
        switch (token.ToLowerInvariant())
        {
            case "!!" or "!high" or "!h":
                priority = Priority.High;
                return true;
            case "!low" or "!l":
                priority = Priority.Low;
                return true;
            case "!normal" or "!n":
                priority = Priority.Normal;
                return true;
            default:
                return false;
        }
    }
}
