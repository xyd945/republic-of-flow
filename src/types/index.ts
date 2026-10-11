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
  /** null until the member actually signs in — an invitation alone earns no
      number. Allocated by claim_membership(); see migration 00011. */
  founder_no: number | null;
  /** When the founder number was taken — arriving, as the Archive tells it.
      Stamped by the database (00015); null until then. */
  joined_at: string | null;
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
  /** Up to three storage paths in listing-images; the first is the cover. */
  images: string[];
  /** Whole FLOW, 1 to 1,000; null is free. On an Offer the taker pays it,
      on a Wanted the poster does (00016). */
  price: number | null;
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
  /** The listing's price when the hand went up; what an accept will hold. */
  price: number | null;
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
  /** Only on a paid match, and only for its two people and curators. */
  payment?: MatchPayment;
}

/** What a paid match owes and where that stands (00016). */
export interface MatchPayment {
  match_id: string;
  payer_profile_id: string;
  payee_profile_id: string;
  amount: number;
  status: 'held' | 'paid' | 'refunded';
  held_at: string;
  settled_at: string | null;
  settled_by: 'payer' | 'curator' | null;
}

/** A wallet: a founder's, or for curators the Treasury and On hold too. */
export interface Account {
  id: string;
  kind: 'member' | 'treasury' | 'escrow';
  profile_id: string | null;
  balance: number;
}

/** One line of your ledger, with the event it belongs to. */
export interface LedgerLine {
  id: number;
  amount: number;
  created_at: string;
  transaction: { kind: 'welcome' | 'hold' | 'pay' | 'refund'; memo: string; match_id: string | null } | null;
}

/** The Curator Desk's view of the Treasury: ledger_audit(). */
export interface LedgerAudit {
  issued: number;
  in_wallets: number;
  on_hold: number;
  balanced: boolean;
}

/** A curator's note in the Archive (00015). Plain text, as typed. */
export interface ArchiveNote {
  id: string;
  author_profile_id: string | null;
  /** YYYY-MM-DD: the day it happened, which may be before it was written. */
  happened_on: string;
  title: string;
  body: string;
  /** Up to three storage paths in listing-images; the first is the cover. */
  images: string[];
  created_at: string;
  updated_at: string;
}

/**
 * What archive_events() may say about the private parts of the Republic:
 * that a meeting happened, and which listing opened the Market. Never who —
 * and so never a photo, whose path carries its owner's user id.
 */
export interface ArchiveEvent {
  kind: 'meeting' | 'first_listing';
  happened_at: string;
  listing_type: 'wanted' | 'offer';
  listing_title: Translatable;
}

/** In-app notification centre (00008). */
export type NotificationKind =
  | 'interest_raised'
  | 'interest_accepted'
  | 'interest_declined'
  | 'suggestion_made'    // to the listing owner: someone was suggested for it
  | 'suggested_to_you'   // to the member: a curator put you forward
  | 'match_undone'
  | 'match_met'
  | 'payment_received';  // to the payee: payload carries amount and by_curator

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
    amount?: number;
    by_curator?: boolean;
  };
  read_at: string | null;
  created_at: string;
}
