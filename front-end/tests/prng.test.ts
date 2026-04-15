import { describe, expect, it } from "vitest";
import { mulberry32, shuffle, defaultRng } from "../src/lib/prng";

describe("prng", () => {
  it("mulberry32 produces a deterministic sequence for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBeCloseTo(b(), 10);
  });

  it("shuffle returns a permutation (same items, possibly different order)", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(arr, mulberry32(1));
    expect(out.slice().sort((a, b) => a - b)).toEqual(arr);
    expect(out).not.toBe(arr); // returns a new array
  });

  it("shuffle with the same seed returns the same order", () => {
    const arr = ["a", "b", "c", "d", "e", "f"];
    const s1 = shuffle(arr, mulberry32(99));
    const s2 = shuffle(arr, mulberry32(99));
    expect(s1).toEqual(s2);
  });

  it("defaultRng falls back to Math.random when seed is null", () => {
    expect(defaultRng(null)).toBe(Math.random);
  });
});
