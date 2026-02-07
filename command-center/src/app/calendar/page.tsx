"use client";

import { CalendarView } from "@/components/calendar/calendar-view";

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Content Calendar</h2>
        <p className="text-sm text-muted-foreground mt-1">
          View and schedule content across your publishing calendar.
        </p>
      </div>
      <CalendarView />
    </div>
  );
}
