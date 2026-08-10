import { useEffect, useRef } from "react";

const briefingSignals = [
  { code: "BOUNDARY", text: "Fictional committee simulation · not a real-world alert" },
  { code: "EVIDENCE", text: "Define proof of lost meaningful human control" },
  { code: "AUTHORITY", text: "Map who can act when normal chains fail" },
  { code: "DIRECTIVE", text: "Owner · resource · deadline · fallback · verification" },
  { code: "OUTPUT", text: "Decisions become consequences" },
  { code: "SOURCE", text: "Official background guide" },
] as const;

export function ArmageddonSignalRail() {
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isVisible = true;
    let isDocumentVisible = document.visibilityState === "visible";

    const syncMotion = () => {
      rail.dataset.motion = reducedMotion.matches
        ? "reduced"
        : isVisible && isDocumentVisible
          ? "running"
          : "paused";
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        syncMotion();
      },
      { rootMargin: "120px 0px" },
    );
    const handleVisibility = () => {
      isDocumentVisible = document.visibilityState === "visible";
      syncMotion();
    };

    observer.observe(rail);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", syncMotion);
    syncMotion();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", syncMotion);
    };
  }, []);

  return (
    <section ref={railRef} className="armageddon-signal-rail" aria-label="Armageddon preparation signals" data-motion="paused">
      <ul className="armageddon-signal-list">
        {briefingSignals.map((signal) => <li key={signal.code}><b>{signal.code}</b><span>{signal.text}</span></li>)}
      </ul>
      <div className="armageddon-signal-viewport" aria-hidden="true">
        <div className="armageddon-signal-track">
          {[0, 1].map((copy) => (
            <div className="armageddon-signal-group" key={copy}>
              {briefingSignals.map((signal) => <span key={`${copy}-${signal.code}`}><b>{signal.code}</b><i />{signal.text}</span>)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
