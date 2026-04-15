import { describe, expect, it } from "vitest";
import { formatDuration, formatEta, formatPct } from "../src/lib/format";

describe("format", () => {
  it("formatDuration under a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
  });

  it("formatDuration over a minute zero-pads seconds", () => {
    expect(formatDuration(61)).toBe("1m 01s");
    expect(formatDuration(125)).toBe("2m 05s");
  });

  it("formatEta caps to em-dash when no progress yet", () => {
    expect(formatEta(10, 0)).toBe("—");
  });

  it("formatEta returns seconds under a minute", () => {
    expect(formatEta(10, 5)).toBe("50s");
  });

  it("formatEta returns MmSSs over a minute", () => {
    expect(formatEta(10, 30)).toBe("5m00s");
    expect(formatEta(10, 31)).toBe("5m10s");
  });

  it("formatPct", () => {
    expect(formatPct(72)).toBe("72%");
    expect(formatPct(72.5, 1)).toBe("72.5%");
  });
});
