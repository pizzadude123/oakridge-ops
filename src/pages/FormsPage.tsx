import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, Check, CircleSlash2, ListFilter, Sparkles, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PageHeader } from "../components/PageHeader";
import { FileDrop } from "../components/FileDrop";
import { StatusBadge } from "../components/StatusBadge";
import {
  groupRegistrationsByPreference,
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
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [recommendations, setRecommendations] = useState<ReturnType<typeof recommendAllocations>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const registrations: RegistrationRecord[] = useMemo(() => (stored ?? []).map((row) => ({
    id: row._id,
    fullName: row.fullName,
    email: row.email,
    school: row.school,
    registeredAt: row.registeredAt,
    paymentStatus: row.paymentStatus,
    preference1: row.preference1,
    preference2: row.preference2,
    preference3: row.preference3,
  })), [stored]);
  const grouped = useMemo(() => groupRegistrationsByPreference(registrations, round), [registrations, round]);
  const choices = useMemo(() => [...new Set(registrations.flatMap((row) => [row.preference1, row.preference2]).filter(Boolean))].sort(), [registrations]);

  async function saveRows(fileName: string, rows: RegistrationRecord[]) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await replaceRegistrations({
        fileName,
        rows: rows.map((row) => ({
          fullName: row.fullName,
          email: row.email,
          school: row.school,
          registeredAt: row.registeredAt,
          paymentStatus: row.paymentStatus,
          preference1: row.preference1,
          preference2: row.preference2,
          preference3: row.preference3,
        })),
      });
      setCapacities(Object.fromEntries([...new Set(rows.flatMap((row) => [row.preference1, row.preference2]).filter(Boolean))].map((choice) => [choice, 1])));
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

  return (
    <div className="page">
      <PageHeader eyebrow="Registration forms" title="Compare preferences without the spreadsheet hunt" description="Import a Microsoft Forms Excel/CSV export. The app maps common messy headings and keeps uncertain values visible for review." />

      <section className="truth-banner">
        <AlertTriangle aria-hidden="true" />
        <div><strong>Payment status is reported, not verified.</strong><p>Real payment verification needs a bank or payment-gateway connector. Until then, “Paid” only means that is what the form says.</p></div>
        <span>Verification planned</span>
      </section>

      <FileDrop label={registrations.length ? "Replace registration data" : "Import registration responses"} description="Use the Excel or CSV file downloaded from Microsoft Forms." busy={busy} onFile={importFile} />
      {!registrations.length && <button className="text-button sample-button" type="button" onClick={() => void saveRows("Built-in sample registrations", SAMPLE_ROWS.map((row, index) => ({ ...row, id: `sample-${index}` })))}>No file nearby? Load a safe sample</button>}
      {message && <div className="inline-alert inline-alert--success" role="status"><Check aria-hidden="true" />{message}</div>}
      {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}

      {registrations.length > 0 && (
        <>
          <section className="preference-workspace">
            <div className="section-title-row">
              <div><p className="eyebrow">Question one</p><h2>Who chose the same thing?</h2><p>Switch rounds to compare groups instantly.</p></div>
              <div className="round-switcher" role="group" aria-label="Preference round">
                {[1, 2, 3].map((value) => <button key={value} type="button" className={round === value ? "is-active" : ""} onClick={() => setRound(value as 1 | 2 | 3)}>Round {value}{value === 3 && <small>view only</small>}</button>)}
              </div>
            </div>
            {round === 3 && <div className="inline-alert inline-alert--warning"><CircleSlash2 aria-hidden="true" /><span>Third preferences are visible for comparison but are never used by the recommendation tool.</span></div>}
            <div className="preference-groups">
              {Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right)).map(([choice, people]) => (
                <article key={choice} className="preference-group">
                  <header><span>{people.length}</span><div><strong>{choice}</strong><small>{people.length === 1 ? "person" : "people"}</small></div></header>
                  <ul>{people.map((person) => <li key={person.id}><span>{person.fullName}</span><small>{person.school || "School missing"}</small><StatusBadge status={person.paymentStatus} /></li>)}</ul>
                </article>
              ))}
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
                {!recommendations.length ? <div className="empty-state"><ListFilter aria-hidden="true" /><h3>Set places, then recommend</h3><p>No one will be assigned a third preference.</p></div> : (
                  <div className="recommendation-table-wrap"><table><thead><tr><th>Delegate</th><th>Recommendation</th><th>Why</th></tr></thead><tbody>{recommendations.map((result) => <tr key={result.registrationId}><td><strong>{result.fullName}</strong></td><td>{result.choice ? <span className="recommendation-choice">{result.choice}<small>{result.preferenceRank === 1 ? "1st preference" : "2nd preference"}</small></span> : <span className="status-badge status-badge--needs_review">Needs human decision</span>}</td><td>{result.reason}</td></tr>)}</tbody></table></div>
                )}
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
