import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useQuery } from "convex/react";
import {
  ArrowDown,

  CirclePause,
  CirclePlay,
  ExternalLink,
  FileText,
  Globe2,
  Orbit,
  Play,
  Radio,
  RotateCcw,
  Satellite,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  calculateScenarioOutcome,
  committeeProfiles,
  toYouTubeEmbedUrl,
  type ScenarioMetric,
} from "../../domain/committeeExperience";
import {
  COPUOS_VIDEO_START_SECONDS,
  copuosChapterForProgress,
  copuosVideoTimeForProgress,
} from "../../domain/copuosExperience";
import { PublicShell } from "./PublicShell";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const copuosVideo = `${import.meta.env.BASE_URL}copuos-orbit-scroll.mp4`;
const copuosVideoMobile = `${import.meta.env.BASE_URL}copuos-orbit-scroll-mobile.mp4`;
const copuosVideoFallback = `${import.meta.env.BASE_URL}copuos-orbit-scroll.webm`;
const copuosPoster = `${import.meta.env.BASE_URL}copuos-orbit-poster.jpg`;

const metricLabels: Record<ScenarioMetric, string> = {
  consensus: "International consensus",
  control: "Operational enforceability",
  legitimacy: "Equitable legitimacy",
};

const chapters = [
  {
    index: "01",
    time: "05.00",
    eyebrow: "One atmosphere",
    title: "Every orbit begins on shared ground.",
    body: "The first launch decision already determines registration, disposal, collision risk, and who must answer when an object stops responding.",
  },
  {
    index: "02",
    time: "30.00",
    eyebrow: "A shared orbital room",
    title: "Space arrives early. So must governance.",
    body: "No border contains a debris cloud. Warning data, launch choices, and remediation duties have to cross jurisdictions before fragments cross trajectories.",
  },
  {
    index: "03",
    time: "45.00",
    eyebrow: "New space junk",
    title: "A collision is a policy failure at orbital speed.",
    body: "Delegates must connect detection, attribution, avoidance, end-of-life rules, and financing instead of treating debris as a purely technical problem.",
  },
  {
    index: "04",
    time: "65.00",
    eyebrow: "The commons after launch",
    title: "Write rules that survive re-entry.",
    body: "The resolution must be verifiable, affordable for emerging space actors, enforceable against repeat risk, and precise about who acts next.",
  },
] as const;

export function CopuosDelegatePage() {
  const profile = committeeProfiles.copuos;
  const media = useQuery(api.committeeExperience.publicCommitteeMedia, { committee: "copuos" });
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const timeReadout = useRef<HTMLElement>(null);
  const [chapter, setChapter] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [heroInViewport, setHeroInViewport] = useState(true);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const selectedIds = useMemo(() => Object.values(selections), [selections]);
  const outcome = useMemo(() => calculateScenarioOutcome("copuos", selectedIds), [selectedIds]);
  const embedUrl = media ? toYouTubeEmbedUrl(media.videoUrl) : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = "COPUOS Delegate Experience · Oakridge MUN";
    document.documentElement.classList.add("copuos-scrollbar-hidden");
    document.body.classList.add("copuos-scrollbar-hidden");
    return () => {
      document.title = "Oakridge MUN Operations";
      document.documentElement.classList.remove("copuos-scrollbar-hidden");
      document.body.classList.remove("copuos-scrollbar-hidden");
    };
  }, []);

  useEffect(() => {
    const page = root.current;
    const stage = hero.current;
    if (!page || !stage) return;
    let heroVisible = true;
    const syncVisibility = () => {
      page.dataset.motion = motionEnabled && !document.hidden && heroVisible ? "running" : "paused";
    };
    const observer = new IntersectionObserver(([entry]) => {
      heroVisible = Boolean(entry?.isIntersecting);
      setHeroInViewport(heroVisible);
      syncVisibility();
    }, { threshold: .01 });
    observer.observe(stage);
    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [motionEnabled]);

  useLayoutEffect(() => {
    const page = root.current;
    const stage = hero.current;
    const mediaElement = video.current;
    if (!page || !stage || !mediaElement || !heroInViewport) return;

    const mediaQuery = gsap.matchMedia();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const context = gsap.context(() => {
      const setVideoTime = (seconds: number) => {
        const encodedSeconds = Math.max(0, seconds - COPUOS_VIDEO_START_SECONDS);
        if (mediaElement.readyState < 1 || Math.abs(mediaElement.currentTime - encodedSeconds) < 1 / 45) return;
        mediaElement.currentTime = encodedSeconds;
        if (timeReadout.current) timeReadout.current.textContent = `${seconds.toFixed(2)} SEC`;
      };
      const setStaticFrame = () => {
        page.style.setProperty("--copuos-progress", ".12");
        setVideoTime(30);
        setChapter(1);
      };
      const initializeVideo = () => {
        if (!motionEnabled || reducedMotion.matches) setStaticFrame();
        else setVideoTime(COPUOS_VIDEO_START_SECONDS);
      };
      mediaElement.addEventListener("loadedmetadata", initializeVideo);
      initializeVideo();

      mediaQuery.add("(prefers-reduced-motion: no-preference)", () => {
        if (!motionEnabled) {
          setStaticFrame();
          return;
        }

        const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
        intro
          .from(".copuos-hero-brand", { y: 18, opacity: 0, filter: "blur(12px)", duration: .8 })
          .from(".copuos-title-line > span", { yPercent: 110, rotateX: -16, filter: "blur(16px)", stagger: .09, duration: .85 }, .15)
          .from(".copuos-hero-intro > p, .copuos-hero-actions", { y: 20, opacity: 0, filter: "blur(12px)", stagger: .1, duration: .65 }, .42)
          .from(".copuos-telemetry", { x: 18, opacity: 0, stagger: .07, duration: .55 }, .58);

        const playhead = { time: COPUOS_VIDEO_START_SECONDS };
        let currentChapter = -1;
        const scrollTrigger = ScrollTrigger.create({
          trigger: stage,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            const nextTime = copuosVideoTimeForProgress(self.progress);
            const nextChapter = copuosChapterForProgress(self.progress);
            page.style.setProperty("--copuos-progress", String(self.progress));
            gsap.to(playhead, {
              time: nextTime,
              duration: .24,
              ease: "power2.out",
              overwrite: "auto",
              onUpdate: () => setVideoTime(playhead.time),
            });
            if (nextChapter !== currentChapter) {
              currentChapter = nextChapter;
              setChapter(nextChapter);
            }
          },
        });
        scrollTrigger.update();

        gsap.to(".copuos-orbit-line--one", { strokeDashoffset: -520, ease: "none", scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 1.4 } });
        gsap.to(".copuos-orbit-line--two", { strokeDashoffset: 420, ease: "none", scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 1.8 } });
        gsap.to(".copuos-orbit-node", { motionPath: undefined, rotate: 220, transformOrigin: "50% 50%", ease: "none", scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 1.2 } });

      });

      mediaQuery.add("(prefers-reduced-motion: reduce)", () => {
        setStaticFrame();
      });

      return () => mediaElement.removeEventListener("loadedmetadata", initializeVideo);
    }, page);
    return () => { mediaQuery.revert(); context.revert(); };
  }, [heroInViewport, motionEnabled]);

  useLayoutEffect(() => {
    const page = root.current;
    if (!page) return;
    const mediaQuery = gsap.matchMedia();
    const context = gsap.context(() => {
      mediaQuery.add("(prefers-reduced-motion: no-preference)", () => {
        const cleanups: Array<() => void> = [];
        gsap.utils.toArray<HTMLElement>(".copuos-reveal").forEach((section) => {
          gsap.from(section.querySelectorAll(":scope > *"), {
            y: 34,
            opacity: 0,
            filter: "blur(12px)",
            stagger: .075,
            duration: .72,
            ease: "power3.out",
            scrollTrigger: { trigger: section, start: "top 82%", once: true },
          });
        });
        gsap.utils.toArray<HTMLElement>("[data-copuos-tilt]").forEach((card) => {
          const move = (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            const bounds = card.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - .5;
            const y = (event.clientY - bounds.top) / bounds.height - .5;
            gsap.to(card, { rotateY: x * 5, rotateX: y * -5, y: -5, duration: .45, ease: "power3.out", overwrite: "auto" });
          };
          const reset = () => gsap.to(card, { rotateX: 0, rotateY: 0, y: 0, duration: .7, ease: "elastic.out(1,.55)", overwrite: "auto" });
          card.addEventListener("pointermove", move);
          card.addEventListener("pointerleave", reset);
          card.addEventListener("blur", reset, true);
          cleanups.push(() => {
            card.removeEventListener("pointermove", move);
            card.removeEventListener("pointerleave", reset);
            card.removeEventListener("blur", reset, true);
            gsap.killTweensOf(card);
          });
        });
        return () => cleanups.forEach((cleanup) => cleanup());
      });
    }, page);
    return () => { mediaQuery.revert(); context.revert(); };
  }, []);

  function choose(dilemmaId: string, optionId: string) {
    setSelections((current) => ({ ...current, [dilemmaId]: optionId }));
  }

  return (
    <PublicShell variant="copuos">
      <div ref={root} className="copuos-experience" data-motion={motionEnabled ? "running" : "paused"}>
        <div className="copuos-site-film" aria-hidden="true">
          <video ref={video} muted playsInline preload="auto" poster={copuosPoster}>
            <source media="(max-width: 700px)" src={copuosVideoMobile} type="video/mp4" />
            <source media="(min-width: 701px)" src={copuosVideo} type="video/mp4" />
            <source src={copuosVideoFallback} type="video/webm" />
          </video>
          <div className="copuos-video-grade" />
        </div>
        <section ref={hero} className="copuos-scroll-hero" aria-labelledby="copuos-title">
          <div className="copuos-sticky-frame">
            <svg className="copuos-orbit-map" viewBox="0 0 1000 1000" aria-hidden="true">
              <ellipse className="copuos-orbit-line copuos-orbit-line--one" cx="500" cy="500" rx="420" ry="190" />
              <ellipse className="copuos-orbit-line copuos-orbit-line--two" cx="500" cy="500" rx="320" ry="430" transform="rotate(51 500 500)" />
              <circle className="copuos-orbit-node" cx="885" cy="430" r="7" />
            </svg>

            <div className="copuos-hero-brand">
              <span><Globe2 aria-hidden="true" /> OAKRIDGE MUN XVI</span>
              <span>24—26 JULY 2026</span>
            </div>

            <button className="copuos-motion-control" type="button" aria-pressed={!motionEnabled} onClick={() => setMotionEnabled((current) => !current)}>
              {motionEnabled ? <CirclePause aria-hidden="true" /> : <CirclePlay aria-hidden="true" />}
              {motionEnabled ? "Pause motion" : "Resume motion"}
            </button>

            <div className="copuos-hero-intro">
              <p className="copuos-kicker"><Orbit aria-hidden="true" /> Committee on the Peaceful Uses of Outer Space</p>
              <h1 id="copuos-title" aria-label="COPUOS: Orbit is not empty. It is shared.">
                <span className="copuos-title-line"><span>COPUOS</span></span>
                <span className="copuos-title-line copuos-title-line--thesis"><span>Orbit is not empty.</span></span>
                <span className="copuos-title-line copuos-title-line--thesis"><span>It is shared.</span></span>
              </h1>
              <p>{profile.overview}</p>
              <div className="copuos-hero-actions">
                <a href="#copuos-policy-lab">Enter the policy lab <ArrowDown aria-hidden="true" /></a>
                <a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer"><FileText aria-hidden="true" /> Official background guide</a>
              </div>
            </div>

            <div className="copuos-chapter-stage" aria-live="polite" aria-atomic="true">
              {chapters.map((item, index) => <article key={item.index} className={index === chapter ? "is-active" : ""} aria-hidden={index !== chapter}>
                <div><span>{item.index}</span><small>{item.time} SEC</small></div>
                <p>{item.eyebrow}</p>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </article>)}
            </div>

            <div className="copuos-telemetry" aria-hidden="true">
              <span><b>FRAME</b><em ref={timeReadout}>05.00 SEC</em></span>
              <span><b>ALTITUDE</b><em>SHARED DOMAIN</em></span>
              <span><b>AGENDA</b><em>DEBRIS / NEW SPACE JUNK</em></span>
            </div>
            <div className="copuos-scroll-meter" aria-hidden="true"><i /><span>SCROLL TO LEAVE EARTH</span></div>
          </div>
        </section>

        <section className="copuos-agenda copuos-reveal" aria-labelledby="copuos-agenda-title">
          <div className="copuos-section-index"><span>01</span><small>THE MANDATE</small></div>
          <div className="copuos-agenda-copy">
            <p className="copuos-kicker">The problem is invisible until trajectories intersect</p>
            <h2 id="copuos-agenda-title">The orbital commons needs rules before it needs rescue.</h2>
            <p>{profile.agenda}</p>
          </div>
          <ol>
            {profile.preparation.map((item, index) => <li key={item} data-copuos-tilt tabIndex={0}><span>0{index + 1}</span><div><small>{["CLASSIFY", "COORDINATE", "CODIFY"][index]}</small><p>{item}</p></div><Satellite aria-hidden="true" /></li>)}
          </ol>
        </section>

        <section className="copuos-dais copuos-reveal" aria-labelledby="copuos-dais-title">
          <div className="copuos-dais-media">
            <div className="copuos-media-status"><span>DAIS TRANSMISSION</span><small>{media ? "PUBLISHED" : "AWAITING PUBLICATION"}</small></div>
            <div className="chair-video">
              {media === undefined ? <div className="chair-video-state"><span className="signal-loader" /><p>Checking the briefing channel…</p></div> : embedUrl && media ? <iframe src={embedUrl} title={`${media.title} — ${media.speaker}`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div className="chair-video-state"><Play aria-hidden="true" /><p>Chair explainer awaiting EB publication</p><small>The dais can publish its preparation briefing from staff operations.</small></div>}
            </div>
          </div>
          <div className="copuos-dais-copy">
            <p className="copuos-kicker">02 · From the dais</p>
            <h2 id="copuos-dais-title">{media?.title || "Read the orbit before you regulate it."}</h2>
            <p>{media?.description || "Use the background guide to separate technical fact, legal responsibility, national capability, and the negotiated mechanism your draft resolution actually creates."}</p>
            {media && <strong>{media.speaker}</strong>}
            <div className="copuos-chair-roster"><Users aria-hidden="true" /><div>{profile.chairs.map((chair) => <span key={chair.name}><b>{chair.name}</b><small>{chair.role}</small></span>)}</div></div>
          </div>
        </section>

        <section id="copuos-policy-lab" className="copuos-policy-lab copuos-reveal" aria-labelledby="copuos-policy-title">
          <header>
            <div><p className="copuos-kicker">03 · Orbital policy lab</p><h2 id="copuos-policy-title">Build a debris mandate that survives the launch window.</h2></div>
            <button type="button" onClick={() => setSelections({})}><RotateCcw aria-hidden="true" /> Reset policy</button>
          </header>
          <p className="copuos-disclosure"><Shield aria-hidden="true" /> Deterministic preparation simulation. The pressure profile exposes trade-offs; it is not AI judgment or a prediction of committee results.</p>
          <div className="copuos-policy-grid">
            <div className="copuos-dilemmas">
              {profile.dilemmas.map((dilemma) => <fieldset key={dilemma.id}>
                <legend><span>{dilemma.phase}</span>{dilemma.prompt}</legend>
                <div>{dilemma.options.map((option, optionIndex) => {
                  const selected = selections[dilemma.id] === option.id;
                  return <button data-copuos-tilt key={option.id} type="button" aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => choose(dilemma.id, option.id)}>
                    <span>0{optionIndex + 1}</span><strong>{option.label}</strong><small>{option.consequence}</small><i aria-hidden="true" />
                  </button>;
                })}</div>
              </fieldset>)}
            </div>
            <aside className="copuos-outcome" aria-live="polite" aria-atomic="true">
              <div className="copuos-outcome-signal"><Radio aria-hidden="true" /><span>{outcome.selectedCount}/3 POLICY LAYERS LOCKED</span></div>
              <div className="copuos-radar" aria-hidden="true"><i /><i /><i /><span /></div>
              <h3>Orbital pressure profile</h3>
              <p>{outcome.assessment}</p>
              <div className="copuos-metrics">{(Object.entries(outcome.metrics) as Array<[ScenarioMetric, number]>).map(([metric, value]) => <div key={metric}><span><b>{metricLabels[metric]}</b><strong>{value}</strong></span><i><em style={{ width: `${value}%` }} /></i></div>)}</div>
              <small>Use the weakest dimension as the next moderated-caucus question—not as a score to maximize blindly.</small>
            </aside>
          </div>
        </section>

        <section className="copuos-finale copuos-reveal" aria-labelledby="copuos-finale-title">
          <div><p className="copuos-kicker"><Sparkles aria-hidden="true" /> The view changed. The obligation did not.</p><h2 id="copuos-finale-title">Leave Earth.<br />Keep responsibility.</h2></div>
          <div><p>Arrive with definitions, owners, deadlines, financing, and a verification chain—not only a promise to cooperate.</p><a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer">Read the official guide <ExternalLink aria-hidden="true" /></a></div>
        </section>
      </div>
    </PublicShell>
  );
}
