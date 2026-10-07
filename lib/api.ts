import axios from "axios";

export const apiClient = axios.create({ baseURL: "" });

export function setAuthToken(token: string | null): void {
  if (token) {
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common["Authorization"];
  }
}

let refreshFn: (() => Promise<string | null>) | null = null;

export function setRefreshFunction(fn: () => Promise<string | null>): void {
  refreshFn = fn;
}

let logoutFn: (() => void) | null = null;

export function setLogoutFunction(fn: () => void): void {
  logoutFn = fn;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (original.url?.startsWith("/api/auth/")) return Promise.reject(error);
    if (error.response?.status === 401 && !original._retry && refreshFn) {
      original._retry = true;
      const newToken = await refreshFn();
      if (newToken) {
        original.headers["Authorization"] = `Bearer ${newToken}`;
        return apiClient(original);
      }
      logoutFn?.();
    }
    return Promise.reject(error);
  },
);

// ─── Auth API ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  username?: string;
  is_superuser: boolean;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: AuthUser;
  /** Set when the login used an admin-issued temporary password — the user
   *  must change it via changePassword() before normal use. */
  must_change_password?: boolean;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>("/api/auth/login", { email, password });
  return data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<TokenResponse> {
  // Server revokes every other session and returns a fresh token pair the
  // caller must adopt. 401 here means wrong current password (the /api/auth/*
  // interceptor exemption keeps it from triggering a token refresh).
  const { data } = await apiClient.post<TokenResponse>("/api/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

export async function serverLogout(refreshToken: string): Promise<void> {
  // Revokes this session's refresh-token family server-side. Callers treat it
  // as best-effort (fire-and-forget) — local logout never depends on it.
  await apiClient.post("/api/auth/logout", { refresh_token: refreshToken });
}

interface RegisterResponse extends TokenResponse {
  household_id: string;
}

export async function register(
  email: string,
  password: string,
  username?: string,
  inviteCode?: string,
): Promise<RegisterResponse> {
  const { data } = await apiClient.post<RegisterResponse>("/api/auth/register", {
    email,
    password,
    ...(username ? { username } : {}),
    ...(inviteCode ? { invite_code: inviteCode } : {}),
  });
  return data;
}

export async function refreshToken(token: string): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>("/api/auth/refresh", {
    refresh_token: token,
  });
  return data;
}

// ─── Chat Types ────────────────────────────────────────────────────────────

export interface ChatAction {
  button_text: string;
  button_action: string;
  button_type: "primary" | "secondary" | "destructive";
  button_icon?: string;
  completion_message?: string;
}

export interface ChatActionContext {
  command_name: string;
  context: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  timestamp: number;
  actions?: ChatAction[];
  actionContext?: ChatActionContext;
  actionPreview?: string;
}

export interface ChatStreamEvent {
  type: "status" | "delta" | "done" | "error";
  text?: string;
  message?: string;
  conversation_id?: string;
  full_text?: string;
  stop_reason?: string;
  actions?: ChatAction[];
  action_context?: ChatActionContext;
  action_preview?: string;
}

export interface NodeToolsResponse {
  client_tools: Record<string, unknown>[];
  available_commands: Record<string, unknown>[];
  cached: boolean;
}

// ─── Chat API ──────────────────────────────────────────────────────────────

function parseSSEChunk(text: string): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data: ")) continue;
    try {
      events.push(JSON.parse(trimmed.slice(6)) as ChatStreamEvent);
    } catch {
      // Incomplete JSON — skip
    }
  }
  return events;
}

export async function sendChatMessage(
  payload: {
    message: string;
    node_id: string;
    household_id: string;
    conversation_id?: string;
    timezone?: string;
    client_tools?: Record<string, unknown>[];
    available_commands?: Record<string, unknown>[];
  },
  accessToken: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/cc/mobile/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (res.status === 401) throw new Error("Session expired — please log in again.");
  if (!res.ok) throw new Error(`Chat failed (${res.status})`);
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const event of parseSSEChunk(chunk)) {
      onEvent(event);
    }
  }
}

export async function warmupChat(
  nodeId: string,
  householdId: string,
  _accessToken: string,
  clientTools?: Record<string, unknown>[],
  availableCommands?: Record<string, unknown>[],
  timezone?: string,
): Promise<{ conversation_id: string; tools_loaded: number }> {
  const { data } = await apiClient.post<{ conversation_id: string; tools_loaded: number }>(
    "/api/cc/mobile/chat/warmup",
    {
      node_id: nodeId,
      household_id: householdId,
      timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(clientTools ? { client_tools: clientTools } : {}),
      ...(availableCommands ? { available_commands: availableCommands } : {}),
    },
  );
  return data;
}

export async function fetchNodeTools(nodeId: string): Promise<NodeToolsResponse> {
  const { data } = await apiClient.get<NodeToolsResponse>(
    `/api/cc/mobile/nodes/${nodeId}/tools`,
  );
  return data;
}

export interface NodeInfo {
  node_id: string;
  room: string | null;
  user: string | null;
  voice_mode: string;
  household_id: string | null;
}

export async function fetchNodes(accessToken: string): Promise<NodeInfo[]> {
  const res = await fetch("/api/cc/admin/nodes", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export interface Household {
  id: string;
  name: string;
  role: string;
}

export async function fetchHouseholds(accessToken: string): Promise<Household[]> {
  const res = await fetch("/api/households", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  return res.json();
}

// ─── Inbox API ────────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;
  user_id: number | null;
  household_id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  source_service: string;
  metadata: Record<string, unknown> | null;
  content_format: "markdown" | "html" | "plain" | null;
  is_read: boolean;
  created_at: string;
}

export async function listInboxItems(params?: {
  category?: string;
  is_read?: boolean;
  limit?: number;
}): Promise<InboxItem[]> {
  const { data } = await apiClient.get<InboxItem[]>("/api/inbox", { params });
  return data;
}

export async function getInboxItem(itemId: string): Promise<InboxItem> {
  const { data } = await apiClient.get<InboxItem>(`/api/inbox/${itemId}`);
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>("/api/inbox/unread-count");
  return data.count;
}

export async function markItemRead(itemId: string): Promise<void> {
  await apiClient.patch(`/api/inbox/${itemId}/read`, {});
}

export async function deleteInboxItem(itemId: string): Promise<void> {
  await apiClient.delete(`/api/inbox/${itemId}`);
}

export async function bulkMarkItemsRead(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data } = await apiClient.post<{ updated: number }>(
    "/api/inbox/bulk/read",
    { ids },
  );
  return data.updated;
}

export async function bulkDeleteInboxItems(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data } = await apiClient.post<{ deleted: number }>(
    "/api/inbox/bulk/delete",
    { ids },
  );
  return data.deleted;
}

// ─── Devices API ──────────────────────────────────────────────────────────

export interface DeviceListItem {
  id: string;
  entity_id: string;
  name: string;
  domain: string;
  source: string;
  room_id: string | null;
  room_name: string | null;
  state: string | null;
}

export interface Room {
  id: string;
  name: string;
  household_id: string;
}

export async function listDevices(householdId: string): Promise<DeviceListItem[]> {
  const { data } = await apiClient.get<DeviceListItem[]>(
    `/api/cc/households/${householdId}/devices`,
  );
  return data;
}

export async function listRooms(householdId: string): Promise<Room[]> {
  const { data } = await apiClient.get<Room[]>(
    `/api/cc/households/${householdId}/rooms`,
  );
  return data;
}

export async function controlDevice(
  householdId: string,
  deviceId: string,
  action: Record<string, unknown>,
): Promise<void> {
  await apiClient.post(
    `/api/cc/households/${householdId}/devices/${deviceId}/control`,
    action,
  );
}

export async function getDeviceState(
  householdId: string,
  deviceId: string,
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.get(
    `/api/cc/households/${householdId}/devices/${deviceId}/state`,
  );
  return data;
}

// ─── Smart Home Config API ────────────────────────────────────────────────

export interface SmartHomeConfig {
  device_manager: string;
  primary_node_id: string;
  use_external_devices: boolean;
  nodes: { node_id: string; room: string | null; online: boolean; last_seen: string | null }[];
}

export async function getSmartHomeConfig(householdId: string): Promise<SmartHomeConfig> {
  const { data } = await apiClient.get<SmartHomeConfig>(
    `/api/cc/households/${householdId}/smart-home/config`,
  );
  return data;
}

export async function updateSmartHomeConfig(
  householdId: string,
  updates: { device_manager?: string; primary_node_id?: string; use_external_devices?: boolean },
): Promise<SmartHomeConfig> {
  const { data } = await apiClient.put<SmartHomeConfig>(
    `/api/cc/households/${householdId}/smart-home/config`,
    updates,
  );
  return data;
}

// ─── External Devices API ────────────────────────────────────────────────

export interface ExternalDeviceItem {
  name: string;
  domain: string;
  entity_id: string;
  is_controllable: boolean;
  manufacturer: string | null;
  model: string | null;
  source: string;
  area: string | null;
  state: string | null;
}

export interface DeviceListPollResponse {
  status: "pending" | "completed" | "failed";
  request_id: string;
  manager_name: string | null;
  devices: ExternalDeviceItem[] | null;
  device_count: number | null;
  error_message: string | null;
}

export async function requestDeviceList(nodeId: string): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post<{ id: string; status: string }>(
    `/api/cc/nodes/${nodeId}/device-list/request`,
  );
  return data;
}

export async function pollDeviceList(
  nodeId: string,
  requestId: string,
): Promise<DeviceListPollResponse> {
  const { data } = await apiClient.get<DeviceListPollResponse>(
    `/api/cc/nodes/${nodeId}/device-list/${requestId}`,
  );
  return data;
}

// ─── Invite API ──────────────────────────────────────────────────────────

export interface InviteCode {
  id: number;
  household_id: string;
  code: string;
  default_role: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

export interface InviteValidation {
  valid: boolean;
  household_name: string | null;
}

export async function createInvite(
  householdId: string,
  opts: { default_role?: string; max_uses?: number | null; expires_in_days?: number } = {},
): Promise<InviteCode> {
  const { data } = await apiClient.post<InviteCode>(
    `/api/households/${householdId}/invites`,
    { default_role: "member", expires_in_days: 7, ...opts },
  );
  return data;
}

export async function listInvites(householdId: string): Promise<InviteCode[]> {
  const { data } = await apiClient.get<InviteCode[]>(`/api/households/${householdId}/invites`);
  return data;
}

export async function revokeInvite(householdId: string, inviteId: number): Promise<void> {
  await apiClient.delete(`/api/households/${householdId}/invites/${inviteId}`);
}

export async function validateInviteCode(code: string): Promise<InviteValidation> {
  const { data } = await apiClient.get<InviteValidation>(`/api/invites/${code}/validate`);
  return data;
}

export async function joinHousehold(inviteCode: string): Promise<{ household_id: string; household_name: string; role: string }> {
  const { data } = await apiClient.post(`/api/households/join`, { invite_code: inviteCode });
  return data;
}

export async function switchHousehold(householdId: string): Promise<{ access_token: string; household_id: string }> {
  const { data } = await apiClient.post(`/api/auth/switch-household`, { household_id: householdId });
  return data;
}

export interface HouseholdMember {
  user_id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

export async function listMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data } = await apiClient.get<HouseholdMember[]>(`/api/households/${householdId}/members`);
  return data;
}

export async function updateMemberRole(householdId: string, userId: number, role: string): Promise<HouseholdMember> {
  const { data } = await apiClient.patch<HouseholdMember>(`/api/households/${householdId}/members/${userId}`, { role });
  return data;
}

export async function removeMember(householdId: string, userId: number): Promise<void> {
  await apiClient.delete(`/api/households/${householdId}/members/${userId}`);
}

export async function leaveHousehold(householdId: string): Promise<{ left: boolean; household_id: string; household_deleted: boolean }> {
  const resp = await apiClient.post(`/api/households/${householdId}/leave`);
  return resp.data;
}

export async function createHousehold(name: string): Promise<Household> {
  const { data } = await apiClient.post<Household>(`/api/households`, { name });
  return data;
}

export async function updateHouseholdName(householdId: string, name: string): Promise<Household> {
  const { data } = await apiClient.patch<Household>(`/api/households/${householdId}`, { name });
  return data;
}

// ─── Pantry API ──────────────────────────────────────────────────────────

export interface PantryCommand {
  command_name: string;
  display_name: string;
  description: string;
  author: string;
  latest_version: string;
  categories: string[];
  install_count: number;
  danger_rating: number;
  verified: boolean;
  icon_url: string | null;
  package_type: "command" | "bundle";
  components: string[];
}

export interface PantryBrowseResponse {
  commands: PantryCommand[];
  total: number;
  page: number;
  per_page: number;
}

export interface PantryCategory {
  name: string;
  count: number;
}

export interface PantryAuthor {
  github: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PantryCommandDetail extends Omit<PantryCommand, "author"> {
  github_repo_url: string;
  author: string | PantryAuthor;
  platforms: string[];
  license: string | null;
  security_report: {
    summary: string;
    danger_score: number;
    concerns: string[];
    recommendation: string;
  } | null;
  review_count: number;
  avg_rating: number | null;
  created_at: string;
  updated_at: string;
}

export async function browsePackages(params: {
  q?: string;
  category?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}): Promise<PantryBrowseResponse> {
  const { data } = await apiClient.get<PantryBrowseResponse>("/api/pantry/commands", { params });
  return data;
}

export async function getCategories(): Promise<PantryCategory[]> {
  const { data } = await apiClient.get<{ categories: PantryCategory[] }>("/api/pantry/categories");
  return data.categories;
}

export async function getPackageDetail(commandName: string): Promise<PantryCommandDetail> {
  const { data } = await apiClient.get<PantryCommandDetail>(`/api/pantry/commands/${commandName}`);
  return data;
}

// ─── Actions API ──────────────────────────────────────────────────────────

export async function sendNodeAction(
  nodeId: string,
  payload: {
    command_name: string;
    action_name: string;
    context: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post(
    `/api/cc/nodes/${nodeId}/actions`,
    payload,
  );
  return data;
}
