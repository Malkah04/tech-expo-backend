function isTruthy(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function getCookieDomain() {
  let domain = String(process.env.COOKIE_DOMAIN || "").trim();
  if (!domain) return undefined;
  if (!domain.startsWith(".")) domain = "." + domain;
  return domain;
}

function getSameSite() {
  const raw = String(process.env.COOKIE_SAMESITE || "")
    .trim()
    .toLowerCase();
  if (raw === "lax" || raw === "strict" || raw === "none") return raw;

  // Default to Lax for broad browser compatibility (Brave/Safari).
  // If you need cross-site XHR cookies, explicitly set COOKIE_SAMESITE=none.
  // Note: CHIPS (Partitioned) requires SameSite=None.
  return "lax";
}

function isRequestSecure(req) {
  if (!req) return process.env.NODE_ENV === "production";
  if (req.secure) return true;
  const xfp = req.headers?.["x-forwarded-proto"];
  if (typeof xfp === "string" && xfp.toLowerCase() === "https") return true;
  return process.env.NODE_ENV === "production";
}

function getSecure(req) {
  if (process.env.COOKIE_SECURE != null) {
    return isTruthy(process.env.COOKIE_SECURE);
  }
  return isRequestSecure(req);
}

function shouldPartitionCookies({ secure, sameSite }) {
  if (!isTruthy(process.env.COOKIE_PARTITIONED)) return false;
  // CHIPS requires Secure + SameSite=None.
  return secure === true && String(sameSite).toLowerCase() === "none";
}

function applyPartitionedAttributeToSetCookieHeader(res, cookieNames) {
  const header = res.getHeader("Set-Cookie");
  if (!header) return;

  const names = Array.isArray(cookieNames) ? cookieNames.filter(Boolean) : [];

  const asArray = Array.isArray(header) ? header : [header];
  const patched = asArray.map((value) => {
    if (typeof value !== "string") return value;
    if (names.length) {
      const matches = names.some((name) =>
        value.toLowerCase().startsWith(`${String(name).toLowerCase()}=`),
      );
      if (!matches) return value;
    }
    if (/;\s*Partitioned\b/i.test(value)) return value;
    return `${value}; Partitioned`;
  });

  res.setHeader("Set-Cookie", patched);
}

function buildCookieOptions(req, maxAgeMs, { httpOnly }) {
  const isProduction = process.env.NODE_ENV === "production";

  const secure = isProduction ? true : process.env.COOKIE_SECURE === "true";

  const sameSite = isProduction ? "none" : (process.env.COOKIE_SAMESITE || "lax");

  const shouldPartition = isProduction && sameSite === "none" && secure;

  const domain = isProduction ? undefined : (process.env.COOKIE_DOMAIN || undefined);

  const opts = {
    httpOnly: Boolean(httpOnly),
    secure,
    sameSite,
    path: "/",
    maxAge: Math.max(0, Number(maxAgeMs || 0)),
  };

  if (domain) opts.domain = domain;

  return { opts, secure, sameSite, shouldPartition };
}

function setAuthCookies(res, req, session) {
  if (!session) return;
  const expiresInMs = session.expires_at
    ? new Date(session.expires_at).getTime() - Date.now()
    : 24 * 60 * 60 * 1000;

  const sessionCfg = buildCookieOptions(req, expiresInMs, { httpOnly: true });
  console.log("[Auth Shield] Setting sessionToken cookie", {
    secure: sessionCfg.secure,
    sameSite: sessionCfg.sameSite,
    partitioned: sessionCfg.shouldPartition,
    httpOnly: true,
    domain: process.env.COOKIE_DOMAIN || "not set",
    path: "/",
  });
  res.cookie("sessionToken", session.session_token, sessionCfg.opts);
  if (sessionCfg.shouldPartition) {
    addPartitionedToCookie(res, "sessionToken");
  }

  const csrfCfg = buildCookieOptions(req, expiresInMs, { httpOnly: false });
  res.cookie("csrfToken", session.csrf_token, csrfCfg.opts);
  if (csrfCfg.shouldPartition) {
    addPartitionedToCookie(res, "csrfToken");
  }

  const hintCfg = buildCookieOptions(req, expiresInMs, { httpOnly: false });
  res.cookie("te_is_authed", "true", hintCfg.opts);
  if (hintCfg.shouldPartition) {
    addPartitionedToCookie(res, "te_is_authed");
  }
  res.cookie("te_auth_status", "authorized", hintCfg.opts);
  if (hintCfg.shouldPartition) {
    addPartitionedToCookie(res, "te_auth_status");
  }
}

function addPartitionedToCookie(res, cookieName) {
  const header = res.getHeader("Set-Cookie");
  if (!header) return;
  
  const asArray = Array.isArray(header) ? header : [header];
  const patched = asArray.map((value) => {
    if (typeof value !== "string") return value;
    if (value.toLowerCase().startsWith(`${cookieName.toLowerCase()}=`)) {
      if (!/;\s*Partitioned\b/i.test(value)) {
        return `${value}; Partitioned`;
      }
    }
    return value;
  });
  
  res.setHeader("Set-Cookie", patched);
}

function clearAuthCookies(res, req) {
  const sessionCfg = buildCookieOptions(req, 0, { httpOnly: true });
  res.clearCookie("sessionToken", sessionCfg.opts);

  const csrfCfg = buildCookieOptions(req, 0, { httpOnly: false });
  res.clearCookie("csrfToken", csrfCfg.opts);

  // Clear hint cookies
  const hintCfg = buildCookieOptions(req, 0, { httpOnly: false });
  res.clearCookie("te_is_authed", hintCfg.opts);
  res.clearCookie("te_auth_status", hintCfg.opts);
  res.clearCookie("te_email_verified", hintCfg.opts);
  res.clearCookie("te_profile_completed", hintCfg.opts);
  res.clearCookie("te_role", hintCfg.opts);
  res.clearCookie("te_suspended", hintCfg.opts);
}

function sendOAuthBridge(res, redirectUrl) {
  const target = String(redirectUrl || "/");
  const targetAttr = target
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Referrer-Policy", "no-referrer");
  return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing you in...</title>
  </head>
  <body>
    <p>Completing login...</p>
    <script>
      (function () {
        var url = ${JSON.stringify(target)};
        window.location.replace(url);
      })();
    </script>
    <noscript><a href="${targetAttr}">Continue</a></noscript>
  </body>
</html>`);
}

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  sendOAuthBridge,
};
