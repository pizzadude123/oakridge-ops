import { lazy, useEffect, useRef, useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { AppShell } from "./components/AppShell";
import { SignIn } from "./components/SignIn";
import { oakridgeLogoUrl } from "./lib/assets";
import { importLazyRoute } from "./lib/lazyRoute";
import { workspaceGateState } from "./domain/workspaceGate";

const ContactsPage = lazy(() => importLazyRoute("contacts", () => import("./pages/ContactsPage").then((module) => ({ default: module.ContactsPage }))));
const DashboardPage = lazy(() => importLazyRoute("dashboard", () => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage }))));
const EmailPage = lazy(() => importLazyRoute("email", () => import("./pages/EmailPage").then((module) => ({ default: module.EmailPage }))));
const ExcelPage = lazy(() => importLazyRoute("excel", () => import("./pages/ExcelPage").then((module) => ({ default: module.ExcelPage }))));
const FormsPage = lazy(() => importLazyRoute("forms", () => import("./pages/FormsPage").then((module) => ({ default: module.FormsPage }))));
const InboxPage = lazy(() => importLazyRoute("inbox", () => import("./pages/InboxPage").then((module) => ({ default: module.InboxPage }))));

function Workspace() {
  const status = useQuery(api.workspace.status);
  const bootstrap = useMutation(api.workspace.bootstrap);
  const started = useRef(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const gate = workspaceGateState(status, bootstrapError);

  useEffect(() => {
    if (status?.initialized === false && !started.current) {
      started.current = true;
      setBootstrapError(null);
      void bootstrap().catch((error: unknown) => {
        started.current = false;
        setBootstrapError(error instanceof Error ? error.message : "Oakridge could not finish workspace setup.");
      });
    }
  }, [attempt, bootstrap, status?.initialized]);

  if (gate.mode !== "ready") {
    return (
      <main className="boot-screen boot-screen--workspace" aria-live="polite" role={gate.mode === "error" ? "alert" : "status"}>
        <img src={oakridgeLogoUrl} alt="" />
        {gate.mode === "error" ? <div className="boot-error-mark" aria-hidden="true">!</div> : <div className="spinner" aria-hidden="true" />}
        <h1>{gate.title}</h1>
        <p>{gate.detail}</p>
        {gate.mode === "error" && <button className="button button--primary" type="button" onClick={() => { started.current = false; setBootstrapError(null); setAttempt((value) => value + 1); }}>Retry workspace setup</button>}
      </main>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="email" element={<EmailPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="forms" element={<FormsPage />} />
        <Route path="excel" element={<ExcelPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <main className="boot-screen" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h1>Opening Oakridge Operations</h1>
        </main>
      </AuthLoading>
      <Unauthenticated><SignIn /></Unauthenticated>
      <Authenticated><Workspace /></Authenticated>
    </>
  );
}
