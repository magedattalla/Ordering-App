import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertItemName,
  assertPieceCount,
  assertRestaurantName,
  type CreateRoomInput,
  type RoomSnapshot,
} from "../../shared/domain";
import type { CreatedRoom, RoomGateway } from "./room-gateway";

type ApiError = { error?: string };

type RemoteConfig = {
  url: string;
  publishableKey: string;
  apiBaseUrl: string;
};

const config = (): RemoteConfig | null => {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey, apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "" };
};

const configured = config();

const parseSnapshot = (data: unknown): RoomSnapshot => {
  if (!data || typeof data !== "object") throw new Error("The room response was invalid.");
  const room = data as Record<string, unknown>;
  if (!Array.isArray(room.items)) throw new Error("The room response was missing its items.");
  return {
    id: String(room.id),
    slug: String(room.slug),
    restaurantName: String(room.restaurantName),
    comboSize: Number(room.comboSize),
    status: room.status === "final" ? "final" : "open",
    expiresAt: String(room.expiresAt),
    isHost: Boolean(room.isHost),
    items: room.items.map((item) => {
      const value = item as Record<string, unknown>;
      return {
        id: String(value.id),
        name: String(value.name),
        pieceCount: Number(value.pieceCount),
        sortOrder: Number(value.sortOrder),
      };
    }),
  };
};

export const isSupabaseConfigured = () => configured !== null;

export class SupabaseRoomGateway implements RoomGateway {
  readonly mode = "remote" as const;
  private readonly client: SupabaseClient;
  private readonly apiBaseUrl: string;

  constructor(remoteConfig: RemoteConfig) {
    this.client = createClient(remoteConfig.url, remoteConfig.publishableKey);
    this.apiBaseUrl = remoteConfig.apiBaseUrl;
  }

  static fromEnvironment() {
    if (!configured) throw new Error("Supabase is not configured.");
    return new SupabaseRoomGateway(configured);
  }

  async create(input: CreateRoomInput, captchaToken?: string): Promise<CreatedRoom> {
    await this.ensureSession(captchaToken);
    const result = await this.request("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        restaurantName: assertRestaurantName(input.restaurantName),
        comboSize: assertPieceCount(input.comboSize),
      }),
    });
    const response = result as { room: unknown; inviteToken: string };
    const snapshot = parseSnapshot(response.room);
    return {
      snapshot,
      shareUrl: `${window.location.origin}/r/${snapshot.slug}#token=${response.inviteToken}`,
    };
  }

  async open(slug: string, inviteToken?: string, captchaToken?: string): Promise<RoomSnapshot> {
    await this.ensureSession(captchaToken);
    if (inviteToken) {
      await this.request(`/api/rooms/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        body: JSON.stringify({ inviteToken }),
      });
    }
    return this.getSnapshot(slug);
  }

  async addItem(roomId: string, rawName: string, pieceCount: number) {
    const name = assertItemName(rawName);
    const count = assertPieceCount(pieceCount);
    const result = await this.request(`/api/rooms/${roomId}/items`, {
      method: "POST",
      body: JSON.stringify({ name, pieceCount: count }),
    });
    return parseSnapshot((result as { room: unknown }).room);
  }

  async changeItem(roomId: string, itemId: string, delta: number) {
    const result = await this.request(`/api/rooms/${roomId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "change", delta }),
    });
    return parseSnapshot((result as { room: unknown }).room);
  }

  async renameItem(roomId: string, itemId: string, rawName: string) {
    const result = await this.request(`/api/rooms/${roomId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "rename", name: assertItemName(rawName) }),
    });
    return parseSnapshot((result as { room: unknown }).room);
  }

  async removeItem(roomId: string, itemId: string) {
    const result = await this.request(`/api/rooms/${roomId}/items/${itemId}`, { method: "DELETE" });
    return parseSnapshot((result as { room: unknown }).room);
  }

  async finalize(roomId: string) {
    const result = await this.request(`/api/rooms/${roomId}/finalize`, { method: "POST" });
    return parseSnapshot((result as { room: unknown }).room);
  }

  subscribe(snapshot: RoomSnapshot, onChange: () => void) {
    const onChangeEvent = () => onChange();
    const channel: RealtimeChannel = this.client
      .channel(`rollcall:${snapshot.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `room_id=eq.${snapshot.id}` },
        onChangeEvent,
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${snapshot.id}` }, onChangeEvent)
      .subscribe();

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  private async getSnapshot(slug: string) {
    const result = await this.request(`/api/rooms/${encodeURIComponent(slug)}`);
    return parseSnapshot((result as { room: unknown }).room);
  }

  private async ensureSession(captchaToken?: string) {
    const { data } = await this.client.auth.getSession();
    if (data.session) return data.session;
    const { data: signedIn, error } = await this.client.auth.signInAnonymously(
      captchaToken ? { options: { captchaToken } } : undefined,
    );
    if (error || !signedIn.session) {
      throw new Error(error?.message ?? "Could not start the private room session.");
    }
    return signedIn.session;
  }

  private async request(path: string, init: RequestInit = {}) {
    const { data } = await this.client.auth.getSession();
    if (!data.session?.access_token) throw new Error("Your private room session has expired.");
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
        ...init.headers,
      },
    });
    const body = (await response.json().catch(() => ({}))) as ApiError;
    if (!response.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
    return body;
  }
}
