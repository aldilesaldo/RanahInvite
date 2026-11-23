export type NavTab =
  | 'dashboard'
  | 'setup'
  | 'guests'
  | 'layout'
  | 'batch';

export interface WorkflowStatusSummary {
  setupReady: boolean;
  guestsReady: boolean;
  layoutReady: boolean;
  batchDone: boolean;
  recipientCount: number;
  generatedCount: number;
  confirmedCount: number;
  visibleOverlayCount: number;
  pageCount: 1 | 2;
  recommendedStep: Exclude<NavTab, 'dashboard'>;
  recommendedStepLabel: string;
}

export type OverlayFontFamily =
  | 'Fraunces'
  | 'Playfair Display'
  | 'Syne'
  | 'Outfit'
  | 'Plus Jakarta Sans'
  | 'DM Sans';

export type TextAlign = 'left' | 'center' | 'right';

export type OverlayFieldKey =
  | 'salutation'
  | 'recipient_name'
  | 'institution'
  | 'place_label'
  | 'qr_code'
  | 'rsvp_note'
  | `custom_text_${string}`;

export interface OverlayBlock {
  id: OverlayFieldKey;
  label: string;
  placeholder: string;
  page: 1 | 2;
  visible: boolean;
  /** Percentage 0..100 relative to page width */
  x: number;
  /** Percentage 0..100 relative to page height */
  y: number;
  /** Percentage 10..90 of page width for text wrapping or QR size */
  width: number;
  fontFamily: OverlayFontFamily;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  italic: boolean;
  align: TextAlign;
  color: string;
  locked?: boolean;
}

export interface EventMetadata {
  eventName: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
}

export interface TemplateImages {
  pageCount: 1 | 2;
  page1DataUrl: string;
  page1Width: number;
  page1Height: number;
  page2DataUrl: string | null;
  page2Width: number;
  page2Height: number;
  activeTemplateId: string;
}

export type RecipientStatus = 'ready' | 'generating' | 'generated';

export type RsvpStatus = 'pending' | 'attending' | 'represented' | 'declined';

export interface Recipient {
  id: string;
  salutation: string;
  recipientName: string;
  institution: string;
  placeLabel?: string;
  group?: string;
  invitationCode: string;
  status: RecipientStatus;
  generatedAt?: number;
  rsvpStatus?: RsvpStatus;
  rsvpAt?: number;
  rsvpRepresentative?: string;
  rsvpNote?: string;
}

export interface SavedEventRecord {
  id: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  recipients: Recipient[];
  isCompleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StudioDraftState {
  activeEventId: string;
  events: SavedEventRecord[];
  updatedAt: number;
}

export interface RsvpPayload {
  eventId: string;
  invitationCode: string;
  salutation: string;
  recipientName: string;
  institution: string;
  eventName: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
}

export interface BankSyncUpdate {
  previousKey: {
    invitationCode?: string;
    recipientName: string;
    institution: string;
    group?: string;
  };
  next: {
    salutation: string;
    recipientName: string;
    institution: string;
    placeLabel: string;
    group: string;
  };
}

