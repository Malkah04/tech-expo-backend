const bcrypt = require("bcrypt");
const { pgClient } = require("../config/db.config.pg");
const { expireAllTokensForUser } = require("../utils/session");

const ALLOWED_PROVIDERS = ["apple", "google", "github"];

function normalizeProviders(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p) return null;
      const provider = (p.provider ?? p.Provider ?? p.name ?? "").toString().toLowerCase();
      if (!provider) return null;
      return {
        ...p,
        provider,
        providerId: p.providerId ?? p.provider_id ?? p.id ?? null,
      };
    })
    .filter(Boolean);
}

function pickAllowedProvidersList(providers) {
  const set = new Set();
  for (const p of providers) {
    if (ALLOWED_PROVIDERS.includes(p.provider)) set.add(p.provider);
  }
  return Array.from(set);
}

async function fetchUserAuthState(userId) {
  const res = await pgClient.query(
    `select id, password, providers from users where id = $1 limit 1`,
    [userId],
  );
  return res.rows[0] || null;
}

const getUserStatus = async (req, res) => {
  try {
    const user = await fetchUserAuthState(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const hasPassword = !!user.password;
    return res.status(200).json({ hasPassword });
  } catch (error) {
    console.error("getUserStatus error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getAccounts = async (req, res) => {
  try {
    const user = await fetchUserAuthState(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const providers = normalizeProviders(user.providers);
    const accounts = pickAllowedProvidersList(providers);
    const hasPassword = !!user.password;

    return res.status(200).json({ accounts, hasPassword });
  } catch (error) {
    console.error("getAccounts error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const unlinkAccount = async (req, res) => {
  try {
    const provider = (req.body?.provider || "").toString().toLowerCase();
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    const user = await fetchUserAuthState(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const providers = normalizeProviders(user.providers);
    const accounts = pickAllowedProvidersList(providers);
    const hasPassword = !!user.password;

    // If it's not linked, treat as no-op success.
    if (!accounts.includes(provider)) {
      return res.status(200).json({ success: true, accounts, hasPassword });
    }

    // Safety check: don't allow unlinking last provider without a password.
    if (accounts.length === 1 && !hasPassword) {
      return res
        .status(403)
        .json({ error: "Password required to prevent account lockout" });
    }

    const updateRes = await pgClient.query(
      `
      update users
      set providers = coalesce(
        (
          select jsonb_agg(e)
          from jsonb_array_elements(coalesce(providers, '[]'::jsonb)) e
          where e->>'provider' <> $1
        ),
        '[]'::jsonb
      )
      where id = $2
      returning providers, password
      `,
      [provider, user.id],
    );

    const updated = updateRes.rows[0] || {};
    const updatedProviders = normalizeProviders(updated.providers);
    const updatedAccounts = pickAllowedProvidersList(updatedProviders);
    const updatedHasPassword = !!updated.password;

    return res.status(200).json({
      success: true,
      accounts: updatedAccounts,
      hasPassword: updatedHasPassword,
    });
  } catch (error) {
    console.error("unlinkAccount error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const updatePassword = async (req, res) => {
  try {
    const rawOld = (req.body?.oldPassword ?? "").toString();
    const rawNew = (req.body?.newPassword ?? "").toString();

    if (rawNew.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const user = await fetchUserAuthState(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const hasPassword = !!user.password;

    // Scenario A: no existing password -> allow setting directly (no oldPassword required)
    if (!hasPassword) {
      const hashedPassword = await bcrypt.hash(rawNew, 10);
      await pgClient.query(`update users set password = $1 where id = $2`, [
        hashedPassword,
        user.id,
      ]);

      await expireAllTokensForUser(user.id);

      return res
        .status(200)
        .json({ success: true, hasPassword: true });
    }

    // Scenario B: existing password -> oldPassword is strictly required
    if (!rawOld) {
      return res
        .status(400)
        .json({ error: "Current password is required" });
    }

    const isMatch = await bcrypt.compare(rawOld, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(rawNew, 10);
    await pgClient.query(`update users set password = $1 where id = $2`, [
      hashedPassword,
      user.id,
    ]);

    await expireAllTokensForUser(user.id);

    return res
      .status(200)
      .json({ success: true, hasPassword: true });
  } catch (error) {
    console.error("updatePassword error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getAccounts,
  unlinkAccount,
  getUserStatus,
  updatePassword,
};

