import { useQuery } from "convex/react";
import { ArrowRight, BookOpenCheck, CircleDollarSign, Clock3, FileWarning, Mail, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";

export function DashboardPage() {
  const contacts = useQuery(api.contacts.list);
  const messages = useQuery(api.messages.recent);
  const imports = useQuery(api.imports.list);

  if (!contacts || !messages || !imports) return <div className="page-loader" aria-live="polite"><div className="spinner" />Loading your workspace…</div>;

  const unpaid = contacts.filter((contact) => contact.paymentStatus === "unpaid").length;
  const outstanding = contacts.filter((contact) => contact.replyStatus === "awaiting_reply").length;
  const drafts = messages.filter((message) => message.status === "draft").length;
  const attention = contacts.filter((contact) => contact.paymentStatus !== "reported_paid" || contact.replyStatus === "awaiting_reply").slice(0, 5);

  return (
    <div className="page page--dashboard">
      <PageHeader eyebrow="Command centre" title="What needs doing?" description="Start with one clear action. Everything else can wait." />

      <section className="metric-strip" aria-label="Workspace summary">
        <div><span className="metric-icon metric-icon--blue"><Users aria-hidden="true" /></span><p>Contacts</p><strong>{contacts.length}</strong><small>ready to message</small></div>
        <div><span className="metric-icon metric-icon--gold"><CircleDollarSign aria-hidden="true" /></span><p>Not paid</p><strong>{unpaid}</strong><small>need a follow-up</small></div>
        <div><span className="metric-icon metric-icon--plum"><Clock3 aria-hidden="true" /></span><p>Outstanding</p><strong>{outstanding}</strong><small>awaiting a reply</small></div>
        <div><span className="metric-icon metric-icon--cyan"><Mail aria-hidden="true" /></span><p>Email drafts</p><strong>{drafts}</strong><small>saved safely</small></div>
      </section>

      <section className="dashboard-grid">
        <article className="primary-task-panel">
          <div className="panel-heading">
            <span className="panel-step">Do this first</span>
            <Sparkles aria-hidden="true" />
          </div>
          <h2>Send the next delegate update</h2>
          <p>Pick people, write once, and preview each personalized Gmail draft before opening it.</p>
          <Link className="button button--primary button--large" to="/email">Write an email <ArrowRight aria-hidden="true" /></Link>
          <div className="safe-note"><strong>Safe by default.</strong> The app prepares individual drafts from nagapranayimmadi@gmail.com; Gmail still requires your review.</div>
        </article>

        <article className="attention-panel">
          <div className="section-title-row"><div><p className="eyebrow">Needs attention</p><h2>People to check</h2></div><Link to="/contacts">See everyone</Link></div>
          {attention.length ? (
            <ul className="attention-list">
              {attention.map((contact) => (
                <li key={contact._id}>
                  <span className="avatar">{contact.fullName.split(/\s+/).slice(0,2).map((part) => part[0]).join("")}</span>
                  <div><strong>{contact.fullName}</strong><small>{contact.email}</small></div>
                  <StatusBadge status={contact.paymentStatus === "unpaid" ? contact.paymentStatus : contact.replyStatus} />
                </li>
              ))}
            </ul>
          ) : <div className="empty-inline">Nothing urgent. Nice work.</div>}
        </article>
      </section>

      <section className="quick-actions" aria-labelledby="quick-actions-title">
        <div className="section-title-row"><div><p className="eyebrow">Three simple tools</p><h2 id="quick-actions-title">Choose what you have</h2></div></div>
        <div className="action-rows">
          <Link to="/forms"><span className="action-number">1</span><span className="action-icon"><BookOpenCheck aria-hidden="true" /></span><span><strong>I have a Forms export</strong><small>Compare preferences and make first/second-choice recommendations.</small></span><ArrowRight aria-hidden="true" /></Link>
          <Link to="/excel"><span className="action-number">2</span><span className="action-icon"><FileWarning aria-hidden="true" /></span><span><strong>I have an allocation workbook</strong><small>Find double allocations, missing school names, and vacant seats.</small></span><ArrowRight aria-hidden="true" /></Link>
          <Link to="/contacts"><span className="action-number">3</span><span className="action-icon"><Users aria-hidden="true" /></span><span><strong>I need to find people</strong><small>Filter by payment, reply status, or department.</small></span><ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>

      {imports.length > 0 && (
        <section className="recent-imports">
          <div className="section-title-row"><div><p className="eyebrow">Recent files</p><h2>Last imports</h2></div></div>
          <div className="simple-table" role="table" aria-label="Recent imports">
            {imports.slice(0, 4).map((item) => (
              <div className="simple-table-row" role="row" key={item._id}>
                <span role="cell"><strong>{item.fileName}</strong><small>{item.kind}</small></span>
                <span role="cell">{item.rowCount} rows</span>
                <span role="cell">{item.issueCount ? `${item.issueCount} issues` : "No issues"}</span>
                <span role="cell">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(item.importedAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
