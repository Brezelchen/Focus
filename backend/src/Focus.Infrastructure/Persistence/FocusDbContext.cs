using Focus.Application.Abstractions;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Focus.Infrastructure.Persistence;

/// <summary>
/// Every query only sees the signed-in user's data (global query filters), and new rows are stamped with that
/// user when saved, so the application services don't need to know about users.
/// </summary>
public sealed class FocusDbContext(DbContextOptions<FocusDbContext> options, ICurrentUser? currentUser = null)
    : DbContext(options), IFocusDbContext
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TaskTemplate> Templates => Set<TaskTemplate>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<DayPlanEntry> DayPlanEntries => Set<DayPlanEntry>();
    public DbSet<FocusSession> FocusSessions => Set<FocusSession>();
    public DbSet<FocusSessionTask> FocusSessionTasks => Set<FocusSessionTask>();
    public DbSet<Subtask> Subtasks => Set<Subtask>();
    public DbSet<DayNote> DayNotes => Set<DayNote>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Habit> Habits => Set<Habit>();
    public DbSet<HabitCheckIn> HabitCheckIns => Set<HabitCheckIn>();
    public DbSet<HabitMonthNote> HabitMonthNotes => Set<HabitMonthNote>();

    /// <summary>The signed-in user's id, or -1 (matches nothing) when nobody is signed in.</summary>
    private int CurrentUserId => currentUser?.UserId ?? -1;

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampOwner();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampOwner();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    private void StampOwner()
    {
        foreach (var entry in ChangeTracker.Entries<IUserOwned>())
        {
            if (entry.State != EntityState.Added || entry.Entity.UserId is not null) continue;
            entry.Entity.UserId = currentUser?.UserId
                ?? throw new InvalidOperationException($"Can't save a {entry.Entity.GetType().Name} without a signed-in user.");
        }
    }

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<User>(e =>
        {
            e.Property(u => u.DisplayName).HasMaxLength(User.NameMaxLength).IsRequired();
            e.Property(u => u.Email).HasMaxLength(User.EmailMaxLength);
            e.Property(u => u.GitHubLogin).HasMaxLength(100);
            e.Property(u => u.AvatarUrl).HasMaxLength(500);
            e.HasIndex(u => u.Email).IsUnique();
            e.HasIndex(u => u.GitHubId).IsUnique();
        });

        OwnedByUser<TaskItem>(model);
        OwnedByUser<TaskTemplate>(model);
        OwnedByUser<Tag>(model);
        OwnedByUser<FocusSession>(model);
        OwnedByUser<DayNote>(model);
        OwnedByUser<Habit>(model);
        OwnedByUser<HabitMonthNote>(model);
        // Child rows are only reachable through their (filtered) parent.
        model.Entity<DayPlanEntry>().HasQueryFilter(p => p.TaskItem.UserId == CurrentUserId);
        model.Entity<Subtask>().HasQueryFilter(s => s.TaskItem.UserId == CurrentUserId);
        model.Entity<FocusSessionTask>().HasQueryFilter(t => t.FocusSession.UserId == CurrentUserId);
        model.Entity<HabitCheckIn>().HasQueryFilter(c => c.Habit.UserId == CurrentUserId);

        model.Entity<Tag>(e =>
        {
            e.Property(t => t.Name).HasMaxLength(40).IsRequired();
            e.Property(t => t.Color).HasMaxLength(20).IsRequired();
            e.HasIndex(t => new { t.UserId, t.Name }).IsUnique();
        });

        model.Entity<TaskItem>(e =>
        {
            e.ToTable("Tasks");
            e.Property(t => t.Title).HasMaxLength(TaskItem.TitleMaxLength).IsRequired();
            e.Property(t => t.Notes).HasMaxLength(4000);
            e.HasOne(t => t.Tag).WithMany().HasForeignKey(t => t.TagId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(t => t.Template).WithMany().HasForeignKey(t => t.TemplateId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(t => new { t.UserId, t.PlannedDate, t.Status, t.SortOrder });
        });

        model.Entity<TaskTemplate>(e =>
        {
            e.ToTable("Templates");
            e.Property(t => t.Title).HasMaxLength(TaskItem.TitleMaxLength).IsRequired();
            e.Property(t => t.Notes).HasMaxLength(4000);
            e.Property(t => t.Icon).HasMaxLength(16).IsRequired();
            e.PrimitiveCollection(t => t.Checklist); // stored as a JSON array
            e.HasOne(t => t.Tag).WithMany().HasForeignKey(t => t.TagId).OnDelete(DeleteBehavior.SetNull);
        });

        model.Entity<DayPlanEntry>(e =>
        {
            e.HasOne(p => p.TaskItem).WithMany(t => t.PlanEntries).HasForeignKey(p => p.TaskItemId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(p => new { p.Date, p.TaskItemId }).IsUnique();
        });

        model.Entity<Subtask>(e =>
        {
            e.Property(s => s.Title).HasMaxLength(Subtask.TitleMaxLength).IsRequired();
            e.HasOne(s => s.TaskItem).WithMany(t => t.Subtasks).HasForeignKey(s => s.TaskItemId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(s => new { s.TaskItemId, s.SortOrder });
        });

        model.Entity<DayNote>(e =>
        {
            e.HasIndex(n => new { n.UserId, n.Date }).IsUnique();
            e.Property(n => n.Reflection).HasMaxLength(DayNote.ReflectionMaxLength);
        });

        model.Entity<Habit>(e =>
        {
            e.Property(h => h.Title).HasMaxLength(Habit.TitleMaxLength).IsRequired();
            e.Property(h => h.Icon).HasMaxLength(16).IsRequired();
            e.Property(h => h.Unit).HasMaxLength(Habit.UnitMaxLength);
            e.HasIndex(h => new { h.UserId, h.Month, h.SortOrder });
        });

        model.Entity<HabitCheckIn>(e =>
        {
            e.HasOne(c => c.Habit).WithMany(h => h.CheckIns).HasForeignKey(c => c.HabitId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(c => new { c.HabitId, c.Date }).IsUnique();
        });

        model.Entity<HabitMonthNote>(e =>
        {
            e.Property(n => n.Word).HasMaxLength(HabitMonthNote.WordMaxLength);
            e.Property(n => n.Emoji).HasMaxLength(16);
            e.HasIndex(n => new { n.UserId, n.Month }).IsUnique();
        });

        model.Entity<FocusSession>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.Date });
        });

        model.Entity<FocusSessionTask>(e =>
        {
            e.HasKey(t => new { t.FocusSessionId, t.TaskItemId });
            e.HasOne(t => t.FocusSession).WithMany(s => s.Tasks).HasForeignKey(t => t.FocusSessionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.TaskItem).WithMany().HasForeignKey(t => t.TaskItemId).OnDelete(DeleteBehavior.Cascade);
        });
    }

    private void OwnedByUser<T>(ModelBuilder model) where T : class, IUserOwned =>
        model.Entity<T>(e =>
        {
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.UserId == CurrentUserId);
        });

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
