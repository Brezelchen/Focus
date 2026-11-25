namespace Focus.Application.Abstractions;

/// <summary>
/// "Now" and "today" for the current request. Today is the user's <em>local</em> calendar date
/// (sent by the client), so day boundaries follow the user's time zone rather than the server's.
/// </summary>
public interface IClock
{
    DateTime UtcNow { get; }
    DateOnly Today { get; }
}
