/**
 * @description Notion REST API 응답 타입 (필요 필드만).
 */

export interface NotionOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner?: { type: string; user?: { id?: string } };
  token_type?: string;
  expires_in?: number;
}

export interface NotionRichText {
  plain_text: string;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

export interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
}

export interface NotionWebhookEvent {
  type: string;
  verification_token?: string;
  entity?: { id: string; type: string };
  workspace_id?: string;
  integration_id?: string;
  data?: Record<string, unknown>;
}
