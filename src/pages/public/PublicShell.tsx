import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Radio, ShieldCheck } from "lucide-react";
import { oakridgeWhiteLogoUrl } from "../../lib/assets";

const publicNavigation = [
  { to: "/committees/copuos", label: "COPUOS" },
  { to: "/committees/armageddon", label: "Armageddon" },
  { to: "/crisis/jcc-cold-war", label: "JCC live" },
  { to: "/crisis/armageddon-ai-takeover", label: "AI crisis" },
];

export function PublicShell({ children, variant }: { children: ReactNode; variant: "disec" | "copuos" | "armageddon" | "jcc" }) {
  return (
    <div className={`public-site public-site--${variant}`}>
      <a className="public-skip-link" href="#delegate-content">Skip to delegate briefing</a>
      <header className="public-header">
        <Link className="public-brand" to="/committees/copuos" aria-label="Oakridge MUN delegate experience">
          <img src={oakridgeWhiteLogoUrl} alt="" />
          <span><strong>OAKRIDGE MUN</strong><small>Delegate experience</small></span>
        </Link>
        <nav aria-label="Delegate experience navigation">
          {publicNavigation.map((item) => <NavLink key={item.to} to={item.to}>{item.label}</NavLink>)}
        </nav>
        <Link className="public-operations-link" to="/"><ShieldCheck aria-hidden="true" /> Staff operations</Link>
      </header>
      <main id="delegate-content" tabIndex={-1}>{children}</main>
      <footer className="public-footer">
        <div><Radio aria-hidden="true" /><strong>Oakridge MUN XVI</strong></div>
        <p>Crisis transmissions and scenario outcomes are fictional committee simulation material—not real-world alerts, reporting, or automated advice.</p>
        <Link to="/">Staff sign-in</Link>
      </footer>
    </div>
  );
}
