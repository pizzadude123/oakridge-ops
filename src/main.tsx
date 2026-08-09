/* eslint-disable react-refresh/only-export-components */
import "@fontsource-variable/montserrat";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { oakridgeLogoUrl } from "./lib/assets";
import "./styles.css";
import "./brand-guidelines.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function MissingConfiguration() {
  return (
    <main className="configuration-error">
      <img src={oakridgeLogoUrl} alt="" />
      <p className="eyebrow">Setup needed</p>
      <h1>The database address is missing.</h1>
      <p>Copy <code>.env.example</code> to <code>.env.local</code>, add <code>VITE_CONVEX_URL</code>, and restart the app.</p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convex ? (
      <ConvexAuthProvider client={convex}>
        <HashRouter>
          <App />
        </HashRouter>
      </ConvexAuthProvider>
    ) : (
      <MissingConfiguration />
    )}
  </React.StrictMode>,
);
