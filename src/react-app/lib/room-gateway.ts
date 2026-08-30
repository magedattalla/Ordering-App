import type { AddLineInput, CreateOrderInput, EditLineInput, OrderSnapshot, OrderStatus } from "../../shared/domain";

export type CreatedOrder = { snapshot: OrderSnapshot; shareUrl: string };
export interface OrderGateway {
  readonly mode: "local" | "remote";
  create(input: CreateOrderInput, captchaToken?: string): Promise<CreatedOrder>;
  open(slug: string, inviteToken?: string, nickname?: string, captchaToken?: string): Promise<OrderSnapshot>;
  addLine(orderId: string, input: AddLineInput): Promise<OrderSnapshot>;
  editLine(orderId: string, input: EditLineInput): Promise<OrderSnapshot>;
  removeLine(orderId: string, lineId: string): Promise<OrderSnapshot>;
  setReady(orderId: string, isReady: boolean): Promise<OrderSnapshot>;
  renameParticipant(orderId: string, participantId: string, nickname: string): Promise<OrderSnapshot>;
  removeParticipant(orderId: string, participantId: string, reassignToParticipantId?: string): Promise<OrderSnapshot>;
  transferHost(orderId: string, participantId: string): Promise<OrderSnapshot>;
  setStatus(orderId: string, status: Exclude<OrderStatus, "open"> | "open"): Promise<OrderSnapshot>;
  subscribe(snapshot: OrderSnapshot, onChange: () => void): () => void;
}
