/// <reference lib="webworker" />

export interface PushNotificationData {
  title?: string;
  body?: string;
  icon_url?: string;
  action_url?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  notification_id?: string; // Renamed from user_notification_id
  delivery_id?: string; // Renamed from push_delivery_id
}

export interface Logger {
  error: (message: string, error?: Error) => void;
  info: (message: string) => void;
}

export interface DeliveryStatusUpdater {
  updateDeliveryStatus: (
    deliveryId: string,
    status: "delivered" | "read",
  ) => Promise<void>;
}

export interface PushEventHandler {
  handlePush: (event: PushEvent) => Promise<void>;
  handleNotificationClick: (event: NotificationEvent) => Promise<void>;
}

export type DeliveryStatus = "delivered" | "read";

export interface LogMessage {
  type: "SW_LOG";
  level: string;
  message: string;
  error?: {
    message: string;
    stack?: string;
  };
  timestamp: string;
}
