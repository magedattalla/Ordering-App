import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { z } from "zod";

type OrderEnv = Env & { SUPABASE_SECRET_KEY: string; TURNSTILE_SECRET_KEY?: string };
type WorkerContext = { Bindings: OrderEnv };

const name = z.string().trim().min(1).max(40);
const createOrderSchema = z.object({
  hostNickname: name,
  vendorName: z.string().trim().min(1).max(100),
  title: z.string().trim().max(100).optional(),
  deadlineAt: z.string().datetime().optional(),
  turnstileToken: z.string().optional(),
});
const joinSchema = z.object({ inviteToken: z.string().min(32).max(128), nickname: name, turnstileToken: z.string().optional() });
const lineSchema = z.object({ itemName: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(999), instructions: z.string().trim().max(500).default(""), participantIds: z.array(z.string().uuid()).min(1).max(100) });
const readinessSchema = z.object({ isReady: z.boolean() });
const renameSchema = z.object({ nickname: name });
const removeParticipantSchema = z.object({ reassignToParticipantId: z.string().uuid().optional() });
const transferSchema = z.object({ participantId: z.string().uuid() });
const statusSchema = z.object({ status: z.enum(["open", "closed", "placed"]) });

const app = new Hono<WorkerContext>();
app.onError((error, context) => {
  console.error(JSON.stringify({ event: "order_api_error", message: error.message, path: context.req.path }));
  const forbidden = /access|host|closed|placed|expired|invalid|not found|no longer|cannot edit/i.test(error.message);
  return context.json({ error: error.message || "Something went wrong." }, forbidden ? 403 : 400);
});
app.get("/api/health", (context) => context.json({ ok: true, service: "order" }));

app.post("/api/rooms", async (context) => {
  const input = createOrderSchema.parse(await context.req.json());
  await verifyTurnstile(context.req.raw, context.env, input.turnstileToken);
  const actorId = await getActorId(context.req.raw, context.env);
  const inviteToken = createInviteToken();
  const room = await callRpc(context.env, "create_group_order_v2", {
    p_actor_id: actorId, p_host_nickname: input.hostNickname, p_vendor_name: input.vendorName,
    p_title: input.title || null, p_deadline_at: input.deadlineAt || null, p_slug: createSlug(),
    p_token_hash: await sha256(inviteToken),
  });
  return context.json({ room, inviteToken }, 201);
});
app.get("/api/rooms/:slug", async (context) => context.json({ room: await callRpc(context.env, "get_group_order_snapshot_by_slug_v2", { p_slug: context.req.param("slug"), p_actor_id: await getActorId(context.req.raw, context.env) }) }));
app.post("/api/rooms/:slug/join", async (context) => {
  const input = joinSchema.parse(await context.req.json()); await verifyTurnstile(context.req.raw, context.env, input.turnstileToken);
  const room = await callRpc(context.env, "join_group_order_v2", { p_slug: context.req.param("slug"), p_token_hash: await sha256(input.inviteToken), p_actor_id: await getActorId(context.req.raw, context.env), p_nickname: input.nickname });
  return context.json({ room });
});
app.post("/api/rooms/:orderId/lines", async (context) => {
  const input = lineSchema.parse(await context.req.json()); const actorId = await getActorId(context.req.raw, context.env);
  return context.json({ room: await callRpc(context.env, "add_order_line_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: actorId, p_item_name: input.itemName, p_quantity: input.quantity, p_instructions: input.instructions, p_participant_ids: input.participantIds }) });
});
app.patch("/api/rooms/:orderId/lines/:lineId", async (context) => {
  const input = lineSchema.parse(await context.req.json()); const actorId = await getActorId(context.req.raw, context.env);
  return context.json({ room: await callRpc(context.env, "edit_order_line_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: actorId, p_line_id: context.req.param("lineId"), p_item_name: input.itemName, p_quantity: input.quantity, p_instructions: input.instructions, p_participant_ids: input.participantIds }) });
});
app.delete("/api/rooms/:orderId/lines/:lineId", async (context) => context.json({ room: await callRpc(context.env, "remove_order_line_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: await getActorId(context.req.raw, context.env), p_line_id: context.req.param("lineId") }) }));
app.put("/api/rooms/:orderId/readiness", async (context) => {
  const input = readinessSchema.parse(await context.req.json()); return context.json({ room: await callRpc(context.env, "set_participant_readiness_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: await getActorId(context.req.raw, context.env), p_is_ready: input.isReady }) });
});
app.patch("/api/rooms/:orderId/participants/:participantId", async (context) => {
  const input = renameSchema.parse(await context.req.json()); return context.json({ room: await callRpc(context.env, "rename_participant_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: await getActorId(context.req.raw, context.env), p_participant_id: context.req.param("participantId"), p_nickname: input.nickname }) });
});
app.delete("/api/rooms/:orderId/participants/:participantId", async (context) => {
  const input = removeParticipantSchema.parse(await context.req.json().catch(() => ({}))); return context.json({ room: await callRpc(context.env, "remove_participant_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: await getActorId(context.req.raw, context.env), p_participant_id: context.req.param("participantId"), p_reassign_to_participant_id: input.reassignToParticipantId || null }) });
});
app.put("/api/rooms/:orderId/host", async (context) => {
  const input = transferSchema.parse(await context.req.json()); return context.json({ room: await callRpc(context.env, "transfer_group_order_host_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: await getActorId(context.req.raw, context.env), p_new_host_participant_id: input.participantId }) });
});
app.put("/api/rooms/:orderId/status", async (context) => {
  const input = statusSchema.parse(await context.req.json()); return context.json({ room: await callRpc(context.env, "set_group_order_status_v2", { p_group_order_id: context.req.param("orderId"), p_actor_id: await getActorId(context.req.raw, context.env), p_status: input.status }) });
});

const createServiceClient = (env: OrderEnv) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("The Order database is not configured.");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
};
const callRpc = async (env: OrderEnv, functionName: string, args: Record<string, unknown>) => { const { data, error } = await createServiceClient(env).rpc(functionName, args); if (error) throw new Error(error.message); return data; };
const getActorId = async (request: Request, env: OrderEnv) => {
  const authorization = request.headers.get("authorization"); if (!authorization?.startsWith("Bearer ")) throw new Error("A private session is required.");
  const response = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization } });
  if (!response.ok) throw new Error("Your private session expired."); const user = await response.json() as { id?: string }; if (!user.id) throw new Error("Your private session is invalid."); return user.id;
};
const verifyTurnstile = async (request: Request, env: OrderEnv, responseToken?: string) => {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (!responseToken) throw new Error("Complete the verification first.");
  const form = new FormData(); form.set("secret", env.TURNSTILE_SECRET_KEY); form.set("response", responseToken); const ip = request.headers.get("CF-Connecting-IP"); if (ip) form.set("remoteip", ip); form.set("idempotency_key", crypto.randomUUID());
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }); const body = await result.json() as { success?: boolean }; if (!body.success) throw new Error("Verification failed. Please try again.");
};
const createSlug = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const createInviteToken = () => { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); };
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const cleanupExpiredOrders = async (env: OrderEnv) => { try { const count = await callRpc(env, "cleanup_expired_group_orders_v2", {}); console.log(JSON.stringify({ event: "expired_orders_cleaned", count })); } catch (error) { console.error(JSON.stringify({ event: "expired_order_cleanup_failed", message: error instanceof Error ? error.message : "unknown" })); } };

export default { fetch: app.fetch, scheduled: (_event, env, context) => { context.waitUntil(cleanupExpiredOrders(env)); } } satisfies ExportedHandler<OrderEnv>;
