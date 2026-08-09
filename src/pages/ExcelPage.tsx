import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertOctagon, CheckCircle2, Download, FileCheck2, FileWarning, School, UserRoundX } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../convex/_generated/api";
import { FileDrop } from "../components/FileDrop";
import { PageHeader } from "../components/PageHeader";
import { analyzeAllocations, buildRegistrationTimeline, type AllocationRow, type RegistrationRecord } from "../domain/operations";
import { downloadCsv, parseAllocationFile } from "../lib/workbook";

export function ExcelPage() {
  const storedAllocations = useQuery(api.operationsData.allocations);
  const storedRegistrations = useQuery(api.operationsData.registrations);
  const replaceAllocations = useMutation(api.operationsData.replaceAllocations);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [issueFilter, setIssueFilter] = useState<"all" | "duplicates" | "schools">("all");

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
      <PageHeader eyebrow="Workbook safety check" title="Find the problems before delegates do" description="Upload the allocation workbook to catch double allocations, repeated seats, missing schools, and registration timing patterns." actions={issueRows.length ? <button className="button button--secondary" type="button" onClick={exportReport}><Download aria-hidden="true" /> Download issue list</button> : undefined} />

      <FileDrop label={allocations.length ? "Check a newer workbook" : "Check allocation workbook"} description="The checker finds committee tables even when each sheet starts on a different row." busy={busy} onFile={importFile} />
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
