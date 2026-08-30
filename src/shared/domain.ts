export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const MAX_PARTICIPANTS = 100;

export type OrderStatus = "open" | "closed" | "placed";
export type ParticipantRole = "host" | "member";
export type OptionKind = "variant" | "addition" | "removal";

export type Participant = {
  id: string;
  nickname: string;
  role: ParticipantRole;
  isReady: boolean;
  joinedAt: string;
  isCurrentUser: boolean;
};

export type OrderLineOption = { id: string; kind: OptionKind; name: string; priceAdjustmentMinor: number };
export type OrderLine = {
  id: string;
  itemName: string;
  quantity: number;
  instructions: string;
  creatorParticipantId: string;
  participantIds: string[];
  sortOrder: number;
  menuItemRef?: string;
  unitPriceMinor?: number;
  options: OrderLineOption[];
  canEdit: boolean;
};
export type OrderCapabilities = { pricedMenu: boolean };
export type OrderSnapshot = {
  id: string; slug: string; vendorName: string; title: string | null; status: OrderStatus;
  deadlineAt: string | null; createdAt: string; expiresAt: string; currentParticipantId: string;
  isHost: boolean; participants: Participant[]; lines: OrderLine[]; capabilities: OrderCapabilities;
};
export type CreateOrderInput = { hostNickname: string; vendorName: string; title?: string; deadlineAt?: string };
export type AddLineInput = { itemName: string; quantity: number; instructions?: string; participantIds: string[] };
export type EditLineInput = AddLineInput & { lineId: string };
export type RestaurantSummaryLine = { key: string; itemName: string; quantity: number; instructions: string; options: OrderLineOption[] };

export const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeName = (value: string) => normalizeWhitespace(value).toLocaleLowerCase();
const assertText = (value: string, label: string, max: number, required = true) => {
  const text = normalizeWhitespace(value);
  if (required && !text) throw new Error(`Enter ${label}.`);
  if (text.length > max) throw new Error(`${label[0].toUpperCase()}${label.slice(1)} can be up to ${max} characters.`);
  return text;
};
export const assertNickname = (value: string) => assertText(value, "a nickname", 40);
export const assertVendorName = (value: string) => assertText(value, "the restaurant or vendor", 100);
export const assertOrderTitle = (value: string) => assertText(value, "the order title", 100, false);
export const assertItemName = (value: string) => assertText(value, "an item name", 120);
export const assertInstructions = (value: string) => assertText(value, "instructions", 500, false);
export const assertQuantity = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 999) throw new Error("Quantity must be a whole number between 1 and 999.");
  return value;
};
export const assertDeadline = (value: string | undefined, now = Date.now()) => {
  if (!value) return undefined;
  const deadline = Date.parse(value);
  if (!Number.isFinite(deadline) || deadline <= now) throw new Error("Choose a deadline in the future.");
  if (deadline > now + ROOM_LIFETIME_MS) throw new Error("The deadline must be within 24 hours.");
  return new Date(deadline).toISOString();
};
export const assertAssignments = (ids: string[]) => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) throw new Error("Assign the item to at least one person.");
  return unique;
};
export const readyCount = (snapshot: OrderSnapshot) => snapshot.participants.filter((person) => person.isReady).length;
export const deadlineState = (snapshot: OrderSnapshot, now = Date.now()) => {
  if (!snapshot.deadlineAt) return { hasDeadline: false, isPast: false, remainingMs: null } as const;
  const remainingMs = Date.parse(snapshot.deadlineAt) - now;
  return { hasDeadline: true, isPast: remainingMs <= 0, remainingMs } as const;
};
export const canParticipantEdit = (snapshot: OrderSnapshot) => snapshot.status === "open";
export const isOrderExpired = (snapshot: Pick<OrderSnapshot, "expiresAt">, now = Date.now()) => Date.parse(snapshot.expiresAt) <= now;
export const nextOrderStatus = (current: OrderStatus, requested: OrderStatus): OrderStatus => {
  if (current === "placed") throw new Error("A placed order cannot be changed.");
  if (requested === "placed" && current !== "closed") throw new Error("Close the order before placing it.");
  return requested;
};
export const transferHostRole = (participants: Participant[], currentHostId: string, nextHostId: string) => {
  if (!participants.some((person) => person.id === nextHostId)) throw new Error("That person is no longer in the order.");
  return participants.map((person) => ({ ...person, role: person.id === nextHostId ? "host" as const : person.id === currentHostId ? "member" as const : person.role }));
};
export const clearParticipantReadiness = (participants: Participant[], participantId: string) => participants.map((person) => person.id === participantId ? { ...person, isReady: false } : person);

export const restaurantSummary = (snapshot: Pick<OrderSnapshot, "lines">): RestaurantSummaryLine[] => {
  const groups = new Map<string, RestaurantSummaryLine>();
  for (const line of snapshot.lines) {
    const optionKey = [...line.options].sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`))
      .map((option) => `${option.kind}:${normalizeName(option.name)}:${option.priceAdjustmentMinor}`).join("|");
    const key = `${normalizeName(line.itemName)}\u0000${normalizeWhitespace(line.instructions)}\u0000${optionKey}`;
    const existing = groups.get(key);
    if (existing) existing.quantity += line.quantity;
    else groups.set(key, { key, itemName: normalizeWhitespace(line.itemName), quantity: line.quantity, instructions: normalizeWhitespace(line.instructions), options: line.options });
  }
  return [...groups.values()];
};

export const createRestaurantSummaryText = (snapshot: OrderSnapshot) => {
  const heading = snapshot.title ? `${snapshot.title} — ${snapshot.vendorName}` : snapshot.vendorName;
  const lines = restaurantSummary(snapshot).flatMap((line) => [`${line.quantity} × ${line.itemName}`, ...(line.instructions ? [`  ${line.instructions}`] : [])]);
  return [heading, "", ...(lines.length ? lines : ["No items yet."])].join("\n");
};
export const createPersonSummaryText = (snapshot: OrderSnapshot) => {
  const heading = snapshot.title ? `${snapshot.title} — ${snapshot.vendorName}` : snapshot.vendorName;
  const sections = snapshot.participants.map((person) => {
    const lines = snapshot.lines.filter((line) => line.participantIds.includes(person.id));
    return [`${person.nickname}${person.isReady ? " ✓" : ""}`, ...(lines.length ? lines.flatMap((line) => [`- ${line.quantity} × ${line.itemName}`, ...(line.instructions ? [`  ${line.instructions}`] : [])]) : ["- Nothing added"])].join("\n");
  });
  return [heading, "", ...sections].join("\n\n");
};

export type BillLine = { id: string; subtotalMinor: number; participantIds: string[] };
export type BillAllocationInput = { participantIds: string[]; lines: BillLine[]; taxMinor?: number; tipMinor?: number; feesMinor?: number; discountMinor?: number };
const splitMinorUnits = (amount: number, participantIds: string[]) => {
  const sorted = [...participantIds].sort();
  const base = Math.trunc(amount / sorted.length);
  let remainder = amount - base * sorted.length;
  return new Map(sorted.map((id) => {
    const adjustment = remainder === 0 ? 0 : remainder > 0 ? 1 : -1;
    if (remainder !== 0) remainder -= adjustment;
    return [id, base + adjustment];
  }));
};
export const allocateBill = (input: BillAllocationInput) => {
  const itemTotals = new Map(input.participantIds.map((id) => [id, 0]));
  for (const line of [...input.lines].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [id, amount] of splitMinorUnits(line.subtotalMinor, assertAssignments(line.participantIds))) itemTotals.set(id, (itemTotals.get(id) ?? 0) + amount);
  }
  const subtotal = [...itemTotals.values()].reduce((sum, value) => sum + value, 0);
  const extras = (input.taxMinor ?? 0) + (input.tipMinor ?? 0) + (input.feesMinor ?? 0) - (input.discountMinor ?? 0);
  const allocations = new Map(itemTotals);
  if (extras !== 0 && subtotal > 0) {
    const raw = [...itemTotals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => ({ id, amount: Math.trunc((extras * value) / subtotal) }));
    let remainder = extras - raw.reduce((sum, entry) => sum + entry.amount, 0);
    for (const entry of raw) {
      if (remainder !== 0) { const adjustment = remainder > 0 ? 1 : -1; entry.amount += adjustment; remainder -= adjustment; }
      allocations.set(entry.id, (allocations.get(entry.id) ?? 0) + entry.amount);
    }
  }
  return Object.fromEntries(allocations);
};
