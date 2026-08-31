import { describe, expect, test } from "bun:test";
import {
  assessPassword,
  DEFAULT_PASSWORD,
  MIN_PASSWORD_LENGTH,
} from "../password-strength";

function checkById(password: string, id: string) {
  const found = assessPassword(password).checks.find((c) => c.id === id);
  if (!found) throw new Error(`check ${id} is missing`);
  return found;
}

describe("assessPassword", () => {
  test("an empty field is neutral, not a failure", () => {
    const result = assessPassword("");
    expect(result.strength).toBe("empty");
    expect(result.score).toBe(0);
    expect(result.acceptable).toBe(false);
  });

  describe("blocking checks mirror the server", () => {
    test("length below the server minimum is not acceptable", () => {
      const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
      const result = assessPassword(short);
      expect(checkById(short, "length").passed).toBe(false);
      expect(result.acceptable).toBe(false);
    });

    test("exactly the minimum length passes", () => {
      const exact = "a".repeat(MIN_PASSWORD_LENGTH);
      expect(checkById(exact, "length").passed).toBe(true);
      expect(assessPassword(exact).acceptable).toBe(true);
    });

    test("the seeded default is rejected", () => {
      expect(checkById(DEFAULT_PASSWORD, "not-default").passed).toBe(false);
      expect(assessPassword(DEFAULT_PASSWORD).acceptable).toBe(false);
    });

    test("both blocking checks are marked as blocking", () => {
      const blocking = assessPassword("whatever")
        .checks.filter((c) => c.blocking)
        .map((c) => c.id)
        .sort();
      expect(blocking).toEqual(["length", "not-default"]);
    });
  });

  describe("advisory checks", () => {
    test("detects mixed case", () => {
      expect(checkById("lowercaseonly", "mixed-case").passed).toBe(false);
      expect(checkById("MixedCaseHere", "mixed-case").passed).toBe(true);
    });

    test("accepts either a number or a symbol", () => {
      expect(checkById("plainletters", "number-or-symbol").passed).toBe(false);
      expect(checkById("withnumber9", "number-or-symbol").passed).toBe(true);
      expect(checkById("with-symbol!", "number-or-symbol").passed).toBe(true);
    });

    test("advisory failures never block submission", () => {
      // Long, single-case, no digits: weak advice but legal.
      const result = assessPassword("onlylowercaseletters");
      expect(result.acceptable).toBe(true);
      expect(checkById("onlylowercaseletters", "mixed-case").passed).toBe(
        false,
      );
    });
  });

  describe("strength grading", () => {
    test("acceptable but plain scores weak", () => {
      const result = assessPassword("plainpass");
      expect(result.acceptable).toBe(true);
      expect(result.strength).toBe("weak");
      expect(result.score).toBe(1);
    });

    test("one advisory check met scores fair", () => {
      const result = assessPassword("PlainPass");
      expect(result.strength).toBe("fair");
      expect(result.score).toBe(2);
    });

    test("two or more advisory checks met scores strong", () => {
      const result = assessPassword("PlainPass9");
      expect(result.strength).toBe("strong");
      expect(result.score).toBe(3);
    });

    test("a long single-case password reaches strong via length", () => {
      const result = assessPassword("correcthorsebatterystaple");
      expect(result.strength).toBe("strong");
    });

    test("an unacceptable password never grades above weak", () => {
      // Would otherwise satisfy both advisory checks.
      const result = assessPassword("Ab9!");
      expect(result.acceptable).toBe(false);
      expect(result.strength).toBe("weak");
    });

    test("every acceptable password grades at or above weak", () => {
      // The meter must never show "empty" for text the server would accept.
      for (const candidate of [
        "plainpass",
        "PlainPass",
        "PlainPass9!",
        "correcthorsebatterystaple",
      ]) {
        const { acceptable, strength } = assessPassword(candidate);
        expect(acceptable).toBe(true);
        expect(strength).not.toBe("empty");
      }
    });

    test("score stays within the meter's range", () => {
      for (const candidate of [
        "",
        "a",
        DEFAULT_PASSWORD,
        "plainpass",
        "PlainPass",
        "PlainPass9!",
        "correcthorsebatterystaple",
      ]) {
        const { score } = assessPassword(candidate);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(3);
      }
    });
  });
});
