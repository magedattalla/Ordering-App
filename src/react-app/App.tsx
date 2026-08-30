import QRCode from "qrcode";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { assertDeadline, createPersonSummaryText, createRestaurantSummaryText, deadlineState, readyCount, restaurantSummary, type AddLineInput, type CreateOrderInput, type OrderLine, type OrderSnapshot, type Participant } from "../shared/domain";
import { TurnstileWidget } from "./components/TurnstileWidget";
import { createOrderGateway } from "./lib/gateway";
import type { OrderGateway } from "./lib/room-gateway";

type View = "order" | "people" | "summary";
type SummaryView = "restaurant" | "person";
const shareKey = (slug: string) => `order:v2:share:${slug}`;
const route = () => { const match = location.pathname.match(/^\/r\/([^/]+)$/); return { slug: match?.[1], token: new URLSearchParams(location.hash.slice(1)).get("token") ?? undefined }; };
const storeToken = (slug: string, token: string) => { try { sessionStorage.setItem(shareKey(slug), token); } catch { /* private browsing */ } };
const getToken = (slug: string) => { try { return sessionStorage.getItem(shareKey(slug)) ?? undefined; } catch { return undefined; } };
const tokenFromUrl = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get("token") ?? undefined;
const safeCopy = async (text: string) => { await navigator.clipboard.writeText(text); };

type Recents = { vendors: string[]; items: Record<string, string[]>; instructions: string[] };
const recentsKey = "order:v2:recents";
const readRecents = (): Recents => { try { return JSON.parse(localStorage.getItem(recentsKey) ?? '{"vendors":[],"items":{},"instructions":[]}'); } catch { return { vendors: [], items: {}, instructions: [] }; } };
const remember = (kind: "vendor" | "item" | "instructions", value: string, vendor = "") => {
  const text = value.trim(); if (!text) return; const data = readRecents(); const unique = (items: string[]) => [text, ...items.filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, 10);
  if (kind === "vendor") data.vendors = unique(data.vendors); else if (kind === "instructions") data.instructions = unique(data.instructions); else { const key = vendor.trim().toLowerCase(); data.items[key] = unique(data.items[key] ?? []); }
  localStorage.setItem(recentsKey, JSON.stringify(data));
};

export function App() {
  const gateway = useMemo<OrderGateway>(() => createOrderGateway(), []);
  const [currentRoute, setCurrentRoute] = useState(route);
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [needsNickname, setNeedsNickname] = useState(false);
  const [loading, setLoading] = useState(Boolean(currentRoute.slug));
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  const requiresCaptcha = gateway.mode === "remote" && Boolean(turnstileSiteKey);

  useEffect(() => { const update = () => setOnline(navigator.onLine); addEventListener("online", update); addEventListener("offline", update); return () => { removeEventListener("online", update); removeEventListener("offline", update); }; }, []);
  useEffect(() => { const pop = () => setCurrentRoute(route()); addEventListener("popstate", pop); return () => removeEventListener("popstate", pop); }, []);
  useEffect(() => {
    if (!currentRoute.slug) { setOrder(null); setLoading(false); setNeedsNickname(false); return; }
    let active = true; const secret = currentRoute.token ?? getToken(currentRoute.slug); setLoading(true); setMessage("");
    gateway.open(currentRoute.slug, secret).then((snapshot) => {
      if (!active) return; setOrder(snapshot); setNeedsNickname(false);
      if (secret) { storeToken(snapshot.slug, secret); setShareUrl(`${location.origin}/r/${snapshot.slug}#token=${secret}`); }
      if (location.hash) history.replaceState({}, "", location.pathname);
    }).catch((error: Error) => { if (!active) return; if (secret) setNeedsNickname(true); else setMessage(error.message); }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [currentRoute.slug, currentRoute.token, gateway]);
  useEffect(() => { if (!order) return; return gateway.subscribe(order, () => { if (!online) return; gateway.open(order.slug).then(setOrder).catch(() => undefined); }); }, [gateway, online, order]);
  useEffect(() => { if ("serviceWorker" in navigator && import.meta.env.PROD) void navigator.serviceWorker.register("/sw.js"); }, []);

  const create = async (input: CreateOrderInput) => {
    setLoading(true); setMessage("");
    try { const created = await gateway.create(input, captchaToken); const secret = tokenFromUrl(created.shareUrl); if (secret) storeToken(created.snapshot.slug, secret); history.pushState({}, "", `/r/${created.snapshot.slug}`); setCurrentRoute(route()); setOrder(created.snapshot); setShareUrl(created.shareUrl); remember("vendor", input.vendorName); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not start the order."); }
    finally { setLoading(false); }
  };
  const join = async (nickname: string) => {
    if (!currentRoute.slug) return; const secret = currentRoute.token ?? getToken(currentRoute.slug); if (!secret) return setMessage("This invite link is missing its private token.");
    setLoading(true); setMessage("");
    try { const snapshot = await gateway.open(currentRoute.slug, secret, nickname, captchaToken); storeToken(snapshot.slug, secret); history.replaceState({}, "", `/r/${snapshot.slug}`); setOrder(snapshot); setShareUrl(`${location.origin}/r/${snapshot.slug}#token=${secret}`); setNeedsNickname(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not join the order."); }
    finally { setLoading(false); }
  };
  const home = () => { history.pushState({}, "", "/"); setCurrentRoute(route()); setOrder(null); setShareUrl(""); setMessage(""); };

  return <div className="app-shell">
    <header className="app-header"><button className="brand" onClick={home} aria-label="Start a new order"><span className="brand-mark">O</span><span>Order</span></button><div className="header-status"><span className={online ? "connection online" : "connection offline"}>{online ? "Live" : "Offline"}</span>{gateway.mode === "local" && <span className="prototype-badge">Local prototype</span>}</div></header>
    <main className="page">
      {!online && <Notice text="You’re offline. Changes are disabled and will not be queued." />}
      {message && <Notice text={message} action={() => setMessage("")} />}
      {loading && !order && !needsNickname && <LoadingState />}
      {!loading && !order && !needsNickname && !currentRoute.slug && <StartOrder onSubmit={create} requiresCaptcha={requiresCaptcha} captchaToken={captchaToken} siteKey={turnstileSiteKey} onCaptcha={setCaptchaToken} onError={setMessage} />}
      {!order && needsNickname && currentRoute.slug && <JoinOrder onSubmit={join} loading={loading} requiresCaptcha={requiresCaptcha} captchaToken={captchaToken} siteKey={turnstileSiteKey} onCaptcha={setCaptchaToken} onError={setMessage} />}
      {order && <OrderRoom order={order} shareUrl={shareUrl || (getToken(order.slug) ? `${location.origin}/r/${order.slug}#token=${getToken(order.slug)}` : "")} gateway={gateway} online={online} onChange={setOrder} onError={(error) => setMessage(error.message)} />}
    </main>
  </div>;
}

function Notice({ text, action }: { text: string; action?: () => void }) { return <div className="notice" role="alert"><span>{text}</span>{action && <button className="text-button" onClick={action}>Dismiss</button>}</div>; }
function LoadingState() { return <div className="loading-card" aria-live="polite"><span className="spinner" /><strong>Opening the order</strong><p>Getting the latest changes…</p></div>; }

function StartOrder({ onSubmit, requiresCaptcha, captchaToken, siteKey, onCaptcha, onError }: { onSubmit: (input: CreateOrderInput) => Promise<void>; requiresCaptcha: boolean; captchaToken?: string; siteKey?: string; onCaptcha: (token: string) => void; onError: (message: string) => void }) {
  const recent = readRecents(); const [hostNickname, setHostNickname] = useState(""); const [vendorName, setVendorName] = useState(""); const [title, setTitle] = useState(""); const [deadlineAt, setDeadlineAt] = useState(""); const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSubmitting(true); try { await onSubmit({ hostNickname, vendorName, title: title || undefined, deadlineAt: deadlineAt ? assertDeadline(new Date(deadlineAt).toISOString()) : undefined }); } finally { setSubmitting(false); } };
  return <section className="start-screen"><div className="hero"><span className="eyebrow">Group ordering, without the group chat chaos</span><h1>Start one order.<br />Add everything together.</h1><p>Share a private link and let everyone add what they want in real time.</p></div>
    <form className="glass-card form-stack" onSubmit={submit}>
      <Field label="Your nickname"><input autoComplete="nickname" value={hostNickname} onChange={(e) => setHostNickname(e.target.value)} maxLength={40} placeholder="What should everyone call you?" required /></Field>
      <Field label="Restaurant or vendor"><input list="recent-vendors" value={vendorName} onChange={(e) => setVendorName(e.target.value)} maxLength={100} placeholder="Where are you ordering from?" required /><datalist id="recent-vendors">{recent.vendors.map((vendor) => <option key={vendor} value={vendor} />)}</datalist></Field>
      <Field label="Order title" optional><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Friday team lunch" /></Field>
      <Field label="Deadline" optional><input type="datetime-local" value={deadlineAt} min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} max={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)} onChange={(e) => setDeadlineAt(e.target.value)} /><small>A reminder only. The order stays open until you close it.</small></Field>
      {requiresCaptcha && siteKey && <TurnstileWidget siteKey={siteKey} onToken={onCaptcha} onError={onError} />}
      <button className="primary-button" disabled={submitting || (requiresCaptcha && !captchaToken)}>{submitting ? "Starting…" : "Start order"}</button>
    </form><p className="privacy-note">Private link · No account · Expires after 24 hours</p></section>;
}

function JoinOrder({ onSubmit, loading, requiresCaptcha, captchaToken, siteKey, onCaptcha, onError }: { onSubmit: (nickname: string) => Promise<void>; loading: boolean; requiresCaptcha: boolean; captchaToken?: string; siteKey?: string; onCaptcha: (token: string) => void; onError: (message: string) => void }) {
  const [nickname, setNickname] = useState(""); return <section className="join-screen"><div className="join-icon">👋</div><span className="eyebrow">You’ve been invited</span><h1>Join the order</h1><p>Pick a temporary nickname so everyone knows which items are yours.</p><form className="glass-card form-stack" onSubmit={(e) => { e.preventDefault(); void onSubmit(nickname); }}><Field label="Your nickname"><input autoFocus value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} placeholder="Your name" required /></Field>{requiresCaptcha && siteKey && <TurnstileWidget siteKey={siteKey} onToken={onCaptcha} onError={onError} />}<button className="primary-button" disabled={loading || (requiresCaptcha && !captchaToken)}>{loading ? "Joining…" : "Join order"}</button></form></section>;
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <label className="field"><span>{label}{optional && <em>Optional</em>}</span>{children}</label>; }

function OrderRoom({ order, shareUrl, gateway, online, onChange, onError }: { order: OrderSnapshot; shareUrl: string; gateway: OrderGateway; online: boolean; onChange: (order: OrderSnapshot) => void; onError: (error: Error) => void }) {
  const [view, setView] = useState<View>("order"); const [editing, setEditing] = useState<OrderLine | null>(null); const [shareOpen, setShareOpen] = useState(false); const [busy, setBusy] = useState(false); const [tick, setTick] = useState(Date.now());
  const me = order.participants.find((p) => p.id === order.currentParticipantId)!; const readiness = readyCount(order); const locked = order.status !== "open" || !online; const deadline = deadlineState(order, tick);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const act = async (action: () => Promise<OrderSnapshot>) => { if (!online) return onError(new Error("Reconnect before making changes.")); setBusy(true); try { onChange(await action()); } catch (error) { onError(error instanceof Error ? error : new Error("Could not save that change.")); } finally { setBusy(false); } };
  const deadlineCopy = deadline.hasDeadline ? (deadline.isPast ? "Deadline passed" : `Due ${formatRelative(deadline.remainingMs ?? 0)}`) : null;
  return <section className="room-screen">
    <div className="room-titlebar"><div><div className="room-meta"><span className={`status-pill ${order.status}`}>{order.status}</span>{deadlineCopy && <span className={deadline.isPast ? "deadline overdue" : "deadline"}>{deadlineCopy}</span>}</div><h1>{order.title || order.vendorName}</h1>{order.title && <p>{order.vendorName}</p>}</div><button className="icon-button share-button" onClick={() => setShareOpen(true)} aria-label="Share order">↗</button></div>
    <div className="readiness-card"><div className="avatar-stack">{order.participants.slice(0, 5).map((person) => <span key={person.id} className={person.isReady ? "avatar ready" : "avatar"} title={person.nickname}>{person.nickname.slice(0, 1).toUpperCase()}</span>)}</div><div><strong>{readiness} of {order.participants.length} ready</strong><span>{order.status === "open" ? "Ordering is live" : order.status === "closed" ? "Reviewing the order" : "Order placed"}</span></div>{order.status === "open" && <button className={me.isReady ? "done-button ready" : "done-button"} disabled={busy || !online} onClick={() => void act(() => gateway.setReady(order.id, !me.isReady))}>{me.isReady ? "Done ✓" : "I’m done"}</button>}</div>
    {order.status === "closed" && <div className="locked-banner">Participant editing is paused while the host reviews the order.</div>}{order.status === "placed" && <div className="locked-banner placed">This order is placed and permanently read-only.</div>}
    <nav className="segmented" aria-label="Order views">{(["order", "people", "summary"] as View[]).map((tab) => <button key={tab} className={view === tab ? "active" : ""} onClick={() => setView(tab)}>{tab === "people" ? `People ${order.participants.length}` : tab[0].toUpperCase() + tab.slice(1)}</button>)}</nav>
    {view === "order" && <>
      {!locked && <LineForm key={editing?.id ?? `new-${order.lines.length}`} order={order} line={editing} disabled={busy} onCancel={() => setEditing(null)} onSave={(input) => void act(async () => { const updated = editing ? await gateway.editLine(order.id, { ...input, lineId: editing.id }) : await gateway.addLine(order.id, input); remember("item", input.itemName, order.vendorName); remember("instructions", input.instructions ?? ""); setEditing(null); return updated; })} />}
      <section className="section"><div className="section-heading"><div><h2>Everyone’s order</h2><p>{order.lines.length ? `${order.lines.length} ${order.lines.length === 1 ? "item" : "items"}` : "Waiting for the first item"}</p></div></div>
        {!order.lines.length ? <EmptyState icon="＋" title="Nothing here yet" copy={locked ? "No items were added." : "Add your first item above."} /> : <div className="line-list">{order.lines.map((line) => <LineCard key={line.id} line={line} participants={order.participants} locked={locked} onEdit={() => setEditing(line)} onRemove={() => void act(() => gateway.removeLine(order.id, line.id))} />)}</div>}
      </section></>}
    {view === "people" && <PeopleView order={order} gateway={gateway} busy={busy || !online} act={act} />}
    {view === "summary" && <SummaryViewPanel order={order} onError={onError} />}
    {order.isHost && order.status !== "placed" && <HostBar order={order} busy={busy || !online} act={act} gateway={gateway} />}
    {shareOpen && <ShareSheet url={shareUrl} title={order.title || order.vendorName} onClose={() => setShareOpen(false)} onError={onError} />}
  </section>;
}

function LineForm({ order, line, disabled, onSave, onCancel }: { order: OrderSnapshot; line: OrderLine | null; disabled: boolean; onSave: (input: AddLineInput) => void; onCancel: () => void }) {
  const recent = readRecents(); const [itemName, setItemName] = useState(line?.itemName ?? ""); const [quantity, setQuantity] = useState(line?.quantity ?? 1); const [instructions, setInstructions] = useState(line?.instructions ?? ""); const [assigned, setAssigned] = useState<string[]>(line?.participantIds ?? [order.currentParticipantId]);
  useEffect(() => { setItemName(line?.itemName ?? ""); setQuantity(line?.quantity ?? 1); setInstructions(line?.instructions ?? ""); setAssigned(line?.participantIds ?? [order.currentParticipantId]); }, [line, order.currentParticipantId]);
  const toggle = (id: string) => setAssigned((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return <form className="composer glass-card" onSubmit={(e) => { e.preventDefault(); onSave({ itemName, quantity, instructions, participantIds: assigned }); }}><div className="composer-title"><strong>{line ? "Edit item" : "Add an item"}</strong>{line && <button type="button" className="text-button" onClick={onCancel}>Cancel</button>}</div><Field label="Item"><input list={`items-${order.id}`} value={itemName} onChange={(e) => setItemName(e.target.value)} maxLength={120} placeholder="What are you getting?" required /><datalist id={`items-${order.id}`}>{(recent.items[order.vendorName.toLowerCase()] ?? []).map((item) => <option key={item} value={item} />)}</datalist></Field><div className="quantity-row"><span>Quantity</span><div className="stepper"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} type="number" min="1" max="999" inputMode="numeric" aria-label="Quantity" /><button type="button" onClick={() => setQuantity((value) => Math.min(999, value + 1))}>+</button></div></div><Field label="Changes or instructions" optional><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={500} placeholder="No onions, sauce on the side, less ice…" />{recent.instructions.length > 0 && <div className="recent-chips">{recent.instructions.slice(0, 3).map((text) => <button type="button" key={text} onClick={() => setInstructions(text)}>{text}</button>)}</div>}</Field><div className="assignment"><div><span>For</span><button type="button" className="text-button" onClick={() => setAssigned(order.participants.map((person) => person.id))}>Everyone here</button></div><div className="people-chips">{order.participants.map((person) => <button type="button" key={person.id} className={assigned.includes(person.id) ? "person-chip selected" : "person-chip"} onClick={() => toggle(person.id)}><span>{person.nickname.slice(0, 1).toUpperCase()}</span>{person.isCurrentUser ? "Me" : person.nickname}</button>)}</div></div><button className="primary-button" disabled={disabled || !assigned.length}>{line ? "Save changes" : "Add to order"}</button></form>;
}

function LineCard({ line, participants, locked, onEdit, onRemove }: { line: OrderLine; participants: Participant[]; locked: boolean; onEdit: () => void; onRemove: () => void }) {
  const names = line.participantIds.map((id) => participants.find((person) => person.id === id)?.nickname).filter(Boolean); return <article className="line-card"><div className="line-quantity">{line.quantity}×</div><div className="line-content"><strong>{line.itemName}</strong>{line.instructions && <p>{line.instructions}</p>}<span>{names.length === participants.length && participants.length > 1 ? "Everyone here" : names.join(", ")}</span></div>{line.canEdit && !locked && <div className="line-actions"><button className="icon-button" onClick={onEdit} aria-label={`Edit ${line.itemName}`}>•••</button><button className="delete-button" onClick={onRemove}>Remove</button></div>}</article>;
}

function PeopleView({ order, gateway, busy, act }: { order: OrderSnapshot; gateway: OrderGateway; busy: boolean; act: (action: () => Promise<OrderSnapshot>) => Promise<void> }) {
  return <section className="section"><div className="section-heading"><div><h2>People</h2><p>{readyCount(order)} marked done</p></div></div><div className="people-list">{order.participants.map((person) => <ParticipantCard key={person.id} person={person} order={order} gateway={gateway} busy={busy} act={act} />)}</div></section>;
}
function ParticipantCard({ person, order, gateway, busy, act }: { person: Participant; order: OrderSnapshot; gateway: OrderGateway; busy: boolean; act: (action: () => Promise<OrderSnapshot>) => Promise<void> }) {
  const [reassign, setReassign] = useState(order.currentParticipantId); const canManage = order.isHost && person.role !== "host";
  const rename = () => { const name = prompt("Nickname", person.nickname); if (name?.trim()) void act(() => gateway.renameParticipant(order.id, person.id, name)); };
  return <article className="person-row"><span className={person.isReady ? "person-avatar ready" : "person-avatar"}>{person.nickname.slice(0, 1).toUpperCase()}</span><div><strong>{person.nickname}{person.isCurrentUser && " (you)"}</strong><span>{person.role === "host" ? "Host" : person.isReady ? "Ready" : "Still ordering"}</span></div>{(person.isCurrentUser || order.isHost) && <button className="text-button" disabled={busy} onClick={rename}>Rename</button>}{canManage && <details className="manage-menu"><summary>Manage</summary><div><button disabled={busy} onClick={() => void act(() => gateway.transferHost(order.id, person.id))}>Make host</button><label>Reassign personal items<select value={reassign} onChange={(e) => setReassign(e.target.value)}>{order.participants.filter((p) => p.id !== person.id).map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}<option value="">Delete personal items</option></select></label><button className="danger" disabled={busy} onClick={() => confirm(`Remove ${person.nickname}?`) && void act(() => gateway.removeParticipant(order.id, person.id, reassign || undefined))}>Remove person</button></div></details>}</article>;
}

function SummaryViewPanel({ order, onError }: { order: OrderSnapshot; onError: (error: Error) => void }) {
  const [mode, setMode] = useState<SummaryView>("restaurant"); const restaurantLines = restaurantSummary(order); const copy = async () => { try { await safeCopy(mode === "restaurant" ? createRestaurantSummaryText(order) : createPersonSummaryText(order)); } catch { onError(new Error("This browser blocked copying.")); } };
  return <section className="section"><div className="summary-heading"><div><h2>Final summary</h2><p>Switch views before copying.</p></div><button className="secondary-button" onClick={() => void copy()}>Copy</button></div><div className="segmented compact"><button className={mode === "restaurant" ? "active" : ""} onClick={() => setMode("restaurant")}>Restaurant</button><button className={mode === "person" ? "active" : ""} onClick={() => setMode("person")}>By person</button></div>{mode === "restaurant" ? <div className="summary-card"><h3>{order.vendorName}</h3>{restaurantLines.length ? restaurantLines.map((line) => <div className="summary-line" key={line.key}><strong>{line.quantity}×</strong><div><span>{line.itemName}</span>{line.instructions && <small>{line.instructions}</small>}</div></div>) : <EmptyState icon="☷" title="No items to summarize" copy="The summary will update as items are added." />}</div> : <div className="person-summaries">{order.participants.map((person) => <div className="person-summary" key={person.id}><h3>{person.nickname}{person.isReady && " ✓"}</h3>{order.lines.filter((line) => line.participantIds.includes(person.id)).map((line) => <div key={line.id}><strong>{line.quantity}× {line.itemName}</strong>{line.instructions && <small>{line.instructions}</small>}</div>)}</div>)}</div>}</section>;
}

function HostBar({ order, busy, act, gateway }: { order: OrderSnapshot; busy: boolean; act: (action: () => Promise<OrderSnapshot>) => Promise<void>; gateway: OrderGateway }) {
  return <div className="host-bar"><span>Host controls</span>{order.status === "open" && <button className="primary-button" disabled={busy} onClick={() => void act(() => gateway.setStatus(order.id, "closed"))}>Close order</button>}{order.status === "closed" && <><button className="secondary-button" disabled={busy} onClick={() => void act(() => gateway.setStatus(order.id, "open"))}>Reopen</button><button className="primary-button" disabled={busy} onClick={() => void act(() => gateway.setStatus(order.id, "placed"))}>Mark as placed</button></>}</div>;
}

function ShareSheet({ url, title, onClose, onError }: { url: string; title: string; onClose: () => void; onError: (error: Error) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { if (canvas.current && url) void QRCode.toCanvas(canvas.current, url, { width: 224, margin: 1, color: { dark: "#17233b", light: "#ffffff" } }); }, [url]);
  const copy = async () => { if (!url) return onError(new Error("Open the original invite link to share it again.")); try { await safeCopy(url); setCopied(true); } catch { onError(new Error("This browser blocked copying.")); } };
  const share = async () => { if (!url) return; if (navigator.share) { try { await navigator.share({ title, text: `Join my order for ${title}`, url }); } catch { /* dismissed */ } } else await copy(); };
  return <div className="sheet-backdrop" role="presentation" onClick={onClose}><section className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}><div className="sheet-handle" /><button className="sheet-close" onClick={onClose}>Done</button><span className="eyebrow">Private invite</span><h2 id="share-title">Bring everyone in</h2><p>Anyone with this link can join. The QR code contains the same private invite.</p><div className="qr-wrap"><canvas ref={canvas} aria-label="Order invite QR code" /></div><div className="share-actions"><button className="primary-button" onClick={() => void share()}>Share invite</button><button className="secondary-button" onClick={() => void copy()}>{copied ? "Copied ✓" : "Copy link"}</button></div></section></div>;
}

function EmptyState({ icon, title, copy }: { icon: string; title: string; copy: string }) { return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{copy}</p></div>; }
function formatRelative(ms: number) { const minutes = Math.max(1, Math.ceil(ms / 60_000)); if (minutes < 60) return `in ${minutes} min`; const hours = Math.floor(minutes / 60); const remaining = minutes % 60; return `in ${hours}h${remaining ? ` ${remaining}m` : ""}`; }
