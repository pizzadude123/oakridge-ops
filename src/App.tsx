import { useEffect, useRef } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { AppShell } from "./components/AppShell";
import { SignIn } from "./components/SignIn";
import { ContactsPage } from "./pages/ContactsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmailPage } from "./pages/EmailPage";
import { ExcelPage } from "./pages/ExcelPage";
import { oakridgeLogoUrl } from "./lib/assets";
import { FormsPage } from "./pages/FormsPage";

function Workspace() {
  const status = useQuery(api.workspace.status);
  const bootstrap = useMutation(api.workspace.bootstrap);
  const started = useRef(false);

  useEffect(() => {
    if (status?.initialized === false && !started.current) {
      started.current = true;
      void bootstrap().catch(() => {
        started.current = false;
      });
    }
  }, [bootstrap, status?.initialized]);

  if (!status?.initialized) {
    return (
      <main className="boot-screen" aria-live="polite">
        <img src={oakridgeLogoUrl} alt="" />
        <div className="spinner" aria-hidden="true" />
        <h1>Preparing your Oakridge workspace</h1>
        <p>Adding the two test contacts and safe routing rules.</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell gmailSender={status.settings?.gmailSender ?? "nagapranayimmadi@gmail.com"} />}>
        <Route index element={<DashboardPage />} />
        <Route path="email" element={<EmailPage />} />
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
