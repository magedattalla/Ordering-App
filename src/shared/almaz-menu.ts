export const ALMAZ_VENDOR_NAME = "Almaz";
export const ALMAZ_EDITION_DATE = "2026-10-11";

export type AlmazMenuCategory = "Breakfast" | "Sandwiches" | "Salads" | "Boxes" | "Hawawshi" | "Pasta" | "Desserts" | "Drinks";

export type AlmazMenuItem = {
  id: string;
  name: string;
  category: AlmazMenuCategory;
  priceEgp: number;
  description?: string;
};

export const ALMAZ_MENU: AlmazMenuItem[] = [
  { id: "plain-eggs", name: "Plain Eggs", category: "Breakfast", priceEgp: 65 },
  { id: "shakshouka", name: "Shakshouka", category: "Breakfast", priceEgp: 70 },
  { id: "morta-eggs", name: "Morta Eggs", category: "Breakfast", priceEgp: 80 },
  { id: "mix-cheese-eggs", name: "Mix Cheese Eggs", category: "Breakfast", priceEgp: 65 },
  { id: "basterma-eggs", name: "Basterma Eggs", category: "Breakfast", priceEgp: 80 },
  { id: "bolobeef-eggs", name: "Bolobeef Eggs", category: "Breakfast", priceEgp: 80 },
  { id: "sogouk-baladi-eggs", name: "Sogouk Baladi Eggs", category: "Breakfast", priceEgp: 80 },
  { id: "armenian-sogouk-eggs", name: "Armenian Sogouk Eggs", category: "Breakfast", priceEgp: 80 },
  { id: "melted-romy-cheese", name: "Melted Romy Cheese", category: "Breakfast", priceEgp: 60 },
  { id: "melted-romy-oregano-olives", name: "Melted Romy with Oregano and Olives", category: "Breakfast", priceEgp: 60 },

  { id: "kebda", name: "Kebda", category: "Sandwiches", priceEgp: 85 },
  { id: "sogouk-baladi", name: "Sogouk Baladi", category: "Sandwiches", priceEgp: 85 },
  { id: "sogouk-baladi-cheese", name: "Sogouk Baladi with Cheese", category: "Sandwiches", priceEgp: 95 },
  { id: "sogouk-mafroum", name: "Sogouk Mafroum", category: "Sandwiches", priceEgp: 85 },
  { id: "sogouk-torky", name: "Sogouk Torky", category: "Sandwiches", priceEgp: 85 },
  { id: "sogouk-iskandarani", name: "Sogouk Iskandarani", category: "Sandwiches", priceEgp: 100 },
  { id: "sogouk-armenian", name: "Sogouk Armenian", category: "Sandwiches", priceEgp: 100 },
  { id: "kofta-almaz", name: "Kofta Almaz", category: "Sandwiches", priceEgp: 100 },

  { id: "potato-salad", name: "Potato Salad", category: "Salads", priceEgp: 40 },
  { id: "pickled-tomato", name: "Pickled Tomato", category: "Salads", priceEgp: 40 },
  { id: "pickles", name: "Pickles", category: "Salads", priceEgp: 40 },
  { id: "pickled-cucumber", name: "Pickled Cucumber", category: "Salads", priceEgp: 40 },
  { id: "tahini", name: "Tahini", category: "Salads", priceEgp: 40 },
  { id: "almaz-fries", name: "Almaz Fries", category: "Salads", priceEgp: 75 },

  { id: "breakfast-box", name: "Breakfast Box", category: "Boxes", priceEgp: 200, description: "Choice of 2 breakfast sandwiches, mixed potato/tomato salad, and a soft drink" },
  { id: "dewaka-box", name: "Dewaka Box", category: "Boxes", priceEgp: 250, description: "Choice of 2 sandwiches, mixed potato/tomato salad, and a soft drink" },
  { id: "shella-box", name: "Shella Box", category: "Boxes", priceEgp: 650, description: "Choice of 6 sandwiches, 3 mixed potato/tomato salads, and 3 rayeb" },
  { id: "party-box", name: "Party Box", category: "Boxes", priceEgp: 1000, description: "Choice of 10 sandwiches, 5 mixed potato/tomato salads, and 5 soft drinks" },

  { id: "hawawshi", name: "Hawawshi", category: "Hawawshi", priceEgp: 110 },
  { id: "hawawshi-cheese", name: "Hawawshi with Cheese", category: "Hawawshi", priceEgp: 125 },

  { id: "plain-pasta", name: "Plain Pasta", category: "Pasta", priceEgp: 85 },
  { id: "pasta-kebda", name: "Pasta with Kebda", category: "Pasta", priceEgp: 150 },
  { id: "pasta-sogouk", name: "Pasta with Sogouk", category: "Pasta", priceEgp: 150 },
  { id: "pasta-kofta", name: "Pasta with Kofta", category: "Pasta", priceEgp: 150 },

  { id: "sakalans-white-honey", name: "Sakalans White Honey", category: "Desserts", priceEgp: 85 },
  { id: "sakalans-molasses", name: "Sakalans with Molasses (Viagra)", category: "Desserts", priceEgp: 85 },
  { id: "zalabia-sugar-small", name: "Zalabia Sugar — Small", category: "Desserts", priceEgp: 75 },
  { id: "zalabia-sugar-large", name: "Zalabia Sugar — Large", category: "Desserts", priceEgp: 100 },
  { id: "zalabia-nutella-small", name: "Zalabia Nutella — Small", category: "Desserts", priceEgp: 75 },
  { id: "zalabia-nutella-large", name: "Zalabia Nutella — Large", category: "Desserts", priceEgp: 100 },
  { id: "zalabia-sharbat-small", name: "Zalabia Sharbat — Small", category: "Desserts", priceEgp: 75 },
  { id: "zalabia-sharbat-large", name: "Zalabia Sharbat — Large", category: "Desserts", priceEgp: 100 },

  { id: "water", name: "Water", category: "Drinks", priceEgp: 20 },
  { id: "soft-drink", name: "Soft Drink", category: "Drinks", priceEgp: 30 },
  { id: "sparkling-water", name: "Sparkling Water", category: "Drinks", priceEgp: 40 },
  { id: "redbull", name: "Redbull", category: "Drinks", priceEgp: 100 },
];

const searchableText = (item: AlmazMenuItem) => `${item.name} ${item.category} ${item.description ?? ""}`.toLocaleLowerCase();

export const searchAlmazMenu = (query: string) => {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized ? ALMAZ_MENU.filter((item) => searchableText(item).includes(normalized)) : ALMAZ_MENU;
};

export const findAlmazMenuItem = (name: string) => ALMAZ_MENU.find((item) => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());

export const isAlmazOrder = (vendorName: string) => vendorName.trim().toLocaleLowerCase() === ALMAZ_VENDOR_NAME.toLocaleLowerCase();

export const cairoDateKey = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export const isAlmazEditionActive = (now = new Date()) => cairoDateKey(now) === ALMAZ_EDITION_DATE;
