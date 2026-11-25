using Focus.Application.Days;
using Focus.Application.Tasks;
using Focus.Application.Templates;

namespace Focus.Api.Endpoints;

public static class TaskEndpoints
{
    public static RouteGroupBuilder MapTaskEndpoints(this RouteGroupBuilder api)
    {
        var tasks = api.MapGroup("/tasks").WithTags("Tasks");
        tasks.MapGet("/", (TaskService s, int? tagId, string? q, CancellationToken ct) => s.GetBacklogAsync(tagId, q, ct))
            .WithSummary("Backlog: open tasks without a planned day");
        tasks.MapGet("/{id:int}", (int id, TaskService s, CancellationToken ct) => s.GetAsync(id, ct));
        tasks.MapPost("/", async (CreateTaskRequest r, TaskService s, CancellationToken ct) =>
        {
            var task = await s.CreateAsync(r, ct);
            return Results.Created($"/api/tasks/{task.Id}", task);
        });
        tasks.MapPost("/quick", async (QuickAddRequest r, TaskService s, CancellationToken ct) =>
        {
            var task = await s.QuickAddAsync(r, ct);
            return Results.Created($"/api/tasks/{task.Id}", task);
        }).WithSummary("Create a task from text such as: Write report #work ~45m !high");
        tasks.MapPut("/{id:int}", (int id, UpdateTaskRequest r, TaskService s, CancellationToken ct) => s.UpdateAsync(id, r, ct));
        tasks.MapPost("/{id:int}/complete", (int id, TaskService s, CancellationToken ct) => s.CompleteAsync(id, ct));
        tasks.MapPost("/{id:int}/reopen", (int id, TaskService s, CancellationToken ct) => s.ReopenAsync(id, ct));
        tasks.MapPost("/{id:int}/move", (int id, MoveTaskRequest r, TaskService s, CancellationToken ct) => s.MoveAsync(id, r, ct))
            .WithSummary("Move to a day (or the backlog when date is null) at a position");
        tasks.MapPost("/{id:int}/save-as-template", (int id, TemplateService s, CancellationToken ct) => s.CreateFromTaskAsync(id, ct));
        tasks.MapDelete("/{id:int}", async (int id, TaskService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, ct);
            return Results.NoContent();
        });

        var days = api.MapGroup("/days").WithTags("Days");
        days.MapGet("/{date}", (DateOnly date, DayService s, CancellationToken ct) => s.GetDayAsync(date, ct));
        days.MapPost("/rollover", (DayService s, CancellationToken ct) => s.RolloverAsync(ct))
            .WithSummary("Return unfinished tasks of past days to the backlog");

        return api;
    }
}
