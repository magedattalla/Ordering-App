import {
  assertItemName,
  assertPieceCount,
  assertRestaurantName,
  calculateTotal,
  normalizeItemName,
  type CreateRoomInput,
  type RoomItem,
  type RoomSnapshot,
} from "../../shared/domain";
import type { CreatedRoom, RoomGateway } from "./room-gateway";

type StoredRoom = RoomSnapshot & { inviteToken: string };
type StoredRooms = Record<string, StoredRoom>;

const storageKey = "rollcall:prototype-rooms";
const channelName = "rollcall:prototype-room-events";

const readRooms = (): StoredRooms => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as StoredRooms;
  } catch {
    return {};
  }
};

const writeRooms = (rooms: StoredRooms) => localStorage.setItem(storageKey, JSON.stringify(rooms));

const randomToken = () => {
  const values = new Uint8Array(24);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const throwIfExpired = (room: StoredRoom) => {
  if (Date.parse(room.expiresAt) <= Date.now()) {
    throw new Error("This room expired after 24 hours.");
  }
};

export class LocalRoomGateway implements RoomGateway {
  readonly mode = "local" as const;
  private readonly channel = new BroadcastChannel(channelName);

  async create(input: CreateRoomInput): Promise<CreatedRoom> {
    const restaurantName = assertRestaurantName(input.restaurantName);
    const comboSize = assertPieceCount(input.comboSize);
    const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
    const inviteToken = randomToken();
    const room: StoredRoom = {
      id: crypto.randomUUID(),
      slug,
      restaurantName,
      comboSize,
      status: "open",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isHost: true,
      items: [],
      inviteToken,
    };
    const rooms = readRooms();
    rooms[slug] = room;
    writeRooms(rooms);
    this.publish(slug);
    return { snapshot: this.publicRoom(room), shareUrl: this.shareUrl(slug, inviteToken) };
  }

  async open(slug: string, inviteToken?: string): Promise<RoomSnapshot> {
    const room = readRooms()[slug];
    if (!room) throw new Error("This prototype room is only available in the browser that created it.");
    throwIfExpired(room);
    if (inviteToken && inviteToken !== room.inviteToken) throw new Error("That room link is invalid.");
    return this.publicRoom(room);
  }

  async addItem(roomId: string, rawName: string, pieceCount: number): Promise<RoomSnapshot> {
    const name = assertItemName(rawName);
    const count = assertPieceCount(pieceCount);
    return this.updateById(roomId, (room) => {
      this.assertOpen(room);
      const normalized = normalizeItemName(name);
      const existing = room.items.find((item) => normalizeItemName(item.name) === normalized);
      if (existing) existing.pieceCount += count;
      else room.items.push({ id: crypto.randomUUID(), name, pieceCount: count, sortOrder: room.items.length + 1 });
    });
  }

  async changeItem(roomId: string, itemId: string, delta: number): Promise<RoomSnapshot> {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error("Choose a valid change.");
    return this.updateById(roomId, (room) => {
      this.assertOpen(room);
      const item = room.items.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("That item no longer exists.");
      item.pieceCount += delta;
      if (item.pieceCount <= 0) room.items = room.items.filter((candidate) => candidate.id !== itemId);
    });
  }

  async renameItem(roomId: string, itemId: string, rawName: string): Promise<RoomSnapshot> {
    const name = assertItemName(rawName);
    return this.updateById(roomId, (room) => {
      this.assertOpen(room);
      const item = room.items.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("That item no longer exists.");
      const sameName = room.items.find(
        (candidate) => candidate.id !== itemId && normalizeItemName(candidate.name) === normalizeItemName(name),
      );
      if (sameName) {
        sameName.pieceCount += item.pieceCount;
        room.items = room.items.filter((candidate) => candidate.id !== itemId);
      } else item.name = name;
    });
  }

  async removeItem(roomId: string, itemId: string): Promise<RoomSnapshot> {
    return this.updateById(roomId, (room) => {
      this.assertOpen(room);
      room.items = room.items.filter((item) => item.id !== itemId);
    });
  }

  async finalize(roomId: string): Promise<RoomSnapshot> {
    return this.updateById(roomId, (room) => {
      this.assertOpen(room);
      if (!room.isHost) throw new Error("Only the room creator can finish the order.");
      if (calculateTotal(room.items) !== room.comboSize) throw new Error("The combo must be exact before finishing.");
      room.status = "final";
    });
  }

  subscribe(snapshot: RoomSnapshot, onChange: () => void) {
    const onMessage = (event: MessageEvent<{ slug: string }>) => {
      if (event.data.slug === snapshot.slug) onChange();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) onChange();
    };
    this.channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      this.channel.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }

  private async updateById(roomId: string, update: (room: StoredRoom) => void) {
    const rooms = readRooms();
    const room = Object.values(rooms).find((candidate) => candidate.id === roomId);
    if (!room) throw new Error("This room was not found.");
    throwIfExpired(room);
    update(room);
    rooms[room.slug] = room;
    writeRooms(rooms);
    this.publish(room.slug);
    return this.publicRoom(room);
  }

  private assertOpen(room: StoredRoom) {
    if (room.status !== "open") throw new Error("This order is already final.");
  }

  private publish(slug: string) {
    this.channel.postMessage({ slug });
  }

  private publicRoom(room: StoredRoom): RoomSnapshot {
    const { inviteToken: _inviteToken, ...snapshot } = room;
    return snapshot;
  }

  private shareUrl(slug: string, inviteToken: string) {
    return `${window.location.origin}/r/${slug}#token=${inviteToken}`;
  }
}
