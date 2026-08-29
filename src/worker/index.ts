import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { z } from "zod";

type RollCallEnv = Env & {
  // A Wrangler secret: intentionally absent from wrangler.jsonc and the browser.
  SUPABASE_SECRET_KEY: string;
};

type WorkerContext = { Bindings: RollCallEnv };

const createRoomSchema = z.object({
  restaurantName: z.string().trim().min(1).max(100),
  comboSize: z.number().int().positive().safe(),
});

const joinSchema = z.object({ inviteToken: z.string().min(32).max(128) });
const addItemSchema = z.object({ name: z.string().trim().min(1).max(100), pieceCount: z.number().int().positive().safe() });
const changeItemSchema = z.object({ action: z.literal("change"), delta: z.number().int().refine((value) => value !== 0) });
const renameItemSchema = z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(100) });

const app = new Hono<WorkerContext>();

app.onError((error, context) => {
  console.error(JSON.stringify({ event: "api_error", message: error.message, path: context.req.path }));
  const status = /access|host|final|expired|invalid|not found|no longer/i.test(error.message) ? 403 : 400;
  return context.json({ error: error.message || "Something went wrong." }, status);
});

app.get("/api/health", (context) => context.json({ ok: true }));

app.post("/api/rooms", async (context) => {
  const input = createRoomSchema.parse(await context.req.json());
  const actorId = await getActorId(context.req.raw, context.env);
  const inviteToken = createInviteToken();
  const room = await callRpc(context.env, "create_room", {
    p_actor_id: actorId,
    p_restaurant_name: input.restaurantName,
    p_combo_size: input.comboSize,
    p_slug: createSlug(),
    p_token_hash: await sha256(inviteToken),
  });
  return context.json({ room, inviteToken }, 201);
});

app.get("/api/rooms/:slug", async (context) => {
  const actorId = await getActorId(context.req.raw, context.env);
  const room = await callRpc(context.env, "get_room_snapshot_by_slug", {
    p_slug: context.req.param("slug"),
    p_actor_id: actorId,
  });
  return context.json({ room });
});

app.post("/api/rooms/:slug/join", async (context) => {
  const input = joinSchema.parse(await context.req.json());
  const actorId = await getActorId(context.req.raw, context.env);
  const room = await callRpc(context.env, "join_room", {
    p_slug: context.req.param("slug"),
    p_token_hash: await sha256(input.inviteToken),
    p_actor_id: actorId,
  });
  return context.json({ room });
});

app.post("/api/rooms/:roomId/items", async (context) => {
  const input = addItemSchema.parse(await context.req.json());
  const actorId = await getActorId(context.req.raw, context.env);
  const room = await callRpc(context.env, "add_or_increment_item", {
    p_room_id: context.req.param("roomId"),
    p_actor_id: actorId,
    p_name: input.name,
    p_piece_count: input.pieceCount,
  });
  return context.json({ room });
});

app.patch("/api/rooms/:roomId/items/:itemId", async (context) => {
  const body: unknown = await context.req.json();
  const actorId = await getActorId(context.req.raw, context.env);
  const roomId = context.req.param("roomId");
  const itemId = context.req.param("itemId");
  const room = "action" in (body as Record<string, unknown>) && (body as { action?: unknown }).action === "rename"
    ? await callRpc(context.env, "rename_item", {
      p_room_id: roomId,
      p_actor_id: actorId,
      p_item_id: itemId,
      p_name: renameItemSchema.parse(body).name,
    })
    : await callRpc(context.env, "change_item_count", {
      p_room_id: roomId,
      p_actor_id: actorId,
      p_item_id: itemId,
      p_delta: changeItemSchema.parse(body).delta,
    });
  return context.json({ room });
});

app.delete("/api/rooms/:roomId/items/:itemId", async (context) => {
  const actorId = await getActorId(context.req.raw, context.env);
  const room = await callRpc(context.env, "remove_item", {
    p_room_id: context.req.param("roomId"),
    p_actor_id: actorId,
    p_item_id: context.req.param("itemId"),
  });
  return context.json({ room });
});

app.post("/api/rooms/:roomId/finalize", async (context) => {
  const actorId = await getActorId(context.req.raw, context.env);
  const room = await callRpc(context.env, "finalize_room", {
    p_room_id: context.req.param("roomId"),
    p_actor_id: actorId,
  });
  return context.json({ room });
});

const createServiceClient = (env: RollCallEnv) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("The RollCall database is not configured.");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
};

const callRpc = async (env: RollCallEnv, functionName: string, args: Record<string, unknown>) => {
  const { data, error } = await createServiceClient(env).rpc(functionName, args);
  if (error) throw new Error(error.message);
  return data;
};

const getActorId = async (request: Request, env: RollCallEnv) => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("A private room session is required.");
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("The RollCall database is not configured.");
  const response = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization,
    },
  });
  if (!response.ok) throw new Error("Your private room session has expired.");
  const user = (await response.json()) as { id?: string };
  if (!user.id) throw new Error("Your private room session is invalid.");
  return user.id;
};

const createSlug = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);

const createInviteToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sha256 = async (value: string) => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const cleanupExpiredRooms = async (env: RollCallEnv) => {
  try {
    const count = await callRpc(env, "cleanup_expired_rooms", {});
    console.log(JSON.stringify({ event: "expired_rooms_cleaned", count }));
  } catch (error) {
    console.error(JSON.stringify({ event: "expired_room_cleanup_failed", message: error instanceof Error ? error.message : "unknown" }));
  }
};

export default {
  fetch: app.fetch,
  scheduled: (_event, env, ctx) => {
    ctx.waitUntil(cleanupExpiredRooms(env as RollCallEnv));
  },
} satisfies ExportedHandler<RollCallEnv>;
