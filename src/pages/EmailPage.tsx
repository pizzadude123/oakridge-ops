import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { AtSign, Building2, Check, ChevronRight, ExternalLink, FileImage, FileUp, Filter, ImagePlus, MailCheck, Route, Save, Send, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import clsx from "clsx";
import { useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  providerRetryAction,
  summarizeProviderDelivery,
  summarizeProviderDeliveryInterruption,
  type ProviderResultCounts,
} from "../../convex/lib/mailDelivery";
import { buildGmailComposeUrl, buildOakridgeEmailHtml, matchRoutingRule, personalizeTemplate, unresolvedFieldsForRecipients, type EmailImageAlignment, type EmailImagePlacement, type EmailImageWidth } from "../domain/email";
import { emailAssetUploadEndpoint, formatImageSize, validateSelectedEmailImages } from "../domain/emailAssets";
import { PageHeader } from "../components/PageHeader";
import { RichEditor } from "../components/RichEditor";
import { StatusBadge } from "../components/StatusBadge";
import { htmlToPlainText, initials } from "../lib/text";
import { parsePeopleFile } from "../lib/workbook";

const SENDER = "cattartzz@gmail.com";
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;
const DEFAULT_BODY = `<p>Hello {{firstName}},</p><p>We are writing with an Oakridge MUN update.</p><h3>What you need to know</h3><p>Add the essential details, including any date, decision, or action required.</p><p>Regards,<br><strong>Oakridge MUN Team</strong></p>`;
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
type UploadedEmailImage = {
  id: Id<"emailAssets">;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
  alt: string;
  placement: EmailImagePlacement;
  width: EmailImageWidth;
  alignment: EmailImageAlignment;
};

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
  const { fetchAccessToken } = useConvexAuth();
  const contacts = useQuery(api.contacts.list);
  const rules = useQuery(api.routingRules.list);
  const messages = useQuery(api.messages.recent);
  const googleStatus = useQuery(api.googleData.status);
  const microsoftStatus = useQuery(api.graphData.status);
  const saveDraft = useMutation(api.messages.saveDraft);
  const markStatus = useMutation(api.messages.markStatus);
  const saveRule = useMutation(api.routingRules.save);
  const importPeople = useMutation(api.contacts.importPeople);
  const removeEmailImage = useMutation(api.emailAssets.remove);
  const beginGoogleConnection = useAction(api.googleGmail.beginConnection);
  const disconnectGoogle = useAction(api.googleGmail.disconnect);
  const sendGoogleBatch = useAction(api.googleGmail.sendPersonalizedBatch);
  const beginMicrosoftConnection = useAction(api.microsoftGraph.beginConnection);
  const sendMicrosoftBatch = useAction(api.microsoftMail.sendPersonalizedBatch);
  const location = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const sendDialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("write");
  const [providerChoice, setProviderChoice] = useState<MailProvider | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peopleFilter, setPeopleFilter] = useState<"all" | "unpaid" | "outstanding">("all");
  const [subject, setSubject] = useState("An update from Oakridge MUN");
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY);
  const [emailImages, setEmailImages] = useState<UploadedEmailImage[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() => connectionNotice(location.search));
  const [sendConfirmed, setSendConfirmed] = useState(false);
  const [sendError, setSendError] = useState("");
  const [deliveryCounts, setDeliveryCounts] = useState<ProviderResultCounts>(emptyProviderResultCounts);
  const [sendInterrupted, setSendInterrupted] = useState(false);
  const [testSubject, setTestSubject] = useState("Allocation question from a delegate");
  const emailImagesRef = useRef<UploadedEmailImage[]>([]);
  const removeEmailImageRef = useRef(removeEmailImage);

  useEffect(() => {
    emailImagesRef.current = emailImages;
    removeEmailImageRef.current = removeEmailImage;
  }, [emailImages, removeEmailImage]);

  useEffect(() => () => {
    for (const image of emailImagesRef.current) {
      void removeEmailImageRef.current({ id: image.id }).catch(() => undefined);
    }
  }, []);

  const visibleContacts = useMemo(() => (contacts ?? []).filter((contact) =>
    peopleFilter === "all"
      || (peopleFilter === "unpaid" && contact.paymentStatus === "unpaid")
      || (peopleFilter === "outstanding" && contact.replyStatus === "awaiting_reply"),
  ), [contacts, peopleFilter]);
  const allVisibleSelected = visibleContacts.length > 0 && visibleContacts.every((contact) => selected.has(contact._id));
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
    ? buildOakridgeEmailHtml({
        bodyHtml: DOMPurify.sanitize(previewBody.output),
        preheader: previewSubject.output,
        images: emailImages.map(({ url, alt, placement, width, alignment }) => ({ src: url, alt, placement, width, alignment })),
      })
    : "";
  const routingRule = matchRoutingRule(testSubject, (rules ?? []).map((rule) => ({ ...rule, id: rule._id })));


  function toggleContact(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleVisibleContacts() {
    setSelected((current) => {
      const next = new Set(current);
      if (visibleContacts.length > 0 && visibleContacts.every((contact) => next.has(contact._id))) {
        visibleContacts.forEach((contact) => next.delete(contact._id));
      } else {
        visibleContacts.forEach((contact) => next.add(contact._id));
      }
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

  async function uploadEmailImages(files: File[]) {
    setNotice("");
    let selectedFiles: File[];
    try {
      selectedFiles = validateSelectedEmailImages({ existingSizes: emailImages.map(({ size }) => size), files });
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Those images could not be added.");
      return;
    }
    setImageBusy(true);
    try {
      for (const file of selectedFiles) {
        const authToken = await fetchAccessToken({ forceRefreshToken: false });
        if (!authToken) throw new Error("Sign in before uploading email images.");
        const response = await fetch(emailAssetUploadEndpoint(CONVEX_URL, file.name), {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": file.type },
          body: file,
        });
        const result = await response.json() as Partial<UploadedEmailImage> & { error?: string };
        if (!response.ok || !result.id || !result.url || !result.fileName || !result.contentType || !result.size) {
          throw new Error(result.error || `${file.name} could not be uploaded.`);
        }
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
        setEmailImages((current) => [...current, {
          id: result.id as Id<"emailAssets">,
          url: result.url!,
          fileName: result.fileName!,
          contentType: result.contentType!,
          size: result.size!,
          alt,
          placement: current.length === 0 ? "header" : "body",
          width: current.length === 0 ? "full" : "wide",
          alignment: "center",
        }]);
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The email images could not be uploaded.");
    } finally {
      setImageBusy(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function deleteEmailImage(id: Id<"emailAssets">) {
    setImageBusy(true); setNotice("");
    try {
      await removeEmailImage({ id });
      setEmailImages((current) => current.filter((image) => image.id !== id));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The email image could not be removed.");
    } finally { setImageBusy(false); }
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
    if (emailImages.some(({ alt }) => !alt.trim())) {
      setNotice("Add alternative text for every campaign image before sending.");
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
          imageAssets: emailImages.map(({ id, alt, placement, width, alignment }) => ({ assetId: id, alt, placement, width, alignment })),
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
            <button className="select-all-button" type="button" onClick={toggleVisibleContacts}>{allVisibleSelected ? "Clear this group" : "Select this group"}</button>
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
            <div className="merge-fields"><span>Personalize content:</span>{mergeFields.map(([label, token]) => <button key={token} type="button" onClick={() => insertField(token)}>+ {label}</button>)}</div>
            <RichEditor value={bodyHtml} onChange={setBodyHtml} />
            <section className="email-media-panel" aria-labelledby="email-media-heading">
              <div className="email-media-heading">
                <div className="email-media-icon"><FileImage aria-hidden="true" /></div>
                <div><h3 id="email-media-heading">Image objects</h3><p>Add up to three embedded visuals, then place each as a lead, in-message, or closing object.</p></div>
                <button className="button button--secondary" type="button" disabled={imageBusy || emailImages.length >= 3} onClick={() => imageInput.current?.click()}><ImagePlus aria-hidden="true" /> {imageBusy ? "Uploading…" : "Add images"}</button>
              </div>
              <input ref={imageInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/gif" multiple aria-label="Upload campaign images" onChange={(event) => { if (event.target.files?.length) void uploadEmailImages([...event.target.files]); }} />
              {emailImages.length ? (
                <div className="email-image-list">{emailImages.map((image, index) => (
                  <article key={image.id} className="email-image-item">
                    <img src={image.url} alt="" />
                    <div className="email-image-copy">
                      <strong>{image.fileName}</strong><small>{formatImageSize(image.size)} · Image object {index + 1}</small>
                      <label>Alternative text<input value={image.alt} maxLength={160} onChange={(event) => setEmailImages((current) => current.map((item) => item.id === image.id ? { ...item, alt: event.target.value } : item))} placeholder="Describe the image for recipients who cannot see it" /></label>
                      <div className="email-object-controls">
                        <label>Location<select aria-label={`Location for ${image.fileName}`} value={image.placement} onChange={(event) => setEmailImages((current) => current.map((item) => item.id === image.id ? { ...item, placement: event.target.value as EmailImagePlacement } : item))}><option value="header">Lead</option><option value="body">Body</option><option value="footer">End</option></select></label>
                        <label>Scale<select aria-label={`Scale for ${image.fileName}`} value={image.width} onChange={(event) => setEmailImages((current) => current.map((item) => item.id === image.id ? { ...item, width: event.target.value as EmailImageWidth } : item))}><option value="full">Full</option><option value="wide">Wide</option><option value="compact">Small</option></select></label>
                        <label>Align<select aria-label={`Alignment for ${image.fileName}`} value={image.alignment} onChange={(event) => setEmailImages((current) => current.map((item) => item.id === image.id ? { ...item, alignment: event.target.value as EmailImageAlignment } : item))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                      </div>
                    </div>
                    <button className="icon-button icon-button--danger" type="button" disabled={imageBusy || busy || deliveryCounts.unknown > 0 || deliveryCounts.inProgress > 0} onClick={() => void deleteEmailImage(image.id)} aria-label={`Remove ${image.fileName}`}><Trash2 aria-hidden="true" /></button>
                  </article>
                ))}</div>
              ) : (
                <button className="email-image-drop" type="button" disabled={imageBusy} onClick={() => imageInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) void uploadEmailImages([...event.dataTransfer.files]); }}><ImagePlus aria-hidden="true" /><span><strong>Drop campaign images here</strong><small>Or choose files · 1 MB each · 2 MB total</small></span></button>
              )}
            </section>
            <div className="composer-footer"><div><strong>{selected.size || 0} personalized email{selected.size === 1 ? "" : "s"}</strong><small>{emailImages.length ? `${emailImages.length} embedded image${emailImages.length === 1 ? "" : "s"} · Send through a connected provider.` : "Each person receives a separate message—never a visible bulk list."}</small></div><div className="composer-actions"><button className="button button--secondary" type="button" title={emailImages.length ? "Uploaded images require provider delivery." : undefined} disabled={!selected.size || busy || emailImages.length > 0 || selectedRecipientIssues.length > 0} onClick={() => void prepareDrafts()}><Save aria-hidden="true" /> Prepare drafts</button><button className="button button--primary" type="button" disabled={!selected.size || busy || imageBusy || emailImages.some(({ alt }) => !alt.trim()) || selectedRecipientIssues.length > 0} onClick={() => providerConnected ? reviewSend() : void connectProvider(mailProvider)}><Send aria-hidden="true" /> {providerConnected ? "Review & send" : `Connect ${providerLabel}`}</button></div></div>

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

      <dialog ref={sendDialog} className="modal email-send-dialog" aria-labelledby="send-dialog-title" aria-describedby="send-dialog-description" onClose={() => { setSendConfirmed(false); setSendError(""); }}>
        <form onSubmit={(event) => event.preventDefault()}>
          <div className="send-dialog-icon"><ShieldCheck aria-hidden="true" /></div>
          <p className="eyebrow">Final check · {providerLabel}</p>
          <h2 id="send-dialog-title">Send {selectedContacts.length} separate personalized email{selectedContacts.length === 1 ? "" : "s"}?</h2>
          <p id="send-dialog-description">Each recipient gets their own Oakridge-branded message. No recipient can see anyone else in the batch.</p>
          <div className="send-review-summary">
            <div><small>Provider</small><strong>{providerLabel}</strong></div>
            <div><small>From</small><strong>{sender}</strong></div>
            <div><small>Recipients</small><strong>{selectedContacts.length}</strong></div>
            <div><small>Images</small><strong>{emailImages.length}</strong></div>
          </div>
          <div className="send-recipient-sample">{selectedContacts.slice(0, 5).map((contact) => <span key={contact._id}>{contact.fullName} <small>{contact.email}</small></span>)}{selectedContacts.length > 5 && <span>+ {selectedContacts.length - 5} more</span>}</div>
          <label className="send-confirmation"><input type="checkbox" checked={sendConfirmed} onChange={(event) => setSendConfirmed(event.target.checked)} /><span>I reviewed the provider, sender, subject, message, images, and recipient count.</span></label>
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
