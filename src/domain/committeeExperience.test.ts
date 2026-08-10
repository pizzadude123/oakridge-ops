import { describe, expect, it } from "vitest";
import {
  armageddonOpeningImpacts,
  calculateScenarioOutcome,
  committeeProfiles,
  crisisChannelProfiles,
  toYouTubeEmbedUrl,
} from "./committeeExperience";

describe("committee experience profiles", () => {
  it("uses the published Oakridge agendas for DISEC and Armageddon", () => {
    expect(committeeProfiles.disec.agenda).toContain("Disarmament, Demobilization, and Reintegration");
    expect(committeeProfiles.disec.backgroundGuideUrl).toContain("DISEC%20Background%20Guide");
    expect(committeeProfiles.armageddon.agenda).toContain("Artificial Superintelligence");
    expect(committeeProfiles.armageddon.backgroundGuideUrl).toContain("Armageddon%20Background%20Guide");
  });

  it("labels JCC as Tehran 1943 while explaining its Cold War consequence", () => {
    expect(crisisChannelProfiles.jcc.agenda).toContain("Tehran");
    expect(crisisChannelProfiles.jcc.context).toContain("Cold War");
  });
});

describe("chair explainer URLs", () => {
  it("normalizes supported YouTube links to privacy-enhanced embeds", () => {
    expect(toYouTubeEmbedUrl("https://youtu.be/AbC123_xYz0")).toBe("https://www.youtube-nocookie.com/embed/AbC123_xYz0");
    expect(toYouTubeEmbedUrl("https://www.youtube.com/watch?v=AbC123_xYz0&t=20s")).toBe("https://www.youtube-nocookie.com/embed/AbC123_xYz0");
  });

  it("rejects non-YouTube and malformed URLs", () => {
    expect(toYouTubeEmbedUrl("https://example.com/video")).toBeNull();
    expect(toYouTubeEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(toYouTubeEmbedUrl("")).toBeNull();
  });
});

describe("delegate preparation simulator", () => {
  it("defines three Armageddon opening moves with immediate, cascading, and delegate impacts", () => {
    const openingOptionIds = committeeProfiles.armageddon.dilemmas[0].options.map((option) => option.id);
    expect(armageddonOpeningImpacts.map((impact) => impact.optionId)).toEqual(openingOptionIds);
    expect(armageddonOpeningImpacts).toHaveLength(3);
    for (const impact of armageddonOpeningImpacts) {
      expect(impact.timeline).toHaveLength(3);
      expect(impact.timeline.map((step) => step.horizon)).toEqual(["IMMEDIATE", "FIRST HOUR", "IN COMMITTEE"]);
      expect(impact.delegatePressure.length).toBeGreaterThan(40);
      expect(impact.debateQuestion.endsWith("?")).toBe(true);
    }
  });

  it("returns a bounded, deterministic outcome from actual option IDs", () => {
    const first = calculateScenarioOutcome("disec", ["local-ownership", "monitored-amnesty", "regional-trust-fund"]);
    const second = calculateScenarioOutcome("disec", ["local-ownership", "monitored-amnesty", "regional-trust-fund"]);
    expect(first).toEqual(second);
    expect(first.metrics.consensus).toBeGreaterThanOrEqual(0);
    expect(first.metrics.consensus).toBeLessThanOrEqual(100);
    expect(first.metrics.control).toBeGreaterThanOrEqual(0);
    expect(first.metrics.legitimacy).toBeLessThanOrEqual(100);
    expect(first.assessment.length).toBeGreaterThan(20);
  });

  it("ignores option IDs belonging to another committee", () => {
    const result = calculateScenarioOutcome("armageddon", ["local-ownership"]);
    expect(result.selectedCount).toBe(0);
  });
});
