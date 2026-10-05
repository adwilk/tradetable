import TCGdex, { Query } from "@tcgdex/sdk";

export const tcgdex = new TCGdex("en");
export { Query };

export type TCGdexMarketPricing = {
  cardmarket?: {
    unit?: string;
    avg?: number;
    low?: number;
    trend?: number;
    avg30?: number;
    "avg-holo"?: number;
    "trend-holo"?: number;
  };
};

export type TCGdexPriceableCard = {
  id: string;
  name: string;
  localId: string;
  image?: string;
  rarity?: string;
  variants?: { firstEdition?: boolean; holo?: boolean; normal?: boolean; reverse?: boolean; wPromo?: boolean };
  set?: { id: string; name: string; logo?: string; cardCount?: { total: number; official: number } };
  pricing?: TCGdexMarketPricing;
  getImageURL(quality?: "low" | "high", extension?: "png" | "webp"): string;
};
