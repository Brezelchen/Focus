using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Focus.IntegrationTests;

public sealed class FocusApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"focus-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseSetting("ConnectionStrings:Focus", $"Data Source={_dbPath};Pooling=False");

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { File.Delete(_dbPath); } catch (IOException) { /* best effort */ }
    }
}

public sealed class ApiTests(FocusApiFactory factory) : IClassFixture<FocusApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private sealed record TagDto(int Id, string Name, string Color);
    private sealed record TaskDto(int Id, string Title, string Status, DateOnly? PlannedDate, int? EstimateMinutes, string Priority, TagDto? Tag, DateTime CreatedAt);
    private sealed record DayDto(DateOnly Date, List<TaskDto> Tasks, int Planned, int Done);

    private HttpClient Client(string localDate)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Local-Date", localDate);
        return client;
    }

    [Fact]
    public async Task Plan_complete_and_read_a_day()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var client = Client(today.ToString("yyyy-MM-dd"));

        var created = await client.PostAsJsonAsync("/api/tasks/quick", new { text = "Write report #work ~45m !high" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var task = (await created.Content.ReadFromJsonAsync<TaskDto>(Json))!;
        Assert.Equal("Write report", task.Title);
        Assert.Equal("work", task.Tag?.Name);
        Assert.Equal("high", task.Priority);
        Assert.Equal(DateTimeKind.Utc, task.CreatedAt.Kind);

        var moved = await client.PostAsJsonAsync($"/api/tasks/{task.Id}/move", new { date = today, index = 0 });
        moved.EnsureSuccessStatusCode();
        (await client.PostAsync($"/api/tasks/{task.Id}/complete", null)).EnsureSuccessStatusCode();

        var day = await client.GetFromJsonAsync<DayDto>($"/api/days/{today:yyyy-MM-dd}", Json);
        Assert.Contains(day!.Tasks, t => t.Id == task.Id && t.Status == "done");
        Assert.True(day.Done >= 1);
    }

    private sealed record SubtaskDto(int Id, string Title, bool IsDone);
    private sealed record TaskWithChecklist(int Id, List<SubtaskDto> Subtasks);
    private sealed record NoteDto(DateOnly Date, string? Mood, string? Reflection);

    [Fact]
    public async Task Checklist_and_reflection_endpoints()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var client = Client(today.ToString("yyyy-MM-dd"));

        var created = await client.PostAsJsonAsync("/api/tasks", new { title = "Pack", subtasks = new[] { "Passport" } });
        var task = (await created.Content.ReadFromJsonAsync<TaskWithChecklist>(Json))!;
        Assert.Single(task.Subtasks);

        var added = await client.PostAsJsonAsync($"/api/tasks/{task.Id}/subtasks", new { title = "Charger" });
        task = (await added.Content.ReadFromJsonAsync<TaskWithChecklist>(Json))!;
        Assert.Equal(["Passport", "Charger"], task.Subtasks.Select(s => s.Title));

        var ticked = await client.PatchAsJsonAsync($"/api/tasks/{task.Id}/subtasks/{task.Subtasks[0].Id}", new { isDone = true });
        task = (await ticked.Content.ReadFromJsonAsync<TaskWithChecklist>(Json))!;
        Assert.True(task.Subtasks[0].IsDone);

        var note = await client.PutAsJsonAsync($"/api/days/{today:yyyy-MM-dd}/note", new { mood = "great", reflection = "Good day" });
        note.EnsureSuccessStatusCode();
        Assert.Equal("great", (await note.Content.ReadFromJsonAsync<NoteDto>(Json))!.Mood);
        var cleared = await client.PutAsJsonAsync($"/api/days/{today:yyyy-MM-dd}/note", new { mood = (string?)null, reflection = "" });
        Assert.Equal(HttpStatusCode.NoContent, cleared.StatusCode);
    }

    private sealed record RepeatDto(string Frequency, int Interval, List<string> Weekdays, int? MonthDay, DateOnly StartDate);
    private sealed record RepeatingTask(int Id, int? TemplateId, RepeatDto? Repeat);

    [Fact]
    public async Task Repeat_endpoint_sets_and_clears_a_rule()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var client = Client(today.ToString("yyyy-MM-dd"));
        var task = (await (await client.PostAsJsonAsync("/api/tasks", new { title = "Plan week" })).Content.ReadFromJsonAsync<RepeatingTask>(Json))!;

        var set = await client.PutAsJsonAsync($"/api/tasks/{task.Id}/repeat",
            new { repeat = new { frequency = "weekly", interval = 1, weekdays = new[] { "monday", "friday" } } });
        set.EnsureSuccessStatusCode();
        var repeating = (await set.Content.ReadFromJsonAsync<RepeatingTask>(Json))!;
        Assert.NotNull(repeating.TemplateId);
        Assert.Equal("weekly", repeating.Repeat?.Frequency);
        Assert.Equal(["monday", "friday"], repeating.Repeat?.Weekdays);

        var cleared = await client.PutAsJsonAsync($"/api/tasks/{task.Id}/repeat", new { repeat = (object?)null });
        Assert.Null((await cleared.Content.ReadFromJsonAsync<RepeatingTask>(Json))!.Repeat);
    }

    [Fact]
    public async Task Errors_are_problem_details()
    {
        var client = Client(DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd"));

        var invalid = await client.PostAsJsonAsync("/api/tasks/quick", new { text = "   " });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal("application/problem+json", invalid.Content.Headers.ContentType?.MediaType);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/tasks/999999")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/does-not-exist")).StatusCode);
    }
}
