using Focus.Application.Abstractions;
using Focus.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Focus.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<FocusDbContext>(o => o.UseSqlite(connectionString));
        services.AddScoped<IFocusDbContext>(sp => sp.GetRequiredService<FocusDbContext>());
        return services;
    }
}
