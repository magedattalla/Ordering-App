export const COMBO_PRESETS = [15, 20, 30, 40, 50, 60, 70, 80, 100] as const;

export type RoomStatus = "open" | "final";

export type RoomItem = {
  id: string;
  name: string;
  pieceCount: number;
  sortOrder: number;
};

export type RoomSnapshot = {
  id: string;
  slug: string;
  restaurantName: string;
  comboSize: number;
  status: RoomStatus;
  expiresAt: string;
  isHost: boolean;
  items: RoomItem[];
};

export type CreateRoomInput = {
  restaurantName: string;
  comboSize: number;
};

export const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");

export const normalizeItemName = (value: string) => normalizeName(value).toLocaleLowerCase();

export const isPositiveSafeInteger = (value: number) =>
  Number.isSafeInteger(value) && value > 0;

export const assertRestaurantName = (value: string) => {
  const name = normalizeName(value);
  if (!name) throw new Error("Enter the restaurant name.");
  if (name.length > 100) throw new Error("Restaurant names can be up to 100 characters.");
  return name;
};

export const assertItemName = (value: string) => {
  const name = normalizeName(value);
  if (!name) throw new Error("Enter an item name.");
  if (name.length > 100) throw new Error("Item names can be up to 100 characters.");
  return name;
};

export const assertPieceCount = (value: number) => {
  if (!isPositiveSafeInteger(value)) throw new Error("Pieces must be a positive whole number.");
  return value;
};

export const pieceLabel = (count: number) => `${count} ${count === 1 ? "piece" : "pieces"}`;

export const calculateTotal = (items: RoomItem[]) =>
  items.reduce((total, item) => total + item.pieceCount, 0);

export const roomState = (snapshot: RoomSnapshot) => {
  const total = calculateTotal(snapshot.items);
  const difference = snapshot.comboSize - total;

  return {
    total,
    difference,
    isExact: difference === 0,
    isOver: difference < 0,
    isUnder: difference > 0,
    progress: Math.min(100, Math.round((total / snapshot.comboSize) * 100)),
  };
};

export const createOrderText = (snapshot: RoomSnapshot) => {
  const total = calculateTotal(snapshot.items);
  const lines = snapshot.items.map((item) => `- ${item.name}: ${pieceLabel(item.pieceCount)}`);
  return [
    snapshot.restaurantName,
    `${total} / ${snapshot.comboSize} pieces`,
    "",
    ...lines,
  ].join("\n");
};
