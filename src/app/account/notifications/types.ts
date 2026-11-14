export type PreferenceRow = {
  event: string;
  domain: "poolx" | "auction";
  label: string;
  description: string;
  audience: "PARTICIPANT" | "SUBSCRIBER";
  essential: boolean;
  inApp: boolean;
  email: boolean;
};

export type InboxItem = {
  id: string;
  event: string;
  domain: "poolx" | "auction";
  data: Record<string, unknown>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type Inbox = { total: number; unread: number; items: InboxItem[] };
