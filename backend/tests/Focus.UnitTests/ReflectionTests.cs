using Focus.Application.Common;
using Focus.Application.Days;
using Focus.Domain.Entities;

namespace Focus.UnitTests;

public sealed class ReflectionTests : IDisposable
{
    private readonly TestApp _app = new();
    private DateOnly Today => _app.Clock.Today;

    public void Dispose() => _app.Dispose();

    [Fact]
    public async Task A_reflection_is_saved_updated_and_shown_with_the_day_and_in_stats()
    {
        await _app.Days.SaveNoteAsync(Today, new SaveDayNoteRequest(Mood.Good, "  Shipped the report  "));
        var note = await _app.Days.SaveNoteAsync(Today, new SaveDayNoteRequest(Mood.Great, "Shipped the report"));

        Assert.Equal(Mood.Great, note!.Mood);
        var day = await _app.Days.GetDayAsync(Today);
        Assert.Equal("Shipped the report", day.Note?.Reflection);

        var stats = await _app.Stats.GetSummaryAsync(Today.AddDays(-1), Today, null);
        Assert.Null(stats.Days[0].Mood);
        Assert.Equal(Mood.Great, stats.Days[1].Mood);
        Assert.Equal("Shipped the report", stats.Days[1].Reflection);
    }

    [Fact]
    public async Task An_empty_reflection_deletes_the_note()
    {
        await _app.Days.SaveNoteAsync(Today, new SaveDayNoteRequest(Mood.Okay, null));
        var result = await _app.Days.SaveNoteAsync(Today, new SaveDayNoteRequest(null, "   "));

        Assert.Null(result);
        Assert.Null((await _app.Days.GetDayAsync(Today)).Note);
    }

    [Fact]
    public async Task Past_days_can_be_reflected_on_but_future_days_cannot()
    {
        await _app.Days.SaveNoteAsync(Today.AddDays(-3), new SaveDayNoteRequest(Mood.Meh, "Tired"));
        await Assert.ThrowsAsync<ValidationException>(() =>
            _app.Days.SaveNoteAsync(Today.AddDays(1), new SaveDayNoteRequest(Mood.Good, null)));
    }

    [Fact]
    public async Task Reflections_have_a_length_limit()
    {
        await Assert.ThrowsAsync<ValidationException>(() =>
            _app.Days.SaveNoteAsync(Today, new SaveDayNoteRequest(null, new string('x', DayNote.ReflectionMaxLength + 1))));
    }
}
