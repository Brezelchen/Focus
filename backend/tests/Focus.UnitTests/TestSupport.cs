using Focus.Application.Abstractions;
using Focus.Application.Days;
using Focus.Application.Stats;
using Focus.Application.Tags;
using Focus.Application.Tasks;
using Focus.Application.Templates;
using Focus.Domain.Entities;
using Focus.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Focus.UnitTests;

/// <summary>The signed-in user for tests. Change <see cref="UserId"/> to act as someone else.</summary>
public sealed class FakeCurrentUser : ICurrentUser
{
    public int? UserId { get; set; }
}

public sealed class FakeClock : IClock
{
    public DateTime UtcNow { get; set; } = new(2026, 11, 25, 9, 0, 0, DateTimeKind.Utc);
    public DateOnly Today { get; set; } = new(2026, 11, 25);

    public void NextDay()
    {
        Today = Today.AddDays(1);
        UtcNow = UtcNow.AddDays(1);
    }
}

/// <summary>A real FocusDbContext on an in-memory SQLite database, plus the services wired to it.</summary>
public sealed class TestApp : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public TestApp()
    {
        _connection.Open();
        Db = new FocusDbContext(new DbContextOptionsBuilder<FocusDbContext>().UseSqlite(_connection).Options, User);
        Db.Database.Migrate();
        User.UserId = AddUser("Tester");

        Tags = new TagService(Db);
        Tasks = new TaskService(Db, Clock, Tags);
        Recurrence = new RecurrenceService(Db, Clock, Tasks);
        Days = new DayService(Db, Clock, Recurrence);
        Templates = new TemplateService(Db, Clock, Tags, Tasks, Recurrence);
        Stats = new StatsService(Db, Clock);
    }

    public FakeClock Clock { get; } = new();
    public FakeCurrentUser User { get; } = new();
    public FocusDbContext Db { get; }
    public TagService Tags { get; }
    public TaskService Tasks { get; }
    public DayService Days { get; }
    public TemplateService Templates { get; }
    public RecurrenceService Recurrence { get; }
    public StatsService Stats { get; }

    /// <summary>Creates another account and returns its id.</summary>
    public int AddUser(string name)
    {
        var user = new User { DisplayName = name, CreatedAt = Clock.UtcNow };
        Db.Users.Add(user);
        Db.SaveChanges();
        return user.Id;
    }

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
    }
}
