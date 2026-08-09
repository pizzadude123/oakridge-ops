import { useAuthActions } from "@convex-dev/auth/react";
import gsap from "gsap";
import { BarChart3, BookOpenCheck, ContactRound, Home, Inbox, LogOut, Mail, Menu, Presentation, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { oakridgeLogoUrl, oakridgeWhiteLogoUrl } from "../lib/assets";
import { RouteBoundary } from "./RouteBoundary";

const PRIMARY_SENDER = "cattartzz@gmail.com";

const navigation = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/email", label: "Email", icon: Mail },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/contacts", label: "Contacts", icon: ContactRound },
  { to: "/forms", label: "Forms", icon: BookOpenCheck },
  { to: "/excel", label: "Excel checks", icon: BarChart3 },
  { to: "/experience", label: "Delegate experience", icon: Presentation },
];

export function AppShell({ publisherOnly = false }: { publisherOnly?: boolean }) {
  const { signOut } = useAuthActions();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleNavigation = publisherOnly ? navigation.filter((item) => item.to === "/experience") : navigation;


  useLayoutEffect(() => {
    const content = main.current?.firstElementChild;
    if (!content || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(content, { y: 8 }, { y: 0, duration: .42, ease: "power2.out", clearProps: "transform" });
    }, main);
    return () => context.revert();
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <button className="mobile-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu aria-hidden="true" /></button>
      {menuOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={clsx("sidebar", menuOpen && "sidebar--open")}>
        <div className="sidebar-topline">
          <div className="brand-lockup brand-lockup--light">
            <span className="brand-mark"><img src={oakridgeWhiteLogoUrl} alt="" /></span>
            <span><strong>Oakridge MUN</strong><small>{publisherOnly ? "EB Publisher" : "Operations"}</small></span>
          </div>
          <button className="sidebar-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X aria-hidden="true" /></button>
        </div>
        <nav aria-label="Main navigation">
          {visibleNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)} className={({ isActive }) => clsx("nav-link", isActive && "nav-link--active")}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <span>{publisherOnly ? "Restricted access" : "Default email"}</span>
          <strong title={publisherOnly ? "Experience publisher" : PRIMARY_SENDER}>{publisherOnly ? "Experience publisher" : PRIMARY_SENDER}</strong>
          <button type="button" onClick={() => void signOut()}><LogOut aria-hidden="true" /> Sign out</button>
        </div>
      </aside>
      <div className="workspace">
        <header className="mobile-brand">
          <img src={oakridgeLogoUrl} alt="" />
          <span><strong>Oakridge MUN</strong><small>{publisherOnly ? "EB Publisher" : "Operations"}</small></span>
        </header>
        <main ref={main} id="main-content" tabIndex={-1}>
          <RouteBoundary><Outlet /></RouteBoundary>
        </main>
      </div>
    </div>
  );
}
