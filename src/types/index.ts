import type { Tables } from "@/integrations/supabase/types";

// Re-export database types with friendly names
export type RestaurantEntry = Tables<"restaurant_entries">;
export type Album = Tables<"albums">;
export type AlbumEntry = Tables<"album_entries">;
export type Tag = Tables<"tags">;
export type EntryTag = Tables<"entry_tags">;
export type Profile = Tables<"profiles">;
export type RestaurantPhoto = Tables<"restaurant_photos">;
export type Receipt = Tables<"receipts">;
export type ReceiptItem = Tables<"receipt_items">;
export type ScheduledVisit = Tables<"scheduled_visits">;
export type Plan = Tables<"plans">;
export type PlanSlot = Tables<"plan_slots">;
export type ShareToken = Tables<"share_tokens">;
export type RestaurantNote = Tables<"restaurant_notes">;
export type RestaurantSocialLink = Tables<"restaurant_social_links">;
export type UserFollow = Tables<"user_follows">;

// Extended types with relations
export interface RestaurantEntryWithPhotos extends RestaurantEntry {
  photos?: RestaurantPhoto[];
  tags?: Tag[];
}

export interface AlbumWithEntries extends Album {
  entries?: RestaurantEntry[];
  entryCount?: number;
}

export interface ScheduledVisitWithPlan extends ScheduledVisit {
  plan?: Plan;
}
