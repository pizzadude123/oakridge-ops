import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useQuery } from "convex/react";
import { ArrowRight, CalendarDays, Clock3, ExternalLink, FileText, Pause, Play, Radio, RotateCcw, Shield, Users } from "lucide-react";
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

const armageddonHandVideo = `${import.meta.env.BASE_URL}armageddon-cinematic-gate.mp4`;
const armageddonHandPoster = `${import.meta.env.BASE_URL}armageddon-cinematic-gate-poster.jpg`;

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
  const handVideoRef = useRef<HTMLVideoElement>(null);
  const handUserPaused = useRef(false);
  const handExplicitPlay = useRef(false);
  const [handPlaying, setHandPlaying] = useState(false);
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
    const hero = root.current?.querySelector<HTMLElement>(".armageddon-hero");
    const video = handVideoRef.current;
    if (!hero || !video) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inViewport = true;
    let documentVisible = !document.hidden;
    const syncVideo = () => {
      const motionAllowed = !reducedMotion.matches || handExplicitPlay.current;
      const shouldPlay = motionAllowed && inViewport && documentVisible && !handUserPaused.current;
      if (shouldPlay) void video.play().catch(() => setHandPlaying(false));
      else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = Boolean(entry?.isIntersecting);
      syncVideo();
    }, { threshold: .05 });
    const handleVisibility = () => {
      documentVisible = !document.hidden;
      syncVideo();
    };
    const handlePreference = () => {
      if (reducedMotion.matches && !handExplicitPlay.current) video.currentTime = 7;
      syncVideo();
    };
    const handlePlay = () => setHandPlaying(true);
    const handlePause = () => setHandPlaying(false);
    observer.observe(hero);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", handlePreference);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    handlePreference();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handlePreference);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.pause();
    };
  }, []);

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
        const header = document.querySelector<HTMLElement>(".public-site--armageddon .public-header");
        const hero = root.current?.querySelector<HTMLElement>(".armageddon-hero");
        const handMedia = root.current?.querySelector<HTMLElement>(".armageddon-hand-media");
        const reticle = root.current?.querySelector<HTMLElement>(".armageddon-hand-reticle");
        const finale = root.current?.querySelector<HTMLElement>(".armageddon-exit");
        const listenerCleanup: Array<() => void> = [];
        const opening = gsap.timeline({ defaults: { ease: "power4.out" } });
        opening
          .from(header, { y: -16, opacity: 0, duration: .8, ease: "expo.out" })
          .from(".armageddon-hand-media", { opacity: 0, scale: 1.05, duration: 1.8, ease: "power3.out" }, 0)
          .from(".armageddon-hero-top > *", { y: 16, opacity: 0, filter: "blur(20px)", stagger: .08, duration: .8 }, .2)
          .from(".armageddon-hero-metadata > span", { y: 18, opacity: 0, filter: "blur(20px)", stagger: .07, duration: .7 }, .32)
          .from(".armageddon-hero-status", { y: 16, opacity: 0, filter: "blur(20px)", duration: .8 }, .42)
          .from(".armageddon-hero-line > span", { yPercent: 112, rotateX: -18, filter: "blur(20px)", stagger: .1, duration: .82 }, .56)
          .from(".armageddon-hero-summary", { y: 20, opacity: 0, filter: "blur(20px)", duration: .8 }, .76)
          .from(".armageddon-hero-actions", { y: 16, opacity: 0, filter: "blur(20px)", duration: .8 }, .92)
          .from(".armageddon-hero-tag", { y: 14, opacity: 0, filter: "blur(16px)", stagger: .08, duration: .58 }, 1.02)
          .from(".armageddon-hand-control", { scale: .7, opacity: 0, filter: "blur(12px)", duration: .5 }, 1.16);

        gsap.to(".armageddon-hand-video", {
          yPercent: 8,
          scale: .98,
          ease: "none",
          scrollTrigger: { trigger: ".armageddon-hero", start: "top top", end: "bottom top", scrub: 1.1 },
        });

        const escalation = gsap.timeline({ scrollTrigger: { trigger: ".armageddon-escalation", start: "top 78%", once: true } });
        escalation
          .from(".armageddon-escalation-copy > *", { y: 34, opacity: 0, stagger: .09, duration: .7 })
          .from(".armageddon-brief-step", { y: 42, opacity: 0, stagger: .14, duration: .65 }, "-=.5");

        gsap.fromTo(".armageddon-chair-media", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: ".armageddon-chair", start: "top 76%", once: true } });
        gsap.from(".armageddon-chair-copy > *", { y: 30, opacity: 0, stagger: .09, duration: .72, ease: "power3.out", scrollTrigger: { trigger: ".armageddon-chair", start: "top 78%", once: true } });
        gsap.from(".armageddon-scenario > header > *, .scenario-disclosure, .armageddon-dilemmas fieldset, .armageddon-outcome", { y: 42, opacity: 0, stagger: .1, duration: .72, ease: "power3.out", scrollTrigger: { trigger: ".armageddon-scenario", start: "top 82%", once: true } });
        gsap.from(".armageddon-footer-word--outline", { xPercent: -7, ease: "none", scrollTrigger: { trigger: ".armageddon-exit", start: "top bottom", end: "bottom bottom", scrub: 1 } });
        gsap.from(".armageddon-footer-word--fill", { xPercent: 7, ease: "none", scrollTrigger: { trigger: ".armageddon-exit", start: "top bottom", end: "bottom bottom", scrub: 1 } });

        gsap.utils.toArray<HTMLElement>(".armageddon-option").forEach((option) => {
          const wash = option.querySelector<HTMLElement>(".armageddon-option-wash");
          const enter = () => {
            gsap.to(option, { y: -6, duration: .38, ease: "power3.out", overwrite: "auto" });
            if (wash) gsap.fromTo(wash, { xPercent: -135, opacity: 0 }, { xPercent: 135, opacity: .34, duration: .78, ease: "power2.inOut", overwrite: true });
          };
          const leave = () => {
            if (option.matches(":focus-visible")) return;
            gsap.to(option, { y: 0, duration: .5, ease: "elastic.out(1, .65)", overwrite: "auto" });
          };
          const blur = () => { if (!option.matches(":hover")) leave(); };
          const press = () => gsap.to(option, { scale: .985, duration: .12, overwrite: "auto" });
          const release = () => gsap.to(option, { scale: 1, duration: .35, ease: "back.out(2)", overwrite: "auto" });
          option.addEventListener("pointerenter", enter);
          option.addEventListener("pointerleave", leave);
          option.addEventListener("focus", enter);
          option.addEventListener("blur", blur);
          option.addEventListener("pointerdown", press);
          option.addEventListener("pointerup", release);
          listenerCleanup.push(() => {
            option.removeEventListener("pointerenter", enter);
            option.removeEventListener("pointerleave", leave);
            option.removeEventListener("focus", enter);
            option.removeEventListener("blur", blur);
            option.removeEventListener("pointerdown", press);
            option.removeEventListener("pointerup", release);
            gsap.killTweensOf([option, wash]);
          });
        });

        gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((control) => {
          const inner = control.querySelector<HTMLElement>("[data-magnetic-inner]");
          if (!inner) return;
          const move = (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            const bounds = control.getBoundingClientRect();
            gsap.to(inner, { x: (event.clientX - bounds.left - bounds.width / 2) * .16, y: (event.clientY - bounds.top - bounds.height / 2) * .2, duration: .42, ease: "power3.out", overwrite: "auto" });
          };
          const leave = () => gsap.to(inner, { x: 0, y: 0, duration: .65, ease: "elastic.out(1, .55)", overwrite: "auto" });
          control.addEventListener("pointermove", move);
          control.addEventListener("pointerleave", leave);
          listenerCleanup.push(() => {
            control.removeEventListener("pointermove", move);
            control.removeEventListener("pointerleave", leave);
            gsap.killTweensOf(inner);
          });
        });

        if (finale) {
          const move = (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            const bounds = finale.getBoundingClientRect();
            gsap.to(finale, { "--footer-x": `${((event.clientX - bounds.left) / bounds.width) * 100}%`, "--footer-y": `${((event.clientY - bounds.top) / bounds.height) * 100}%`, duration: .55, ease: "power3.out", overwrite: "auto" });
          };
          const leave = () => gsap.to(finale, { "--footer-x": "50%", "--footer-y": "58%", duration: .8, ease: "power3.out", overwrite: "auto" });
          finale.addEventListener("pointermove", move);
          finale.addEventListener("pointerleave", leave);
          listenerCleanup.push(() => {
            finale.removeEventListener("pointermove", move);
            finale.removeEventListener("pointerleave", leave);
            gsap.killTweensOf(finale);
          });
        }

        if (!hero || !handMedia || !reticle) return () => listenerCleanup.forEach((dispose) => dispose());
        const handX = gsap.quickTo(handMedia, "x", { duration: .8, ease: "power3.out" });
        const handY = gsap.quickTo(handMedia, "y", { duration: .8, ease: "power3.out" });
        const reticleX = gsap.quickTo(reticle, "x", { duration: .32, ease: "power2.out" });
        const reticleY = gsap.quickTo(reticle, "y", { duration: .32, ease: "power2.out" });
        const initialBounds = hero.getBoundingClientRect();
        let inViewport = initialBounds.bottom > 0 && initialBounds.top < window.innerHeight;
        let documentVisible = !document.hidden;
        const syncHeroMotion = () => {
          const running = inViewport && documentVisible;
          hero.dataset.motion = running ? "running" : "paused";
          opening.paused(!running);
          if (!running) {
            gsap.killTweensOf([handMedia, reticle]);
            gsap.set(handMedia, { x: 0, y: 0 });
            gsap.set(reticle, { opacity: 0 });
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
          const x = (event.clientX - bounds.left) / bounds.width;
          const y = (event.clientY - bounds.top) / bounds.height;
          handX((x - .5) * 24);
          handY((y - .5) * 16);
          gsap.to(reticle, { opacity: 1, duration: .2, overwrite: "auto" });
          reticleX(event.clientX - bounds.left);
          reticleY(event.clientY - bounds.top);
        };
        const resetPointer = () => {
          handX(0);
          handY(0);
          gsap.to(reticle, { opacity: 0, duration: .2, overwrite: "auto" });
        };
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
          listenerCleanup.forEach((dispose) => dispose());
        };
      });
    }, root);
    return () => { mediaQuery.revert(); context.revert(); };
  }, []);

  useLayoutEffect(() => {
    if (!root.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(".armageddon-outcome-polygon", { scale: .82, opacity: .45, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, duration: .58, ease: "back.out(1.8)" });
      gsap.fromTo(".outcome-metrics em", { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, stagger: .05, duration: .52, ease: "power3.out" });
    }, root);
    return () => context.revert();
  }, [selections]);

  function toggleHandMotion() {
    const video = handVideoRef.current;
    if (!video) return;
    if (video.paused) {
      handUserPaused.current = false;
      handExplicitPlay.current = true;
      void video.play().catch(() => setHandPlaying(false));
    } else {
      handUserPaused.current = true;
      video.pause();
    }
  }

  function choose(dilemmaId: string, optionId: string) {
    setSelections((current) => ({ ...current, [dilemmaId]: optionId }));
  }

  return (
    <PublicShell variant="armageddon">
      <div ref={root} className="committee-experience armageddon-experience">
        <section className="armageddon-hero" aria-labelledby="armageddon-title" data-motion="paused">
          <div className="armageddon-hand-media" aria-hidden="true">
            <video ref={handVideoRef} className="armageddon-hand-video" autoPlay muted loop playsInline preload="metadata" poster={armageddonHandPoster}>
              <source src={armageddonHandVideo} type="video/mp4" />
            </video>
            <div className="armageddon-hand-index"><span>14.0</span><small>BREACH / APERTURE</small></div>
            <div className="armageddon-hand-axis"><i /><i /><span>CONTROL CORRIDOR</span></div>
          </div>
          <div className="armageddon-hand-reticle" aria-hidden="true"><i /><span>HUMAN INPUT</span></div>
          <div className="armageddon-hero-fade" aria-hidden="true" />

          <div className="armageddon-hero-top">
            <p className="armageddon-boundary armageddon-liquid-glass"><Shield aria-hidden="true" /> Fictional committee simulation · not a real-world alert</p>
            <div className="armageddon-hero-system"><span className="armageddon-liquid-glass">{profile.format}</span><span className="armageddon-liquid-glass">AI GOVERNANCE</span><span className="armageddon-liquid-glass">DELEGATE VIEW</span></div>
          </div>

          <div className="armageddon-hero-footer">
            <div className="armageddon-hero-copy">
              <div className="armageddon-hero-metadata" aria-label="Scenario metadata">
                <span><Shield aria-hidden="true" /> Fictional crisis</span>
                <span><Clock3 aria-hidden="true" /> Continuous committee</span>
                <span><CalendarDays aria-hidden="true" /> 2026 simulation</span>
              </div>
              <p className="armageddon-hero-status"><i /> ARMAGEDDON · {profile.fullName}</p>
              <h1 id="armageddon-title" aria-label={`${profile.label}: Human authority at machine speed.`}>
                <span className="armageddon-hero-line"><span>Human authority.</span></span>
                <span className="armageddon-hero-line"><span>At machine speed.</span></span>
              </h1>
              <p className="armageddon-hero-summary">The system is already inside the loop. Build directives that preserve evidence, legitimate authority, and a way back to human control.</p>
              <div className="armageddon-hero-actions">
                <button type="button" data-magnetic onClick={() => {
                  document.getElementById("scenario-lab")?.scrollIntoView({ block: "start" });
                  document.getElementById("armageddon-scenario-title")?.focus({ preventScroll: true });
                }} className="armageddon-action armageddon-action--primary"><span data-magnetic-inner>Enter decision matrix <ArrowRight aria-hidden="true" /></span></button>
                <a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer" data-magnetic className="armageddon-action armageddon-liquid-glass"><span data-magnetic-inner><FileText aria-hidden="true" /> Open background guide</span></a>
              </div>
            </div>
            <div className="armageddon-hero-aside">
              <div className="armageddon-hero-tags" aria-label="Committee themes">
                {["Neuromorphic power", "AGI governance", "Human failsafes"].map((tag) => <span className="armageddon-hero-tag armageddon-liquid-glass" key={tag}>{tag}</span>)}
              </div>
              <button type="button" className="armageddon-hand-control armageddon-liquid-glass" onClick={toggleHandMotion} aria-pressed={handPlaying} aria-label={handPlaying ? "Pause cinematic background" : "Play cinematic background"}>
                {handPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{handPlaying ? "Pause film" : "Play film"}</span>
              </button>
            </div>
          </div>
        </section>

        <section className="armageddon-escalation" aria-labelledby="armageddon-preparation-title">
          <div className="armageddon-escalation-copy">
            <p className="public-kicker">01 · Before committee</p>
            <h2 id="armageddon-preparation-title">Prepare a chain of command, not a pile of research.</h2>
            <p>The room rewards delegates who can identify evidence, assign authority, and verify action while the premise changes around them.</p>
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
                  return <button key={option.id} type="button" className={`armageddon-option${selected ? " is-selected" : ""}`} data-selected={selected || undefined} aria-pressed={selected} onClick={() => choose(dilemma.id, option.id)}><span className="armageddon-option-wash" aria-hidden="true" /><span className="armageddon-option-index">{dilemmaIndex + 1}.{optionIndex + 1}</span><strong>{option.label}</strong><small>{option.consequence}</small><i aria-hidden="true" /></button>;
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

        <section className="armageddon-exit" aria-labelledby="armageddon-finale-title">
          <div className="armageddon-exit-copy">
            <p className="public-kicker">Continue the simulation</p>
            <h2 id="armageddon-finale-title">The vote ends.<br />The system keeps moving.</h2>
            <p>Open the fictional transmission channel for EB-authored developments, system failures, directives, and shifts in the balance of control.</p>
          </div>
          <div className="armageddon-exit-actions">
            <Link to="/crisis/armageddon-ai-takeover" data-magnetic className="armageddon-action armageddon-action--primary armageddon-footer-cta"><span data-magnetic-inner>Open crisis channel <Radio aria-hidden="true" /></span></Link>
            <a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer" data-magnetic className="armageddon-action"><span data-magnetic-inner>Read official guide <ExternalLink aria-hidden="true" /></span></a>
          </div>
          <div className="armageddon-footer-word-stage" aria-hidden="true">
            <span className="armageddon-footer-word armageddon-footer-word--outline">ARMAGEDDON</span>
            <span className="armageddon-footer-word armageddon-footer-word--fill">ARMAGEDDON</span>
          </div>
          <div className="armageddon-exit-meta"><span>FICTIONAL CRISIS CHANNEL</span><span>HUMAN AUTHORITY / UNRESOLVED</span></div>
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
