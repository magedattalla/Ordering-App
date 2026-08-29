import type { CreateRoomInput, RoomSnapshot } from "../../shared/domain";

export type CreatedRoom = {
  snapshot: RoomSnapshot;
  shareUrl: string;
};

export interface RoomGateway {
  readonly mode: "local" | "remote";
  create(input: CreateRoomInput, captchaToken?: string): Promise<CreatedRoom>;
  open(slug: string, inviteToken?: string, captchaToken?: string): Promise<RoomSnapshot>;
  addItem(roomId: string, name: string, pieceCount: number): Promise<RoomSnapshot>;
  changeItem(roomId: string, itemId: string, delta: number): Promise<RoomSnapshot>;
  renameItem(roomId: string, itemId: string, name: string): Promise<RoomSnapshot>;
  removeItem(roomId: string, itemId: string): Promise<RoomSnapshot>;
  finalize(roomId: string): Promise<RoomSnapshot>;
  subscribe(snapshot: RoomSnapshot, onChange: () => void): () => void;
}
