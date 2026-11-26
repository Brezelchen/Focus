using Focus.Application.Days;
using Focus.Application.FocusSessions;
using Focus.Application.Stats;
using Focus.Application.Tags;
using Focus.Application.Tasks;
using Focus.Application.Templates;
using Microsoft.Extensions.DependencyInjection;

namespace Focus.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services) => services
        .AddScoped<TaskService>()
        .AddScoped<DayService>()
        .AddScoped<TagService>()
        .AddScoped<TemplateService>()
        .AddScoped<RecurrenceService>()
        .AddScoped<FocusSessionService>()
        .AddScoped<StatsService>();
}
