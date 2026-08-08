/**
 * Qoder API constants, ported from 9router/open-sse/shared/qoder/constants.js.
 *
 * Endpoint set used by kcgrouter:
 *   openapi.qoder.sh   - PAT→job-token exchange + userinfo
 *   api3.qoder.sh      - inference (chat) + model list, requires COSY signing
 *   api2.qoder.sh      - job-token (jt-...) inference + model list
 *
 * Device flow / token refresh endpoints exist in 9router but are not ported
 * (kcgrouter has no Qoder OAuth flow — connections use PATs only).
 */

export const QODER_OPENAPI_BASE = "https://openapi.qoder.sh";
export const QODER_CHAT_BASE = "https://api3.qoder.sh";
// Job-token (jt-...) traffic is rejected by api3 with "Login expired" (403);
// the official qodercli serves it from api2 instead.
export const QODER_CHAT_BASE_ALT = "https://api2.qoder.sh";

export const QODER_USERINFO_URL = `${QODER_OPENAPI_BASE}/api/v1/userinfo`;
// Account quota usage (plain Bearer job-token GET).
export const QODER_QUOTA_USAGE_URL = `${QODER_OPENAPI_BASE}/api/v2/quota/usage`;
// Account plan label + request quota (same Bearer auth as above).
export const QODER_USER_STATUS_URL = `${QODER_OPENAPI_BASE}/api/v3/user/status`;

// PAT (Personal Access Token, pt-...) → short-lived job token (jt-...) exchange.
// PATs cannot sign COSY requests directly — they must be exchanged first.
// This endpoint is NOT COSY-signed (plain JSON POST).
export const QODER_JOB_TOKEN_EXCHANGE_URL = `${QODER_OPENAPI_BASE}/api/v1/jobToken/exchange`;

// Inference endpoints (under /algo on api3.qoder.sh, all COSY-signed)
export const QODER_CHAT_SIG_PATH =
  "/api/v2/service/pro/sse/agent_chat_generation";
export const QODER_CHAT_URL = `${QODER_CHAT_BASE}/algo${QODER_CHAT_SIG_PATH}?FetchKeys=llm_model_result&AgentId=agent_common`;
export const QODER_CHAT_URL_ENCODED = `${QODER_CHAT_URL}&Encode=1`;
export const QODER_MODEL_LIST_URL = `${QODER_CHAT_BASE}/algo/api/v2/model/list`;

// COSY header constants. These are not arbitrary — the upstream signature
// validation matches them against the values used at signing time.
export const QODER_IDE_VERSION = "1.0.0";
export const QODER_CLIENT_TYPE = "5";
export const QODER_DATA_POLICY = "disagree";
export const QODER_LOGIN_VERSION = "v2";
export const QODER_MACHINE_OS = "x86_64_windows";
export const QODER_MACHINE_TYPE = "5";

// Canonical model identifiers. Identity map — keep as a map so callers can
// cheaply test "is this a known qoder model?" before sending the request.
export const QODER_MODEL_MAP: Record<string, string> = {
  // Tier models
  auto: "auto",
  ultimate: "ultimate",
  performance: "performance",
  efficient: "efficient",
  lite: "lite",
  // Frontier models
  qmodel: "qmodel",
  qmodel_latest: "qmodel_latest",
  qmodel_preview: "qmodel_preview",
  dmodel: "dmodel",
  dfmodel: "dfmodel",
  gm51model: "gm51model",
  kmodel: "kmodel",
  kmodel_latest: "kmodel_latest",
  mmodel: "mmodel",
};

// RSA public key for COSY encryption (extracted from Qoder IDE v0.9).
// Matches the CLIProxyAPIPlus branch and live qodercli traffic.
export const QODER_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;
