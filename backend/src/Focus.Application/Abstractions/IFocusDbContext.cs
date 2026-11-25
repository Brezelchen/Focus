using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Abstractions;

public interface IFocusDbContext
{
    DbSet<TaskItem> Tasks { get; }
    DbSet<TaskTemplate> Templates { get; }
    DbSet<Tag> Tags { get; }
    DbSet<DayPlanEntry> DayPlanEntries { get; }
    DbSet<FocusSession> FocusSessions { get; }
    DbSet<FocusSessionTask> FocusSessionTasks { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
