import { describe, expect, test } from "bun:test";
import { formatCountdown } from "../useLoginLockout";

describe("formatCountdown", () => {
  test("shows plain seconds below a minute", () => {
    expect(formatCountdown(0)).toBe("0s");
    expect(formatCountdown(9)).toBe("9s");
    expect(formatCountdown(59)).toBe("59s");
  });

  test("switches to m:ss at a minute", () => {
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(61)).toBe("1:01");
  });

  test("pads the seconds so the width stays stable", () => {
    // Without padding the countdown would jitter between "1:5" and "1:05".
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(70)).toBe("1:10");
  });

  test("handles the production window length", () => {
    // 15 minutes, the default lockout.
    expect(formatCountdown(900)).toBe("15:00");
    expect(formatCountdown(899)).toBe("14:59");
  });
});
