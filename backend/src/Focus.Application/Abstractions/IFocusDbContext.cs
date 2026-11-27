using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace Focus.Application.Abstractions;

public interface IFocusDbContext
{
    DbSet<TaskItem> Tasks { get; }
    DbSet<TaskTemplate> Templates { get; }
    DbSet<Tag> Tags { get; }
    DbSet<DayPlanEntry> DayPlanEntries { get; }
    DbSet<FocusSession> FocusSessions { get; }
    DbSet<FocusSessionTask> FocusSessionTasks { get; }
    DbSet<Subtask> Subtasks { get; }
    DbSet<DayNote> DayNotes { get; }
    DbSet<User> Users { get; }

    EntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
