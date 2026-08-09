import DOMPurify from "dompurify";
import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { AtSign, Building2, Check, ChevronRight, ExternalLink, FileUp, Filter, MailCheck, Route, Save, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import clsx from "clsx";
import { useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  providerRetryAction,
  summarizeProviderDelivery,
  summarizeProviderDeliveryInterruption,
  type ProviderResultCounts,
} from "../../convex/lib/mailDelivery";
import { buildGmailComposeUrl, buildOakridgeEmailHtml, matchRoutingRule, personalizeTemplate, unresolvedFieldsForRecipients } from "../domain/email";
import { PageHeader } from "../components/PageHeader";
import { RichEditor } from "../components/RichEditor";
import { StatusBadge } from "../components/StatusBadge";
import { htmlToPlainText, initials } from "../lib/text";
import { parsePeopleFile } from "../lib/workbook";

const SENDER = "cattartzz@gmail.com";
const DEFAULT_BODY = `<h2>An update from Oakridge MUN</h2><p>Hello {{firstName}},</p><p>Thank you for being part of the Oakridge Model United Nations community.</p><p>We’re writing to share an important update with you. Please review the details below, and reply to this email if there is anything we can help with.</p><p><strong>Your update</strong><br>Write the announcement, next step, or important detail here.</p><p>Warm regards,<br><strong>Oakridge MUN Team</strong></p>`;
const mergeFields = [
  ["First name", "{{firstName}}"],
  ["Full name", "{{fullName}}"],
  ["School", "{{school}}"],
  ["Email", "{{email}}"],
  ["Committee", "{{committee}}"],
  ["Allocation", "{{allocation}}"],
  ["First preference", "{{preference1}}"],
] as const;

type Tab = "write" | "routing" | "history";
type MailProvider = "google" | "microsoft";

function emptyProviderResultCounts(): ProviderResultCounts {
  return { accepted: 0, failed: 0, unknown: 0, inProgress: 0, alreadyAccepted: 0 };
}

function connectionNotice(search: string) {
  const parameters = new URLSearchParams(search);
  if (parameters.get("google") === "connected") return "Google account connected. It is ready for reviewed bulk sending.";
  if (parameters.get("google") === "error") return "Google could not be connected. Check the OAuth configuration and try again.";
  if (parameters.get("graph") === "connected") return "Microsoft account connected. It is ready for reviewed bulk sending.";
  if (parameters.get("graph") === "error") return "Microsoft could not be connected. Check the OAuth configuration and try again.";
  return "";
}

function contactFields(contact: Doc<"contacts">) {
  return {
    firstName: contact.fullName.split(/\s+/)[0] ?? contact.fullName,
    fullName: contact.fullName,
    email: contact.email,
    school: contact.school,
    committee: contact.assignedCommittee ?? contact.preference1 ?? "",
    allocation: contact.assignedAllocation ?? "",
    preference1: contact.preference1 ?? "",
  };
}

export function EmailPage() {
  const contacts = useQuery(api.contacts.list);
  const rules = useQuery(api.routingRules.list);
  const messages = useQuery(api.messages.recent);
  const googleStatus = useQuery(api.googleData.status);
  const microsoftStatus = useQuery(api.graphData.status);
  const saveDraft = useMutation(api.messages.saveDraft);
  const markStatus = useMutation(api.messages.markStatus);
  const saveRule = useMutation(api.routingRules.save);
  const importPeople = useMutation(api.contacts.importPeople);
  const beginGoogleConnection = useAction(api.googleGmail.beginConnection);
  const disconnectGoogle = useAction(api.googleGmail.disconnect);
  const sendGoogleBatch = useAction(api.googleGmail.sendPersonalizedBatch);
  const beginMicrosoftConnection = useAction(api.microsoftGraph.beginConnection);
  const sendMicrosoftBatch = useAction(api.microsoftMail.sendPersonalizedBatch);
  const location = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const sendDialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("write");
  const [providerChoice, setProviderChoice] = useState<MailProvider | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peopleFilter, setPeopleFilter] = useState<"all" | "unpaid" | "outstanding">("all");
  const [subject, setSubject] = useState("An update from Oakridge MUN");
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() => connectionNotice(location.search));
  const [sendConfirmed, setSendConfirmed] = useState(false);
  const [sendError, setSendError] = useState("");
  const [deliveryCounts, setDeliveryCounts] = useState<ProviderResultCounts>(emptyProviderResultCounts);
  const [sendInterrupted, setSendInterrupted] = useState(false);
  const [testSubject, setTestSubject] = useState("Allocation question from a delegate");

  const visibleContacts = useMemo(() => (contacts ?? []).filter((contact) =>
    peopleFilter === "all"
      || (peopleFilter === "unpaid" && contact.paymentStatus === "unpaid")
      || (peopleFilter === "outstanding" && contact.replyStatus === "awaiting_reply"),
  ), [contacts, peopleFilter]);
  const selectedContacts = (contacts ?? []).filter((contact) => selected.has(contact._id));
  const selectedRecipientIssues = unresolvedFieldsForRecipients(
    subject,
    bodyHtml,
    selectedContacts.map(contactFields),
  );
  const previewContact = selectedContacts[0] ?? visibleContacts[0];
  const previewSubject = previewContact ? personalizeTemplate(subject, contactFields(previewContact)) : null;
  const previewBody = previewContact ? personalizeTemplate(bodyHtml, contactFields(previewContact), "html") : null;
  const unresolved = [...new Set([...(previewSubject?.unresolved ?? []), ...(previewBody?.unresolved ?? [])])];
  const mailProvider = providerChoice
    ?? (microsoftStatus?.connected && !googleStatus?.connected ? "microsoft" : "google");
  const providerConnected = mailProvider === "google" ? Boolean(googleStatus?.connected) : Boolean(microsoftStatus?.connected);
  const sender = mailProvider === "google"
    ? (googleStatus?.connected && googleStatus.email ? googleStatus.email : SENDER)
    : (microsoftStatus?.connected && microsoftStatus.email ? microsoftStatus.email : "Microsoft account not connected");
  const providerLabel = mailProvider === "google" ? "Google" : "Microsoft";
  const retryAction = providerRetryAction(deliveryCounts, sendInterrupted);
  const previewDocument = previewBody && previewSubject
    ? buildOakridgeEmailHtml({ bodyHtml: DOMPurify.sanitize(previewBody.output), preheader: previewSubject.output })
    : "";
  const routingRule = matchRoutingRule(testSubject, (rules ?? []).map((rule) => ({ ...rule, id: rule._id })));


  function toggleContact(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function insertField(token: string) {
    setBodyHtml((current) => current.endsWith("</p>") ? current.replace(/<\/p>$/, ` ${token}</p>`) : `${current}<p>${token}</p>`);
  }

  async function importRecipientFile(file: File) {
    setBusy(true); setNotice("");
    try {
      const parsed = await parsePeopleFile(file);
      const result = await importPeople({ fileName: file.name, people: parsed.people });
      setSelected(new Set(result.contactIds.map(String)));
      const skipped = parsed.skippedRows ? ` ${parsed.skippedRows} duplicate or incomplete ${parsed.skippedRows === 1 ? "row was" : "rows were"} skipped.` : "";
      setNotice(`${result.created} new and ${result.updated} existing ${result.contactIds.length === 1 ? "person is" : "people are"} selected.${skipped}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The people file could not be imported.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function connectProvider(provider: MailProvider) {
    setProviderChoice(provider); setBusy(true); setNotice("");
    try {
      const result = provider === "google"
        ? await beginGoogleConnection({})
        : await beginMicrosoftConnection({ returnTo: "email" });
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `${provider === "google" ? "Google" : "Microsoft"} could not be connected.`;
      setNotice(message.includes("is not configured") ? `${provider === "google" ? "Google" : "Microsoft"} connection setup is not configured on the server yet.` : message);
      setBusy(false);
    }
  }

  async function removeGoogleConnection() {
    setBusy(true); setNotice("");
    try {
      await disconnectGoogle({});
      setNotice("Google account disconnected. Your saved email history remains available.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Google could not be disconnected.");
    } finally { setBusy(false); }
  }

  function reviewSend() {
    setNotice(""); setSendError(""); setSendConfirmed(false);
    setDeliveryCounts(emptyProviderResultCounts()); setSendInterrupted(false);
    if (!providerConnected) {
      setNotice(`Connect ${providerLabel} before sending. You can still prepare manual Gmail drafts now.`);
      return;
    }
    const issue = selectedRecipientIssues[0];
    if (issue) {
      const contact = selectedContacts[issue.recipientIndex];
      setNotice(`${contact.fullName} is missing ${issue.fields.map((field) => `{{${field}}}`).join(", ")}. No emails were sent.`);
      return;
    }
    sendDialog.current?.showModal();
  }

  async function sendNow() {
    if (!sendConfirmed || !selectedContacts.length) return;
    const counts = emptyProviderResultCounts();
    const failures: string[] = [];
    setDeliveryCounts({ ...counts }); setSendInterrupted(false);
    setBusy(true); setSendError("");
    try {
      for (let offset = 0; offset < selectedContacts.length; offset += 50) {
        const chunk = selectedContacts.slice(offset, offset + 50);
        const args = {
          contactIds: chunk.map((contact) => contact._id),
          subjectTemplate: subject,
          bodyHtmlTemplate: bodyHtml,
          confirmation: `SEND ${chunk.length}`,
        };
        const result = mailProvider === "google" ? await sendGoogleBatch(args) : await sendMicrosoftBatch(args);
        counts.accepted += result.accepted;
        counts.failed += result.failed;
        counts.unknown += result.unknown;
        counts.inProgress += result.inProgress;
        counts.alreadyAccepted += result.alreadyAccepted;
        failures.push(...result.failures);
        setDeliveryCounts({ ...counts });
      }
      const summary = summarizeProviderDelivery(counts, providerLabel);
      if (!summary.safeToClose) {
        setSendError(`${summary.message} ${failures.slice(0, 3).join(" · ")}`.trim());
      } else {
        sendDialog.current?.close();
        setNotice(summary.message);
        setTab("history");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `${providerLabel} could not send this email batch.`;
      setDeliveryCounts({ ...counts });
      setSendInterrupted(true);
      setSendError(summarizeProviderDeliveryInterruption(counts, providerLabel, message, selectedContacts.length));
    } finally { setBusy(false); }
  }

  function openDraft(contact: Doc<"contacts">, message?: Doc<"messages">) {
    const fields = contactFields(contact);
    const personalizedSubject = message?.subject ?? personalizeTemplate(subject, fields).output;
    const personalizedHtml = message?.bodyHtml ?? personalizeTemplate(bodyHtml, fields, "html").output;
    const personalizedText = message?.bodyText ?? htmlToPlainText(personalizedHtml);
    const url = buildGmailComposeUrl({ sender: SENDER, to: [contact.email], subject: personalizedSubject, body: personalizedText });
    window.open(url, "_blank", "noopener,noreferrer");
    if (!message) {
      void saveDraft({ contactId: contact._id, recipientEmail: contact.email, recipientName: contact.fullName, subject: personalizedSubject, bodyHtml: personalizedHtml, bodyText: personalizedText })
        .then((id) => markStatus({ id, status: "opened_in_gmail" }));
    } else {
      void markStatus({ id: message._id, status: "opened_in_gmail" });
    }
  }

  async function prepareDrafts() {
    if (!selectedContacts.length) return;
    const issue = selectedRecipientIssues[0];
    if (issue) {
      const contact = selectedContacts[issue.recipientIndex];
      setNotice(`${contact.fullName} is missing ${issue.fields.map((field) => `{{${field}}}`).join(", ")}. No drafts were saved.`);
      return;
    }
    setBusy(true); setNotice("");
    try {
      for (const contact of selectedContacts) {
        const fields = contactFields(contact);
        const personalizedSubject = personalizeTemplate(subject, fields).output;
        const personalizedHtml = personalizeTemplate(bodyHtml, fields, "html").output;
        await saveDraft({ contactId: contact._id, recipientEmail: contact.email, recipientName: contact.fullName, subject: personalizedSubject, bodyHtml: personalizedHtml, bodyText: htmlToPlainText(personalizedHtml) });
      }
      setNotice(`${selectedContacts.length} personalized ${selectedContacts.length === 1 ? "draft" : "drafts"} saved. Open each from Email history to review in Gmail.`);
      setTab("history");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Drafts could not be saved.");
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Email studio" title="Write once. Make it personal." description="Connect Google or Microsoft, choose the sending account, and send one reviewed, personalized email per person." />
      <div className="tab-bar" role="tablist" aria-label="Email tools">
        <button role="tab" aria-selected={tab === "write"} className={tab === "write" ? "is-active" : ""} onClick={() => setTab("write")}><Sparkles aria-hidden="true" /> Write</button>
        <button role="tab" aria-selected={tab === "routing"} className={tab === "routing" ? "is-active" : ""} onClick={() => setTab("routing")}><Route aria-hidden="true" /> Routing rules</button>
        <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}><MailCheck aria-hidden="true" /> Email history</button>
      </div>
      {notice && <div className="inline-alert email-page-alert" role="status">{notice}</div>}

      {tab === "write" && (
        <>
          <section className="mail-provider-panel" aria-labelledby="sending-account-heading">
            <div className="provider-panel-heading">
              <div><p className="eyebrow">Sending account</p><h2 id="sending-account-heading">Choose Google or Microsoft</h2></div>
              <span><ShieldCheck aria-hidden="true" /> Secure server connection</span>
            </div>
            <div className="provider-options">
              <article className={clsx("provider-card", mailProvider === "google" && "provider-card--active", googleStatus?.connected && "provider-card--connected")}>
                <div className="provider-card-copy"><span className="provider-icon provider-icon--google"><AtSign aria-hidden="true" /></span><div><strong>Google</strong><small>{googleStatus?.connected ? googleStatus.email : "Gmail sending"}</small></div></div>
                <div className="provider-card-actions">
                  {googleStatus === undefined ? <button type="button" className="button button--ghost" disabled>Checking…</button> : googleStatus.connected ? <><button type="button" className="button button--secondary" aria-pressed={mailProvider === "google"} onClick={() => setProviderChoice("google")}>{mailProvider === "google" ? <><Check aria-hidden="true" /> Selected</> : "Use Google"}</button><button type="button" className="provider-disconnect" disabled={busy} onClick={() => void removeGoogleConnection()}>Disconnect</button></> : <button type="button" className="button button--secondary" disabled={busy} onClick={() => void connectProvider("google")}>Connect Google</button>}
                </div>
              </article>
              <article className={clsx("provider-card", mailProvider === "microsoft" && "provider-card--active", microsoftStatus?.connected && "provider-card--connected")}>
                <div className="provider-card-copy"><span className="provider-icon provider-icon--microsoft"><Building2 aria-hidden="true" /></span><div><strong>Microsoft</strong><small>{microsoftStatus?.connected ? microsoftStatus.email : "Outlook sending"}</small></div></div>
                <div className="provider-card-actions">
                  {microsoftStatus === undefined ? <button type="button" className="button button--ghost" disabled>Checking…</button> : microsoftStatus.connected ? <button type="button" className="button button--secondary" aria-pressed={mailProvider === "microsoft"} onClick={() => setProviderChoice("microsoft")}>{mailProvider === "microsoft" ? <><Check aria-hidden="true" /> Selected</> : "Use Microsoft"}</button> : <button type="button" className="button button--secondary" disabled={busy} onClick={() => void connectProvider("microsoft")}>Connect Microsoft</button>}
                </div>
              </article>
            </div>
          </section>
          <div className="email-studio">
          <section className="recipient-rail" aria-label="Choose recipients">
            <div className="rail-heading"><div><p className="eyebrow">Step 1</p><h2>Choose people</h2></div><span>{selected.size} selected</span></div>
            <div className="compact-filter"><Filter aria-hidden="true" /><select value={peopleFilter} onChange={(event) => setPeopleFilter(event.target.value as typeof peopleFilter)} aria-label="Filter recipients"><option value="all">Everyone</option><option value="unpaid">Not paid</option><option value="outstanding">Awaiting reply</option></select></div>
            <button className="select-all-button" type="button" onClick={() => setSelected((current) => current.size === visibleContacts.length ? new Set() : new Set(visibleContacts.map((contact) => contact._id)))}>{selected.size === visibleContacts.length && visibleContacts.length ? "Clear selection" : "Select this group"}</button>
            <input ref={fileInput} className="sr-only" type="file" accept=".xlsx,.xls,.csv" aria-label="Import people from Excel or CSV" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importRecipientFile(file); }} />
            <button className="recipient-import-button" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><FileUp aria-hidden="true" /><span><strong>{busy ? "Importing…" : "Import people"}</strong><small>Excel, CSV, or a Forms export</small></span></button>
            <div className="recipient-list">
              {!contacts ? <div className="page-loader">Loading…</div> : visibleContacts.map((contact) => (
                <label key={contact._id} className={clsx("recipient-item", selected.has(contact._id) && "recipient-item--selected")}>
                  <input type="checkbox" checked={selected.has(contact._id)} onChange={() => toggleContact(contact._id)} />
                  <span className="avatar">{initials(contact.fullName)}</span>
                  <span><strong>{contact.fullName}</strong><small>{contact.email}</small></span>
                  {selected.has(contact._id) && <Check aria-hidden="true" />}
                </label>
              ))}
            </div>
          </section>

          <section className="composer-panel">
            <div className="composer-heading"><div><p className="eyebrow">Step 2</p><h2>Write the message</h2></div><span className="sender-chip">From {sender}</span></div>
            <label className="subject-field">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What is this email about?" /></label>
            <div className="merge-fields"><span>Personalize:</span>{mergeFields.map(([label, token]) => <button key={token} type="button" onClick={() => insertField(token)}>+ {label}</button>)}</div>
            <RichEditor value={bodyHtml} onChange={setBodyHtml} />
            <div className="composer-footer"><div><strong>{selected.size || 0} personalized email{selected.size === 1 ? "" : "s"}</strong><small>Each person receives a separate message—never a visible bulk list.</small></div><div className="composer-actions"><button className="button button--secondary" type="button" disabled={!selected.size || busy || selectedRecipientIssues.length > 0} onClick={() => void prepareDrafts()}><Save aria-hidden="true" /> Prepare drafts</button><button className="button button--primary" type="button" disabled={!selected.size || busy || selectedRecipientIssues.length > 0} onClick={() => providerConnected ? reviewSend() : void connectProvider(mailProvider)}><Send aria-hidden="true" /> {providerConnected ? "Review & send" : `Connect ${providerLabel}`}</button></div></div>

          </section>

          <aside className="preview-panel">
            <div className="preview-heading"><div><p className="eyebrow">Step 3</p><h2>Check the result</h2></div><span>Preview</span></div>
            {previewContact && previewBody && previewSubject ? (
              <div className="email-preview email-preview--branded">
                <div className="preview-addresses"><span><small>From</small>{sender}</span><span><small>To</small>{previewContact.email}</span><span><small>Subject</small><strong>{previewSubject.output}</strong></span></div>
                {unresolved.length > 0 && <div className="inline-alert inline-alert--warning" role="alert">Add {unresolved.map((field) => `{{${field}}}`).join(", ")} to {previewContact.fullName} before sending.</div>}
                <iframe className="branded-email-frame" title={`Email preview for ${previewContact.fullName}`} sandbox="" srcDoc={previewDocument} />
              </div>
            ) : <div className="empty-state"><Users aria-hidden="true" /><h3>Choose a person</h3><p>Their personalized email will appear here.</p></div>}
          </aside>
          </div>
        </>
      )}

      {tab === "routing" && (
        <div className="routing-layout">
          <section className="data-panel">
            <div className="data-panel-heading"><div><p className="eyebrow">Department map</p><h2>Subject routing rules</h2><p>Keywords are matched without worrying about capital letters.</p></div><span className="connection-state">Rules active · mailbox watcher not connected</span></div>
            <div className="rules-list">{(rules ?? []).map((rule) => <RoutingRuleRow key={rule._id} rule={rule} onSave={saveRule} />)}</div>
          </section>
          <aside className="route-tester">
            <p className="eyebrow">Try a subject</p><h2>Where will it go?</h2><label>Email subject<input value={testSubject} onChange={(event) => setTestSubject(event.target.value)} /></label>
            {routingRule ? <div className="route-result"><span className="route-arrow"><ChevronRight aria-hidden="true" /></span><p>Send to <strong>{routingRule.department}</strong></p><small>{routingRule.recipients.join(", ")}</small><button className="button button--primary button--full" type="button" onClick={() => window.open(buildGmailComposeUrl({ sender: SENDER, to: routingRule.recipients, subject: `Fwd: ${testSubject}`, body: "Forwarded for your department’s review." }), "_blank", "noopener,noreferrer")}><Send aria-hidden="true" /> Forward in Gmail</button></div> : <div className="empty-inline">No rule matches this subject.</div>}
            <div className="planned-note"><strong>Automatic inbox forwarding</strong><p>The rule engine works now. Continuous forwarding requires a Gmail/Outlook mailbox API connection and is deliberately not shown as connected.</p></div>
          </aside>
        </div>
      )}

      {tab === "history" && (
        <section className="data-panel">
          <div className="data-panel-heading"><div><p className="eyebrow">Audited safely</p><h2>Email history</h2><p>Provider sends show Google or Microsoft. Manual Gmail drafts remain clearly separate from confirmed API acceptance.</p></div></div>
          {!messages ? <div className="page-loader">Loading…</div> : messages.length === 0 ? <div className="empty-state"><MailCheck aria-hidden="true" /><h3>No drafts yet</h3><p>Prepare a personalized message and it will appear here.</p></div> : <div className="message-history">{messages.map((message) => {
            const contact = contacts?.find((item) => item._id === message.contactId);
            const apiProvider = message.provider === "google_gmail" ? "Gmail API" : message.provider === "microsoft_graph" ? "Microsoft Graph" : null;
            return <article key={message._id}><div><strong>{message.recipientName}</strong><small>{message.recipientEmail}</small></div><div className="message-subject"><strong>{message.subject}</strong><small>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(message.createdAt)}{message.providerError ? ` · ${message.providerError}` : ""}</small></div><StatusBadge status={message.status} /><div className="history-actions">{apiProvider ? <span className="provider-label">{apiProvider}</span> : <>{contact && <button type="button" className="button button--ghost" onClick={() => openDraft(contact, message)}><ExternalLink aria-hidden="true" /> Open</button>}<button type="button" className="button button--secondary" disabled={message.status === "sent"} onClick={() => void markStatus({ id: message._id, status: "sent" })}><Check aria-hidden="true" /> Mark sent</button></>}</div></article>;
          })}</div>}
        </section>
      )}

      <dialog ref={sendDialog} className="modal email-send-dialog" onClose={() => { setSendConfirmed(false); setSendError(""); }}>
        <form onSubmit={(event) => event.preventDefault()}>
          <div className="send-dialog-icon"><ShieldCheck aria-hidden="true" /></div>
          <p className="eyebrow">Final check · {providerLabel}</p>
          <h2>Send {selectedContacts.length} separate personalized email{selectedContacts.length === 1 ? "" : "s"}?</h2>
          <p>Each recipient gets their own Oakridge-branded message. No recipient can see anyone else in the batch.</p>
          <div className="send-review-summary">
            <div><small>Provider</small><strong>{providerLabel}</strong></div>
            <div><small>From</small><strong>{sender}</strong></div>
            <div><small>Recipients</small><strong>{selectedContacts.length}</strong></div>
          </div>
          <div className="send-recipient-sample">{selectedContacts.slice(0, 5).map((contact) => <span key={contact._id}>{contact.fullName} <small>{contact.email}</small></span>)}{selectedContacts.length > 5 && <span>+ {selectedContacts.length - 5} more</span>}</div>
          <label className="send-confirmation"><input type="checkbox" checked={sendConfirmed} onChange={(event) => setSendConfirmed(event.target.checked)} /><span>I reviewed the provider, sender, subject, message, and recipient count.</span></label>
          {sendError && <div className="inline-alert inline-alert--warning" role="alert">{sendError}</div>}
          <div className="modal-actions"><button type="button" className="button button--ghost" disabled={busy} onClick={() => sendDialog.current?.close()}>Cancel</button><button type="button" className="button button--primary" disabled={!sendConfirmed || busy || (Boolean(sendError) && retryAction.disabled)} onClick={() => void sendNow()}><Send aria-hidden="true" /> {busy ? "Sending…" : sendError ? retryAction.label : `Send with ${providerLabel}`}</button></div>
        </form>
      </dialog>
    </div>
  );
}

function RoutingRuleRow({ rule, onSave }: { rule: Doc<"routingRules">; onSave: ReturnType<typeof useMutation<typeof api.routingRules.save>> }) {
  const [keywords, setKeywords] = useState(rule.keywords.join(", "));
  const [recipients, setRecipients] = useState(rule.recipients.join(", "));
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saved, setSaved] = useState(false);
  async function save() {
    await onSave({ id: rule._id, name: rule.name, department: rule.department, keywords: keywords.split(",").map((value) => value.trim()).filter(Boolean), recipients: recipients.split(",").map((value) => value.trim().toLocaleLowerCase()).filter(Boolean), enabled, priority: rule.priority });
    setSaved(true); window.setTimeout(() => setSaved(false), 1500);
  }
  return <article className="rule-row"><label className="toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span /><span className="sr-only">Enable {rule.name}</span></label><div className="rule-identity"><span>{rule.department}</span><strong>{rule.name}</strong></div><label>Subject words<input value={keywords} onChange={(event) => setKeywords(event.target.value)} /></label><label>Forward to<input value={recipients} onChange={(event) => setRecipients(event.target.value)} /></label><button className="button button--ghost" type="button" onClick={() => void save()}>{saved ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}{saved ? "Saved" : "Save"}</button></article>;
}
