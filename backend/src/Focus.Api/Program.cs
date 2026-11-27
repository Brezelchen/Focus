using System.Text.Json;
using System.Text.Json.Serialization;
using Focus.Api.Auth;
using Focus.Api.Endpoints;
using Focus.Api.Infrastructure;
using Focus.Application;
using Focus.Application.Abstractions;
using Focus.Infrastructure;
using Focus.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// The SQLite file (and the keys that protect sign-in cookies) live in App_Data next to the app,
// unless a connection string / keys path is configured.
var dataDir = Path.Combine(builder.Environment.ContentRootPath, "App_Data");
var connectionString = builder.Configuration.GetConnectionString("Focus");
if (string.IsNullOrWhiteSpace(connectionString))
{
    Directory.CreateDirectory(dataDir);
    connectionString = $"Data Source={Path.Combine(dataDir, "focus.db")}";
}

builder.Services
    .AddApplication()
    .AddInfrastructure(connectionString)
    .AddFocusAuth(builder.Configuration, Path.Combine(dataDir, "keys"))
    .AddHttpContextAccessor()
    .AddSingleton(TimeProvider.System)
    .AddScoped<IClock, HttpClock>()
    .AddProblemDetails()
    .AddExceptionHandler<ApplicationExceptionHandler>()
    .AddOpenApi();

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<FocusDbContext>().Database.Migrate();
}

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// The production Angular build is emitted into wwwroot, so one process serves the app and the API.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Everything under /api needs a signed-in user, except the sign-in endpoints themselves.
var api = app.MapGroup("/api").RequireAuthorization();
api.MapAuthEndpoints()
    .MapTaskEndpoints()
    .MapTemplateEndpoints()
    .MapTagEndpoints()
    .MapFocusSessionEndpoints()
    .MapStatsEndpoints();
api.Map("{**rest}", () => Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not found"))
    .ExcludeFromDescription();

app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
