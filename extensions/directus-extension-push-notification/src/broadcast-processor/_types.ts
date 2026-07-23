export type NotificationChannel = "push" | "email" | "sms" | "in_app";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type BroadcastStatus = "draft" | "processing" | "completed" | "failed";
export type BroadcastTargetType = "all" | "roles" | "users" | "filter";

export interface BroadcastTranslation {
  languages_code: string;
  title: string;
  body: string;
}

export interface NotificationBroadcast {
  id: string;
  title: string;
  body: string;
  target_type: BroadcastTargetType;
  target_roles?: Array<{ directus_roles_id: string } | string>;
  target_users?: Array<{ directus_users_id: string } | string>;
  target_filter?: Record<string, unknown>;
  channel: NotificationChannel;
  priority: NotificationPriority;
  icon?: string;
  icon_url?: string;
  action_url?: string;
  data?: Record<string, unknown>;
  status: BroadcastStatus;
  total_users?: number;
  total_created?: number;
  total_failed?: number;
  date_expires?: string;
  translations?: BroadcastTranslation[];
}

export interface TargetUser {
  id: string;
  push_enabled: boolean;
  language: string | null;
}

export interface BroadcastTarget {
  target_type: BroadcastTargetType;
  target_roles?: Array<{ directus_roles_id: string } | string>;
  target_users?: Array<{ directus_users_id: string } | string>;
  target_filter?: Record<string, unknown>;
}
