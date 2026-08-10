import { describe, expect, it } from "vitest";
import {
  COPUOS_VIDEO_END_SECONDS,
  COPUOS_VIDEO_START_SECONDS,
  copuosChapterForProgress,
  copuosVideoTimeForProgress,
} from "./copuosExperience";

describe("COPUOS scroll-scrub timing", () => {
  it("uses only the approved five-second trims at both ends", () => {
    expect(COPUOS_VIDEO_START_SECONDS).toBe(5);
    expect(COPUOS_VIDEO_END_SECONDS).toBeCloseTo(85.783, 3);
    expect(copuosVideoTimeForProgress(0)).toBe(5);
    expect(copuosVideoTimeForProgress(1)).toBeCloseTo(85.783, 3);
  });

  it("reaches unmistakable space near the first twelve percent of scroll", () => {
    expect(copuosVideoTimeForProgress(0.12)).toBeCloseTo(30, 3);
    expect(copuosVideoTimeForProgress(0.06)).toBeGreaterThan(15);
  });

  it("is monotonic and clamps out-of-range progress", () => {
    const samples = Array.from({ length: 101 }, (_, index) => copuosVideoTimeForProgress(index / 100));
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1])).toBe(true);
    expect(copuosVideoTimeForProgress(-2)).toBe(5);
    expect(copuosVideoTimeForProgress(4)).toBeCloseTo(85.783, 3);
  });

  it("hands content through four stable narrative chapters", () => {
    expect(copuosChapterForProgress(0)).toBe(0);
    expect(copuosChapterForProgress(0.13)).toBe(1);
    expect(copuosChapterForProgress(0.48)).toBe(2);
    expect(copuosChapterForProgress(0.8)).toBe(3);
    expect(copuosChapterForProgress(1)).toBe(3);
  });
});
