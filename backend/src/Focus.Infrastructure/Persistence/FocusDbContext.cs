using Focus.Application.Abstractions;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Focus.Infrastructure.Persistence;

public sealed class FocusDbContext(DbContextOptions<FocusDbContext> options) : DbContext(options), IFocusDbContext
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TaskTemplate> Templates => Set<TaskTemplate>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<DayPlanEntry> DayPlanEntries => Set<DayPlanEntry>();
    public DbSet<FocusSession> FocusSessions => Set<FocusSession>();
    public DbSet<FocusSessionTask> FocusSessionTasks => Set<FocusSessionTask>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Tag>(e =>
        {
            e.Property(t => t.Name).HasMaxLength(40).IsRequired();
            e.Property(t => t.Color).HasMaxLength(20).IsRequired();
            e.HasIndex(t => t.Name).IsUnique();
        });

        model.Entity<TaskItem>(e =>
        {
            e.ToTable("Tasks");
            e.Property(t => t.Title).HasMaxLength(TaskItem.TitleMaxLength).IsRequired();
            e.Property(t => t.Notes).HasMaxLength(4000);
            e.HasOne(t => t.Tag).WithMany().HasForeignKey(t => t.TagId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.Template).WithMany().HasForeignKey(t => t.TemplateId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(t => new { t.PlannedDate, t.Status, t.SortOrder });
        });

        model.Entity<TaskTemplate>(e =>
        {
            e.ToTable("Templates");
            e.Property(t => t.Title).HasMaxLength(TaskItem.TitleMaxLength).IsRequired();
            e.Property(t => t.Notes).HasMaxLength(4000);
            e.Property(t => t.Icon).HasMaxLength(16).IsRequired();
            e.HasOne(t => t.Tag).WithMany().HasForeignKey(t => t.TagId).OnDelete(DeleteBehavior.SetNull);
        });

        model.Entity<DayPlanEntry>(e =>
        {
            e.HasOne(p => p.TaskItem).WithMany(t => t.PlanEntries).HasForeignKey(p => p.TaskItemId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(p => new { p.Date, p.TaskItemId }).IsUnique();
        });

        model.Entity<FocusSession>(e =>
        {
            e.HasIndex(s => s.Date);
        });

        model.Entity<FocusSessionTask>(e =>
        {
            e.HasKey(t => new { t.FocusSessionId, t.TaskItemId });
            e.HasOne(t => t.FocusSession).WithMany(s => s.Tasks).HasForeignKey(t => t.FocusSessionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.TaskItem).WithMany().HasForeignKey(t => t.TaskItemId).OnDelete(DeleteBehavior.Cascade);
        });
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder conventions)
    {
        // Store enums readably; dates as ISO text so they sort correctly in SQLite.
        conventions.Properties<Enum>().HaveConversion<string>().HaveMaxLength(20);

        // SQLite doesn't keep DateTimeKind; all timestamps are UTC, so mark them as such when reading.
        conventions.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        conventions.Properties<DateTime?>().HaveConversion<UtcDateTimeConverter>();
    }

    private sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
        v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
}
