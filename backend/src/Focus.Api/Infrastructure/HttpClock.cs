using System.Globalization;
using Focus.Application.Abstractions;

namespace Focus.Api.Infrastructure;

/// <summary>
/// Uses the client's local calendar date from the <c>X-Local-Date</c> header (yyyy-MM-dd) so "today" follows the
/// user's time zone. Falls back to the server's local date when the header is missing or implausible.
/// </summary>
public sealed class HttpClock(IHttpContextAccessor http, TimeProvider time) : IClock
{
    public const string HeaderName = "X-Local-Date";

    public DateTime UtcNow => time.GetUtcNow().UtcDateTime;

    public DateOnly Today
    {
        get
        {
            var header = http.HttpContext?.Request.Headers[HeaderName].ToString();
            var utcToday = DateOnly.FromDateTime(UtcNow);
            if (DateOnly.TryParseExact(header, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var local)
                && Math.Abs(local.DayNumber - utcToday.DayNumber) <= 1)
            {
                return local;
            }

            return DateOnly.FromDateTime(time.GetLocalNow().DateTime);
        }
    }
}
