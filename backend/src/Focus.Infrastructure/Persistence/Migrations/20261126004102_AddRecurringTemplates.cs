using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Focus.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRecurringTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RepeatFrequency",
                table: "Templates",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RepeatInterval",
                table: "Templates",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateOnly>(
                name: "RepeatLastRun",
                table: "Templates",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RepeatMonthDay",
                table: "Templates",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "RepeatStart",
                table: "Templates",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RepeatWeekdays",
                table: "Templates",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RepeatFrequency",
                table: "Templates");

            migrationBuilder.DropColumn(
                name: "RepeatInterval",
                table: "Templates");

            migrationBuilder.DropColumn(
                name: "RepeatLastRun",
                table: "Templates");

            migrationBuilder.DropColumn(
                name: "RepeatMonthDay",
                table: "Templates");

            migrationBuilder.DropColumn(
                name: "RepeatStart",
                table: "Templates");

            migrationBuilder.DropColumn(
                name: "RepeatWeekdays",
                table: "Templates");
        }
    }
}
