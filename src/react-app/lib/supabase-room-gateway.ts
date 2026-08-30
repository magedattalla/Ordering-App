import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { assertAssignments, assertDeadline, assertInstructions, assertItemName, assertNickname, assertOrderTitle, assertQuantity, assertVendorName, type AddLineInput, type CreateOrderInput, type EditLineInput, type OrderSnapshot, type OrderStatus } from "../../shared/domain";
import type { CreatedOrder, OrderGateway } from "./room-gateway";

type RemoteConfig = { url: string; publishableKey: string; apiBaseUrl: string };
type ApiError = { error?: string };
const config = (): RemoteConfig | null => {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim(); const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey, apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "" } : null;
};
const configured = config();

export const parseSnapshot = (data: unknown): OrderSnapshot => {
  if (!data || typeof data !== "object") throw new Error("The order response was invalid.");
  const value = data as OrderSnapshot;
  if (!Array.isArray(value.participants) || !Array.isArray(value.lines)) throw new Error("The order response was incomplete.");
  return value;
};
export const isSupabaseConfigured = () => configured !== null;

export class SupabaseOrderGateway implements OrderGateway {
  readonly mode = "remote" as const;
  private readonly client: SupabaseClient;
  private readonly apiBaseUrl: string;
  constructor(remote: RemoteConfig) { this.client = createClient(remote.url, remote.publishableKey); this.apiBaseUrl = remote.apiBaseUrl; }
  static fromEnvironment() { if (!configured) throw new Error("Supabase is not configured."); return new SupabaseOrderGateway(configured); }

  async create(input: CreateOrderInput, captchaToken?: string): Promise<CreatedOrder> {
    await this.ensureSession(captchaToken);
    const result = await this.request("/api/rooms", { method: "POST", body: JSON.stringify({ hostNickname: assertNickname(input.hostNickname), vendorName: assertVendorName(input.vendorName), title: assertOrderTitle(input.title ?? "") || undefined, deadlineAt: assertDeadline(input.deadlineAt), turnstileToken: captchaToken }) }) as { room: unknown; inviteToken: string };
    const snapshot = parseSnapshot(result.room); return { snapshot, shareUrl: `${location.origin}/r/${snapshot.slug}#token=${result.inviteToken}` };
  }
  async open(slug: string, inviteToken?: string, nickname?: string, captchaToken?: string) {
    await this.ensureSession(captchaToken);
    if (inviteToken && nickname) await this.request(`/api/rooms/${encodeURIComponent(slug)}/join`, { method: "POST", body: JSON.stringify({ inviteToken, nickname: assertNickname(nickname), turnstileToken: captchaToken }) });
    return this.snapshot(slug);
  }
  async addLine(orderId: string, input: AddLineInput) { return this.mutate(`/api/rooms/${orderId}/lines`, "POST", { itemName: assertItemName(input.itemName), quantity: assertQuantity(input.quantity), instructions: assertInstructions(input.instructions ?? ""), participantIds: assertAssignments(input.participantIds) }); }
  async editLine(orderId: string, input: EditLineInput) { return this.mutate(`/api/rooms/${orderId}/lines/${input.lineId}`, "PATCH", { itemName: assertItemName(input.itemName), quantity: assertQuantity(input.quantity), instructions: assertInstructions(input.instructions ?? ""), participantIds: assertAssignments(input.participantIds) }); }
  async removeLine(orderId: string, lineId: string) { return this.mutate(`/api/rooms/${orderId}/lines/${lineId}`, "DELETE"); }
  async setReady(orderId: string, isReady: boolean) { return this.mutate(`/api/rooms/${orderId}/readiness`, "PUT", { isReady }); }
  async renameParticipant(orderId: string, participantId: string, nickname: string) { return this.mutate(`/api/rooms/${orderId}/participants/${participantId}`, "PATCH", { nickname: assertNickname(nickname) }); }
  async removeParticipant(orderId: string, participantId: string, reassignToParticipantId?: string) { return this.mutate(`/api/rooms/${orderId}/participants/${participantId}`, "DELETE", { reassignToParticipantId }); }
  async transferHost(orderId: string, participantId: string) { return this.mutate(`/api/rooms/${orderId}/host`, "PUT", { participantId }); }
  async setStatus(orderId: string, status: OrderStatus) { return this.mutate(`/api/rooms/${orderId}/status`, "PUT", { status }); }
  subscribe(snapshot: OrderSnapshot, onChange: () => void) {
    const changed = () => onChange(); const channel: RealtimeChannel = this.client.channel(`order:v2:${snapshot.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_orders", filter: `id=eq.${snapshot.id}` }, changed)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `group_order_id=eq.${snapshot.id}` }, changed)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_lines", filter: `group_order_id=eq.${snapshot.id}` }, changed)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_line_participants", filter: `group_order_id=eq.${snapshot.id}` }, changed).subscribe();
    const consistencyRefresh = window.setInterval(changed, 3_000);
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") changed(); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(consistencyRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void this.client.removeChannel(channel);
    };
  }
  private async snapshot(slug: string) { return parseSnapshot(((await this.request(`/api/rooms/${encodeURIComponent(slug)}`)) as { room: unknown }).room); }
  private async mutate(path: string, method: string, body?: unknown) { return parseSnapshot(((await this.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })) as { room: unknown }).room); }
  private async ensureSession(captchaToken?: string) {
    const existing = await this.client.auth.getSession();
    const session = existing.data.session ?? (await this.client.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined)).data.session;
    if (!session) throw new Error("Could not start a private session.");
    await this.client.realtime.setAuth(session.access_token);
    return session;
  }
  private async request(path: string, init: RequestInit = {}) { const { data } = await this.client.auth.getSession(); if (!data.session?.access_token) throw new Error("Your private session expired."); const response = await fetch(`${this.apiBaseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init.headers } }); const body = await response.json().catch(() => ({})) as ApiError; if (!response.ok) throw new Error(body.error ?? "Something went wrong. Try again."); return body; }
}
