import { config } from "../config.js";

export type LinkedUser = {
  user_id: number;
  display_name: string;
  league_username: string;
  game_name: string;
  tag_line: string;
};

export type ConquerorNotifyPayload = {
  gameName: string;
  tagLine: string;
  matchId: string;
  placement: number;
  comp: string;
  gameMode: "normal" | "ranked" | "double_up";
  url?: string;
  lpChange?: number;
  ratedTier?: string;
  ratedDivision?: string;
  ratedRating?: number;
  currentRank?: string;
};

export type LinkedUsersResponse = {
  users: LinkedUser[];
};

async function meepsFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${config.meepsApiUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Conqueror-Secret": config.webhookSecret,
    ...(options.headers as Record<string, string>),
  };
  return fetch(url, { ...options, headers });
}

export async function getLinkedUsers(): Promise<LinkedUser[]> {
  const res = await meepsFetch("/api/conqueror-linked-users");
  if (!res.ok) {
    throw new Error(`Meeps linked-users failed: ${res.status} ${await res.text()}`);
  }
  const data: LinkedUsersResponse = await res.json();
  return data.users ?? [];
}

export async function postNotify(payload: ConquerorNotifyPayload): Promise<void> {
  const res = await meepsFetch("/api/conqueror-notify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Meeps notify failed: ${res.status} ${await res.text()}`);
  }
}
