import { describe, expect, it } from "vitest";
import { allocateBill, assertAssignments, assertDeadline, assertItemName, assertNickname, assertQuantity, assertVendorName, clearParticipantReadiness, createPersonSummaryText, createRestaurantSummaryText, deadlineState, isOrderExpired, nextOrderStatus, normalizeName, readyCount, restaurantSummary, transferHostRole, type OrderSnapshot } from "../../shared/domain";

const snapshot = (overrides: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: "order", slug: "slug", vendorName: "Good Food", title: "Friday lunch", status: "open",
  deadlineAt: null, createdAt: "2026-08-30T10:00:00.000Z", expiresAt: "2026-08-31T10:00:00.000Z",
  currentParticipantId: "a", isHost: true, capabilities: { pricedMenu: false },
  participants: [
    { id: "a", nickname: "Maged", role: "host", isReady: true, joinedAt: "2026-08-30T10:00:00.000Z", isCurrentUser: true },
    { id: "b", nickname: "Sara", role: "member", isReady: false, joinedAt: "2026-08-30T10:01:00.000Z", isCurrentUser: false },
  ], lines: [], ...overrides,
});

describe("Order domain", () => {
  it("normalizes and validates names", () => {
    expect(normalizeName("  Chicken   Wrap ")).toBe("chicken wrap");
    expect(assertNickname("  Maged ")).toBe("Maged");
    expect(assertVendorName("  Good   Food ")).toBe("Good Food");
    expect(assertItemName("  Iced   latte ")).toBe("Iced latte");
    expect(() => assertQuantity(0)).toThrow("between 1 and 999");
    expect(() => assertQuantity(1.5)).toThrow("whole number");
    expect(assertAssignments(["a", "a", "b"])).toEqual(["a", "b"]);
  });
  it("keeps deadlines inside the 24-hour room lifespan", () => {
    const now = Date.parse("2026-08-30T10:00:00.000Z");
    expect(assertDeadline("2026-08-30T12:00:00.000Z", now)).toBe("2026-08-30T12:00:00.000Z");
    expect(() => assertDeadline("2026-08-31T11:00:00.000Z", now)).toThrow("within 24 hours");
    expect(deadlineState(snapshot({ deadlineAt: "2026-08-30T09:00:00.000Z" }), now).isPast).toBe(true);
  });
  it("tracks readiness", () => expect(readyCount(snapshot())).toBe(1));
  it("clears readiness after an edit and transfers the single host role", () => {
    const room = snapshot();
    expect(clearParticipantReadiness(room.participants, "a")[0].isReady).toBe(false);
    const transferred = transferHostRole(room.participants, "a", "b");
    expect(transferred.filter((person) => person.role === "host").map((person) => person.id)).toEqual(["b"]);
  });
  it("enforces status transitions and exact expiry", () => {
    expect(nextOrderStatus("open", "closed")).toBe("closed");
    expect(nextOrderStatus("closed", "open")).toBe("open");
    expect(nextOrderStatus("closed", "placed")).toBe("placed");
    expect(() => nextOrderStatus("open", "placed")).toThrow("Close the order");
    expect(() => nextOrderStatus("placed", "open")).toThrow("cannot be changed");
    expect(isOrderExpired(snapshot({ expiresAt: "2026-08-30T10:00:00.000Z" }), Date.parse("2026-08-30T10:00:00.000Z"))).toBe(true);
  });
  it("groups restaurant lines only when item, instructions, and options match", () => {
    const base = { creatorParticipantId: "a", participantIds: ["a"], sortOrder: 1, options: [], canEdit: true };
    const room = snapshot({ lines: [
      { ...base, id: "1", itemName: "Burger", quantity: 1, instructions: "No onions" },
      { ...base, id: "2", itemName: " burger ", quantity: 2, instructions: "No onions" },
      { ...base, id: "3", itemName: "Burger", quantity: 1, instructions: "Extra sauce" },
    ] });
    expect(restaurantSummary(room)).toHaveLength(2);
    expect(restaurantSummary(room)[0].quantity).toBe(3);
    expect(createRestaurantSummaryText(room)).toContain("3 × Burger");
    expect(createPersonSummaryText(room)).toContain("Maged ✓");
  });
  it("allocates shared lines and remainders deterministically", () => {
    const allocation = allocateBill({ participantIds: ["b", "a", "c"], lines: [{ id: "shared", subtotalMinor: 100, participantIds: ["c", "a", "b"] }], taxMinor: 10 });
    expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(110);
    expect(allocation.a).toBeGreaterThanOrEqual(allocation.c);
  });
});
