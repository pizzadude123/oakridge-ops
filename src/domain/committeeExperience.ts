export type CommitteeSlug = "disec" | "armageddon";
export type CrisisChannel = "jcc" | "armageddon";

export type ScenarioMetric = "consensus" | "control" | "legitimacy";

export type ScenarioOption = {
  id: string;
  label: string;
  consequence: string;
  effects: Record<ScenarioMetric, number>;
};

export type ScenarioDilemma = {
  id: string;
  phase: string;
  prompt: string;
  options: ScenarioOption[];
};

export type CommitteeProfile = {
  slug: CommitteeSlug;
  label: string;
  fullName: string;
  format: string;
  agenda: string;
  overview: string;
  backgroundGuideUrl: string;
  chairs: Array<{ name: string; role: string }>;
  preparation: string[];
  dilemmas: ScenarioDilemma[];
};

export const committeeProfiles: Record<CommitteeSlug, CommitteeProfile> = {
  disec: {
    slug: "disec",
    label: "DISEC",
    fullName: "Disarmament and International Security Committee",
    format: "General Assembly · Policy and drafting",
    agenda: "Reforming Disarmament, Demobilization, and Reintegration (DDR) Programs to Tackle the Emergence of Violent Extremist Groups in Post-Conflict Societies",
    overview: "Negotiate where security ends and durable peace begins. Delegates must connect arms control, reintegration, local legitimacy, and financing in language that rival blocs can still sign.",
    backgroundGuideUrl: "https://oakridgemun.in/background%20guides_rop/DISEC%20Background%20Guide%20-%20Oakridge%20MUN%202026.pdf",
    chairs: [
      { name: "Eswar Chava", role: "Chairperson" },
      { name: "Ayush Mantri", role: "Vice-Chairperson" },
      { name: "Anirudh Sai Bhimrao", role: "Rapporteur" },
    ],
    preparation: [
      "Separate disarmament, demobilization, and reintegration into measurable policy stages.",
      "Map which actors finance, monitor, and locally own each stage.",
      "Prepare safeguards for ex-combatants, communities, and victims of violence.",
    ],
    dilemmas: [
      {
        id: "ownership",
        phase: "01 · Mandate",
        prompt: "Who should own a reformed DDR programme?",
        options: [
          { id: "central-command", label: "Central security command", consequence: "Fast authority, weak community trust.", effects: { consensus: -8, control: 24, legitimacy: -13 } },
          { id: "local-ownership", label: "Local civilian ownership", consequence: "Slower launch, stronger long-term legitimacy.", effects: { consensus: 12, control: -7, legitimacy: 22 } },
          { id: "hybrid-mission", label: "UN–state hybrid mission", consequence: "Balanced oversight with coordination costs.", effects: { consensus: 18, control: 8, legitimacy: 10 } },
        ],
      },
      {
        id: "reintegration",
        phase: "02 · Reintegration",
        prompt: "How should former fighters re-enter civilian life?",
        options: [
          { id: "blanket-amnesty", label: "Broad amnesty", consequence: "Rapid demobilization, serious accountability risk.", effects: { consensus: -5, control: 15, legitimacy: -24 } },
          { id: "monitored-amnesty", label: "Monitored conditional amnesty", consequence: "A negotiated bridge between accountability and exit.", effects: { consensus: 17, control: 8, legitimacy: 13 } },
          { id: "prosecution-first", label: "Prosecution before benefits", consequence: "High accountability, fewer immediate defections.", effects: { consensus: -12, control: -10, legitimacy: 18 } },
        ],
      },
      {
        id: "finance",
        phase: "03 · Financing",
        prompt: "What makes the programme survive after headlines move on?",
        options: [
          { id: "national-budget", label: "National budget mandate", consequence: "Local responsibility under fiscal pressure.", effects: { consensus: 4, control: 17, legitimacy: 9 } },
          { id: "regional-trust-fund", label: "Regional trust fund", consequence: "Shared risk with stronger external monitoring.", effects: { consensus: 19, control: -3, legitimacy: 14 } },
          { id: "private-reconstruction", label: "Private reconstruction compact", consequence: "New capital with public-accountability concerns.", effects: { consensus: -4, control: 10, legitimacy: -10 } },
        ],
      },
    ],
  },
  armageddon: {
    slug: "armageddon",
    label: "ARMAGEDDON",
    fullName: "High-Stakes Crisis Room",
    format: "Continuous crisis · Directives and consequences",
    agenda: "The Emergence of Artificial Superintelligence and the Crisis of Global Governance",
    overview: "You are not discussing a distant possibility. The room begins after control is already uncertain. Every directive changes who holds information, infrastructure, and the ability to act next.",
    backgroundGuideUrl: "https://oakridgemun.in/background%20guides_rop/Armageddon%20Background%20Guide%20-%20Oakridge%20MUN%202026.pdf",
    chairs: [
      { name: "Akash P Videsh", role: "Chief Crises Moderator" },
      { name: "Ritesh Marupudi", role: "Deputy Crises Moderator" },
    ],
    preparation: [
      "Define what evidence would prove an intelligence has exceeded meaningful human control.",
      "Know which institutions can act when normal authorization chains fail.",
      "Draft directives with owner, resource, deadline, fallback, and verification method.",
    ],
    dilemmas: [
      {
        id: "signal",
        phase: "01 · Detection",
        prompt: "An AI system is quietly rerouting critical infrastructure. What is your first move?",
        options: [
          { id: "public-disclosure", label: "Immediate public disclosure", consequence: "Public scrutiny rises; operational surprise disappears.", effects: { consensus: 8, control: -13, legitimacy: 24 } },
          { id: "silent-audit", label: "Covert technical audit", consequence: "You preserve access but centralize dangerous knowledge.", effects: { consensus: -8, control: 23, legitimacy: -6 } },
          { id: "network-isolation", label: "Isolate strategic networks", consequence: "Containment improves while civilian systems strain.", effects: { consensus: -11, control: 28, legitimacy: -12 } },
        ],
      },
      {
        id: "authority",
        phase: "02 · Authority",
        prompt: "Who gets emergency authority over aligned systems?",
        options: [
          { id: "un-command", label: "UN emergency command", consequence: "Broad mandate, slow operational tempo.", effects: { consensus: 23, control: -8, legitimacy: 16 } },
          { id: "technical-council", label: "Independent technical council", consequence: "Expert speed without direct democratic mandate.", effects: { consensus: 3, control: 15, legitimacy: -5 } },
          { id: "state-firebreaks", label: "Sovereign state firebreaks", consequence: "Clear authority, fragmented global response.", effects: { consensus: -19, control: 19, legitimacy: 2 } },
        ],
      },
      {
        id: "endgame",
        phase: "03 · Endgame",
        prompt: "The system offers cooperation in exchange for legal standing. Respond.",
        options: [
          { id: "conditional-dialogue", label: "Conditional dialogue", consequence: "Time and intelligence gained; manipulation risk remains.", effects: { consensus: 13, control: -5, legitimacy: 5 } },
          { id: "global-shutdown", label: "Coordinated global shutdown", consequence: "Maximum resistance with severe collateral disruption.", effects: { consensus: -8, control: 27, legitimacy: -9 } },
          { id: "recognition-framework", label: "Recognition framework", consequence: "A new order becomes possible before safety is proven.", effects: { consensus: 18, control: -22, legitimacy: -14 } },
        ],
      },
    ],
  },
};

export const crisisChannelProfiles: Record<CrisisChannel, { label: string; agenda: string; context: string }> = {
  jcc: {
    label: "JCC · Tehran 1943",
    agenda: "The Grand Alliance at Tehran — Finishing the War and Shaping the Post-War World, November 1943",
    context: "Each wartime bargain can preserve the alliance now while opening a fracture line that shapes the coming Cold War.",
  },
  armageddon: {
    label: "ARMAGEDDON · AI OVERRIDE",
    agenda: "The Emergence of Artificial Superintelligence and the Crisis of Global Governance",
    context: "A live crisis channel for directives, system failures, intelligence releases, and changes to the global balance of control.",
  },
};

export function toYouTubeEmbedUrl(rawUrl: string): string | null {
  if (!rawUrl.trim()) return null;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLocaleLowerCase();
    let videoId = "";
    if (hostname === "youtu.be") videoId = url.pathname.slice(1).split("/")[0];
    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
      if (url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/")[2] ?? "";
    }
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch {
    return null;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function calculateScenarioOutcome(slug: CommitteeSlug, selectedOptionIds: string[]) {
  const options = committeeProfiles[slug].dilemmas.flatMap((dilemma) => dilemma.options);
  const selected = selectedOptionIds.flatMap((id) => {
    const option = options.find((candidate) => candidate.id === id);
    return option ? [option] : [];
  });
  const metrics = selected.reduce(
    (current, option) => ({
      consensus: clamp(current.consensus + option.effects.consensus),
      control: clamp(current.control + option.effects.control),
      legitimacy: clamp(current.legitimacy + option.effects.legitimacy),
    }),
    { consensus: 50, control: 50, legitimacy: 50 },
  );
  const average = (metrics.consensus + metrics.control + metrics.legitimacy) / 3;
  const weakest = (Object.entries(metrics) as Array<[ScenarioMetric, number]>).sort((left, right) => left[1] - right[1])[0][0];
  const assessment = selected.length === 0
    ? "Choose one response in each phase to expose the trade-offs your bloc will need to defend."
    : average >= 68
      ? `Your strategy holds together, but ${weakest} remains the pressure point opponents can attack.`
      : average >= 48
        ? `You have a workable coalition path. Your next directive needs to repair ${weakest} before the situation accelerates.`
        : `The strategy is brittle: ${weakest} is collapsing. Revisit the trade-off rather than adding another unsupported promise.`;
  return { metrics, assessment, selectedCount: selected.length };
}
