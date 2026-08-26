/** The Republic supports English (default) and Chinese only. */
export type Language = 'en' | 'zh';

export type Translatable = Record<string, string>;

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  native_name: string | null;
  initials: string;
  class_name: string;
  headline: Translatable;
  role: Translatable;
  intro: Translatable;
  professional: Translatable;
  bio: string | null;
  avatar_url: string | null;
  preferred_language: Language;
  contact_kind: 'whatsapp' | 'wechat' | 'email' | 'class';
  contact_value: string;
  is_active: boolean;
  is_featured: boolean;
  is_curator: boolean;
  founder_no: number;
  created_at: string;
  updated_at: string;
}

export interface HiddenWorld {
  id: string;
  profile_id: string;
  name: Translatable;
  category: string;
  visibility: 'members' | 'private';
  sort_order: number;
  created_at: string;
}

export interface MarketListing {
  id: string;
  creator_profile_id: string;
  type: 'wanted' | 'offer';
  title: Translatable;
  description: Translatable;
  tags: string[];
  chips: Translatable[];
  capacity: number | null;
  status: 'draft' | 'open' | 'matched' | 'closed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface MarketInterest {
  id: string;
  listing_id: string;
  profile_id: string;
  message: Translatable | null;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  created_at: string;
}

export interface Match {
  id: string;
  listing_id: string;
  initiator_profile_id: string;
  matched_profile_id: string;
  status: 'proposed' | 'accepted' | 'connected' | 'completed' | 'closed';
  source: 'self' | 'curator' | 'system';
  next_step: Translatable | null;
  created_at: string;
  completed_at: string | null;
}

export type CategoryId = 'craft' | 'nature' | 'mind' | 'build' | 'money' | 'art';

export interface Category {
  id: CategoryId;
  en: string;
  zh: string;
}

export interface ProfileWithHiddenWorlds extends Profile {
  hidden_worlds: HiddenWorld[];
  ask_topics: Translatable[];
  want_topics: Translatable[];
  languages: string[];
}

export type InterestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export interface ListingInterest {
  id: string;
  listing_id: string;
  profile_id: string;
  message: Translatable | null;
  status: InterestStatus;
  profile?: ProfileWithHiddenWorlds;
}

export interface ListingWithCreator extends MarketListing {
  creator?: ProfileWithHiddenWorlds;
  /**
   * Only what RLS lets the viewer see: the full set for a listing you own or
   * if you're a curator, otherwise just your own row. Never render a count
   * from this to a non-owner — it would be wrong.
   */
  interests: ListingInterest[];
  viewer_interest_status: InterestStatus | null;
  suggested_profile_id: string | null;
  suggested_profile?: ProfileWithHiddenWorlds;
  suggested_reason: Translatable | null;
}

export interface MatchWithParties extends Match {
  initiator?: ProfileWithHiddenWorlds;
  matched?: ProfileWithHiddenWorlds;
  listing?: MarketListing;
}

/** In-app notification centre (00008). */
export type NotificationKind =
  | 'interest_raised'
  | 'interest_accepted'
  | 'interest_declined'
  | 'suggestion_made'    // to the listing owner: someone was suggested for it
  | 'suggested_to_you'   // to the member: a curator put you forward
  | 'match_undone'
  | 'match_met';

/**
 * `payload` is a snapshot taken when the event happened, not a set of joins:
 * the listing may since have been edited or deleted and the row should still
 * read correctly. Titles keep their full {en, zh} object, because the reader's
 * language is not known at write time.
 */
export interface AppNotification {
  id: string;
  profile_id: string;
  kind: NotificationKind;
  payload: {
    actor_id?: string;
    actor_name?: string;
    listing_id?: string;
    listing_title?: Translatable;
    match_id?: string;
  };
  read_at: string | null;
  created_at: string;
}
