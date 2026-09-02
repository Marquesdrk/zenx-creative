import { describe, expect, it } from "vitest";
import { BEST_TIME_SLOTS, pickTimeSlots, planSchedule } from "./plan";

describe("pickTimeSlots", () => {
  it("returns all slots when count matches the full list", () => {
    expect(pickTimeSlots(BEST_TIME_SLOTS.length)).toEqual(BEST_TIME_SLOTS);
  });

  it("spreads a single slot in the middle of the day, not the first slot", () => {
    expect(pickTimeSlots(1)).toEqual(["15:00"]);
  });

  it("spreads two slots across morning and evening instead of two consecutive ones", () => {
    const slots = pickTimeSlots(2);
    expect(slots).toEqual(["08:00", "21:00"]);
  });

  it("clamps counts above the available slot list", () => {
    expect(pickTimeSlots(99)).toEqual(BEST_TIME_SLOTS);
  });
});

describe("planSchedule", () => {
  it("assigns videosPerDay items to each day before moving to the next day", () => {
    const from = new Date("2026-01-01T06:00:00");
    const schedule = planSchedule(5, 2, from);
    expect(schedule).toHaveLength(5);
    // 2/day → days 0,0,1,1,2
    const days = schedule.map((d) => d.getDate());
    expect(days).toEqual([1, 1, 2, 2, 3]);
  });

  it("never schedules a time that has already passed today", () => {
    // With 2 videos/day the slots are 08:00 and 21:00 — at 13:00, 21:00 is still ahead today.
    const from = new Date("2026-01-01T13:00:00");
    const schedule = planSchedule(2, 2, from);
    expect(schedule[0].getDate()).toBe(1);
    expect(schedule[0].getHours()).toBe(21);
    expect(schedule[1].getDate()).toBe(2);
  });

  it("starts tomorrow entirely when every slot for today has passed", () => {
    const from = new Date("2026-01-01T23:00:00");
    const schedule = planSchedule(1, 1, from);
    expect(schedule[0].getDate()).toBe(2);
  });

  it("returns timestamps in ascending order", () => {
    const from = new Date("2026-01-01T00:00:00");
    const schedule = planSchedule(10, 3, from);
    for (let i = 1; i < schedule.length; i += 1) {
      expect(schedule[i].getTime()).toBeGreaterThan(schedule[i - 1].getTime());
    }
  });
});
