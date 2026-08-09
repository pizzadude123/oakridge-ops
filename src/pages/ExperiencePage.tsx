import { useMutation, useQuery } from "convex/react";
import { Check, Copy, ExternalLink, Film, Pencil, Radio, Send, Trash2, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PageHeader } from "../components/PageHeader";
import { committeeProfiles, crisisChannelProfiles, toYouTubeEmbedUrl, type CommitteeSlug, type CrisisChannel } from "../domain/committeeExperience";

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
  isPublished: boolean;
};

const emptyEditor: EditorState = {
  channel: "jcc",
  headline: "",
  briefing: "",
  severity: "breaking",
  transmission: "intelligence",
  sourceLabel: "Crisis Directorate",
  portfolios: "",
  isPublished: false,
};

const publicLinks = {
  disec: "/committees/disec",
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
    {status && <p className="editor-status editor-status--success"><Check aria-hidden="true" />{status}</p>}{error && <p className="editor-status editor-status--error">{error}</p>}
  </form>;
}

export function ExperiencePage() {
  const experience = useQuery(api.committeeExperience.adminExperience);
  const saveUpdate = useMutation(api.committeeExperience.saveCrisisUpdate);
  const setPublished = useMutation(api.committeeExperience.setCrisisPublished);
  const deleteUpdate = useMutation(api.committeeExperience.deleteCrisisUpdate);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const profile = crisisChannelProfiles[editor.channel];

  function change<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
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
        isPublished: editor.isPublished,
      });
      setMessage(`Update ${String(result.updateNumber).padStart(2, "0")} ${editor.isPublished ? "published" : "saved as a draft"}.`);
      setEditor({ ...emptyEditor, channel: editor.channel });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The crisis update could not be saved.");
    } finally { setBusy(false); }
  }

  function editUpdate(update: NonNullable<typeof experience>["updates"][number]) {
    setEditor({
      updateId: update._id,
      channel: update.channel,
      headline: update.headline,
      briefing: update.briefing,
      severity: update.severity,
      transmission: update.transmission,
      sourceLabel: update.sourceLabel,
      portfolios: update.affectedPortfolios.join(", "),
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
      <div><UsersRound aria-hidden="true" /><span><small>Committee briefings</small><strong>DISEC + Armageddon</strong></span></div>
      <Link to={publicLinks.disec} target="_blank">DISEC <ExternalLink aria-hidden="true" /></Link>
      <Link to={publicLinks.armageddon} target="_blank">Armageddon <ExternalLink aria-hidden="true" /></Link>
      <button type="button" onClick={() => void copyPublicLink(publicLinks.jcc, "JCC")}>{copied === "JCC" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} JCC crisis link</button>
      <button type="button" onClick={() => void copyPublicLink(publicLinks.armageddonCrisis, "Armageddon")}>{copied === "Armageddon" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} AI crisis link</button>
    </section>

    <section className="experience-section">
      <div className="section-title-row"><div><p className="eyebrow">Part one · Chair explainers</p><h2>Put the dais in the delegate’s preparation loop</h2><p>Publish privacy-enhanced YouTube embeds. Drafts remain visible only here.</p></div></div>
      <div className="media-editor-layout">{(["disec", "armageddon"] as CommitteeSlug[]).map((committee) => {
        const stored = experience?.media.find((item) => item.committee === committee) as MediaRecord | undefined;
        return <MediaEditor key={`${committee}-${stored?._id ?? "new"}`} committee={committee} stored={stored} />;
      })}</div>
    </section>

    <section className="experience-section crisis-manager">
      <div className="section-title-row"><div><p className="eyebrow">Part two · Crisis publishing</p><h2>Turn an EB update into a delegate event</h2><p>Draft privately, preview the exact public treatment, then publish into the subscribed live channel.</p></div></div>
      <div className="crisis-manager-layout">
        <form className="crisis-editor" onSubmit={(event) => void submitUpdate(event)}>
          <header><Radio aria-hidden="true" /><div><small>{editor.updateId ? "Editing transmission" : "New transmission"}</small><strong>{profile.label}</strong></div></header>
          <div className="form-grid">
            <label><span>Channel</span><select value={editor.channel} onChange={(event) => change("channel", event.target.value as CrisisChannel)}><option value="jcc">JCC · Tehran 1943</option><option value="armageddon">Armageddon · AI takeover</option></select></label>
            <label><span>Severity</span><select value={editor.severity} onChange={(event) => change("severity", event.target.value as EditorState["severity"])}><option value="advisory">Advisory</option><option value="breaking">Breaking</option><option value="critical">Critical</option></select></label>
            <label><span>Transmission type</span><select value={editor.transmission} onChange={(event) => change("transmission", event.target.value as EditorState["transmission"])}><option value="intelligence">Intelligence</option><option value="directive">Directive</option><option value="broadcast">Broadcast</option></select></label>
            <label><span>Source label</span><input value={editor.sourceLabel} onChange={(event) => change("sourceLabel", event.target.value)} maxLength={80} required /></label>
            <label className="field-span"><span>Headline</span><input value={editor.headline} onChange={(event) => change("headline", event.target.value)} maxLength={140} placeholder="A development delegates must respond to" required /></label>
            <label className="field-span"><span>Full briefing</span><textarea value={editor.briefing} onChange={(event) => change("briefing", event.target.value)} maxLength={2400} rows={9} placeholder="State what happened, what is confirmed, and what changed. Do not prescribe the delegate response." required /></label>
            <label className="field-span"><span>Affected portfolios or actors</span><input value={editor.portfolios} onChange={(event) => change("portfolios", event.target.value)} placeholder="United States, Soviet Union, Emergency Council" /><small>Comma-separated, maximum 12.</small></label>
          </div>
          <label className="publish-toggle publish-toggle--crisis"><input type="checkbox" checked={editor.isPublished} onChange={(event) => change("isPublished", event.target.checked)} /><span>Publish immediately to delegates</span></label>
          <div className="editor-actions">{editor.updateId && <button type="button" className="button button--secondary" onClick={() => setEditor({ ...emptyEditor, channel: editor.channel })}>Cancel edit</button>}<button className="button button--primary" type="submit" disabled={busy}><Send aria-hidden="true" /> {busy ? "Saving…" : editor.isPublished ? "Publish transmission" : "Save private draft"}</button></div>
          {message && <p className="editor-status editor-status--success"><Check aria-hidden="true" />{message}</p>}{error && <p className="editor-status editor-status--error">{error}</p>}
        </form>

        <aside className={`crisis-admin-preview crisis-admin-preview--${editor.channel}`}>
          <p className="eyebrow">Public preview</p><span>{editor.severity} / {editor.transmission}</span><h3>{editor.headline || "Your crisis headline will appear here"}</h3><p>{editor.briefing || "The full delegate briefing is previewed as plain text. Draft content is never queried by public pages."}</p>{editor.portfolios && <div>{editor.portfolios.split(",").filter(Boolean).map((item) => <b key={item}>{item.trim()}</b>)}</div>}
        </aside>
      </div>

      <div className="crisis-update-history">
        <header><div><p className="eyebrow">Transmission history</p><h3>{experience?.updates.length ?? 0} updates</h3></div></header>
        {!experience?.updates.length ? <div className="empty-state"><Radio aria-hidden="true" /><h3>No transmissions yet</h3><p>Create a private draft or publish the first committee update.</p></div> : experience.updates.map((update) => <article key={update._id}><span className={`crisis-severity crisis-severity--${update.severity}`} /> <div><small>{update.channel.toUpperCase()} · UPDATE {String(update.updateNumber).padStart(2, "0")} · {update.transmission}</small><strong>{update.headline}</strong><p>{update.briefing}</p></div><b className={update.isPublished ? "is-published" : "is-draft"}>{update.isPublished ? "Published" : "Draft"}</b><div className="crisis-history-actions"><button type="button" onClick={() => editUpdate(update)}><Pencil aria-hidden="true" /> Edit</button><button type="button" onClick={() => void setPublished({ updateId: update._id, isPublished: !update.isPublished })}>{update.isPublished ? "Unpublish" : "Publish"}</button><button type="button" className="danger-text" onClick={() => { if (window.confirm("Delete this crisis update permanently?")) void deleteUpdate({ updateId: update._id }); }}><Trash2 aria-hidden="true" /> Delete</button></div></article>)}
      </div>
    </section>
  </div>;
}
