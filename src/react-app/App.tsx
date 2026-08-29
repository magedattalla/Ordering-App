import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  COMBO_PRESETS,
  createOrderText,
  pieceLabel,
  roomState,
  type RoomItem,
  type RoomSnapshot,
} from "../shared/domain";
import { createRoomGateway } from "./lib/gateway";
import type { RoomGateway } from "./lib/room-gateway";
import { TurnstileWidget } from "./components/TurnstileWidget";

const recentKey = (restaurantName: string) => `rollcall:recent:${restaurantName.trim().toLowerCase()}`;

const getRecentItems = (restaurantName: string) => {
  try {
    return JSON.parse(localStorage.getItem(recentKey(restaurantName)) ?? "[]") as string[];
  } catch {
    return [];
  }
};

const rememberItem = (restaurantName: string, itemName: string) => {
  const current = getRecentItems(restaurantName);
  const next = [itemName, ...current.filter((item) => item.toLocaleLowerCase() !== itemName.toLocaleLowerCase())].slice(0, 8);
  localStorage.setItem(recentKey(restaurantName), JSON.stringify(next));
};

const shareKey = (slug: string) => `rollcall:share:${slug}`;

// The invite token is deliberately stripped from the address bar, so keep it for
// this tab only. Session storage survives a reload without leaving the secret in
// browser history or in a link the phone might preview.
const rememberShareToken = (slug: string, token: string) => {
  try {
    sessionStorage.setItem(shareKey(slug), token);
  } catch {
    // Private browsing modes can refuse session storage; copying the link is then
    // unavailable after a reload, which the copy button already explains.
  }
};

const recallShareToken = (slug: string) => {
  try {
    return sessionStorage.getItem(shareKey(slug)) ?? undefined;
  } catch {
    return undefined;
  }
};

const tokenFromShareUrl = (shareUrl: string) =>
  new URLSearchParams(new URL(shareUrl).hash.slice(1)).get("token") ?? undefined;

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const readRoute = () => {
  const match = window.location.pathname.match(/^\/r\/([^/]+)$/);
  const params = new URLSearchParams(window.location.hash.slice(1));
  return { slug: match?.[1], token: params.get("token") ?? undefined };
};

const setRoomRoute = (slug: string, shareUrl?: string) => {
  const url = shareUrl ? new URL(shareUrl) : new URL(`/r/${slug}`, window.location.origin);
  window.history.pushState({}, "", `${url.pathname}${url.hash}`);
};

const clearTokenFromAddress = () => {
  if (window.location.hash) window.history.replaceState({}, "", window.location.pathname);
};

export function App() {
  const gateway = useMemo<RoomGateway>(() => createRoomGateway(), []);
  const [route, setRoute] = useState(readRoute);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [loading, setLoading] = useState(Boolean(route.slug));
  const [message, setMessage] = useState<string>("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  const requiresCaptcha = gateway.mode === "remote" && Boolean(turnstileSiteKey);

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!route.slug) {
      setRoom(null);
      setLoading(false);
      return;
    }
    if (requiresCaptcha && !captchaToken) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const inviteToken = route.token ?? recallShareToken(route.slug);
    gateway
      .open(route.slug, inviteToken, captchaToken)
      .then((snapshot) => {
        if (!active) return;
        setRoom(snapshot);
        if (inviteToken) {
          rememberShareToken(snapshot.slug, inviteToken);
          setShareUrl(`${window.location.origin}/r/${snapshot.slug}#token=${inviteToken}`);
        } else setShareUrl("");
        if (route.token) clearTokenFromAddress();
      })
      .catch((error: Error) => active && setMessage(error.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [captchaToken, gateway, requiresCaptcha, route.slug, route.token]);

  useEffect(() => {
    if (!room || room.status !== "open") return;
    return gateway.subscribe(room, () => {
      gateway.open(room.slug).then(setRoom).catch(() => undefined);
    });
  }, [gateway, room]);

  const startRoom = async (restaurantName: string, comboSize: number) => {
    setMessage("");
    setLoading(true);
    try {
      const created = await gateway.create({ restaurantName, comboSize }, captchaToken);
      const inviteToken = tokenFromShareUrl(created.shareUrl);
      if (inviteToken) rememberShareToken(created.snapshot.slug, inviteToken);
      setRoomRoute(created.snapshot.slug, created.shareUrl);
      setRoute(readRoute());
      setRoom(created.snapshot);
      setShareUrl(created.shareUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start the room.");
    } finally {
      setLoading(false);
    }
  };

  const refresh = (snapshot: RoomSnapshot) => {
    setRoom(snapshot);
    setMessage("");
  };

  const leaveRoom = () => {
    window.history.pushState({}, "", "/");
    setRoute(readRoute());
    setRoom(null);
    setShareUrl("");
    setMessage("");
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="wordmark" type="button" onClick={leaveRoom} aria-label="Start a new RollCall room">
          <span>RollCall</span><i className="wordmark-stop" aria-hidden="true" />
        </button>
        {gateway.mode === "local" && <span className="prototype-badge">Prototype mode</span>}
      </header>

      {message && (
        <div className="notice" role="alert">
          <span>{message}</span>
          <button type="button" className="text-button" onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}

      {loading && !room ? <div className="loading">Loading room…</div> : null}
      {!loading && !room && (
        <StartRoomForm
          onSubmit={startRoom}
          requiresCaptcha={requiresCaptcha}
          captchaToken={captchaToken}
          turnstileSiteKey={turnstileSiteKey}
          onCaptchaToken={setCaptchaToken}
          onCaptchaError={setMessage}
          isJoinRoute={Boolean(route.slug)}
        />
      )}
      {room && (
        <RoomBuilder
          room={room}
          shareUrl={shareUrl}
          onRoomChange={refresh}
          onError={(error) => setMessage(error.message)}
          gateway={gateway}
        />
      )}
    </main>
  );
}

function StartRoomForm({
  onSubmit,
  requiresCaptcha,
  captchaToken,
  turnstileSiteKey,
  onCaptchaToken,
  onCaptchaError,
  isJoinRoute,
}: {
  onSubmit: (restaurantName: string, comboSize: number) => Promise<void>;
  requiresCaptcha: boolean;
  captchaToken?: string;
  turnstileSiteKey?: string;
  onCaptchaToken: (token: string) => void;
  onCaptchaError: (message: string) => void;
  isJoinRoute: boolean;
}) {
  const [restaurantName, setRestaurantName] = useState("");
  const [selection, setSelection] = useState("40");
  const [customSize, setCustomSize] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const comboSize = selection === "custom" ? Number(customSize) : Number(selection);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(restaurantName, comboSize);
    } finally {
      setSubmitting(false);
    }
  };

  if (isJoinRoute && requiresCaptcha && turnstileSiteKey) {
    return (
      <section className="start-panel" aria-labelledby="verify-title">
        <p className="eyebrow">Private room</p>
        <h1 id="verify-title">Quick verification.</h1>
        <p className="intro">Confirm you’re human to open this shared room.</p>
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={onCaptchaToken} onError={onCaptchaError} />
      </section>
    );
  }

  return (
    <section className="start-panel" aria-labelledby="start-title">
      <p className="eyebrow">One table. One combo.</p>
      <h1 id="start-title">Hit the combo exactly.</h1>
      <p className="intro">Start one private room, share the link, and build the order together.</p>
      <form onSubmit={submit} className="form-stack">
        <label>
          Restaurant
          <input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} placeholder="e.g. Sushi Samba" maxLength={100} required />
        </label>
        <label>
          Combo size
          <select value={selection} onChange={(event) => setSelection(event.target.value)}>
            {COMBO_PRESETS.map((size) => <option value={size} key={size}>{size} pieces</option>)}
            <option value="custom">Custom</option>
          </select>
        </label>
        {selection === "custom" && (
          <label>
            Custom piece count
            <input value={customSize} onChange={(event) => setCustomSize(event.target.value)} type="number" inputMode="numeric" min="1" step="1" placeholder="Enter a whole number" required />
          </label>
        )}
        {requiresCaptcha && turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} onToken={onCaptchaToken} onError={onCaptchaError} />}
        <button className="primary-button" type="submit" disabled={submitting || (requiresCaptcha && !captchaToken)}>{submitting ? "Starting room…" : "Start a room"}</button>
      </form>
      <p className="fine-print">Rooms stay private and expire after 24 hours.</p>
    </section>
  );
}

function RoomBuilder({
  room,
  shareUrl,
  gateway,
  onRoomChange,
  onError,
}: {
  room: RoomSnapshot;
  shareUrl: string;
  gateway: RoomGateway;
  onRoomChange: (snapshot: RoomSnapshot) => void;
  onError: (error: Error) => void;
}) {
  const state = roomState(room);
  const [itemName, setItemName] = useState("");
  const [pieceCount, setPieceCount] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const recentItems = getRecentItems(room.restaurantName);
  const listId = `recent-${room.id}`;

  const act = async (action: () => Promise<RoomSnapshot>) => {
    setSubmitting(true);
    try {
      onRoomChange(await action());
    } catch (error) {
      onError(error instanceof Error ? error : new Error("Something went wrong."));
    } finally {
      setSubmitting(false);
    }
  };

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    await act(async () => {
      const updated = await gateway.addItem(room.id, itemName, pieceCount);
      rememberItem(room.restaurantName, itemName.trim());
      setItemName("");
      return updated;
    });
  };

  const copy = async (text: string) => {
    if (!(await copyToClipboard(text))) {
      return onError(new Error("This browser blocked copying. Select the text and copy it manually."));
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const copyShare = async () => {
    if (!shareUrl) return onError(new Error("Open the original private link to copy it again."));
    await copy(shareUrl);
  };

  const copyOrder = () => copy(createOrderText(room));

  return (
    <section className="room-panel" aria-labelledby="room-title">
      <div className="room-topline">
        <div>
          <p className="eyebrow">Private combo room</p>
          <h1 id="room-title">{room.restaurantName}</h1>
        </div>
        <button className="secondary-button" type="button" onClick={() => void copyShare()}>{copied ? "Copied" : "Copy link"}</button>
      </div>

      <section className={`progress-section ${state.isExact ? "is-exact" : state.isOver ? "is-over" : ""}`} aria-live="polite">
        <div className="total-line"><strong>{state.total}</strong><span>/ {room.comboSize} pieces</span></div>
        <div className="progress-track" aria-label={`${state.total} out of ${room.comboSize} pieces`}><div className="progress-fill" style={{ width: `${state.progress}%` }} /></div>
        <p className="progress-copy">
          {state.isExact ? "Combo complete." : state.isOver ? `${pieceLabel(Math.abs(state.difference))} to remove.` : `${pieceLabel(state.difference)} left.`}
        </p>
      </section>

      {room.status === "open" && (
        <form className="add-form" onSubmit={addItem}>
          <label>
            Add to the order
            <input list={listId} value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Roll or sushi item" maxLength={100} required />
            <datalist id={listId}>{recentItems.map((item) => <option key={item} value={item} />)}</datalist>
          </label>
          <div className="count-control" aria-label="Piece count">
            {[1, 2, 4, 8].map((count) => (
              <button className={pieceCount === count ? "count-button selected" : "count-button"} type="button" key={count} onClick={() => setPieceCount(count)}>{count}</button>
            ))}
            <input value={pieceCount} onChange={(event) => setPieceCount(Number(event.target.value))} type="number" inputMode="numeric" min="1" step="1" aria-label="Custom piece count" />
          </div>
          <button className="primary-button" type="submit" disabled={submitting}>Add item</button>
        </form>
      )}

      <section className="item-section" aria-labelledby="items-title">
        <div className="section-heading"><h2 id="items-title">The order</h2><span>{room.items.length} {room.items.length === 1 ? "item" : "items"}</span></div>
        {room.items.length === 0 ? <p className="empty-state">Nothing yet. Add the first pick.</p> : <ul className="item-list">
          {room.items.map((item) => <ItemRow key={item.id} item={item} room={room} gateway={gateway} onChange={onRoomChange} onError={onError} disabled={submitting} />)}
        </ul>}
      </section>

      {room.status === "open" ? (
        <div className="finish-section">
          {room.isHost ? <button className="finish-button" type="button" disabled={!state.isExact || submitting} onClick={() => void act(() => gateway.finalize(room.id))}>Finish order</button> : <p className="host-note">Only the room creator can finish the order.</p>}
        </div>
      ) : (
        <section className="final-card" aria-live="polite">
          <p className="eyebrow">Order final</p>
          <h2>Ready to send.</h2>
          <p>{pieceLabel(state.total)} locked in for {room.restaurantName}.</p>
          <button className="secondary-button" type="button" onClick={() => void copyOrder()}>{copied ? "Copied" : "Copy order"}</button>
        </section>
      )}
    </section>
  );
}

function ItemRow({
  item,
  room,
  gateway,
  onChange,
  onError,
  disabled,
}: {
  item: RoomItem;
  room: RoomSnapshot;
  gateway: RoomGateway;
  onChange: (snapshot: RoomSnapshot) => void;
  onError: (error: Error) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const act = async (action: () => Promise<RoomSnapshot>) => {
    try {
      onChange(await action());
    } catch (error) {
      onError(error instanceof Error ? error : new Error("Could not update that item."));
    }
  };
  const saveRename = async (event: FormEvent) => {
    event.preventDefault();
    await act(async () => {
      const updated = await gateway.renameItem(room.id, item.id, name);
      setEditing(false);
      return updated;
    });
  };

  return (
    <li className="item-row">
      <div className="item-name">
        {editing ? <form onSubmit={saveRename}><input value={name} onChange={(event) => setName(event.target.value)} aria-label="Item name" autoFocus /><button className="text-button" type="submit">Save</button></form> : <><strong>{item.name}</strong>{room.status === "open" && <button className="text-button" type="button" onClick={() => setEditing(true)}>Edit</button>}</>}
      </div>
      <div className="item-actions">
        {room.status === "open" && <button type="button" className="quantity-button" onClick={() => void act(() => gateway.changeItem(room.id, item.id, -1))} disabled={disabled} aria-label={`Remove one piece from ${item.name}`}>−</button>}
        <span aria-label={pieceLabel(item.pieceCount)}>{item.pieceCount}</span>
        {room.status === "open" && <button type="button" className="quantity-button" onClick={() => void act(() => gateway.changeItem(room.id, item.id, 1))} disabled={disabled} aria-label={`Add one piece to ${item.name}`}>+</button>}
        {room.status === "open" && <button type="button" className="remove-button" onClick={() => void act(() => gateway.removeItem(room.id, item.id))} disabled={disabled} aria-label={`Remove ${item.name}`}>Remove</button>}
      </div>
    </li>
  );
}
