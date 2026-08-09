import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useQuery } from "convex/react";
import { ArrowRight, ExternalLink, FileText, Play, Radio, RotateCcw, Shield, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import {
  calculateScenarioOutcome,
  committeeProfiles,
  toYouTubeEmbedUrl,
  type CommitteeSlug,
  type ScenarioMetric,
} from "../../domain/committeeExperience";
import { PublicShell } from "./PublicShell";

gsap.registerPlugin(ScrollTrigger);

const metricLabels: Record<ScenarioMetric, string> = {
  consensus: "Coalition consensus",
  control: "Operational control",
  legitimacy: "Public legitimacy",
};

function isCommitteeSlug(value: string | undefined): value is CommitteeSlug {
  return value === "disec" || value === "armageddon";
}

export function CommitteeDelegatePage() {
  const { slug } = useParams();
  if (!isCommitteeSlug(slug)) return <Navigate to="/committees/disec" replace />;
  return <CommitteeExperience slug={slug} />;
}

function CommitteeExperience({ slug }: { slug: CommitteeSlug }) {
  const profile = committeeProfiles[slug];
  const media = useQuery(api.committeeExperience.publicCommitteeMedia, { committee: slug });
  const root = useRef<HTMLDivElement>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const selectedIds = useMemo(() => Object.values(selections), [selections]);
  const outcome = useMemo(() => calculateScenarioOutcome(slug, selectedIds), [selectedIds, slug]);
  const embedUrl = media ? toYouTubeEmbedUrl(media.videoUrl) : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${profile.label} Delegate Experience · Oakridge MUN`;
    return () => { document.title = "Oakridge MUN Operations"; };
  }, [profile.label]);

  useLayoutEffect(() => {
    if (!root.current) return;
    const mediaQuery = gsap.matchMedia();
    const context = gsap.context(() => {
      mediaQuery.add("(prefers-reduced-motion: no-preference)", () => {
        const opening = gsap.timeline({ defaults: { ease: "power3.out" } });
        opening
          .from(".committee-hero .public-kicker", { y: 16, duration: .45 })
          .from(".committee-wordmark span", { yPercent: 24, rotateX: -35, stagger: .045, duration: .7 }, "-=.2")
          .from(".committee-hero-copy > *", { y: 18, stagger: .08, duration: .5 }, "-=.5")
          .from(".committee-visual", { scale: .92, rotate: slug === "disec" ? -8 : 3, duration: .9 }, "-=.75");
        gsap.utils.toArray<HTMLElement>(".experience-reveal").forEach((section) => {
          gsap.from(section, {
            y: 42,
            duration: .72,
            ease: "power2.out",
            scrollTrigger: { trigger: section, start: "top 86%", once: true },
          });
        });
      });
    }, root);
    return () => { mediaQuery.revert(); context.revert(); };
  }, [slug]);

  function choose(dilemmaId: string, optionId: string) {
    setSelections((current) => ({ ...current, [dilemmaId]: optionId }));
  }

  return (
    <PublicShell variant={slug}>
      <div ref={root} className="committee-experience">
        <section className="committee-hero">
          <div className="committee-hero-copy">
            <p className="public-kicker"><span /> {profile.format}</p>
            <h1 className="committee-wordmark" aria-label={profile.label}>{profile.label.split("").map((letter, index) => <span aria-hidden="true" key={`${letter}-${index}`}>{letter}</span>)}</h1>
            <p className="committee-full-name">{profile.fullName}</p>
            <h2>{slug === "disec" ? "Peace is not the absence of weapons." : "Control was the first casualty."}</h2>
            <p>{profile.overview}</p>
            <div className="committee-hero-actions">
              <a href="#scenario-lab" className="public-button public-button--primary">Enter scenario lab <ArrowRight aria-hidden="true" /></a>
              <a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer" className="public-button public-button--ghost"><FileText aria-hidden="true" /> Background guide</a>
            </div>
          </div>
          <div className="committee-visual" aria-hidden="true">
            {slug === "disec" ? <div className="disec-orbit"><i /><i /><i /><strong>DDR</strong><span>SECURITY</span><span>REINTEGRATION</span><span>TRUST</span></div> : <div className="ai-core"><i /><i /><i /><strong>01</strong><span>CONTROL<br />UNCERTAIN</span><b>GLOBAL SYSTEM / DEGRADED</b></div>}
          </div>
          <div className="agenda-ticker"><span>AGENDA</span><p>{profile.agenda}</p></div>
        </section>

        <section className="committee-brief experience-reveal">
          <div className="brief-index"><span>01</span><p>Before committee</p></div>
          <div className="brief-copy"><p className="public-kicker">The mandate</p><h2>Know what the room will demand from you.</h2><p>The background guide gives you evidence. Your preparation must turn that evidence into coalitions, clauses, and decisions that survive pressure.</p></div>
          <ol>{profile.preparation.map((item, index) => <li key={item}><span>0{index + 1}</span><p>{item}</p></li>)}</ol>
        </section>

        <section className="chair-briefing experience-reveal">
          <div className="chair-video">
            {media === undefined ? <div className="chair-video-state"><span className="signal-loader" /><p>Checking the briefing channel…</p></div> : embedUrl && media ? <iframe src={embedUrl} title={`${media.title} — ${media.speaker}`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div className="chair-video-state"><Play aria-hidden="true" /><p>Chair explainer awaiting EB publication</p><small>The operations manager can publish a YouTube briefing here without changing this page.</small></div>}
          </div>
          <div className="chair-copy"><p className="public-kicker">02 · From the dais</p><h2>{media?.title || "The briefing before the briefing."}</h2><p>{media?.description || "A dedicated chair explainer slot gives delegates the mandate, procedure, research boundaries, and the mistakes the Executive Board wants them to avoid."}</p>{media && <strong>{media.speaker}</strong>}<div className="chair-roster"><Users aria-hidden="true" /><div>{profile.chairs.map((chair) => <span key={chair.name}><b>{chair.name}</b><small>{chair.role}</small></span>)}</div></div></div>
        </section>

        <section id="scenario-lab" className="scenario-lab experience-reveal">
          <header><div><p className="public-kicker">03 · Interactive preparation</p><h2>{slug === "disec" ? "Build a DDR mandate that can survive the vote." : "Choose what remains under human control."}</h2></div><button type="button" onClick={() => setSelections({})}><RotateCcw aria-hidden="true" /> Reset scenario</button></header>
          <p className="scenario-disclosure"><Shield aria-hidden="true" /> Preparation simulation. These outcomes are deterministic trade-offs, not AI judgment or a prediction of committee results.</p>
          <div className="scenario-grid">
            <div className="dilemma-stack">
              {profile.dilemmas.map((dilemma) => <fieldset key={dilemma.id}><legend><span>{dilemma.phase}</span>{dilemma.prompt}</legend><div>{dilemma.options.map((option) => <button key={option.id} type="button" className={selections[dilemma.id] === option.id ? "is-selected" : ""} aria-pressed={selections[dilemma.id] === option.id} onClick={() => choose(dilemma.id, option.id)}><strong>{option.label}</strong><small>{option.consequence}</small></button>)}</div></fieldset>)}
            </div>
            <aside className="scenario-outcome" aria-live="polite">
              <div className="outcome-signal"><Radio aria-hidden="true" /><span>{outcome.selectedCount}/3 decisions locked</span></div>
              <h3>Strategic consequence</h3>
              <p>{outcome.assessment}</p>
              <div className="outcome-metrics">{(Object.entries(outcome.metrics) as Array<[ScenarioMetric, number]>).map(([metric, value]) => <div key={metric}><span><b>{metricLabels[metric]}</b><strong>{value}</strong></span><i><em style={{ width: `${value}%` }} /></i></div>)}</div>
              <small>Use the weakest dimension as your next caucus question—not as a score to maximize blindly.</small>
            </aside>
          </div>
        </section>

        <section className="committee-exit experience-reveal">
          <p className="public-kicker">Continue the experience</p>
          <h2>{slug === "armageddon" ? "The next development is already moving." : "Read deeper. Arrive with language worth negotiating."}</h2>
          <div>{slug === "armageddon" && <Link to="/crisis/armageddon-ai-takeover" className="public-button public-button--primary">Open live crisis channel <Radio aria-hidden="true" /></Link>}<a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer" className="public-button public-button--ghost">Open official guide <ExternalLink aria-hidden="true" /></a></div>
        </section>
      </div>
    </PublicShell>
  );
}
