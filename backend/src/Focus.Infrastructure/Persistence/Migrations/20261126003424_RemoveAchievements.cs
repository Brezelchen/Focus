using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Focus.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveAchievements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UnlockedAchievements");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UnlockedAchievements",
                columns: table => new
                {
                    Key = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    UnlockedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UnlockedAchievements", x => x.Key);
                });
        }
    }
}
