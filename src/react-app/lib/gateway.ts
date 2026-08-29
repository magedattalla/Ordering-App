import type { RoomGateway } from "./room-gateway";
import { LocalRoomGateway } from "./local-room-gateway";
import { isSupabaseConfigured, SupabaseRoomGateway } from "./supabase-room-gateway";

export const createRoomGateway = (): RoomGateway =>
  isSupabaseConfigured() ? SupabaseRoomGateway.fromEnvironment() : new LocalRoomGateway();
