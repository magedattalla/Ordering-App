import { describe, expect, it } from "vitest";
import {
  assertItemName,
  assertPieceCount,
  assertRestaurantName,
  calculateTotal,
  createOrderText,
  isPositiveSafeInteger,
  normalizeItemName,
  pieceLabel,
  roomState,
  type RoomSnapshot,
} from "../../shared/domain";

const room = (items: RoomSnapshot["items"], comboSize = 20): RoomSnapshot => ({
  id: "room-id",
  slug: "room-slug",
  restaurantName: "Sushi Samba",
  comboSize,
  status: "open",
  expiresAt: "2026-08-30T00:00:00.000Z",
  isHost: true,
  items,
});

describe("RollCall domain rules", () => {
  it("normalizes duplicate item names safely", () => {
    expect(normalizeItemName("  Crispy   Shrimp ")).toBe("crispy shrimp");
    expect(assertItemName("  Crispy   Shrimp ")).toBe("Crispy Shrimp");
  });

  it("calculates under, exact, and over combo states", () => {
    const items = [{ id: "one", name: "Philadelphia", pieceCount: 8, sortOrder: 1 }];
    expect(calculateTotal(items)).toBe(8);
    expect(roomState(room(items)).difference).toBe(12);
    expect(roomState(room([{ ...items[0], pieceCount: 20 }])).isExact).toBe(true);
    expect(roomState(room([{ ...items[0], pieceCount: 24 }])).isOver).toBe(true);
  });

  it("rejects empty names", () => {
    expect(() => assertItemName("   ")).toThrow("Enter an item name.");
  });

  it("rejects over-long restaurant and item names", () => {
    expect(assertRestaurantName("  Sushi   Samba ")).toBe("Sushi Samba");
    expect(() => assertRestaurantName("  ")).toThrow("Enter the restaurant name.");
    expect(() => assertRestaurantName("x".repeat(101))).toThrow("up to 100 characters");
    expect(() => assertItemName("x".repeat(101))).toThrow("up to 100 characters");
  });

  it("accepts only positive whole piece counts", () => {
    expect(assertPieceCount(8)).toBe(8);
    expect(isPositiveSafeInteger(1)).toBe(true);
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isPositiveSafeInteger(value)).toBe(false);
      expect(() => assertPieceCount(value)).toThrow("positive whole number");
    }
  });

  it("says piece once and pieces otherwise", () => {
    expect(pieceLabel(1)).toBe("1 piece");
    expect(pieceLabel(0)).toBe("0 pieces");
    expect(pieceLabel(4)).toBe("4 pieces");
  });

  it("caps progress once the combo is over target", () => {
    const over = roomState(room([{ id: "one", name: "Toro", pieceCount: 30, sortOrder: 1 }]));
    expect(over.progress).toBe(100);
    expect(over.difference).toBe(-10);
    expect(roomState(room([])).progress).toBe(0);
    expect(calculateTotal([])).toBe(0);
  });

  it("writes a restaurant-ready order summary", () => {
    const snapshot = room([
      { id: "one", name: "Salmon Nigiri", pieceCount: 12, sortOrder: 1 },
      { id: "two", name: "Tuna Roll", pieceCount: 1, sortOrder: 2 },
    ]);
    expect(createOrderText(snapshot)).toBe(
      ["Sushi Samba", "13 / 20 pieces", "", "- Salmon Nigiri: 12 pieces", "- Tuna Roll: 1 piece"].join("\n"),
    );
  });
});
