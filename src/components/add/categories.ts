import { Landmark, Utensils, Wine, BookOpen, Users, Receipt, type LucideIcon } from "lucide-react";
import type { PhotoCategory } from "@/lib/draftStore";

export interface CategoryDef {
  key: PhotoCategory;
  icon: LucideIcon;
  /** chave i18n do rótulo curto */
  labelKey: string;
  /** valor de restaurant_photos.type */
  photoType: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "place", icon: Landmark, labelKey: "restaurantDetail.place", photoType: "restaurant_photo" },
  { key: "food", icon: Utensils, labelKey: "restaurantDetail.food", photoType: "food" },
  { key: "wine", icon: Wine, labelKey: "restaurantDetail.wine", photoType: "wine" },
  { key: "menu", icon: BookOpen, labelKey: "restaurantDetail.menu", photoType: "menu" },
  { key: "friends", icon: Users, labelKey: "restaurantDetail.friends", photoType: "friends" },
  { key: "receipt", icon: Receipt, labelKey: "restaurantDetail.receipt", photoType: "receipt" },
];

export const CATEGORY_BY_KEY: Record<PhotoCategory, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<PhotoCategory, CategoryDef>;

/** Categorias com IA logo após a foto. */
export const AI_CATEGORIES: PhotoCategory[] = ["receipt", "menu", "wine"];

export function categoryFromPhotoType(type: string | null | undefined): PhotoCategory {
  switch (type) {
    case "food":
    case "wine":
    case "menu":
    case "friends":
      return type;
    default:
      return "place";
  }
}
