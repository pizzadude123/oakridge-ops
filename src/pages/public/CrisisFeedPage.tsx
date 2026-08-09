import gsap from "gsap";
import { useQuery } from "convex/react";
import { AlertTriangle, ArrowUp, Clock3, Radio, Satellite, ShieldAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { crisisChannelProfiles, type CrisisChannel } from "../../domain/committeeExperience";
import { PublicShell } from "./PublicShell";

const routeChannels: Record<string, CrisisChannel> = {
  "jcc-cold-war": "jcc",
  "armageddon-ai-takeover": "armageddon",
};

function formatTransmissionTime(timestamp?: number) {
  if (!timestamp) return "Publication time unavailable";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function CrisisFeedPage() {
  const { slug } = useParams();
  const channel = slug ? routeChannels[slug] : undefined;
  if (!channel) return <Navigate to="/crisis/jcc-cold-war" replace />;
  return <CrisisConsole channel={channel} />;
}

function CrisisConsole({ channel }: { channel: CrisisChannel }) {
  const updates = useQuery(api.committeeExperience.publicCrisisUpdates, { channel });
  const profile = crisisChannelProfiles[channel];
  const root = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeUpdate = useMemo(() => updates?.find((update) => update._id === activeId) ?? updates?.[0], [activeId, updates]);
  const hasNewerUpdate = Boolean(activeId && updates?.[0] && updates[0]._id !== activeId);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${profile.label} Crisis Channel · Oakridge MUN`;
    return () => { document.title = "Oakridge MUN Operations"; };
  }, [profile.label]);

  useLayoutEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline
        .from(".crisis-console-header > *", { y: 14, stagger: .08, duration: .45 })
        .from(".crisis-stage", { clipPath: "inset(0 0 100% 0)", duration: .7 }, "-=.25")
        .from(".transmission-index", { x: -16, duration: .45 }, "-=.3");
    }, root);
    return () => context.revert();
  }, [channel]);

  return (
    <PublicShell variant={channel === "jcc" ? "jcc" : "armageddon"}>
      <div ref={root} className={`crisis-console crisis-console--${channel}`}>
        <header className="crisis-console-header">
          <p className="public-kicker"><span className="live-pulse" /> Live simulation channel</p>
          <h1>{profile.label}</h1>
          <p>{profile.agenda}</p>
          <div className="crisis-context"><ShieldAlert aria-hidden="true" /><span>{profile.context}</span></div>
          <div className="crisis-classification"><b>MODEL UN SIMULATION</b><span>FICTIONAL CRISIS COMMUNICATIONS</span><span>NOT A REAL-WORLD ALERT</span></div>
        </header>

        <div className="crisis-signal-board" aria-hidden="true">
          {channel === "jcc" ? <><div className="war-map"><i /><i /><i /><span>MOSCOW</span><span>TEHRAN</span><span>WASHINGTON</span><b>ALLIANCE SIGNAL / 1943</b></div></> : <><div className="neural-grid"><i /><i /><i /><i /><strong>SYS<br />OVERRIDE</strong><span>HUMAN AUTHORITY<br />UNVERIFIED</span></div></>}
        </div>

        {updates === undefined ? <section className="crisis-loading"><span className="signal-loader" /><p>Opening encrypted committee channel…</p></section> : updates.length === 0 ? <section className="crisis-empty"><Satellite aria-hidden="true" /><p className="public-kicker">Channel established</p><h2>Awaiting the first EB transmission.</h2><p>The public feed is connected. Drafts remain private until an Executive Board publisher releases them.</p></section> : <section className="crisis-stage">
          <aside className="transmission-index" aria-label="Published crisis updates">
            <header><Radio aria-hidden="true" /><span>{updates.length} transmission{updates.length === 1 ? "" : "s"}</span></header>
            {updates.map((update) => <button key={update._id} type="button" className={activeUpdate?._id === update._id ? "is-active" : ""} onClick={() => setActiveId(update._id)} aria-pressed={activeUpdate?._id === update._id}><span>#{String(update.updateNumber).padStart(2, "0")}</span><div><small>{update.transmission} · {update.severity}</small><strong>{update.headline}</strong><time dateTime={update.publishedAt ? new Date(update.publishedAt).toISOString() : undefined}>{formatTransmissionTime(update.publishedAt)}</time></div></button>)}
          </aside>

          <article className={`transmission-detail transmission-detail--${activeUpdate?.severity}`} aria-live="polite">
            {hasNewerUpdate && <button className="new-transmission" type="button" onClick={() => setActiveId(updates[0]._id)}><ArrowUp aria-hidden="true" /> New transmission available</button>}
            {activeUpdate && <>
              <header><div><span>UPDATE {String(activeUpdate.updateNumber).padStart(2, "0")}</span><b>{activeUpdate.severity}</b></div><p>{activeUpdate.transmission} / {activeUpdate.sourceLabel}</p></header>
              <h2>{activeUpdate.headline}</h2>
              <p className="transmission-body">{activeUpdate.briefing}</p>
              {activeUpdate.affectedPortfolios.length > 0 && <div className="affected-portfolios"><small>Affected portfolios / actors</small><div>{activeUpdate.affectedPortfolios.map((portfolio) => <span key={portfolio}>{portfolio}</span>)}</div></div>}
              <footer><Clock3 aria-hidden="true" /><time dateTime={activeUpdate.publishedAt ? new Date(activeUpdate.publishedAt).toISOString() : undefined}>{formatTransmissionTime(activeUpdate.publishedAt)}</time><span>Fictional committee simulation</span></footer>
            </>}
          </article>
        </section>}

        <section className="delegate-response-protocol">
          <p className="public-kicker">Delegate response protocol</p>
          <ol><li><span>01</span><p>Separate confirmed facts in the update from assumptions your portfolio is making.</p></li><li><span>02</span><p>Identify who now has capability, authority, information, and time.</p></li><li><span>03</span><p>Write the next directive with an owner, resource, deadline, fallback, and verification method.</p></li></ol>
          <div><AlertTriangle aria-hidden="true" /><p>Do not treat this interface as real news. Every transmission is authored for the Oakridge MUN committee simulation.</p></div>
        </section>
      </div>
    </PublicShell>
  );
}
