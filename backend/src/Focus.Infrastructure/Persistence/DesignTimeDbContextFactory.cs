using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Focus.Infrastructure.Persistence;

/// <summary>
/// Lets <c>dotnet ef</c> create migrations with this project as the startup project, so the API
/// doesn't need to be rebuilt (or stopped) to add a migration.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<FocusDbContext>
{
    public FocusDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<FocusDbContext>().UseSqlite("Data Source=design-time.db").Options);
}
