import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import { clearLazyRouteRecovery, hasLazyRouteRecovery, isLazyRouteFailure } from "../lib/lazyRoute";

type BoundaryProps = { children: ReactNode; routeKey: string };
type BoundaryState = { error: Error | null };

function refreshRoute(routeKey: string) {
  clearLazyRouteRecovery(routeKey);
  const url = new URL(window.location.href);
  url.searchParams.set("refresh", String(Date.now()));
  window.location.replace(url.toString());
}

class RouteErrorBoundaryInner extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Oakridge route render failed", error, info.componentStack);
  }

  retry = () => {
    refreshRoute(this.props.routeKey);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const staleChunk = isLazyRouteFailure(error);
    return (
      <section className="route-error" role="alert" aria-labelledby="route-error-title">
        <span className="route-error-icon"><AlertTriangle aria-hidden="true" /></span>
        <p className="eyebrow">Workspace recovery</p>
        <h1 id="route-error-title">{staleChunk ? "This page was updated" : "This page could not be opened"}</h1>
        <p>{staleChunk ? "A newer Oakridge release is available. Refresh once to load the current page assets." : "Your workspace is still safe. Refresh the page to retry this view."}</p>
        <button className="button button--primary" type="button" onClick={this.retry}><RefreshCw aria-hidden="true" /> Refresh page</button>
      </section>
    );
  }
}

function RouteLoading({ routeKey }: { routeKey: string }) {
  const [recoveryTimedOut, setRecoveryTimedOut] = useState(false);
  useEffect(() => {
    if (!hasLazyRouteRecovery(routeKey)) return;
    const timeout = window.setTimeout(() => setRecoveryTimedOut(true), 4_000);
    return () => window.clearTimeout(timeout);
  }, [routeKey]);
  if (recoveryTimedOut) {
    return (
      <section className="route-error" role="alert" aria-labelledby="route-timeout-title">
        <span className="route-error-icon"><AlertTriangle aria-hidden="true" /></span>
        <p className="eyebrow">Workspace recovery</p>
        <h1 id="route-timeout-title">This page was updated</h1>
        <p>The latest page assets did not finish loading. Refresh once to request a clean copy.</p>
        <button className="button button--primary" type="button" onClick={() => refreshRoute(routeKey)}><RefreshCw aria-hidden="true" /> Refresh page</button>
      </section>
    );
  }
  return (
    <section className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-mark" aria-hidden="true"><span /></span>
      <div><strong>Opening workspace</strong><small>Loading the latest Oakridge view…</small></div>
    </section>
  );
}

export function RouteBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const routeKey = location.pathname.replace(/^\//, "") || "dashboard";
  return (
    <RouteErrorBoundaryInner key={location.pathname} routeKey={routeKey}>
      <Suspense fallback={<RouteLoading routeKey={routeKey} />}>{children}</Suspense>
    </RouteErrorBoundaryInner>
  );
}
