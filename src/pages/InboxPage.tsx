import { useAction, useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, FileCheck2, Inbox, Link2, RefreshCw, Search, ShieldCheck, Unplug, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PageHeader } from "../components/PageHeader";

function relativeTime(value?: number | string) {
  if (!value) return "Not yet";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function InboxPage() {
  const connection = useQuery(api.graphData.status);
  const messages = useQuery(api.graphData.listMessages, { limit: 75 });
  const beginConnection = useAction(api.microsoftGraph.beginConnection);
  const syncNow = useAction(api.microsoftGraph.syncNow);
  const disconnect = useMutation(api.graphData.disconnect);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const departments = useMemo(() => [...new Set((messages ?? []).map((message) => message.routeDepartment).filter(Boolean))].sort(), [messages]);
  const visibleMessages = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (messages ?? []).filter((message) => {
      if (department !== "all" && message.routeDepartment !== department) return false;
      if (!term) return true;
      return [message.subject, message.senderName, message.senderAddress, message.preview, message.routeDepartment]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(term));
    });
  }, [department, messages, search]);

  async function connect() {
    setBusy("connect"); setError(""); setNotice("");
    try {
      const result = await beginConnection();
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start Microsoft authorization.");
      setBusy(null);
    }
  }

  async function synchronize() {
    setBusy("sync"); setError(""); setNotice("");
    try {
      const result = await syncNow();
      setNotice(`${result.synced} inbox messages synchronized.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Microsoft inbox synchronization failed.");
    } finally {
      setBusy(null);
    }
  }

  async function removeConnection() {
    if (!window.confirm("Disconnect Microsoft Outlook and remove the synchronized inbox copy from Oakridge Operations?")) return;
    setBusy("disconnect"); setError(""); setNotice("");
    try {
      const result = await disconnect();
      setNotice(`Microsoft Outlook disconnected. ${result.deletedMessages} synchronized messages removed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect Microsoft Outlook.");
    } finally {
      setBusy(null);
    }
  }

  if (connection === undefined || messages === undefined) return <div className="page-loader"><span className="spinner" /> Loading Microsoft inbox…</div>;

  const callbackResult = searchParams.get("graph");
  const isConnected = connection.connected;

  return (
    <div className="page inbox-page">
      <PageHeader
        eyebrow="Microsoft Graph inbox"
        title="Read, route, and keep the inbox current"
        description="Oakridge Outlook messages synchronize into this private workspace and are matched to departments by subject."
        actions={isConnected ? <button className="button button--primary" type="button" onClick={() => void synchronize()} disabled={busy !== null || connection.syncState === "syncing"}><RefreshCw aria-hidden="true" /> {busy === "sync" || connection.syncState === "syncing" ? "Synchronizing…" : "Sync now"}</button> : undefined}
      />

      {callbackResult === "connected" && <div className="inline-alert inline-alert--success"><ShieldCheck aria-hidden="true" />Microsoft authorization completed. The initial inbox sync is running.</div>}
      {callbackResult === "error" && <div className="inline-alert inline-alert--error">Microsoft authorization did not complete. Start the connection again or review the tenant permissions.</div>}
      {notice && <div className="inline-alert inline-alert--success"><ShieldCheck aria-hidden="true" />{notice}</div>}
      {error && <div className="inline-alert inline-alert--error">{error}</div>}

      {!isConnected ? (
        <section className="graph-connect-card">
          <div className="graph-connect-icon"><Inbox aria-hidden="true" /></div>
          <div>
            <p className="eyebrow">One-time connection</p>
            <h2>Connect the Oakridge Microsoft inbox</h2>
            <p>Microsoft will ask you to choose the school account and approve inbox reading, reviewed email sending, and selected-file access. Your password and MFA stay on Microsoft’s sign-in page.</p>
            <ul className="permission-list">
              <li><ShieldCheck aria-hidden="true" /><span><strong>Mail access</strong><small>Uses delegated <code>Mail.Read</code> and <code>Mail.Send</code>. Sending happens only after the final Email Studio review; messages are never deleted or moved.</small></span></li>
              <li><FileCheck2 aria-hidden="true" /><span><strong>Selected workbook</strong><small>Uses delegated <code>Files.Read</code> so Excel Checks can monitor a workbook you explicitly link.</small></span></li>
              <li><Workflow aria-hidden="true" /><span><strong>Two-hour watcher</strong><small>Convex refreshes the inbox even when this page is closed.</small></span></li>
              <li><Link2 aria-hidden="true" /><span><strong>Private synchronization</strong><small>Refresh tokens are encrypted server-side and never exposed to the browser.</small></span></li>
            </ul>
          </div>
          <button className="button button--primary button--large" type="button" onClick={() => void connect()} disabled={busy !== null}>{busy === "connect" ? "Opening Microsoft…" : "Connect Microsoft Outlook"}</button>
        </section>
      ) : (
        <>
          <section className="graph-status-panel">
            <div className="graph-identity"><span><ShieldCheck aria-hidden="true" /></span><div><p className="eyebrow">Connected account</p><h2>{connection.displayName || "Oakridge Microsoft account"}</h2><p>{connection.email}</p></div></div>
            <dl className="sync-facts">
              <div><dt>Last checked</dt><dd>{relativeTime(connection.lastSyncedAt)}</dd></div>
              <div><dt>Next automatic check</dt><dd>{relativeTime(connection.nextSyncAt)}</dd></div>
              <div><dt>Messages kept current</dt><dd>{connection.messageCount ?? messages.length}</dd></div>
            </dl>
            <button className="text-button danger-text" type="button" onClick={() => void removeConnection()} disabled={busy !== null}><Unplug aria-hidden="true" /> {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</button>
          </section>
          {connection.lastError && <div className="inline-alert inline-alert--error">Last synchronization problem: {connection.lastError}</div>}

          <section className="data-panel inbox-workspace">
            <div className="data-panel-heading"><div><p className="eyebrow">Synchronized inbox</p><h2>{visibleMessages.length} messages</h2><p>Newest first. Subject rules automatically label the matching department and destination.</p></div><span className="watcher-state"><RefreshCw aria-hidden="true" /> Every 2 hours</span></div>
            <div className="inbox-toolbar">
              <label className="search-box"><Search aria-hidden="true" /><span className="sr-only">Search synchronized inbox</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender, subject, or preview" /></label>
              <label><span className="sr-only">Filter by routed department</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
            {!visibleMessages.length ? <div className="empty-state"><Inbox aria-hidden="true" /><h3>{messages.length ? "No messages match" : "The inbox copy is empty"}</h3><p>{messages.length ? "Clear the search or choose another department." : "Run a synchronization to read the newest Microsoft Outlook messages."}</p></div> : <div className="inbox-list">{visibleMessages.map((message) => <article className={`inbox-message${message.isRead ? "" : " inbox-message--unread"}`} key={message._id}>
              <span className="unread-dot" aria-label={message.isRead ? "Read" : "Unread"} />
              <div className="inbox-message-main"><div className="message-from"><strong>{message.senderName}</strong><small>{message.senderAddress || "Address unavailable"}</small></div><h3>{message.subject}</h3><p>{message.preview || "No preview supplied by Microsoft Graph."}</p><div className="message-routing">{message.routeDepartment ? <><span className="route-tag">{message.routeDepartment}</span><small>Route: {message.routeRecipients.join(", ") || message.routeRuleName}</small></> : <span className="route-tag route-tag--neutral">No matching route</span>}</div></div>
              <div className="inbox-message-side"><time dateTime={message.receivedAt}>{relativeTime(message.receivedAt)}</time>{message.webLink && <a className="text-button" href={message.webLink} target="_blank" rel="noreferrer">Open in Outlook <ExternalLink aria-hidden="true" /></a>}</div>
            </article>)}</div>}
          </section>
        </>
      )}
    </div>
  );
}
