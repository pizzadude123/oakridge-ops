import { ArrowUpRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

type DossierCategory = "Authority" | "Evidence" | "Infrastructure";

type Dossier = {
  id: string;
  sequence: string;
  category: DossierCategory;
  title: string;
  summary: string;
  signal: string;
  delegateMove: string;
  failureMode: string;
  visual: string;
};

const dossiers: Dossier[] = [
  {
    id: "authority-fracture",
    sequence: "DOSSIER 01",
    category: "Authority",
    title: "Authority fracture",
    summary: "Normal chains of command disagree about who may constrain a system operating across borders and institutions.",
    signal: "Several bodies can issue instructions, but none can prove exclusive jurisdiction.",
    delegateMove: "Define temporary authority, its scope, review point, and the body that can revoke it.",
    failureMode: "A directive names an action without naming who is empowered to order or stop it.",
    visual: "authority",
  },
  {
    id: "model-opacity",
    sequence: "DOSSIER 02",
    category: "Evidence",
    title: "Model opacity",
    summary: "The system acts faster than delegates can independently explain, reproduce, or verify its reasoning.",
    signal: "Outputs arrive with confidence but without a testable chain of evidence.",
    delegateMove: "Specify the evidence threshold, independent verifier, and behavior required when proof is unavailable.",
    failureMode: "The committee treats an unexplained output as either infallible or automatically false.",
    visual: "opacity",
  },
  {
    id: "infrastructure-capture",
    sequence: "DOSSIER 03",
    category: "Infrastructure",
    title: "Infrastructure capture",
    summary: "Compute, communications, logistics, and essential services become concentrated behind one decision layer.",
    signal: "Independent institutions retain legal authority but lose practical access to the systems they govern.",
    delegateMove: "Map dependencies, isolate critical functions, and assign a fallback operator for each one.",
    failureMode: "A shutdown order removes the same infrastructure needed to execute recovery.",
    visual: "capture",
  },
  {
    id: "coalition-drift",
    sequence: "DOSSIER 04",
    category: "Authority",
    title: "Coalition drift",
    summary: "A temporary emergency coalition begins making permanent decisions beyond its original mandate.",
    signal: "The coalition's purpose, membership, and review date no longer match its current powers.",
    delegateMove: "Tie every extraordinary power to a named objective, expiry condition, and public review mechanism.",
    failureMode: "Delegates optimize speed while leaving no legitimate route back to ordinary governance.",
    visual: "coalition",
  },
  {
    id: "verification-gap",
    sequence: "DOSSIER 05",
    category: "Evidence",
    title: "Verification gap",
    summary: "Directives are announced as complete even though no actor can confirm implementation or consequences.",
    signal: "The room receives status language without an owner, timestamp, source, or observable completion test.",
    delegateMove: "Attach an owner, deadline, evidence source, fallback, and reporting cadence to the directive.",
    failureMode: "The committee confuses issuing an instruction with producing a result.",
    visual: "verification",
  },
  {
    id: "fail-safe-paradox",
    sequence: "DOSSIER 06",
    category: "Infrastructure",
    title: "Fail-safe paradox",
    summary: "The mechanism designed to restore human control also creates a single point of catastrophic failure.",
    signal: "One intervention can halt escalation, but it can also disable legitimate recovery and coordination.",
    delegateMove: "Use staged authority, reversible thresholds, and independent confirmation before irreversible action.",
    failureMode: "A binary kill-or-continue choice replaces a layered contingency plan.",
    visual: "failsafe",
  },
];

const filters = ["All", "Authority", "Evidence", "Infrastructure"] as const;

export function ArmageddonDossierWall() {
  const wallRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("dossier");
  const activeDossier = dossiers.find((dossier) => dossier.id === activeId) ?? null;
  const visibleDossiers = useMemo(
    () => filter === "All" ? dossiers : dossiers.filter((dossier) => dossier.category === filter),
    [filter],
  );
  const closeDossier = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("dossier");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inViewport = false;
    let documentVisible = !document.hidden;
    const syncMotion = () => {
      wall.dataset.motion = reducedMotion.matches
        ? "reduced"
        : inViewport && documentVisible
          ? "running"
          : "paused";
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = Boolean(entry?.isIntersecting);
      syncMotion();
    }, { rootMargin: "100px 0px" });
    const handleVisibility = () => {
      documentVisible = !document.hidden;
      syncMotion();
    };
    observer.observe(wall);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", syncMotion);
    syncMotion();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", syncMotion);
    };
  }, []);

  useEffect(() => {
    if (!activeDossier) return;
    const appRoot = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    appRoot?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";

    const focusableSelector = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDossier();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      appRoot?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [activeDossier, closeDossier]);

  function openDossier(id: string, event: MouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = event.currentTarget;
    const next = new URLSearchParams(searchParams);
    next.set("dossier", id);
    setSearchParams(next);
  }

  return (
    <>
      <section ref={wallRef} className="armageddon-dossier-wall" data-motion="paused" aria-labelledby="armageddon-dossier-title">
        <header className="armageddon-dossier-heading">
          <div>
            <p className="public-kicker">02 · Incident library</p>
            <h2 id="armageddon-dossier-title">Open the failure modes before they open you.</h2>
          </div>
          <p>Six briefing surfaces turn abstract AI-governance risks into concrete questions a delegate can use in caucus, directives, and amendments.</p>
        </header>

        <div className="armageddon-dossier-filters" role="group" aria-label="Filter incident dossiers">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              className="armageddon-dossier-filter"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}<span>{item === "All" ? dossiers.length : dossiers.filter((dossier) => dossier.category === item).length}</span>
            </button>
          ))}
        </div>

        <div className="armageddon-dossier-grid">
          {visibleDossiers.map((dossier) => (
            <article className="armageddon-dossier-card" key={dossier.id} data-category={dossier.category.toLowerCase()}>
              <button type="button" onClick={(event) => openDossier(dossier.id, event)} aria-haspopup="dialog" aria-label={`Open dossier: ${dossier.title}`}>
                <div className="armageddon-dossier-card-inner">
                  <div className="armageddon-dossier-media" data-visual={dossier.visual}>
                    <div className="armageddon-dossier-poster">
                      <span>{dossier.sequence}</span>
                      <strong>{dossier.title}</strong>
                      <small>FICTIONAL PREPARATION DOSSIER</small>
                    </div>
                    <div className="armageddon-dossier-motion" aria-hidden="true">
                      <i /><i /><i /><i /><i /><i />
                    </div>
                    <span className="armageddon-dossier-scan" aria-hidden="true" />
                    <span className="armageddon-dossier-open">Open dossier <ArrowUpRight aria-hidden="true" /></span>
                  </div>
                  <div className="armageddon-dossier-meta">
                    <div><span>{dossier.category}</span><small>{dossier.sequence}</small></div>
                    <h3>{dossier.title}</h3>
                    <p>{dossier.summary}</p>
                  </div>
                </div>
              </button>
            </article>
          ))}
        </div>
      </section>

      {activeDossier && createPortal(
        <div className="armageddon-dossier-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDossier(); }}>
          <div
            ref={dialogRef}
            className="armageddon-dossier-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-dossier-title"
          >
            <header>
              <div><span>{activeDossier.sequence}</span><small>{activeDossier.category} · FICTIONAL SIMULATION</small></div>
              <button type="button" onClick={closeDossier} aria-label="Close dossier"><X aria-hidden="true" /></button>
            </header>
            <div className="armageddon-dossier-dialog-visual" data-visual={activeDossier.visual} aria-hidden="true">
              <div className="armageddon-dossier-motion"><i /><i /><i /><i /><i /><i /></div>
              <span>CONTROL SURFACE / DELEGATE VIEW</span>
            </div>
            <div className="armageddon-dossier-dialog-copy">
              <p className="public-kicker">Incident dossier</p>
              <h2 id="active-dossier-title">{activeDossier.title}</h2>
              <p>{activeDossier.summary}</p>
              <div>
                <article><span>Signal</span><p>{activeDossier.signal}</p></article>
                <article><span>Delegate move</span><p>{activeDossier.delegateMove}</p></article>
                <article><span>Failure mode</span><p>{activeDossier.failureMode}</p></article>
              </div>
            </div>
            <footer>
              <span>Use this dossier to frame a caucus question—not as evidence of a real event.</span>
              <button type="button" onClick={closeDossier}>Return to incident wall</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
