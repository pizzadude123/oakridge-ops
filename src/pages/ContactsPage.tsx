import { FormEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search, Trash2, UserRoundPlus, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { initials } from "../lib/text";

const filters = [
  ["all", "All contacts"],
  ["outstanding", "Awaiting reply"],
  ["unpaid", "Not paid"],
  ["policy", "Policy"],
  ["finance", "Finance"],
] as const;

type Filter = (typeof filters)[number][0];

export function ContactsPage() {
  const contacts = useQuery(api.contacts.list);
  const upsert = useMutation(api.contacts.upsert);
  const updateStatus = useMutation(api.contacts.updateStatus);
  const remove = useMutation(api.contacts.remove);
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const visible = useMemo(() => {
    if (!contacts) return [];
    const search = query.trim().toLocaleLowerCase();
    return contacts.filter((contact) => {
      const matchesSearch = !search || [contact.fullName, contact.email, contact.school, contact.department].some((value) => value.toLocaleLowerCase().includes(search));
      const matchesFilter = filter === "all"
        || (filter === "outstanding" && contact.replyStatus === "awaiting_reply")
        || (filter === "unpaid" && contact.paymentStatus === "unpaid")
        || contact.department.toLocaleLowerCase() === filter;
      return matchesSearch && matchesFilter;
    });
  }, [contacts, filter, query]);

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await upsert({
        fullName: String(data.get("fullName") ?? "").trim(),
        email: String(data.get("email") ?? "").trim(),
        school: String(data.get("school") ?? "").trim(),
        department: String(data.get("department") ?? "Delegates"),
        paymentStatus: "needs_review",
        replyStatus: "not_contacted",
        tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
        source: "Added manually",
      });
      form.reset(); dialog.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The contact could not be saved.");
    } finally { setBusy(false); }
  }

  async function deleteContact(id: Id<"contacts">, name: string) {
    if (window.confirm(`Remove ${name} from contacts?`)) await remove({ id });
  }

  return (
    <div className="page">
      <PageHeader eyebrow="People" title="Contacts" description="Find the right person in one search, then update their status without opening another screen." actions={<button className="button button--primary" onClick={() => dialog.current?.showModal()}><Plus aria-hidden="true" /> Add contact</button>} />

      <section className="contact-controls" aria-label="Contact filters">
        <label className="search-box"><Search aria-hidden="true" /><span className="sr-only">Search contacts</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, school…" /></label>
        <div className="filter-pills">
          {filters.map(([value, label]) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}
        </div>
      </section>

      <section className="data-panel">
        <div className="data-panel-heading"><div><h2>{visible.length} {visible.length === 1 ? "person" : "people"}</h2><p>Two requested test contacts are already included.</p></div></div>
        {!contacts ? <div className="page-loader"><div className="spinner" />Loading contacts…</div> : visible.length === 0 ? (
          <div className="empty-state"><UserRoundPlus aria-hidden="true" /><h3>No contacts match</h3><p>Clear the search or add a new person.</p></div>
        ) : (
          <div className="contacts-table-wrap">
            <table className="contacts-table">
              <thead><tr><th>Person</th><th>Department</th><th>Payment</th><th>Reply</th><th>Allocation</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{visible.map((contact) => (
                <tr key={contact._id}>
                  <td><div className="person-cell"><span className="avatar">{initials(contact.fullName)}</span><span><strong>{contact.fullName}</strong><small>{contact.email}<br />{contact.school}</small></span></div></td>
                  <td><span className="department-label">{contact.department}</span></td>
                  <td><label className="select-with-badge"><span className="sr-only">Payment status for {contact.fullName}</span><StatusBadge status={contact.paymentStatus} /><select value={contact.paymentStatus} onChange={(event) => void updateStatus({ id: contact._id, paymentStatus: event.target.value as "reported_paid" | "unpaid" | "pending" | "needs_review" })}><option value="reported_paid">Paid — unverified</option><option value="unpaid">Not paid</option><option value="pending">Pending</option><option value="needs_review">Needs review</option></select></label></td>
                  <td><label className="select-with-badge"><span className="sr-only">Reply status for {contact.fullName}</span><StatusBadge status={contact.replyStatus} /><select value={contact.replyStatus} onChange={(event) => void updateStatus({ id: contact._id, replyStatus: event.target.value as "awaiting_reply" | "replied" | "not_contacted" })}><option value="not_contacted">Not contacted</option><option value="awaiting_reply">Awaiting reply</option><option value="replied">Replied</option></select></label></td>
                  <td><strong className="allocation-cell">{contact.assignedCommittee ?? "—"}</strong><small>{contact.assignedAllocation ?? "No allocation"}</small></td>
                  <td><button className="icon-button icon-button--danger" type="button" onClick={() => void deleteContact(contact._id, contact.fullName)} aria-label={`Remove ${contact.fullName}`}><Trash2 aria-hidden="true" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <dialog ref={dialog} className="modal" onClose={() => setError("")}>
        <form method="dialog" className="modal-close-form"><button className="icon-button" aria-label="Close"><X aria-hidden="true" /></button></form>
        <form onSubmit={addContact} className="modal-form">
          <p className="eyebrow">New person</p><h2>Add a contact</h2><p>Only name and email are required.</p>
          <div className="form-grid"><label>Full name<input name="fullName" required autoFocus /></label><label>Email<input name="email" type="email" required /></label><label>School<input name="school" /></label><label>Department<select name="department" defaultValue="Delegates"><option>Delegates</option><option>Policy</option><option>Finance</option><option>Logistics</option><option>Media</option></select></label></div>
          <label>Tags <span className="label-hint">comma separated</span><input name="tags" placeholder="round-1, internal" /></label>
          {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
          <div className="modal-actions"><button type="button" className="button button--ghost" onClick={() => dialog.current?.close()}>Cancel</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save contact"}</button></div>
        </form>
      </dialog>
    </div>
  );
}
