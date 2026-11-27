using System.Globalization;
using Focus.Application.Common;
using Focus.Application.Habits;

namespace Focus.Api.Endpoints;

public static class HabitEndpoints
{
    public static RouteGroupBuilder MapHabitEndpoints(this RouteGroupBuilder api)
    {
        var habits = api.MapGroup("/habits").WithTags("Habits");

        habits.MapGet("/", (string? month, HabitService s, CancellationToken ct) => s.ListAsync(month is null ? null : ParseMonth(month), ct))
            .WithSummary("The base list, plus a month's habits with ?month=yyyy-MM (archived included)");
        habits.MapGet("/{id:int}", (int id, HabitService s, CancellationToken ct) => s.GetAsync(id, ct));
        habits.MapPost("/", async (SaveHabitRequest r, HabitService s, CancellationToken ct) =>
        {
            var habit = await s.CreateAsync(r, ct);
            return Results.Created($"/api/habits/{habit.Id}", habit);
        });
        habits.MapPut("/{id:int}", (int id, SaveHabitRequest r, HabitService s, CancellationToken ct) => s.UpdateAsync(id, r, ct));
        habits.MapDelete("/{id:int}", async (int id, HabitService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, ct);
            return Results.NoContent();
        }).WithSummary("Delete a habit and its history (archive it to keep the history)");
        habits.MapPost("/{id:int}/archive", (int id, HabitService s, CancellationToken ct) => s.ArchiveAsync(id, ct));
        habits.MapPost("/{id:int}/unarchive", (int id, HabitService s, CancellationToken ct) => s.UnarchiveAsync(id, ct));
        habits.MapPost("/reorder", async (ReorderHabitsRequest r, HabitService s, CancellationToken ct) =>
        {
            await s.ReorderAsync(r, ct);
            return Results.NoContent();
        });
        habits.MapPost("/copy-month", (CopyMonthRequest r, HabitService s, CancellationToken ct) => s.CopyMonthAsync(r, ct))
            .WithSummary("Carry month habits over to another month (all, or the given ids)");

        habits.MapGet("/day/{date}", (DateOnly date, HabitService s, CancellationToken ct) => s.GetDayAsync(date, ct))
            .WithSummary("Habits scheduled on a day, with check-ins");
        habits.MapPut("/{id:int}/check-ins/{date}", (int id, DateOnly date, SetCheckInRequest r, HabitService s, CancellationToken ct) =>
            s.SetCheckInAsync(id, date, r, ct))
            .WithSummary("Set the count (or mark skipped) for a day; count 0 clears it");
        habits.MapGet("/month/{month}", (string month, HabitService s, CancellationToken ct) => s.GetMonthAsync(ParseMonth(month), ct))
            .WithSummary("Month grid (yyyy-MM): one row per habit, one cell per day");
        habits.MapGet("/{id:int}/history", (int id, DateOnly? from, DateOnly? to, HabitService s, CancellationToken ct) =>
            s.GetHistoryAsync(id, from, to, ct))
            .WithSummary("One habit's history (default: the last 365 days)");
        habits.MapPut("/month/{month}/note", async (string month, SaveMonthNoteRequest r, HabitService s, CancellationToken ct) =>
            await s.SaveMonthNoteAsync(ParseMonth(month), r, ct) is { } note ? Results.Ok(note) : Results.NoContent())
            .WithSummary("Set the month's intention (word + emoji); empty deletes it");

        return api;
    }

    private static DateOnly ParseMonth(string month) =>
        DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d
            : throw new ValidationException("Months look like 2026-12.");
}
