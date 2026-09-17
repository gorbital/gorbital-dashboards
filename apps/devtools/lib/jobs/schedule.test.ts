import { describe, expect, it } from "vitest";
import { describeEvery, describeSchedule, hasPlainSchedule } from "./schedule";

describe("describeSchedule", () => {
  it("reads on demand and the descriptors", () => {
    expect(describeSchedule("")).toBe("on demand");
    expect(describeSchedule(undefined)).toBe("on demand");
    expect(describeSchedule("@hourly")).toBe("every hour");
    expect(describeSchedule("@daily")).toBe("every day at 00:00");
    expect(describeSchedule("@midnight")).toBe("every day at 00:00");
    expect(describeSchedule("@weekly")).toBe("every Sunday at 00:00");
    expect(describeSchedule("@monthly")).toBe("on the 1st of every month at 00:00");
    expect(describeSchedule("@yearly")).toBe("every year on 1 January at 00:00");
  });

  it("reads @every durations", () => {
    expect(describeSchedule("@every 15m")).toBe("every 15 minutes");
    expect(describeSchedule("@every 1m")).toBe("every minute");
    expect(describeSchedule("@every 1h")).toBe("every hour");
    expect(describeSchedule("@every 6h")).toBe("every 6 hours");
    expect(describeSchedule("@every 1h30m")).toBe("every 1 h 30 min");
    expect(describeSchedule("@every 90s")).toBe("every 90 seconds");
    expect(describeSchedule("@every 30s")).toBe("every 30 seconds");
    expect(describeSchedule("@every 1h0m0s")).toBe("every hour");
    expect(describeEvery("nonsense")).toBeUndefined();
    expect(describeSchedule("@every nonsense")).toBe("@every nonsense");
  });

  it("reads sub-hourly cron", () => {
    expect(describeSchedule("* * * * *")).toBe("every minute");
    expect(describeSchedule("*/15 * * * *")).toBe("every 15 minutes");
    expect(describeSchedule("0 * * * *")).toBe("every hour");
    expect(describeSchedule("30 * * * *")).toBe("every hour at :30");
    expect(describeSchedule("0,30 * * * *")).toBe("every hour at :00 and :30");
    expect(describeSchedule("0 */6 * * *")).toBe("every 6 hours");
    expect(describeSchedule("15 */2 * * *")).toBe("every 2 hours at :15");
  });

  it("reads daily and weekly cron", () => {
    expect(describeSchedule("0 3 * * *")).toBe("every day at 03:00");
    expect(describeSchedule("30 3 * * *")).toBe("every day at 03:30");
    expect(describeSchedule("0 6,18 * * *")).toBe("every day at 06:00 and 18:00");
    expect(describeSchedule("0 9 * * 1-5")).toBe("every weekday at 09:00");
    expect(describeSchedule("0 9 * * mon-fri")).toBe("every weekday at 09:00");
    expect(describeSchedule("0 9 * * 0,6")).toBe("every weekend at 09:00");
    expect(describeSchedule("0 9 * * 1")).toBe("every Monday at 09:00");
    expect(describeSchedule("0 9 * * 1,3,5")).toBe("every Monday, Wednesday and Friday at 09:00");
    expect(describeSchedule("0 0 * * 7")).toBe("every Sunday at 00:00");
    expect(describeSchedule("0 0 * * 0-6")).toBe("every day at 00:00");
  });

  it("reads monthly and yearly cron", () => {
    expect(describeSchedule("0 0 1 * *")).toBe("on the 1st of every month at 00:00");
    expect(describeSchedule("0 4 15 * *")).toBe("on the 15th of every month at 04:00");
    expect(describeSchedule("0 0 2 * *")).toBe("on the 2nd of every month at 00:00");
    expect(describeSchedule("0 0 23 * *")).toBe("on the 23rd of every month at 00:00");
    expect(describeSchedule("0 0 1 1 *")).toBe("every year on 1 January at 00:00");
    expect(describeSchedule("0 0 1 1,7 *")).toBe("every year on 1 January and 1 July at 00:00");
  });

  it("falls back to the expression it cannot read", () => {
    for (const raw of ["0 9-17 * * *", "0 0 1-5 * *", "0 0 * * 1#2", "0 0 L * *", "0 0 0 * *", "5 4 3 2 1 0", "not a schedule", "0 0 1 * 1", "* * * * * *"]) {
      expect(describeSchedule(raw), raw).toBe(raw);
      expect(hasPlainSchedule(raw), raw).toBe(false);
    }
    expect(hasPlainSchedule("0 3 * * *")).toBe(true);
    expect(hasPlainSchedule("")).toBe(true);
  });
});
