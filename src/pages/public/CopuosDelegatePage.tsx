import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  CirclePause,
  CirclePlay,
  ExternalLink,
  FileText,
  Globe2,
  Orbit,
  RotateCcw,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  calculateScenarioOutcome,
  committeeProfiles,
  type ScenarioMetric,
} from "../../domain/committeeExperience";
import {
  COPUOS_VIDEO_START_SECONDS,
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

const narrativeScenes = [
  {
    index: "01",
    eyebrow: "The mandate",
    title: "The orbital commons needs rules before it needs rescue.",
    body: "Deliberation on Debris Mitigation in Outer Space, with an Emphasis on New Space Junk.",
  },
  {
    index: "02",
    eyebrow: "Classify",
    title: "Define the object before assigning the obligation.",
    body: "Distinguish operational spacecraft, legacy debris, newly generated fragments, and objects whose ownership or control is disputed.",
  },
  {
    index: "03",
    eyebrow: "Coordinate",
    title: "A warning is useful only if someone must act on it.",
    body: "Map who detects conjunctions, who shares warnings, who can manoeuvre, who verifies compliance, and what happens when capability is unequal.",
  },
  {
    index: "04",
    eyebrow: "Codify",
    title: "Write the owner, deadline, financing, and verification chain.",
    body: "A resolution needs registration duties, end-of-life standards, liability, remediation authority, data access, and equitable support—not another promise to cooperate.",
  },
  {
    index: "05",
    eyebrow: "From the dais",
    title: "Read the orbit before you regulate it.",
    body: "Dhanush Malhotra and Naren Ayinala ask delegates to separate technical fact, legal responsibility, national capability, and the mechanism a clause actually creates.",
  },
] as const;

export function CopuosDelegatePage() {
  const profile = committeeProfiles.copuos;
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const [chapter, setChapter] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [heroInViewport, setHeroInViewport] = useState(true);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const selectedIds = useMemo(() => Object.values(selections), [selections]);
  const outcome = useMemo(() => calculateScenarioOutcome("copuos", selectedIds), [selectedIds]);


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
          .from(".copuos-hero-intro > p, .copuos-hero-actions", { y: 20, opacity: 0, filter: "blur(12px)", stagger: .1, duration: .65 }, .42);

        const playhead = { time: COPUOS_VIDEO_START_SECONDS };
        let currentChapter = -1;
        const scrollTrigger = ScrollTrigger.create({
          trigger: stage,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            const nextTime = copuosVideoTimeForProgress(self.progress);
            const nextChapter = Math.min(8, Math.floor(self.progress * 9));
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


      });

      mediaQuery.add("(prefers-reduced-motion: reduce)", () => {
        setStaticFrame();
      });

      return () => mediaElement.removeEventListener("loadedmetadata", initializeVideo);
    }, page);
    return () => { mediaQuery.revert(); context.revert(); };
  }, [heroInViewport, motionEnabled]);

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
                <a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer"><FileText aria-hidden="true" /> Official background guide</a>
              </div>
            </div>

            <div className="copuos-scene-stage" aria-live="polite" aria-atomic="true">
              {narrativeScenes.map((item, index) => <article key={item.index} className={`copuos-film-scene ${index === chapter ? "is-active" : ""} ${index % 2 ? "copuos-film-scene--right" : ""}`}>
                <span>{item.index} / 09</span>
                <p>{item.eyebrow}</p>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                {index === 0 && <a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer"><FileText aria-hidden="true" /> Official background guide</a>}
              </article>)}
              {profile.dilemmas.map((dilemma, dilemmaIndex) => {
                const sceneIndex = dilemmaIndex + narrativeScenes.length;
                return <article key={dilemma.id} className={`copuos-film-scene copuos-film-decision ${sceneIndex === chapter ? "is-active" : ""}`}>
                  <span>0{sceneIndex + 1} / 09 · {dilemma.phase}</span>
                  <p>Make the clause operational</p>
                  <h2>{dilemma.prompt}</h2>
                  <div>{dilemma.options.map((option, optionIndex) => {
                    const selected = selections[dilemma.id] === option.id;
                    return <button key={option.id} type="button" aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => choose(dilemma.id, option.id)}>
                      <small>0{optionIndex + 1}</small><strong>{option.label}</strong><em>{option.consequence}</em>
                    </button>;
                  })}</div>
                </article>;
              })}
              <article className={`copuos-film-scene copuos-film-outcome ${chapter === 8 ? "is-active" : ""}`}>
                <span>09 / 09 · Negotiated outcome</span>
                <p>{outcome.selectedCount}/3 policy layers locked</p>
                <h2>{outcome.assessment}</h2>
                <div className="copuos-film-metrics">{(Object.entries(outcome.metrics) as Array<[ScenarioMetric, number]>).map(([metric, value]) => <div key={metric}><small>{metricLabels[metric]}</small><strong>{value}</strong><i><em style={{ width: `${value}%` }} /></i></div>)}</div>
                <p>{outcome.selectedCount === 0 ? "Choose one response in each policy phase before interpreting the pressure profile." : "Use the weakest dimension as the next moderated-caucus question. Arrive with owners, deadlines, financing, and verification—not only a promise to cooperate."}</p>
                <div className="copuos-film-actions"><button type="button" onClick={() => setSelections({})}><RotateCcw aria-hidden="true" /> Reset policy</button><a href={profile.backgroundGuideUrl} target="_blank" rel="noreferrer">Read the official guide <ExternalLink aria-hidden="true" /></a></div>
              </article>
            </div>
          </div>
        </section>

      </div>
    </PublicShell>
  );
}
