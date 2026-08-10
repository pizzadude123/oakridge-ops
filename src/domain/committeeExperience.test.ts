import { describe, expect, it } from "vitest";
import {
  armageddonOpeningImpacts,
  calculateScenarioOutcome,
  committeeProfiles,
  crisisChannelProfiles,
  toYouTubeEmbedUrl,
} from "./committeeExperience";

describe("committee experience profiles", () => {
  it("uses the published Oakridge agendas for COPUOS and Armageddon", () => {
    expect(committeeProfiles.copuos.label).toBe("COPUOS");
    expect(committeeProfiles.copuos.agenda).toContain("Debris Mitigation in Outer Space");
    expect(committeeProfiles.copuos.backgroundGuideUrl).toContain("COPUOS%20Background%20Guide");
    expect(committeeProfiles.copuos.chairs.map((chair) => chair.name)).toEqual(["Dhanush Malhotra", "Naren Ayinala"]);
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
    const first = calculateScenarioOutcome("copuos", ["open-ledger", "binding-end-of-life", "multilateral-removal"]);
    const second = calculateScenarioOutcome("copuos", ["open-ledger", "binding-end-of-life", "multilateral-removal"]);
    expect(first).toEqual(second);
    expect(first.metrics.consensus).toBeGreaterThanOrEqual(0);
    expect(first.metrics.consensus).toBeLessThanOrEqual(100);
    expect(first.metrics.control).toBeGreaterThanOrEqual(0);
    expect(first.metrics.legitimacy).toBeLessThanOrEqual(100);
    expect(first.assessment.length).toBeGreaterThan(20);
  });

  it("ignores option IDs belonging to another committee", () => {
    const result = calculateScenarioOutcome("armageddon", ["open-ledger"]);
    expect(result.selectedCount).toBe(0);
  });
});
