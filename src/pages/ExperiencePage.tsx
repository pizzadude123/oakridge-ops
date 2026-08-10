import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { Check, Copy, ExternalLink, FileUp, Film, Paperclip, Pencil, Radio, Send, Trash2, UsersRound, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PageHeader } from "../components/PageHeader";
import { committeeProfiles, crisisChannelProfiles, toYouTubeEmbedUrl, type CommitteeSlug, type CrisisChannel } from "../domain/committeeExperience";
import { CRISIS_ATTACHMENT_ACCEPT, crisisAttachmentUploadEndpoint, formatCrisisAttachmentSize, isCurrentCrisisUpload, validateSelectedCrisisAttachment } from "../domain/crisisAttachments";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;
const removeCrisisAttachment = makeFunctionReference<"mutation", { id: Id<"crisisAttachments"> }, { removed: boolean }>("crisisAttachments:remove");

type MediaRecord = {
  _id: Id<"committeeMedia">;
  committee: CommitteeSlug;
  title: string;
  speaker: string;
  description: string;
  videoUrl: string;
  published: boolean;
};

type EditorState = {
  updateId?: Id<"crisisUpdates">;
  channel: CrisisChannel;
  headline: string;
  briefing: string;
  severity: "advisory" | "breaking" | "critical";
  transmission: "intelligence" | "directive" | "broadcast";
  sourceLabel: string;
  portfolios: string;
  attachment: CrisisAttachment | null;
  isPublished: boolean;
};

type CrisisAttachment = {
  id: Id<"crisisAttachments">;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
  persisted: boolean;
};

const emptyEditor: EditorState = {
  channel: "jcc",
  headline: "",
  briefing: "",
  severity: "breaking",
  transmission: "intelligence",
  sourceLabel: "Crisis Directorate",
  portfolios: "",
  attachment: null,
  isPublished: false,
};

const publicLinks = {
  copuos: "/committees/copuos",
  armageddon: "/committees/armageddon",
  jcc: "/crisis/jcc-cold-war",
  armageddonCrisis: "/crisis/armageddon-ai-takeover",
};

function MediaEditor({ committee, stored }: { committee: CommitteeSlug; stored?: MediaRecord }) {
  const save = useMutation(api.committeeExperience.saveCommitteeMedia);
  const profile = committeeProfiles[committee];
  const [title, setTitle] = useState(stored?.title ?? `${profile.label} committee briefing`);
  const [speaker, setSpeaker] = useState(stored?.speaker ?? profile.chairs[0].name);
  const [description, setDescription] = useState(stored?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(stored?.videoUrl ?? "");
  const [published, setPublished] = useState(stored?.published ?? false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const embedUrl = toYouTubeEmbedUrl(videoUrl);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setStatus(""); setError("");
    try {
      await save({ committee, title, speaker, description, videoUrl, published });
      setStatus(published ? "Published to the delegate page." : "Chair briefing saved as a private draft.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The chair briefing could not be saved.");
    } finally { setBusy(false); }
  }

  return <form className="media-editor" onSubmit={(event) => void submit(event)}>
    <header><div><Film aria-hidden="true" /><span>{profile.label}</span></div><Link to={publicLinks[committee]} target="_blank">Open public page <ExternalLink aria-hidden="true" /></Link></header>
    <div className="media-editor-grid">
      <label><span>Video title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></label>
      <label><span>Speaker</span><input value={speaker} onChange={(event) => setSpeaker(event.target.value)} maxLength={100} required /></label>
      <label className="field-span"><span>YouTube URL</span><input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtu.be/…" /></label>
      <label className="field-span"><span>What delegates will learn</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={400} rows={3} /></label>
    </div>
    <div className="media-preview">{embedUrl ? <iframe src={embedUrl} title="Chair explainer preview" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div><Film aria-hidden="true" /><p>Add a YouTube link to preview the delegate briefing.</p></div>}</div>
    <footer><label className="publish-toggle"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span>Publish on delegate page</span></label><button className="button button--primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save chair explainer"}</button></footer>
    {status && <p className="editor-status editor-status--success" role="status"><Check aria-hidden="true" />{status}</p>}{error && <p className="editor-status editor-status--error" role="alert">{error}</p>}
  </form>;
}

export function ExperiencePage() {
  const { fetchAccessToken } = useConvexAuth();
  const experience = useQuery(api.committeeExperience.adminExperience);
  const saveUpdate = useMutation(api.committeeExperience.saveCrisisUpdate);
  const setPublished = useMutation(api.committeeExperience.setCrisisPublished);
  const deleteUpdate = useMutation(api.committeeExperience.deleteCrisisUpdate);
  const discardAttachment = useMutation(removeCrisisAttachment);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const editorEpoch = useRef(0);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [busy, setBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const profile = crisisChannelProfiles[editor.channel];

  function change<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
  }

  async function uploadAttachment(file: File) {
    setMessage(""); setError("");
    try {
      validateSelectedCrisisAttachment(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file cannot be attached.");
      return;
    }
    const uploadEpoch = editorEpoch.current;
    setAttachmentBusy(true);
    try {
      if (editor.attachment && !editor.attachment.persisted) {
        await discardAttachment({ id: editor.attachment.id });
        setEditor((current) => current.attachment?.id === editor.attachment?.id ? { ...current, attachment: null } : current);
      }
      const authToken = await fetchAccessToken({ forceRefreshToken: false });
      if (!authToken) throw new Error("Sign in before uploading crisis attachments.");
      const response = await fetch(crisisAttachmentUploadEndpoint(CONVEX_URL, file.name), {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": file.type },
        body: file,
      });
      const result = await response.json() as Partial<Omit<CrisisAttachment, "persisted">> & { error?: string };
      if (!response.ok || !result.id || !result.url || !result.fileName || !result.contentType || !result.size) {
        throw new Error(result.error || `${file.name} could not be uploaded.`);
      }
      if (!isCurrentCrisisUpload(uploadEpoch, editorEpoch.current)) {
        await discardAttachment({ id: result.id as Id<"crisisAttachments"> });
        throw new Error("The editor changed while the file was uploading. Choose the file again for the current transmission.");
      }
      setEditor((current) => ({ ...current, attachment: {
        id: result.id as Id<"crisisAttachments">,
        url: result.url!,
        fileName: result.fileName!,
        contentType: result.contentType!,
        size: result.size!,
        persisted: false,
      } }));
      setMessage(`${result.fileName} is ready to publish with this transmission.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The crisis attachment could not be uploaded.");
    } finally {
      setAttachmentBusy(false);
      if (attachmentInput.current) attachmentInput.current.value = "";
    }
  }

  async function removeEditorAttachment() {
    const attachment = editor.attachment;
    if (!attachment) return;
    setAttachmentBusy(true); setMessage(""); setError("");
    try {
      if (!attachment.persisted) await discardAttachment({ id: attachment.id });
      setEditor((current) => current.attachment?.id === attachment.id ? { ...current, attachment: null } : current);
      setMessage(attachment.persisted ? "The attachment will be removed when you save this update." : "The attachment was removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The attachment could not be removed.");
    } finally { setAttachmentBusy(false); }
  }

  async function cancelEdit() {
    editorEpoch.current += 1;
    const attachment = editor.attachment;
    if (attachment && !attachment.persisted) await discardAttachment({ id: attachment.id }).catch(() => undefined);
    setEditor({ ...emptyEditor, channel: editor.channel });
    setMessage(""); setError("");
  }

  async function submitUpdate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await saveUpdate({
        updateId: editor.updateId,
        channel: editor.channel,
        headline: editor.headline,
        briefing: editor.briefing,
        severity: editor.severity,
        transmission: editor.transmission,
        sourceLabel: editor.sourceLabel,
        affectedPortfolios: editor.portfolios.split(",").map((item) => item.trim()).filter(Boolean),
        attachmentId: editor.attachment?.id,
        isPublished: editor.isPublished,
      });
      setMessage(`Update ${String(result.updateNumber).padStart(2, "0")} ${editor.isPublished ? "published" : "saved as a draft"}.`);
      editorEpoch.current += 1;
      setEditor({ ...emptyEditor, channel: editor.channel });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The crisis update could not be saved.");
    } finally { setBusy(false); }
  }

  async function editUpdate(update: NonNullable<typeof experience>["updates"][number]) {
    if (busy || attachmentBusy) return;
    const unsavedAttachment = editor.attachment && !editor.attachment.persisted ? editor.attachment : null;
    if (unsavedAttachment) {
      try {
        await discardAttachment({ id: unsavedAttachment.id });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Remove the unsaved attachment before editing another transmission.");
        return;
      }
    }
    editorEpoch.current += 1;
    setEditor({
      updateId: update._id,
      channel: update.channel,
      headline: update.headline,
      briefing: update.briefing,
      severity: update.severity,
      transmission: update.transmission,
      sourceLabel: update.sourceLabel,
      portfolios: update.affectedPortfolios.join(", "),
      attachment: update.attachment ? { ...update.attachment, persisted: true } : null,
      isPublished: update.isPublished,
    });
    document.querySelector(".crisis-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyPublicLink(path: string, label: string) {
    const url = `${window.location.origin}${window.location.pathname}#${path}`;
    await navigator.clipboard.writeText(url);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  return <div className="page experience-admin">
    <PageHeader eyebrow="Delegate experience" title="Publish what happens beyond the committee room" description="Manage chair explainers and release real-time crisis transmissions. Public pages never expose drafts, staff identities, or operations data." />

    <section className="experience-links">
      <div><UsersRound aria-hidden="true" /><span><small>Committee briefings</small><strong>COPUOS + Armageddon</strong></span></div>
      <Link to={publicLinks.copuos} target="_blank">COPUOS <ExternalLink aria-hidden="true" /></Link>
      <Link to={publicLinks.armageddon} target="_blank">Armageddon <ExternalLink aria-hidden="true" /></Link>
      <button type="button" onClick={() => void copyPublicLink(publicLinks.jcc, "JCC")}>{copied === "JCC" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} JCC crisis link</button>
      <button type="button" onClick={() => void copyPublicLink(publicLinks.armageddonCrisis, "Armageddon")}>{copied === "Armageddon" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} AI crisis link</button>
    </section>

    <section className="experience-section">
      <div className="section-title-row"><div><p className="eyebrow">Part one · Chair explainers</p><h2>Put the dais in the delegate’s preparation loop</h2><p>Publish privacy-enhanced YouTube embeds. Drafts remain visible only here.</p></div></div>
      <div className="media-editor-layout">{(["copuos", "armageddon"] as CommitteeSlug[]).map((committee) => {
        const stored = experience?.media.find((item) => item.committee === committee) as MediaRecord | undefined;
        return <MediaEditor key={`${committee}-${stored?._id ?? "new"}`} committee={committee} stored={stored} />;
      })}</div>
    </section>

    <section className="experience-section crisis-manager">
      <div className="section-title-row"><div><p className="eyebrow">Part two · Crisis publishing</p><h2>Turn an EB update into a delegate event</h2><p>Draft privately, preview the exact public treatment, then publish into the subscribed live channel.</p></div></div>
      <div className="crisis-manager-layout">
        <form className="crisis-editor" aria-busy={busy || attachmentBusy} onSubmit={(event) => void submitUpdate(event)}>
          <header><Radio aria-hidden="true" /><div><small>{editor.updateId ? "Editing transmission" : "New transmission"}</small><strong>{profile.label}</strong></div></header>
          <div className="form-grid">
            <label><span>Channel</span><select value={editor.channel} onChange={(event) => change("channel", event.target.value as CrisisChannel)}><option value="jcc">JCC · Tehran 1943</option><option value="armageddon">Armageddon · AI takeover</option></select></label>
            <label><span>Severity</span><select value={editor.severity} onChange={(event) => change("severity", event.target.value as EditorState["severity"])}><option value="advisory">Advisory</option><option value="breaking">Breaking</option><option value="critical">Critical</option></select></label>
            <label><span>Transmission type</span><select value={editor.transmission} onChange={(event) => change("transmission", event.target.value as EditorState["transmission"])}><option value="intelligence">Intelligence</option><option value="directive">Directive</option><option value="broadcast">Broadcast</option></select></label>
            <label><span>Source label</span><input value={editor.sourceLabel} onChange={(event) => change("sourceLabel", event.target.value)} maxLength={80} required /></label>
            <label className="field-span"><span>Headline</span><input value={editor.headline} onChange={(event) => change("headline", event.target.value)} maxLength={140} placeholder="A development delegates must respond to" required /></label>
            <label className="field-span"><span>Full briefing</span><textarea value={editor.briefing} onChange={(event) => change("briefing", event.target.value)} maxLength={2400} rows={9} placeholder="State what happened, what is confirmed, and what changed. Do not prescribe the delegate response." required /></label>
            <label className="field-span"><span>Affected portfolios or actors</span><input value={editor.portfolios} onChange={(event) => change("portfolios", event.target.value)} placeholder="United States, Soviet Union, Emergency Council" /><small>Comma-separated, maximum 12.</small></label>
            <div className="field-span crisis-attachment-field">
              <div><span>Delegate attachment</span><small>Optional · one PDF, DOCX, XLSX, CSV, PNG, or JPEG file · 10 MB maximum</small></div>
              <input ref={attachmentInput} className="sr-only" type="file" accept={CRISIS_ATTACHMENT_ACCEPT} aria-label="Upload a crisis transmission attachment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} />
              {editor.attachment ? <div className="crisis-attachment-selected"><Paperclip aria-hidden="true" /><div><strong>{editor.attachment.fileName}</strong><small>{formatCrisisAttachmentSize(editor.attachment.size)} · {editor.attachment.persisted ? "Saved with this update" : "Ready to save"}</small></div><a href={editor.attachment.url} target="_blank" rel="noreferrer">Preview <ExternalLink aria-hidden="true" /></a><button type="button" disabled={attachmentBusy || busy} onClick={() => void removeEditorAttachment()} aria-label={`Remove ${editor.attachment.fileName}`}><X aria-hidden="true" /></button></div> : <button className="crisis-attachment-upload" type="button" disabled={attachmentBusy || busy} onClick={() => attachmentInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadAttachment(file); }}><FileUp aria-hidden="true" /><span><strong>{attachmentBusy ? "Uploading attachment…" : "Choose or drop a delegate file"}</strong><small>The file appears with the public transmission only after publication.</small></span></button>}
            </div>
          </div>
          <label className="publish-toggle publish-toggle--crisis"><input type="checkbox" checked={editor.isPublished} onChange={(event) => change("isPublished", event.target.checked)} /><span>Publish immediately to delegates</span></label>
          <div className="editor-actions">{editor.updateId && <button type="button" className="button button--secondary" disabled={busy || attachmentBusy} onClick={() => void cancelEdit()}>Cancel edit</button>}<button className="button button--primary" type="submit" disabled={busy || attachmentBusy}><Send aria-hidden="true" /> {busy ? "Saving…" : editor.isPublished ? "Publish transmission" : "Save private draft"}</button></div>
          {message && <p className="editor-status editor-status--success" role="status"><Check aria-hidden="true" />{message}</p>}{error && <p className="editor-status editor-status--error" role="alert">{error}</p>}
        </form>

        <aside className={`crisis-admin-preview crisis-admin-preview--${editor.channel}`}>
          <p className="eyebrow">Public preview</p><span>{editor.severity} / {editor.transmission}</span><h3>{editor.headline || "Your crisis headline will appear here"}</h3><p>{editor.briefing || "The full delegate briefing is previewed as plain text. Draft content is never queried by public pages."}</p>{editor.portfolios && <div>{editor.portfolios.split(",").filter(Boolean).map((item) => <b key={item}>{item.trim()}</b>)}</div>}{editor.attachment && <a className="crisis-preview-attachment" href={editor.attachment.url} target="_blank" rel="noreferrer"><Paperclip aria-hidden="true" /><span><small>DELEGATE FILE</small><strong>{editor.attachment.fileName}</strong></span><ExternalLink aria-hidden="true" /></a>}
        </aside>
      </div>

      <div className="crisis-update-history">
        <header><div><p className="eyebrow">Transmission history</p><h3>{experience?.updates.length ?? 0} updates</h3></div></header>
        {!experience?.updates.length ? <div className="empty-state"><Radio aria-hidden="true" /><h3>No transmissions yet</h3><p>Create a private draft or publish the first committee update.</p></div> : experience.updates.map((update) => <article key={update._id}><span className={`crisis-severity crisis-severity--${update.severity}`} /> <div><small>{update.channel.toUpperCase()} · UPDATE {String(update.updateNumber).padStart(2, "0")} · {update.transmission}</small><strong>{update.headline}</strong><p>{update.briefing}</p>{update.attachment && <span className="crisis-history-attachment"><Paperclip aria-hidden="true" />{update.attachment.fileName} · {formatCrisisAttachmentSize(update.attachment.size)}</span>}</div><b className={update.isPublished ? "is-published" : "is-draft"}>{update.isPublished ? "Published" : "Draft"}</b><div className="crisis-history-actions"><button type="button" disabled={busy || attachmentBusy} onClick={() => void editUpdate(update)}><Pencil aria-hidden="true" /> Edit</button><button type="button" disabled={busy || attachmentBusy} onClick={() => void setPublished({ updateId: update._id, isPublished: !update.isPublished })}>{update.isPublished ? "Unpublish" : "Publish"}</button><button type="button" disabled={busy || attachmentBusy} className="danger-text" onClick={() => { if (window.confirm("Delete this crisis update permanently?")) void deleteUpdate({ updateId: update._id }); }}><Trash2 aria-hidden="true" /> Delete</button></div></article>)}
      </div>
    </section>
  </div>;
}
