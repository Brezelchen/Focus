using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Focus.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddHabits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HabitMonthNotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: true),
                    Month = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Word = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    Emoji = table.Column<string>(type: "TEXT", maxLength: 16, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HabitMonthNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HabitMonthNotes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Habits",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Icon = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    Month = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    RepeatFrequency = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    RepeatInterval = table.Column<int>(type: "INTEGER", nullable: false),
                    RepeatWeekdays = table.Column<int>(type: "INTEGER", nullable: false),
                    RepeatMonthDay = table.Column<int>(type: "INTEGER", nullable: true),
                    RepeatStart = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Target = table.Column<int>(type: "INTEGER", nullable: true),
                    Unit = table.Column<string>(type: "TEXT", maxLength: 12, nullable: true),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    TimeOfDay = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    CountsFocusMinutes = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ArchivedAt = table.Column<DateOnly>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Habits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Habits_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "HabitCheckIns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    HabitId = table.Column<int>(type: "INTEGER", nullable: false),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Count = table.Column<int>(type: "INTEGER", nullable: false),
                    Skipped = table.Column<bool>(type: "INTEGER", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HabitCheckIns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HabitCheckIns_Habits_HabitId",
                        column: x => x.HabitId,
                        principalTable: "Habits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HabitCheckIns_HabitId_Date",
                table: "HabitCheckIns",
                columns: new[] { "HabitId", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HabitMonthNotes_UserId_Month",
                table: "HabitMonthNotes",
                columns: new[] { "UserId", "Month" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Habits_UserId_Month_SortOrder",
                table: "Habits",
                columns: new[] { "UserId", "Month", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HabitCheckIns");

            migrationBuilder.DropTable(
                name: "HabitMonthNotes");

            migrationBuilder.DropTable(
                name: "Habits");
        }
    }
}
