/* eslint-disable no-console */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function toJsonBody(data) {
  if (data == null) return undefined;
  return JSON.stringify(data);
}

function splitSetCookieHeader(raw) {
  if (!raw) return [];
  return String(raw).split(/,(?=[^;]+?=)/g);
}

function getSetCookies(headers) {
  if (!headers) return [];

  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  return splitSetCookieHeader(raw);
}

function buildUrl(baseURL, path, params) {
  const url = new URL(path, baseURL);
  const entries = Object.entries(params || {});
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function httpRequest(baseURL, config) {
  const url = buildUrl(baseURL, config.url, config.params);
  const headers = { ...(config.headers || {}) };
  let body;

  if (config.data !== undefined) {
    body = toJsonBody(config.data);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(url, {
    method: config.method || "GET",
    headers,
    body,
  });

  const contentType = response.headers.get("content-type") || "";
  let parsedBody = null;
  if (contentType.includes("application/json")) {
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = null;
    }
  } else {
    try {
      parsedBody = await response.text();
    } catch {
      parsedBody = null;
    }
  }

  return {
    status: response.status,
    data: parsedBody,
    headers: response.headers,
  };
}

function createSessionClient(baseURL) {
  const cookieJar = new Map();

  function ingestSetCookies(setCookieHeaders) {
    const list = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : setCookieHeaders
        ? [setCookieHeaders]
        : [];

    for (const raw of list) {
      const firstPair = String(raw).split(";")[0];
      const idx = firstPair.indexOf("=");
      if (idx <= 0) continue;
      const key = firstPair.slice(0, idx).trim();
      const value = firstPair.slice(idx + 1).trim();
      if (!key) continue;
      cookieJar.set(key, value);
    }
  }

  function cookieHeader() {
    return Array.from(cookieJar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  async function request(config) {
    const headers = { ...(config.headers || {}) };
    const cookie = cookieHeader();
    if (cookie) {
      headers.Cookie = cookie;
    }

    const res = await httpRequest(baseURL, { ...config, headers });
    ingestSetCookies(getSetCookies(res.headers));
    return res;
  }

  return { request };
}

function failWithResponse(prefix, res) {
  const body = (() => {
    try {
      return JSON.stringify(res?.data);
    } catch {
      return String(res?.data);
    }
  })();
  throw new Error(`${prefix} | status=${res?.status} | body=${body}`);
}

async function login(client, identifier, password, label) {
  const res = await client.request({
    method: "POST",
    url: "/api/auth/login",
    data: { identifier, password, rememberMe: false },
  });

  if (res.status !== 200 || res.data?.error) {
    failWithResponse(`${label} login failed`, res);
  }
}

async function getUserByEmail(adminClient, email) {
  const res = await adminClient.request({
    method: "GET",
    url: "/api/auth/users",
  });

  if (res.status !== 200 || !Array.isArray(res.data)) {
    failWithResponse("Failed to fetch /api/auth/users", res);
  }

  const match = res.data.find(
    (u) => String(u?.email || "").toLowerCase() === email,
  );
  if (!match) {
    throw new Error(`Target user ${email} was not found in /api/auth/users`);
  }
  return match;
}

async function unsuspendUser(adminClient, email, strict = false) {
  const res = await adminClient.request({
    method: "PUT",
    url: "/api/user/unsuspend-user",
    data: { email },
  });

  if (res.status === 200) return;

  const msg = String(res.data?.error || "").toLowerCase();
  if (!strict && (res.status === 404 || msg.includes("not suspended"))) {
    return;
  }

  failWithResponse(`Failed to unsuspend user ${email}`, res);
}

async function suspendUser(adminClient, email) {
  const res = await adminClient.request({
    method: "PUT",
    url: "/api/user/suspend-user",
    data: {
      email,
      amount: 1,
      unit: "day",
      reason: "E2E suspended flow test",
    },
  });

  if (res.status !== 200 || res.data?.error) {
    failWithResponse(`Failed to suspend user ${email}`, res);
  }
}

async function assertSuspendedLoginResponse(baseURL, identifier, password) {
  const res = await httpRequest(baseURL, {
    method: "POST",
    url: "/api/auth/login",
    data: { identifier, password, rememberMe: false },
  });

  if (res.status !== 403 || res.data?.code !== "ACCOUNT_SUSPENDED") {
    failWithResponse(
      "Expected ACCOUNT_SUSPENDED response to drive frontend redirect",
      res,
    );
  }

  if (!Object.prototype.hasOwnProperty.call(res.data || {}, "email")) {
    failWithResponse("Suspension response is missing `email` field", res);
  }
}

async function submitSuspensionAppeal(baseURL, email) {
  const res = await httpRequest(baseURL, {
    method: "POST",
    url: "/api/report/make-report",
    data: {
      email,
      category: "Suspension Appeal",
      priority: "High",
      specific_issue: "Suspension Appeal",
      description: "Automated E2E test appeal submission",
      type: "Suspension Appeal",
      metadata: { source: "scripts/e2e-suspended-flow.js" },
    },
  });

  if (res.status !== 200 || !res.data?.ticket) {
    failWithResponse("Failed to submit suspension appeal", res);
  }

  return String(res.data.ticket?.ticket_id || "");
}

async function waitForAppealLog(adminClient, userId, expectedTicketId) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const res = await adminClient.request({
      method: "GET",
      url: "/api/activity-logs",
      params: {
        userId: String(userId),
        action: "SUSPENSION_APPEAL_SUBMITTED",
        limit: 25,
        offset: 0,
      },
    });

    if (res.status !== 200) {
      failWithResponse("Failed to read /api/activity-logs", res);
    }

    const rows = Array.isArray(res.data?.rows) ? res.data.rows : [];
    const hit = rows.find((row) => {
      const meta = row?.metadata || {};
      if (!expectedTicketId) return true;
      return String(meta.ticketId || "") === expectedTicketId;
    });

    if (hit) return hit;
    await sleep(1000);
  }

  throw new Error(
    "SUSPENSION_APPEAL_SUBMITTED log was not found within retry window",
  );
}

async function main() {
  const baseURL = normalizeBaseUrl(
    process.env.E2E_BASE_URL || "http://localhost:3030",
  );
  const adminEmail = String(process.env.E2E_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const adminPassword = String(process.env.E2E_ADMIN_PASSWORD || "");
  const userEmail = String(process.env.E2E_USER_EMAIL || "")
    .trim()
    .toLowerCase();
  const userPassword = String(process.env.E2E_USER_PASSWORD || "");

  if (!adminEmail || !adminPassword || !userEmail || !userPassword) {
    throw new Error(
      "Missing required env vars: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_USER_EMAIL, E2E_USER_PASSWORD",
    );
  }

  if (adminEmail === userEmail) {
    throw new Error("E2E_ADMIN_EMAIL and E2E_USER_EMAIL must be different users");
  }

  console.log(`[e2e] Base URL: ${baseURL}`);
  console.log(`[e2e] Admin: ${adminEmail}`);
  console.log(`[e2e] Target user: ${userEmail}`);

  const adminClient = createSessionClient(baseURL);
  let cleanupNeeded = false;

  try {
    await login(adminClient, adminEmail, adminPassword, "Admin");
    console.log("[e2e] Admin login OK");

    await unsuspendUser(adminClient, userEmail, false);
    console.log("[e2e] Ensured target user starts as active");

    const targetUser = await getUserByEmail(adminClient, userEmail);
    console.log(`[e2e] Target user id: ${targetUser.id}`);

    await suspendUser(adminClient, userEmail);
    cleanupNeeded = true;
    console.log("[e2e] Target user suspended");

    await assertSuspendedLoginResponse(baseURL, userEmail, userPassword);
    console.log("[e2e] Suspended login response assertions passed");

    const ticketId = await submitSuspensionAppeal(baseURL, userEmail);
    console.log(`[e2e] Suspension appeal submitted (ticket: ${ticketId})`);

    const logRow = await waitForAppealLog(adminClient, targetUser.id, ticketId);
    console.log(`[e2e] Appeal log found: ${logRow.id}`);

    console.log("[e2e] PASS");
  } finally {
    if (cleanupNeeded) {
      try {
        await unsuspendUser(adminClient, userEmail, false);
        console.log("[e2e] Cleanup: target user unsuspended");
      } catch (cleanupErr) {
        console.error("[e2e] Cleanup warning:", cleanupErr.message);
      }
    }
  }
}

main().catch((err) => {
  console.error("[e2e] FAIL:", err.message);
  process.exitCode = 1;
});
