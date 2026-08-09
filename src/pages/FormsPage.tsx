import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, Check, Download, FileCheck2, ListFilter, Search, Sparkles, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PageHeader } from "../components/PageHeader";
import { FileDrop } from "../components/FileDrop";
import { StatusBadge } from "../components/StatusBadge";
import {
  analyzeRegistrationQuality,
  buildPreferenceDemand,
  recommendAllocations,
  type RegistrationRecord,
} from "../domain/operations";
import { parseRegistrationFile } from "../lib/workbook";

const SAMPLE_ROWS: Omit<RegistrationRecord, "id">[] = [
  { fullName: "Aarav Rao", email: "aarav@example.com", school: "Oakridge International School", registeredAt: "2026-08-09T09:05:00.000Z", paymentStatus: "unpaid", preference1: "UNSC", preference2: "DISEC", preference3: "UNHRC" },
  { fullName: "Zara Singh", email: "zara@example.com", school: "CHIREC", registeredAt: "2026-08-09T09:25:00.000Z", paymentStatus: "reported_paid", preference1: "UNSC", preference2: "OIC", preference3: "DISEC" },
  { fullName: "Mira Shah", email: "mira@example.com", school: "Indus International School", registeredAt: "2026-08-09T11:00:00.000Z", paymentStatus: "needs_review", preference1: "DISEC", preference2: "UNSC", preference3: "OIC" },
  { fullName: "Kabir Mehta", email: "kabir@example.com", school: "Oakridge International School", registeredAt: "2026-08-09T11:14:00.000Z", paymentStatus: "pending", preference1: "UNHRC", preference2: "DISEC", preference3: "UNSC" },
];

export function FormsPage() {
  const stored = useQuery(api.operationsData.registrations);
  const replaceRegistrations = useMutation(api.operationsData.replaceRegistrations);
  const applyRecommendedCommittees = useMutation(api.operationsData.applyRecommendedCommittees);
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [recommendations, setRecommendations] = useState<ReturnType<typeof recommendAllocations>>([]);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const registrations: RegistrationRecord[] = useMemo(() => (stored ?? []).map((row) => ({
    id: row._id,
    responseId: row.responseId,
    fullName: row.fullName,
    email: row.email,
    school: row.school,
    registeredAt: row.registeredAt,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    paymentStatus: row.paymentStatus,
    preference1: row.preference1,
    preference2: row.preference2,
    preference3: row.preference3,
    answers: row.answers,
  })), [stored]);
  const demand = useMemo(() => buildPreferenceDemand(registrations), [registrations]);
  const quality = useMemo(() => analyzeRegistrationQuality(registrations), [registrations]);
  const choices = useMemo(() => demand.map((item) => item.choice), [demand]);
  const activeChoice = selectedChoice || choices[0] || "";
  const activeDemand = demand.find((item) => item.choice === activeChoice);
  const maxDemand = Math.max(1, ...demand.map((item) => item.weightedDemand));

  async function saveRows(fileName: string, rows: RegistrationRecord[]) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await replaceRegistrations({
        fileName,
        rows: rows.map((row) => ({
          responseId: row.responseId,
          fullName: row.fullName,
          email: row.email,
          school: row.school,
          registeredAt: row.registeredAt,
          startedAt: row.startedAt,
          submittedAt: row.submittedAt,
          paymentStatus: row.paymentStatus,
          preference1: row.preference1,
          preference2: row.preference2,
          preference3: row.preference3,
          answers: row.answers,
        })),
      });
      setCapacities(Object.fromEntries(buildPreferenceDemand(rows).map(({ choice }) => [choice, 1])));
      setRecommendations([]);
      setMessage(`${result.rowCount} registrations imported and ${result.contactCount} contacts synchronized.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The registration file could not be imported.");
    } finally { setBusy(false); }
  }

  async function importFile(file: File) {
    try {
      const rows = await parseRegistrationFile(file);
      await saveRows(file.name, rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be read.");
    }
  }

  function runRecommendations() {
    setRecommendations(recommendAllocations(registrations, choices.map((choice) => ({ choice, capacity: capacities[choice] ?? 0 }))));
  }

  async function applyRecommendations() {
    const assignments = recommendations.flatMap((recommendation) => {
      const registration = registrations.find((row) => row.id === recommendation.registrationId);
      return recommendation.choice && registration?.email
        ? [{ email: registration.email, committee: recommendation.choice }]
        : [];
    });
    if (!assignments.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await applyRecommendedCommittees({ assignments });
      setMessage(`${result.updatedCount} reviewed committee assignments applied to Contacts.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assignments could not be applied to Contacts.");
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Registration forms" title="Compare preferences without the spreadsheet hunt" description="Import a Microsoft Forms Excel/CSV export. The app maps common messy headings and keeps uncertain values visible for review." />

      <section className="truth-banner">
        <AlertTriangle aria-hidden="true" />
        <div><strong>Payment status is reported, not verified.</strong><p>Real payment verification needs a bank or payment-gateway connector. Until then, “Paid” only means that is what the form says.</p></div>
        <span>Verification planned</span>
      </section>

      <section className="form-test-kit">
        <FileCheck2 aria-hidden="true" />
        <div><p className="eyebrow">Real test kit</p><h2>Test Forms and Contacts end to end</h2><p>Includes 12 fictional responses, a blank validated template, parser edge cases, and operator instructions. Importing it synchronizes safe <code>example.com</code> contacts.</p></div>
        <a className="button button--secondary" href={`${import.meta.env.BASE_URL}Oakridge-MUN-Registration-Test.xlsx`} download><Download aria-hidden="true" /> Download Excel test kit</a>
      </section>

      <FileDrop label={registrations.length ? "Replace registration data" : "Import registration responses"} description="Use the Excel or CSV file downloaded from Microsoft Forms, or the test kit above." busy={busy} onFile={importFile} />
      {!registrations.length && <button className="text-button sample-button" type="button" onClick={() => void saveRows("Built-in sample registrations", SAMPLE_ROWS.map((row, index) => ({ ...row, id: `sample-${index}` })))}>No file nearby? Load a safe sample</button>}
      {message && <div className="inline-alert inline-alert--success" role="status"><Check aria-hidden="true" />{message}</div>}
      {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}

      {registrations.length > 0 && (
        <>
          <section className="registration-quality" aria-label="Registration import quality">
            <div><span>{quality.complete}</span><small>complete profiles</small></div>
            <div className={quality.missingNames ? "has-issue" : ""}><span>{quality.missingNames}</span><small>missing names</small></div>
            <div className={quality.missingEmails ? "has-issue" : ""}><span>{quality.missingEmails}</span><small>missing emails</small></div>
            <div className={quality.missingPreferences ? "has-issue" : ""}><span>{quality.missingPreferences}</span><small>without preferences</small></div>
            <div className={quality.duplicateEmails.length ? "has-issue" : ""}><span>{quality.duplicateEmails.length}</span><small>duplicate emails</small></div>
          </section>

          <section className="preference-workspace">
            <div className="section-title-row">
              <div><p className="eyebrow">Preference intelligence</p><h2>Demand, pressure, and fallback paths—together</h2><p>All three preferences are visible at once. First choices carry more weight; no round switching hides the wider picture.</p></div>
            </div>
            <div className="demand-layout">
              <div className="demand-list" role="group" aria-label="Committee preference demand">
                {demand.map((item) => (
                  <button key={item.choice} type="button" className={activeChoice === item.choice ? "demand-row is-active" : "demand-row"} onClick={() => setSelectedChoice(item.choice)} aria-pressed={activeChoice === item.choice}>
                    <span className="demand-row-heading"><strong>{item.choice}</strong><small>{item.uniqueDelegates} interested</small></span>
                    <span className="demand-meter" aria-hidden="true"><i style={{ width: `${(item.weightedDemand / maxDemand) * 100}%` }} /></span>
                    <span className="rank-counts"><b>{item.firstCount}<small>1st</small></b><b>{item.secondCount}<small>2nd</small></b><b>{item.thirdCount}<small>3rd</small></b></span>
                  </button>
                ))}
              </div>
              <div className="delegate-fit-panel">
                <header><Search aria-hidden="true" /><div><p className="eyebrow">Delegate fit explorer</p><h3>{activeChoice || "Choose a committee"}</h3></div></header>
                <div className="delegate-fit-list" tabIndex={0} aria-label={`Delegates interested in ${activeChoice}`}>
                  {activeDemand?.delegates.map((entry) => {
                    const person = registrations.find((row) => row.id === entry.registrationId);
                    if (!person) return null;
                    return <article key={`${entry.registrationId}-${entry.rank}`}><span className={`preference-rank preference-rank--${entry.rank}`}>{entry.rank}{entry.rank === 1 ? "st" : entry.rank === 2 ? "nd" : "rd"}</span><div><strong>{person.fullName || "Name missing"}</strong><small>{person.school || "School missing"}</small><p>Alternates: {[person.preference1, person.preference2, person.preference3].filter((choice) => choice && choice !== activeChoice).join(" · ") || "None supplied"}</p></div><StatusBadge status={person.paymentStatus} /></article>;
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="recommendation-workspace">
            <div className="section-title-row"><div><p className="eyebrow">Question two</p><h2>What should each person get?</h2><p>Enter available places. Recommendations use first preference, then second, and stop there.</p></div></div>
            <div className="capacity-layout">
              <div className="capacity-editor">
                <h3>Available places</h3>
                {choices.map((choice) => <label key={choice}><span>{choice}</span><input type="number" min="0" max="500" value={capacities[choice] ?? 0} onChange={(event) => setCapacities((current) => ({ ...current, [choice]: Math.max(0, Number(event.target.value)) }))} aria-label={`Available places for ${choice}`} /></label>)}
                <button className="button button--primary button--full" type="button" onClick={runRecommendations}><Sparkles aria-hidden="true" /> Recommend allocations</button>
              </div>
              <div className="recommendation-results">
                {!recommendations.length ? <div className="empty-state"><ListFilter aria-hidden="true" /><h3>Set places, then recommend</h3><p>No one will be assigned a third preference.</p></div> : <>
                  <div className="recommendation-table-wrap"><table><thead><tr><th>Delegate</th><th>Recommendation</th><th>Why</th></tr></thead><tbody>{recommendations.map((result) => <tr key={result.registrationId}><td><strong>{result.fullName}</strong></td><td>{result.choice ? <span className="recommendation-choice">{result.choice}<small>{result.preferenceRank === 1 ? "1st preference" : "2nd preference"}</small></span> : <span className="status-badge status-badge--needs_review">Needs human decision</span>}</td><td>{result.reason}</td></tr>)}</tbody></table></div>
                  <div className="assignment-actions"><p>Review every row first. Applying updates only contacts with a valid recommendation.</p><button className="button button--primary" type="button" disabled={busy} onClick={() => void applyRecommendations()}><Check aria-hidden="true" /> Apply reviewed assignments to Contacts</button></div>
                </>}
              </div>
            </div>
          </section>

          <section className="data-panel registration-roster">
            <div className="data-panel-heading"><div><p className="eyebrow">Imported people</p><h2>{registrations.length} registrations</h2><p>Every valid email was synchronized into Contacts automatically.</p></div><Link className="button button--secondary" to="/contacts">Open contacts <ArrowRight aria-hidden="true" /></Link></div>
            <div className="simple-table" role="table" aria-label="Imported registrations">{registrations.slice(0, 12).map((person) => <div className="simple-table-row" role="row" key={person.id}><span role="cell"><strong>{person.fullName || "Name missing"}</strong><small>{person.email || "Email missing"}</small></span><span role="cell">{person.school || "School missing"}</span><span role="cell">{person.preference1 || "No first preference"}</span><span role="cell"><StatusBadge status={person.paymentStatus} /></span></div>)}</div>
            {registrations.length > 12 && <div className="table-footnote">Showing 12 of {registrations.length} people.</div>}
          </section>
        </>
      )}

      {!registrations.length && !busy && <section className="empty-guide"><UsersRound aria-hidden="true" /><h2>Start with the Forms export</h2><ol><li>Open Responses in Microsoft Forms.</li><li>Choose “Open in Excel.”</li><li>Drop that file above.</li></ol></section>}
    </div>
  );
}
