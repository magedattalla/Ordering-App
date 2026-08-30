import type { OrderGateway } from "./room-gateway";
import { LocalOrderGateway } from "./local-room-gateway";
import { isSupabaseConfigured, SupabaseOrderGateway } from "./supabase-room-gateway";

export const createOrderGateway = (): OrderGateway =>
  isSupabaseConfigured() ? SupabaseOrderGateway.fromEnvironment() : new LocalOrderGateway();
