import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { AlertOctagon, Bell, BellRing, CheckCircle2, Download, ExternalLink, FileCheck2, FileWarning, Link2, RefreshCw, School, ShieldCheck, Unplug, UserRoundX } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../convex/_generated/api";
import { FileDrop } from "../components/FileDrop";
import { PageHeader } from "../components/PageHeader";
import { analyzeAllocations, buildRegistrationTimeline, type AllocationRow, type RegistrationRecord } from "../domain/operations";
import { downloadCsv, parseAllocationFile } from "../lib/workbook";

function relativeTime(value?: number | string) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : formatDistanceToNow(date, { addSuffix: true });
}

export function ExcelPage() {
  const storedAllocations = useQuery(api.operationsData.allocations);
  const storedRegistrations = useQuery(api.operationsData.registrations);
  const liveStatus = useQuery(api.workbookData.status);
  const liveAlerts = useQuery(api.workbookData.listAlerts, { limit: 10 });
  const replaceAllocations = useMutation(api.operationsData.replaceAllocations);
  const connectWorkbook = useAction(api.microsoftWorkbook.connectWorkbook);
  const syncWorkbook = useAction(api.microsoftWorkbook.syncNow);
  const beginMicrosoftConnection = useAction(api.microsoftGraph.beginConnection);
  const disconnectWorkbook = useMutation(api.workbookData.disconnect);
  const acknowledgeAlerts = useMutation(api.workbookData.acknowledgeAlerts);
  const [busy, setBusy] = useState(false);
  const [monitorBusy, setMonitorBusy] = useState<"microsoft" | "connect" | "sync" | "disconnect" | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [monitorMessage, setMonitorMessage] = useState("");
  const [monitorError, setMonitorError] = useState("");
  const [issueFilter, setIssueFilter] = useState<"all" | "duplicates" | "schools">("all");
  const initializedAlerts = useRef(false);
  const notifiedAlertIds = useRef(new Set<string>());

  useEffect(() => {
    if (!liveAlerts || typeof Notification === "undefined") return;
    if (!initializedAlerts.current) {
      for (const alert of liveAlerts) notifiedAlertIds.current.add(alert._id);
      initializedAlerts.current = true;
      return;
    }
    for (const alert of liveAlerts) {
      if (notifiedAlertIds.current.has(alert._id)) continue;
      notifiedAlertIds.current.add(alert._id);
      if (!alert.acknowledgedAt && Notification.permission === "granted") {
        new Notification("Oakridge workbook alert", { body: alert.message, tag: alert._id });
      }
    }
  }, [liveAlerts]);

  const allocations: AllocationRow[] = useMemo(() => (storedAllocations ?? []).map((row) => ({ sheet: row.sheet, seatNumber: row.seatNumber, allocation: row.allocation, delegateName: row.delegateName, schoolName: row.schoolName })), [storedAllocations]);
  const registrations: RegistrationRecord[] = useMemo(() => (storedRegistrations ?? []).map((row) => ({ id: row._id, fullName: row.fullName, email: row.email, school: row.school, registeredAt: row.registeredAt, paymentStatus: row.paymentStatus, preference1: row.preference1, preference2: row.preference2, preference3: row.preference3 })), [storedRegistrations]);
  const report = useMemo(() => analyzeAllocations(allocations), [allocations]);
  const timeline = useMemo(() => buildRegistrationTimeline(registrations, "hour"), [registrations]);
  const issueCount = report.duplicateDelegates.length + report.duplicateSeats.length + report.missingSchools.length;

  const issueRows = useMemo(() => {
    const duplicates = report.duplicateDelegates.map((issue) => ({ type: "Double allocation", severity: "Error", delegate: issue.delegateName, location: issue.occurrences.map((row) => `${row.sheet}: ${row.allocation}`).join(" · "), action: "Keep one allocation and remove the other." }));
    const seats = report.duplicateSeats.map((issue) => ({ type: "Duplicate seat", severity: "Error", delegate: issue.occurrences.map((row) => row.delegateName || "Vacant").join(" / "), location: issue.occurrences.map((row) => `${row.sheet}: ${row.allocation}`).join(" · "), action: "Make each committee seat unique." }));
    const schools = report.missingSchools.map((row) => ({ type: "School missing", severity: "Warning", delegate: row.delegateName, location: `${row.sheet}: ${row.allocation}`, action: "Add the delegate’s school name." }));
    if (issueFilter === "duplicates") return [...duplicates, ...seats];
    if (issueFilter === "schools") return schools;
    return [...duplicates, ...seats, ...schools];
  }, [issueFilter, report]);

  function resetMonitorFeedback() {
    setMonitorError("");
    setMonitorMessage("");
  }

  async function connectMicrosoft() {
    setMonitorBusy("microsoft"); resetMonitorFeedback();
    try {
      const result = await beginMicrosoftConnection();
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setMonitorError(caught instanceof Error ? caught.message : "Could not start Microsoft authorization.");
      setMonitorBusy(null);
    }
  }

  async function connectLiveWorkbook() {
    setMonitorBusy("connect"); resetMonitorFeedback();
    try {
      const result = await connectWorkbook({ shareUrl: shareUrl.trim() });
      setShareUrl("");
      setMonitorMessage(`${result.fileName} connected. The baseline check is running now.`);
    } catch (caught) {
      setMonitorError(caught instanceof Error ? caught.message : "Could not connect the live workbook.");
    } finally {
      setMonitorBusy(null);
    }
  }

  async function checkLiveWorkbook() {
    setMonitorBusy("sync"); resetMonitorFeedback();
    try {
      const result = await syncWorkbook();
      setMonitorMessage(result.changed
        ? `${result.issueCount ?? 0} issues checked; ${result.newIssueCount ?? 0} new and ${result.resolvedIssueCount ?? 0} resolved.`
        : "The workbook has not changed since the previous check.");
    } catch (caught) {
      setMonitorError(caught instanceof Error ? caught.message : "The live workbook check failed.");
    } finally {
      setMonitorBusy(null);
    }
  }

  async function removeLiveWorkbook() {
    if (!window.confirm("Stop the five-minute workbook watcher? The most recently synchronized allocation data will remain available.")) return;
    setMonitorBusy("disconnect"); resetMonitorFeedback();
    try {
      await disconnectWorkbook();
      setMonitorMessage("Live workbook monitoring stopped. The latest allocation snapshot is still available.");
    } catch (caught) {
      setMonitorError(caught instanceof Error ? caught.message : "Could not disconnect the live workbook.");
    } finally {
      setMonitorBusy(null);
    }
  }

  async function enableBrowserAlerts() {
    if (typeof Notification === "undefined") {
      setMonitorError("This browser does not support page notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setMonitorMessage(permission === "granted"
      ? "Browser alerts enabled while Oakridge Operations is open."
      : "Browser alerts were not enabled. In-app alerts will still appear.");
  }

  async function importFile(file: File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const rows = await parseAllocationFile(file);
      const nextReport = analyzeAllocations(rows);
      const nextIssueCount = nextReport.duplicateDelegates.length + nextReport.duplicateSeats.length + nextReport.missingSchools.length;
      await replaceAllocations({ fileName: file.name, issueCount: nextIssueCount, rows });
      setMessage(`${rows.length} seats checked across ${new Set(rows.map((row) => row.sheet)).size} sheets. ${nextIssueCount} issues need review.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The workbook could not be checked.");
    } finally { setBusy(false); }
  }

  function exportReport() {
    downloadCsv("oakridge-allocation-issues.csv", issueRows.map((row) => ({ Type: row.type, Severity: row.severity, Delegate: row.delegate, Location: row.location, "What to do": row.action })));
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Workbook safety check" title="Find the problems before delegates do" description="Connect a OneDrive or SharePoint workbook for checks every five minutes, or upload a file for a one-time review." actions={issueRows.length ? <button className="button button--secondary" type="button" onClick={exportReport}><Download aria-hidden="true" /> Download issue list</button> : undefined} />

      {liveStatus === undefined || liveAlerts === undefined ? (
        <section className="live-monitor-panel"><span className="spinner" /><p>Loading live workbook monitor…</p></section>
      ) : (
        <section className={`live-monitor-panel${liveStatus.connected ? " is-connected" : ""}`} aria-labelledby="live-monitor-title">
          <div className="live-monitor-heading">
            <span className="live-monitor-icon">{liveStatus.connected ? <BellRing aria-hidden="true" /> : <Link2 aria-hidden="true" />}</span>
            <div><p className="eyebrow">Five-minute watcher</p><h2 id="live-monitor-title">{liveStatus.connected ? liveStatus.fileName : "Connect a live Excel workbook"}</h2><p>{liveStatus.connected ? "Convex checks Microsoft for changes every five minutes and records only new or resolved problems." : "Paste the Share link from an Excel workbook stored in OneDrive or SharePoint."}</p></div>
            <span className="watcher-state"><RefreshCw aria-hidden="true" /> Every 5 minutes</span>
          </div>

          {!liveStatus.microsoftConnected ? (
            <div className="live-monitor-setup">
              <div><strong>Connect Microsoft first</strong><p>The authorization is read-only: <code>Mail.Read</code> keeps the Inbox working and <code>Files.Read</code> lets the watcher read the selected workbook. It cannot edit or delete the file.</p></div>
              <button className="button button--primary" type="button" onClick={() => void connectMicrosoft()} disabled={monitorBusy !== null}>{monitorBusy === "microsoft" ? "Opening Microsoft…" : "Connect Microsoft"}</button>
            </div>
          ) : !liveStatus.connected ? (
            <form className="live-monitor-form" onSubmit={(event) => { event.preventDefault(); void connectLiveWorkbook(); }}>
              <label>Excel Share link<input type="url" value={shareUrl} onChange={(event) => setShareUrl(event.target.value)} placeholder="https://…sharepoint.com/…" required /></label>
              <button className="button button--primary" type="submit" disabled={monitorBusy !== null || !shareUrl.trim()}>{monitorBusy === "connect" ? "Connecting…" : "Watch this workbook"}</button>
              <small>In Excel: Share → Copy link. The signed-in Microsoft account must be able to open that link.</small>
            </form>
          ) : (
            <>
              <dl className="live-monitor-facts">
                <div><dt>Watcher</dt><dd>{liveStatus.status === "syncing" ? "Checking now…" : liveStatus.status === "error" ? "Needs attention" : "Active"}</dd></div>
                <div><dt>Last checked</dt><dd>{relativeTime(liveStatus.lastCheckedAt)}</dd></div>
                <div><dt>Next check</dt><dd>{relativeTime(liveStatus.nextCheckAt)}</dd></div>
                <div><dt>Last workbook change</dt><dd>{relativeTime(liveStatus.lastChangedAt)}</dd></div>
                <div><dt>Current issues</dt><dd>{liveStatus.issueCount}</dd></div>
                <div><dt>Latest change</dt><dd>{liveStatus.newIssueCount} new · {liveStatus.resolvedIssueCount} resolved</dd></div>
              </dl>
              <div className="live-monitor-actions">
                <button className="button button--primary" type="button" onClick={() => void checkLiveWorkbook()} disabled={monitorBusy !== null || liveStatus.status === "syncing"}><RefreshCw aria-hidden="true" /> {monitorBusy === "sync" || liveStatus.status === "syncing" ? "Checking…" : "Check now"}</button>
                {liveStatus.webUrl && <a className="button button--secondary" href={liveStatus.webUrl} target="_blank" rel="noreferrer">Open in Excel <ExternalLink aria-hidden="true" /></a>}
                {typeof Notification !== "undefined" && Notification.permission !== "granted" && <button className="button button--secondary" type="button" onClick={() => void enableBrowserAlerts()}><Bell aria-hidden="true" /> Enable browser alerts</button>}
                <button className="text-button danger-text" type="button" onClick={() => void removeLiveWorkbook()} disabled={monitorBusy !== null}><Unplug aria-hidden="true" /> {monitorBusy === "disconnect" ? "Disconnecting…" : "Stop watcher"}</button>
              </div>
              <p className="monitor-boundary"><ShieldCheck aria-hidden="true" /> In-app changes appear immediately after each check. Browser notifications work while Oakridge Operations is open; closed-browser alerts need a future email or web-push channel.</p>
            </>
          )}

          {liveStatus.connected && liveStatus.lastError && <div className="inline-alert inline-alert--error">Last live check problem: {liveStatus.lastError}</div>}
          {liveAlerts.length > 0 && <div className="monitor-alert-history"><div><strong>Recent watcher alerts</strong>{liveStatus.unacknowledgedAlerts > 0 && <button className="text-button" type="button" onClick={() => void acknowledgeAlerts()}>Mark read</button>}</div>{liveAlerts.slice(0, 3).map((alert) => <p key={alert._id} className={alert.acknowledgedAt ? "" : "is-new"}><span>{alert.kind === "new_issues" ? "New" : alert.kind === "resolved_issues" ? "Resolved" : "Error"}</span>{alert.message}<time dateTime={new Date(alert.createdAt).toISOString()}>{relativeTime(alert.createdAt)}</time></p>)}</div>}
        </section>
      )}
      {monitorMessage && <div className="inline-alert inline-alert--success" role="status"><ShieldCheck aria-hidden="true" />{monitorMessage}</div>}
      {monitorError && <div className="inline-alert inline-alert--error" role="alert">{monitorError}</div>}

      <div className="manual-file-divider"><span>Manual fallback</span><p>Upload a local copy for a one-time check.</p></div>
      <FileDrop label={allocations.length ? "Check a local workbook" : "Check allocation workbook"} description="The checker finds committee tables even when each sheet starts on a different row." busy={busy} onFile={importFile} />
      {message && <div className="inline-alert inline-alert--success" role="status"><CheckCircle2 aria-hidden="true" />{message}</div>}
      {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}

      {allocations.length > 0 ? (
        <>
          <section className="diagnostic-summary" aria-label="Workbook summary">
            <article><span><FileCheck2 aria-hidden="true" /></span><p>Total seats</p><strong>{report.totalSeats}</strong><small>across {new Set(allocations.map((row) => row.sheet)).size} sheets</small></article>
            <article><span><CheckCircle2 aria-hidden="true" /></span><p>Filled</p><strong>{report.occupiedSeats}</strong><small>{Math.round((report.occupiedSeats / Math.max(1, report.totalSeats)) * 100)}% occupied</small></article>
            <article><span><FileWarning aria-hidden="true" /></span><p>Vacant</p><strong>{report.vacantSeats}</strong><small>available seats</small></article>
            <article className={issueCount ? "has-problem" : "is-clear"}><span><AlertOctagon aria-hidden="true" /></span><p>Problems</p><strong>{issueCount}</strong><small>{issueCount ? "need a person" : "nothing blocking"}</small></article>
          </section>

          <section className="issues-workspace">
            <div className="section-title-row"><div><p className="eyebrow">What needs fixing</p><h2>{issueCount ? `${issueCount} workbook issues` : "Workbook looks clear"}</h2><p>Vacant seats are information, not errors.</p></div><div className="filter-pills"><button type="button" className={issueFilter === "all" ? "is-active" : ""} onClick={() => setIssueFilter("all")}>All</button><button type="button" className={issueFilter === "duplicates" ? "is-active" : ""} onClick={() => setIssueFilter("duplicates")}>Double allocations</button><button type="button" className={issueFilter === "schools" ? "is-active" : ""} onClick={() => setIssueFilter("schools")}>Missing schools</button></div></div>
            {!issueRows.length ? <div className="success-state"><CheckCircle2 aria-hidden="true" /><h3>No matching issues</h3><p>Try another filter or check a newer workbook.</p></div> : <><div className="issue-list">{issueRows.slice(0, 50).map((row, index) => <article key={`${row.type}-${row.delegate}-${index}`}><span className={row.severity === "Error" ? "issue-icon issue-icon--error" : "issue-icon issue-icon--warning"}>{row.type === "School missing" ? <School aria-hidden="true" /> : <UserRoundX aria-hidden="true" />}</span><div className="issue-copy"><span>{row.type}</span><strong>{row.delegate}</strong><small>{row.location}</small></div><p>{row.action}</p></article>)}</div>{issueRows.length > 50 && <div className="table-footnote">Showing the first 50 of {issueRows.length} matching issues. Download the issue list for every row.</div>}</>}
          </section>

          <section className="sheet-overview">
            <div className="section-title-row"><div><p className="eyebrow">Committee health</p><h2>Seats by sheet</h2></div></div>
            <div className="sheet-bars">{[...new Set(allocations.map((row) => row.sheet))].map((sheet) => { const rows = allocations.filter((row) => row.sheet === sheet); const filled = rows.filter((row) => row.delegateName).length; const percent = Math.round((filled / Math.max(1, rows.length)) * 100); return <div key={sheet}><span><strong>{sheet}</strong><small>{filled}/{rows.length} filled</small></span><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><b>{percent}%</b></div>; })}</div>
          </section>
        </>
      ) : <section className="empty-guide"><FileWarning aria-hidden="true" /><h2>Drop the allocation matrix above</h2><p>The checker works with the real Oakridge workbook structure, including DISEC, UNHRC, UNSC, JCC, HCC, Armageddon, Lok Sabha, OIC, and other committee sheets.</p></section>}

      <section className="analytics-panel">
        <div className="section-title-row"><div><p className="eyebrow">Registration timing</p><h2>When did people register?</h2><p>Use this to schedule reminders and promotion when registrations are naturally strongest.</p></div>{timeline.peak && <div className="peak-callout"><span>Peak window</span><strong>{timeline.peak.label}</strong><small>{timeline.peak.count} registrations</small></div>}</div>
        {!timeline.points.length ? <div className="empty-state"><FileCheck2 aria-hidden="true" /><h3>Import Forms responses first</h3><p>Registration timestamps will turn into an hourly chart here.</p></div> : <div className="chart-wrap" role="img" aria-label="Registrations per hour"><ResponsiveContainer width="100%" height={300}><BarChart data={timeline.points} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d9d2c5" /><XAxis dataKey="label" tick={{ fontSize: 12, fill: "#526175" }} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#526175" }} /><Tooltip cursor={{ fill: "#f3ebdd" }} /><Bar dataKey="count" name="Registrations" fill="#0b4ea2" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}
      </section>
    </div>
  );
}
