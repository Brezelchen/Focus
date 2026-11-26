using Focus.Application.FocusSessions;
using Focus.Application.Stats;
using Focus.Application.Tags;
using Focus.Application.Templates;

namespace Focus.Api.Endpoints;

public static class OtherEndpoints
{
    public static RouteGroupBuilder MapTemplateEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/templates").WithTags("Templates");
        g.MapGet("/", (TemplateService s, CancellationToken ct) => s.GetAllAsync(ct));
        g.MapPost("/", async (SaveTemplateRequest r, TemplateService s, CancellationToken ct) =>
        {
            var t = await s.CreateAsync(r, ct);
            return Results.Created($"/api/templates/{t.Id}", t);
        });
        g.MapPut("/{id:int}", (int id, SaveTemplateRequest r, TemplateService s, CancellationToken ct) => s.UpdateAsync(id, r, ct));
        g.MapDelete("/{id:int}", async (int id, TemplateService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, ct);
            return Results.NoContent();
        });
        g.MapPut("/{id:int}/repeat", (int id, SetRepeatRequest r, RecurrenceService s, CancellationToken ct) => s.SetTemplateRepeatAsync(id, r, ct))
            .WithSummary("Set a template's repeat rule, or stop it with { repeat: null }");
        g.MapPost("/{id:int}/instantiate", (int id, InstantiateTemplateRequest r, TemplateService s, CancellationToken ct) => s.InstantiateAsync(id, r, ct));
        return api;
    }

    public static RouteGroupBuilder MapTagEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/tags").WithTags("Tags");
        g.MapGet("/", (TagService s, CancellationToken ct) => s.GetAllAsync(ct));
        g.MapPost("/", async (SaveTagRequest r, TagService s, CancellationToken ct) =>
        {
            var t = await s.CreateAsync(r, ct);
            return Results.Created($"/api/tags/{t.Id}", t);
        });
        g.MapPut("/{id:int}", (int id, SaveTagRequest r, TagService s, CancellationToken ct) => s.UpdateAsync(id, r, ct));
        g.MapDelete("/{id:int}", async (int id, TagService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, ct);
            return Results.NoContent();
        });
        return api;
    }

    public static RouteGroupBuilder MapFocusSessionEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/focus-sessions").WithTags("Focus sessions");
        g.MapPost("/", async (StartSessionRequest r, FocusSessionService s, CancellationToken ct) =>
        {
            var session = await s.StartAsync(r, ct);
            return Results.Created($"/api/focus-sessions/{session.Id}", session);
        });
        g.MapGet("/{id:int}", (int id, FocusSessionService s, CancellationToken ct) => s.GetAsync(id, ct));
        g.MapPost("/{id:int}/finish", (int id, FinishSessionRequest r, FocusSessionService s, CancellationToken ct) => s.FinishAsync(id, r, ct));
        return api;
    }

    public static RouteGroupBuilder MapStatsEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/stats").WithTags("Stats");
        g.MapGet("/summary", (DateOnly? from, DateOnly? to, double? threshold, StatsService s, CancellationToken ct) =>
            s.GetSummaryAsync(from, to, threshold, ct));
        g.MapGet("/insights", (StatsService s, CancellationToken ct) => s.GetInsightsAsync(ct));
        return api;
    }
}
