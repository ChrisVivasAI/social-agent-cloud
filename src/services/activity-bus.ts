import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class ActivityBus extends EventEmitter {
  private history: ActivityEvent[] = [];
  private maxHistory = 100;

  emitActivity(
    type: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const event: ActivityEvent = {
      id: randomUUID(),
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.emit("activity", event);
  }

  getRecentHistory(limit: number = 50): ActivityEvent[] {
    return this.history.slice(-limit);
  }
}

export const activityBus = new ActivityBus();
