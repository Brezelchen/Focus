namespace Focus.Domain.Entities;

public enum TaskItemStatus
{
    Open = 0,
    Done = 1,
}

public enum Priority
{
    Low = 0,
    Normal = 1,
    High = 2,
}

/// <summary>What happened to a task that was planned for a specific day.</summary>
public enum PlanOutcome
{
    /// <summary>Still on the day's list and not done yet.</summary>
    Pending = 0,

    /// <summary>Done while planned for that day.</summary>
    Completed = 1,

    /// <summary>Left the day unfinished: moved back to the backlog, moved to another day, or rolled over.</summary>
    NotCompleted = 2,
}

public enum FocusSessionStatus
{
    Running = 0,
    Completed = 1,
    EndedEarly = 2,
}

/// <summary>How a day felt, picked in the end-of-day reflection.</summary>
public enum Mood
{
    Rough = 0,
    Meh = 1,
    Okay = 2,
    Good = 3,
    Great = 4,
}
