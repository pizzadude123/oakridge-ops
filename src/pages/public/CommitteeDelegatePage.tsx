import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useQuery } from "convex/react";
import { Activity, ArrowRight, Cpu, ExternalLink, FileText, Network, Play, Radio, RotateCcw, Shield, Users } from "lucide-react";
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
import { ArmageddonSignalField } from "./ArmageddonSignalField";
import { ArmageddonSignalRail } from "./ArmageddonSignalRail";
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
  if (slug === "armageddon") return <ArmageddonExperience />;
  return <CommitteeExperience slug={slug} />;
}

function ArmageddonExperience() {
  const profile = committeeProfiles.armageddon;
  const media = useQuery(api.committeeExperience.publicCommitteeMedia, { committee: "armageddon" });
  const root = useRef<HTMLDivElement>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const selectedIds = useMemo(() => Object.values(selections), [selections]);
  const outcome = useMemo(() => calculateScenarioOutcome("armageddon", selectedIds), [selectedIds]);
  const embedUrl = media ? toYouTubeEmbedUrl(media.videoUrl) : null;
  const outcomePolygon = useMemo(() => {
    const values = [outcome.metrics.control, outcome.metrics.consensus, outcome.metrics.legitimacy];
    return values.map((value, index) => {
      const angle = -Math.PI / 2 + index * (Math.PI * 2 / 3);
      const radius = 13 + value * 0.62;
      return `${80 + Math.cos(angle) * radius},${80 + Math.sin(angle) * radius}`;
    }).join(" ");
  }, [outcome.metrics]);

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
          .from(".armageddon-boundary", { y: 16, opacity: 0, duration: .42 })
          .from(".armageddon-wordmark-chunk", { yPercent: 120, rotateX: -48, stagger: .07, duration: .78 }, "-=.2")
          .from(".armageddon-hero-thesis > span", { yPercent: 115, stagger: .1, duration: .68 }, "-=.48")
          .from(".armageddon-hero-summary, .armageddon-hero-actions", { y: 20, opacity: 0, stagger: .08, duration: .5 }, "-=.4")
          .from(".armageddon-portal-frame", { scale: .78, rotate: 8, opacity: 0, duration: 1 }, "-=.75")
          .from(".armageddon-fact", { y: 16, opacity: 0, stagger: .08, duration: .45 }, "-=.5");

        const threatTimeline = gsap.timeline({ repeat: -1, repeatDelay: .8 })
          .to(".armageddon-wordmark", { "--threat-x": "82%", "--threat-y": "42%", duration: 11, ease: "sine.inOut" })
          .to(".armageddon-wordmark", { "--threat-x": "18%", "--threat-y": "56%", duration: 11, ease: "sine.inOut" });

        gsap.to(".armageddon-signal-field", {
          yPercent: 13,
          scale: 1.05,
          ease: "none",
          scrollTrigger: { trigger: ".armageddon-hero", start: "top top", end: "bottom top", scrub: .8 },
        });

        const escalation = gsap.timeline({
          scrollTrigger: { trigger: ".armageddon-escalation", start: "top 76%", once: true },
        });
        escalation
          .from(".armageddon-escalation-copy > *", { y: 28, opacity: 0, stagger: .08, duration: .58 })
          .from(".armageddon-topology-line", { scaleY: 0, transformOrigin: "top", duration: .8 }, "-=.42")
          .from(".armageddon-brief-step", { y: 28, opacity: 0, stagger: .13, duration: .55 }, "-=.58")
          .from(".armageddon-topology-node", { scale: 0, stagger: .12, duration: .38 }, "-=.72");

        [".armageddon-chair", ".armageddon-scenario", ".armageddon-exit"].forEach((selector) => {
          gsap.from(selector, {
            y: 52,
            opacity: 0,
            duration: .82,
            ease: "power2.out",
            scrollTrigger: { trigger: selector, start: "top 84%", once: true },
          });
        });

        const hero = root.current?.querySelector<HTMLElement>(".armageddon-hero");
        const portal = root.current?.querySelector<HTMLElement>(".armageddon-portal-tilt");
        if (!hero || !portal) return undefined;
        gsap.set(portal, { transformPerspective: 900, transformOrigin: "50% 50%" });
        const rotateX = gsap.quickTo(portal, "rotationX", { duration: .55, ease: "power3.out" });
        const rotateY = gsap.quickTo(portal, "rotationY", { duration: .55, ease: "power3.out" });
        const initialBounds = hero.getBoundingClientRect();
        let inViewport = initialBounds.bottom > 0 && initialBounds.top < window.innerHeight;
        let documentVisible = !document.hidden;
        const syncHeroMotion = () => {
          const running = inViewport && documentVisible;
          hero.dataset.motion = running ? "running" : "paused";
          opening.paused(!running);
          threatTimeline.paused(!running);
          if (!running) {
            gsap.killTweensOf(portal);
            gsap.set(portal, { rotationX: 0, rotationY: 0 });
          }
        };
        const observer = new IntersectionObserver(([entry]) => {
          inViewport = Boolean(entry?.isIntersecting);
          syncHeroMotion();
        }, { threshold: .01 });
        const handleVisibility = () => {
          documentVisible = !document.hidden;
          syncHeroMotion();
        };
        const handlePointer = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          const bounds = hero.getBoundingClientRect();
          rotateY(((event.clientX - bounds.left) / bounds.width - .5) * 10);
          rotateX(-((event.clientY - bounds.top) / bounds.height - .5) * 8);
        };
        const resetPointer = () => { rotateX(0); rotateY(0); };
        observer.observe(hero);
        document.addEventListener("visibilitychange", handleVisibility);
        hero.addEventListener("pointermove", handlePointer, { passive: true });
        hero.addEventListener("pointerleave", resetPointer);
        syncHeroMotion();
        return () => {
          observer.disconnect();
          document.removeEventListener("visibilitychange", handleVisibility);
          hero.removeEventListener("pointermove", handlePointer);
          hero.removeEventListener("pointerleave", resetPointer);
        };
      });
    }, root);
    return () => { mediaQuery.revert(); context.revert(); };
  }, []);

  function choose(dilemmaId: string, optionId: string) {
    setSelections((current) => ({ ...current, [dilemmaId]: optionId }));
  }

  return (
    <PublicShell variant="armageddon">
      <div ref={root} className="committee-experience armageddon-experience">
        <section className="armageddon-hero" aria-labelledby="armageddon-title">
          <ArmageddonSignalField />
          <div className="armageddon-hero-grid">
            <div className="armageddon-hero-copy">
              <p className="armageddon-boundary"><Shield aria-hidden="true" /> Fictional committee simulation · not a real-world alert</p>
              <p className="public-kicker"><span /> {profile.format}</p>
              <h1 id="armageddon-title" className="armageddon-wordmark" aria-label={profile.label}>
                <span className="armageddon-wordmark-mask" aria-hidden="true"><span className="armageddon-wordmark-chunk" data-echo="ARMA">ARMA</span></span>
                <span className="armageddon-wordmark-mask" aria-hidden="true"><span className="armageddon-wordmark-chunk" data-echo="GED">GED</span></span>
                <span className="armageddon-wordmark-mask" aria-hidden="true"><span className="armageddon-wordmark-chunk" data-echo="DON">DON</span></span>
              </h1>
              <p className="armageddon-full-name">{profile.fullName}</p>
              <h2 className="armageddon-hero-thesis"><span>The system is already</span><span>inside the loop.</span></h2>
              <p className="armageddon-hero-summary">{profile.overview}</p>
              <div className="armageddon-hero-actions">
                <button type="button" onClick={() => {
                  document.getElementById("scenario-lab")?.scrollIntoView({ block: "start" });
                  document.getElementById("armageddon-scenario-title")?.focus({ preventScroll: true });
                }} className="armageddon-action armageddon-action--primary"><span>Enter decision matrix</span><ArrowRight aria-hidden="true" /></button>
                <a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer" className="armageddon-action"><FileText aria-hidden="true" /><span>Open background guide</span></a>
              </div>
            </div>

            <div className="armageddon-portal-stage" aria-hidden="true">
              <div className="armageddon-portal-tilt">
                <div className="armageddon-portal-frame">
                  <div className="armageddon-portal-rim armageddon-portal-rim--outer" />
                  <div className="armageddon-portal-rim armageddon-portal-rim--inner" />
                  <svg viewBox="0 0 420 420" focusable="false">
                    <circle cx="210" cy="210" r="164" />
                    <circle cx="210" cy="210" r="112" />
                    <path d="M46 210H374M210 46V374M94 94L326 326M326 94L94 326" />
                    <path className="armageddon-portal-route" d="M84 286C126 228 126 126 210 118C294 110 304 226 344 168" />
                  </svg>
                  <div className="armageddon-portal-core"><span>01</span><strong>HUMAN<br />AUTHORITY</strong><small>CONTROL / CONTESTED</small></div>
                  <i className="armageddon-portal-scan" />
                </div>
              </div>
              <span className="armageddon-readout armageddon-readout--top">AGENDA · ARTIFICIAL SUPERINTELLIGENCE</span>
              <span className="armageddon-readout armageddon-readout--bottom">FICTIONAL SIMULATION · DELEGATE VIEW</span>
            </div>
          </div>

          <dl className="armageddon-facts">
            <div className="armageddon-fact"><dt><Activity aria-hidden="true" /> Format</dt><dd>Continuous crisis</dd></div>
            <div className="armageddon-fact"><dt><Cpu aria-hidden="true" /> Decision unit</dt><dd>Directives + consequences</dd></div>
            <div className="armageddon-fact"><dt><Network aria-hidden="true" /> Core tension</dt><dd>Control · consensus · legitimacy</dd></div>
          </dl>
          <div className="armageddon-agenda"><span>Current agenda</span><p>{profile.agenda}</p></div>
        </section>

        <ArmageddonSignalRail />

        <section className="armageddon-escalation" aria-labelledby="armageddon-preparation-title">
          <div className="armageddon-escalation-copy">
            <p className="public-kicker">01 · Before committee</p>
            <h2 id="armageddon-preparation-title">Prepare a chain of command, not a pile of research.</h2>
            <p>The room rewards delegates who can identify evidence, assign authority, and verify action while the premise changes around them.</p>
          </div>
          <div className="armageddon-topology" aria-hidden="true">
            <i className="armageddon-topology-line" />
            <span className="armageddon-topology-node">EVIDENCE</span>
            <span className="armageddon-topology-node">AUTHORITY</span>
            <span className="armageddon-topology-node">VERIFICATION</span>
          </div>
          <ol>
            {profile.preparation.map((item, index) => <li className="armageddon-brief-step" key={item}><span>0{index + 1}</span><div><small>{["Detect", "Authorize", "Verify"][index]}</small><p>{item}</p></div></li>)}
          </ol>
        </section>

        <section className="armageddon-chair" aria-labelledby="armageddon-chair-title">
          <div className="armageddon-chair-copy">
            <p className="public-kicker">02 · From the dais</p>
            <h2 id="armageddon-chair-title">{media?.title || "The briefing before the breach."}</h2>
            <p>{media?.description || "A dedicated chair explainer will establish the mandate, procedure, research boundaries, and the failure modes delegates should avoid before the crisis begins."}</p>
            {media && <strong>{media.speaker}</strong>}
            <div className="armageddon-chair-roster"><Users aria-hidden="true" /><div>{profile.chairs.map((chair) => <span key={chair.name}><b>{chair.name}</b><small>{chair.role}</small></span>)}</div></div>
          </div>
          <div className="armageddon-chair-media">
            <div className="armageddon-media-index"><span>BRIEFING CHANNEL</span><small>{media ? "EB PUBLISHED" : "AWAITING EB PUBLICATION"}</small></div>
            <div className="chair-video">
              {media === undefined ? <div className="chair-video-state"><span className="signal-loader" /><p>Checking the briefing channel…</p></div> : embedUrl && media ? <iframe src={embedUrl} title={`${media.title} — ${media.speaker}`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div className="chair-video-state"><Play aria-hidden="true" /><p>Chair explainer awaiting EB publication</p><small>The operations manager can publish a YouTube briefing here without changing this page.</small></div>}
            </div>
          </div>
        </section>

        <section id="scenario-lab" className="armageddon-scenario" aria-labelledby="armageddon-scenario-title">
          <header>
            <div><p className="public-kicker">03 · Decision matrix</p><h2 id="armageddon-scenario-title" tabIndex={-1}>Choose what remains under human control.</h2></div>
            <button type="button" onClick={() => setSelections({})}><RotateCcw aria-hidden="true" /> Reset all decisions</button>
          </header>
          <p className="scenario-disclosure"><Shield aria-hidden="true" /> Preparation simulation. Outcomes are deterministic trade-offs—not AI judgment or predictions of committee results.</p>
          <div className="armageddon-scenario-grid">
            <div className="armageddon-dilemmas">
              {profile.dilemmas.map((dilemma, dilemmaIndex) => <fieldset key={dilemma.id}>
                <legend><span>{dilemma.phase}</span>{dilemma.prompt}</legend>
                <div>{dilemma.options.map((option, optionIndex) => {
                  const selected = selections[dilemma.id] === option.id;
                  return <button key={option.id} type="button" className={selected ? "is-selected" : ""} data-selected={selected || undefined} aria-pressed={selected} onClick={() => choose(dilemma.id, option.id)}><span className="armageddon-option-index">{dilemmaIndex + 1}.{optionIndex + 1}</span><strong>{option.label}</strong><small>{option.consequence}</small><i aria-hidden="true" /></button>;
                })}</div>
              </fieldset>)}
            </div>

            <aside className="armageddon-outcome" aria-live="polite" data-decisions={outcome.selectedCount}>
              <div className="outcome-signal"><Radio aria-hidden="true" /><span>{outcome.selectedCount}/3 decisions locked</span></div>
              <div className="armageddon-outcome-map" aria-hidden="true">
                <svg viewBox="0 0 160 160">
                  <polygon className="armageddon-outcome-guide" points="80,13 138,113 22,113" />
                  <path d="M80 80V13M80 80L138 113M80 80L22 113" />
                  <polygon className="armageddon-outcome-polygon" points={outcomePolygon} />
                  <circle cx="80" cy="80" r="3" />
                </svg>
                <span className="armageddon-axis armageddon-axis--control">Control</span>
                <span className="armageddon-axis armageddon-axis--consensus">Consensus</span>
                <span className="armageddon-axis armageddon-axis--legitimacy">Legitimacy</span>
              </div>
              <h3>Strategic consequence</h3>
              <p>{outcome.assessment}</p>
              <div className="outcome-metrics">{(Object.entries(outcome.metrics) as Array<[ScenarioMetric, number]>).map(([metric, value]) => <div key={metric}><span><b>{metricLabels[metric]}</b><strong>{value}</strong></span><i><em style={{ width: `${value}%` }} /></i></div>)}</div>
              <small>Use the weakest dimension as your next caucus question—not as a score to maximize blindly.</small>
            </aside>
          </div>
        </section>

        <section className="armageddon-exit">
          <div><p className="public-kicker">Continue the simulation</p><h2>When the crisis moves, your preparation should move with it.</h2><p>Open the fictional transmission channel for EB-authored developments, system failures, directives, and changes to the balance of control.</p></div>
          <div className="armageddon-exit-actions"><Link to="/crisis/armageddon-ai-takeover" className="armageddon-action armageddon-action--primary"><span>Open crisis channel</span><Radio aria-hidden="true" /></Link><a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer" className="armageddon-action"><span>Read official guide</span><ExternalLink aria-hidden="true" /></a></div>
        </section>
      </div>
    </PublicShell>
  );
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
