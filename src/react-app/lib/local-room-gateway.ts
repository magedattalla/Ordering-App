import { assertAssignments, assertDeadline, assertInstructions, assertItemName, assertNickname, assertOrderTitle, assertQuantity, assertVendorName, MAX_PARTICIPANTS, nextOrderStatus, normalizeName, ROOM_LIFETIME_MS, transferHostRole, type AddLineInput, type CreateOrderInput, type EditLineInput, type OrderSnapshot, type OrderStatus } from "../../shared/domain";
import type { CreatedOrder, OrderGateway } from "./room-gateway";

type StoredOrder = OrderSnapshot & { inviteToken: string };
type StoredOrders = Record<string, StoredOrder>;
const storageKey = "order:v2:prototype-orders";
const actorKey = "order:v2:local-actor";
const channelName = "order:v2:events";
const readOrders = (): StoredOrders => { try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { return {}; } };
const writeOrders = (orders: StoredOrders) => localStorage.setItem(storageKey, JSON.stringify(orders));
const actorId = () => { let id = sessionStorage.getItem(actorKey); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(actorKey, id); } return id; };
const token = () => { const bytes = new Uint8Array(24); crypto.getRandomValues(bytes); return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); };

export class LocalOrderGateway implements OrderGateway {
  readonly mode = "local" as const;
  private readonly channel = new BroadcastChannel(channelName);

  async create(input: CreateOrderInput): Promise<CreatedOrder> {
    const now = Date.now(); const userId = actorId(); const participantId = crypto.randomUUID();
    const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 12); const inviteToken = token();
    const order: StoredOrder = {
      id: crypto.randomUUID(), slug, inviteToken, vendorName: assertVendorName(input.vendorName), title: assertOrderTitle(input.title ?? "") || null,
      status: "open", deadlineAt: assertDeadline(input.deadlineAt, now) ?? null, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + ROOM_LIFETIME_MS).toISOString(),
      currentParticipantId: participantId, isHost: true, capabilities: { pricedMenu: false }, lines: [], participants: [
        { id: participantId, nickname: assertNickname(input.hostNickname), role: "host", isReady: false, joinedAt: new Date(now).toISOString(), isCurrentUser: true },
      ],
    };
    sessionStorage.setItem(`order:v2:membership:${slug}`, `${userId}:${participantId}`);
    const orders = readOrders(); orders[slug] = order; writeOrders(orders); this.publish(slug);
    return { snapshot: this.publicOrder(order), shareUrl: `${location.origin}/r/${slug}#token=${inviteToken}` };
  }

  async open(slug: string, inviteToken?: string, nickname?: string) {
    const orders = readOrders(); const order = orders[slug]; this.assertActive(order);
    if (inviteToken && inviteToken !== order.inviteToken) throw new Error("That private order link is invalid.");
    const membershipKey = `order:v2:membership:${slug}`; let membership = sessionStorage.getItem(membershipKey);
    if (!membership) {
      if (!inviteToken) throw new Error("Open the private invite link to join this order.");
      if (!nickname) throw new Error("Enter your nickname to join.");
      if (order.participants.length >= MAX_PARTICIPANTS) throw new Error("This order already has 100 people.");
      const normalized = normalizeName(assertNickname(nickname));
      if (order.participants.some((person) => normalizeName(person.nickname) === normalized)) throw new Error("That nickname is already in use.");
      const participantId = crypto.randomUUID();
      order.participants.push({ id: participantId, nickname: assertNickname(nickname), role: "member", isReady: false, joinedAt: new Date().toISOString(), isCurrentUser: false });
      membership = `${actorId()}:${participantId}`; sessionStorage.setItem(membershipKey, membership); orders[slug] = order; writeOrders(orders); this.publish(slug);
    }
    return this.asCurrent(order, membership.split(":")[1]);
  }

  addLine(orderId: string, input: AddLineInput) { return this.update(orderId, (order, me) => {
    this.assertOpen(order); const participantIds = this.validAssignments(order, input.participantIds);
    order.lines.push({ id: crypto.randomUUID(), itemName: assertItemName(input.itemName), quantity: assertQuantity(input.quantity), instructions: assertInstructions(input.instructions ?? ""), creatorParticipantId: me.id, participantIds, sortOrder: order.lines.length + 1, options: [], canEdit: true });
    me.isReady = false;
  }); }
  editLine(orderId: string, input: EditLineInput) { return this.update(orderId, (order, me) => {
    this.assertOpen(order); const line = this.editableLine(order, input.lineId, me.id); line.itemName = assertItemName(input.itemName); line.quantity = assertQuantity(input.quantity); line.instructions = assertInstructions(input.instructions ?? ""); line.participantIds = this.validAssignments(order, input.participantIds); me.isReady = false;
  }); }
  removeLine(orderId: string, lineId: string) { return this.update(orderId, (order, me) => { this.assertOpen(order); this.editableLine(order, lineId, me.id); order.lines = order.lines.filter((line) => line.id !== lineId); me.isReady = false; }); }
  setReady(orderId: string, isReady: boolean) { return this.update(orderId, (order, me) => { this.assertOpen(order); me.isReady = isReady; }); }
  renameParticipant(orderId: string, participantId: string, nickname: string) { return this.update(orderId, (order, me) => {
    if (!me || (me.role !== "host" && me.id !== participantId)) throw new Error("Only the host can rename other people."); const person = this.person(order, participantId); const name = assertNickname(nickname);
    if (order.participants.some((p) => p.id !== participantId && normalizeName(p.nickname) === normalizeName(name))) throw new Error("That nickname is already in use."); person.nickname = name;
  }); }
  removeParticipant(orderId: string, participantId: string, reassignToParticipantId?: string) { return this.update(orderId, (order, me) => {
    this.host(me); const person = this.person(order, participantId); if (person.role === "host") throw new Error("Transfer host control before removing the host.");
    if (reassignToParticipantId) this.person(order, reassignToParticipantId);
    order.lines = order.lines.flatMap((line) => {
      if (!line.participantIds.includes(participantId)) return [line];
      const ids = line.participantIds.filter((id) => id !== participantId); if (reassignToParticipantId) ids.push(reassignToParticipantId);
      if (!ids.length && line.creatorParticipantId === participantId) return [];
      return [{ ...line, creatorParticipantId: line.creatorParticipantId === participantId ? (reassignToParticipantId ?? me.id) : line.creatorParticipantId, participantIds: [...new Set(ids)] }];
    }); order.participants = order.participants.filter((p) => p.id !== participantId);
  }); }
  transferHost(orderId: string, participantId: string) { return this.update(orderId, (order, me) => { this.host(me); order.participants = transferHostRole(order.participants, me.id, participantId); }); }
  setStatus(orderId: string, status: OrderStatus) { return this.update(orderId, (order, me) => { this.host(me); order.status = nextOrderStatus(order.status, status); }); }
  subscribe(snapshot: OrderSnapshot, onChange: () => void) { const listener = (event: MessageEvent<{slug:string}>) => { if (event.data.slug === snapshot.slug) onChange(); }; this.channel.addEventListener("message", listener); return () => this.channel.removeEventListener("message", listener); }

  private async update(orderId: string, fn: (order: StoredOrder, me: StoredOrder["participants"][number]) => void) {
    const orders = readOrders(); const order = Object.values(orders).find((candidate) => candidate.id === orderId); this.assertActive(order);
    const membership = sessionStorage.getItem(`order:v2:membership:${order.slug}`); const me = order.participants.find((p) => p.id === membership?.split(":")[1]); if (!me) throw new Error("You no longer have access to this order.");
    fn(order, me); orders[order.slug] = order; writeOrders(orders); this.publish(order.slug); return this.asCurrent(order, me.id);
  }
  private assertActive(order?: StoredOrder): asserts order is StoredOrder { if (!order) throw new Error("This order was not found."); if (Date.parse(order.expiresAt) <= Date.now()) throw new Error("This order expired after 24 hours."); }
  private assertOpen(order: StoredOrder) { if (order.status !== "open") throw new Error(order.status === "placed" ? "This order has been placed." : "This order is closed for edits."); }
  private host(person: StoredOrder["participants"][number]) { if (person.role !== "host") throw new Error("Only the host can do that."); }
  private person(order: StoredOrder, id: string) { const person = order.participants.find((p) => p.id === id); if (!person) throw new Error("That person is no longer in the order."); return person; }
  private validAssignments(order: StoredOrder, ids: string[]) { const unique = assertAssignments(ids); unique.forEach((id) => this.person(order, id)); return unique; }
  private editableLine(order: StoredOrder, id: string, me: string) { const line = order.lines.find((candidate) => candidate.id === id); if (!line) throw new Error("That item no longer exists."); const host = this.person(order, me).role === "host"; if (!host && line.creatorParticipantId !== me && !line.participantIds.includes(me)) throw new Error("You cannot edit that item."); return line; }
  private asCurrent(order: StoredOrder, id: string): OrderSnapshot { const snapshot = this.publicOrder(order); snapshot.currentParticipantId = id; snapshot.isHost = snapshot.participants.find((p) => p.id === id)?.role === "host"; snapshot.participants = snapshot.participants.map((p) => ({ ...p, isCurrentUser: p.id === id })); snapshot.lines = snapshot.lines.map((line) => ({ ...line, canEdit: snapshot.isHost || line.creatorParticipantId === id || line.participantIds.includes(id) })); return snapshot; }
  private publicOrder(order: StoredOrder): OrderSnapshot { const { inviteToken: _token, ...snapshot } = structuredClone(order); return snapshot; }
  private publish(slug: string) { this.channel.postMessage({ slug }); }
}
