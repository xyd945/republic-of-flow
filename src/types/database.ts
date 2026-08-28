// GENERATED FILE — do not edit by hand.
//
// Regenerate with:  npm run gen:types
//
// Read from the live PostgREST OpenAPI document rather than written by hand,
// so a column added or dropped in a migration shows up here as a diff instead
// of as a runtime surprise. See scripts/gen-types.ts for why this route and
// not `supabase gen types`.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface MarketInterestsRow {
  id: string;  // primary key
  listing_id: string;
  profile_id: string;
  message: Json | null;
  status: string;
  created_at: string;
}

export interface MarketListingsRow {
  id: string;  // primary key
  creator_profile_id: string;
  type: string;
  title: Json;
  description: Json;
  tags: string[];
  chips: Json;
  capacity: number | null;
  status: string;
  suggested_profile_id: string | null;
  suggested_reason: Json | null;
  created_at: string;
  updated_at: string;
}

export interface MatchesRow {
  id: string;  // primary key
  listing_id: string | null;
  initiator_profile_id: string;
  matched_profile_id: string;
  status: string;
  source: string;
  next_step: Json | null;
  created_at: string;
  completed_at: string | null;
}

export interface NotificationsRow {
  id: string;  // primary key
  profile_id: string;
  kind: string;
  payload: Json;
  read_at: string | null;
  created_at: string;
}

export interface ProfileHiddenWorldsRow {
  id: string;  // primary key
  profile_id: string;
  name: Json;
  category: string | null;
  visibility: string;
  sort_order: number;
  created_at: string;
}

export interface ProfilesRow {
  id: string;  // primary key
  user_id: string;
  full_name: string;
  native_name: string | null;
  initials: string;
  class_name: string;
  headline: Json;
  role: Json;
  intro: Json;
  professional: Json;
  bio: string | null;
  avatar_url: string | null;
  preferred_language: string;
  contact_kind: string;
  contact_value: string;
  ask_topics: Json;
  want_topics: Json;
  languages: string[];
  is_active: boolean;
  is_featured: boolean;
  is_curator: boolean;
  founder_no: number | null;
  created_at: string;
  updated_at: string;
}

/** Every table exposed through the API. */
export type TableName =
  | 'market_interests'
  | 'market_listings'
  | 'matches'
  | 'notifications'
  | 'profile_hidden_worlds'
  | 'profiles';

/** Every function callable through .rpc(). */
export type RpcName =
  | 'accept_interest'
  | 'add_notification'
  | 'auth_profile_id'
  | 'claim_membership'
  | 'curator_suggest'
  | 'curator_update_member'
  | 'decline_interest'
  | 'dismatch'
  | 'is_curator'
  | 'mark_match_met'
  | 'mark_notifications_read'
  | 'notification_payload'
  | 'raise_interest'
  | 'rls_auto_enable'
  | 'save_profile';
