const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const GithubStrategy = require("passport-github2").Strategy;
// const User = require("../models/user.model");
const { initializeSession } = require("../utils/session");
const { nanoid } = require("nanoid");
const { pgClient } = require("../config/db.config.pg");

const axios = require("axios");
const { GoTrueAdminApi } = require("@supabase/supabase-js");

async function getGithubEmails(accessToken) {
  const { data } = await axios.get("https://api.github.com/user/emails", {
    headers: { Authorization: `token ${accessToken}` },
  });
  const primaryEmail = data.find((e) => e.primary && e.verified);
  return primaryEmail ? primaryEmail.email : null;
}

const host =
  process.env.NODE_ENV === "production" ? "" : "http://localhost:3030";

const generateUsername = async (name) => {
  let baseName = name.replace(/\s+/g, "").toLowerCase();
  if (baseName.length < 3) {
    baseName = baseName.padEnd(3, "x");
  }
  const userNameRes = await pgClient.query(
    `select * from users where username=$1`,
    [baseName],
  );
  if (userNameRes.rows.length === 0) {
    return baseName;
  }
  while (true) {
    const newName = `${baseName}_${nanoid(4)}`;
    const checkRes = await pgClient.query(
      `select * from users where username=$1`,
      [newName],
    );

    if (checkRes.rows.length === 0) {
      return newName;
    }
  }
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${host}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();

        const byProviderRes = await pgClient.query(
          `
          select *
          from users
          where exists (
            select 1
            from jsonb_array_elements(coalesce(providers, '[]'::jsonb)) p
            where p->>'provider' = 'google'
              and p->>'providerId' = $1
          )
          limit 1
          `,
          [profile.id],
        );

        if (byProviderRes.rows[0]) {
          return done(null, byProviderRes.rows[0]);
        }

        if (email) {
          const byEmailRes = await pgClient.query(
            `select * from users where email = $1 limit 1`,
            [email],
          );

          const user = byEmailRes.rows[0];
          if (user) {
            await pgClient.query(
              `
              update users
              set providers = coalesce(providers, '[]'::jsonb) || $1::jsonb
              where id = $2
              `,
              [
                JSON.stringify([
                  { provider: "google", providerId: profile.id },
                ]),
                user.id,
              ],
            );

            return done(null, user);
          }
          if (!user) {
            console.log("in no email in database", user);
            console.log(email);
            console.log(profile.name.givenName);
            console.log(profile.name.familyName);
            const username = await generateUsername(profile.name.givenName);

            console.log(username);

            const newUserRes = await pgClient.query(
              `
                insert into users (
                  first_name,
                  last_name,
                  username,
                  email,
                  providers,
                  is_verified,
                  validate_before_login
                )
                values ($1,$2,$3,$4,$5,true,true)
                returning *
              `,
              [
                profile.name.givenName || "",
                profile.name.familyName || "",
                username,
                email,
                JSON.stringify([
                  { provider: "google", providerId: profile.id },
                ]),
              ],
            );
            console.log(newUserRes.rows[0]);

            done(null, newUserRes.rows[0]);
          }
        }
      } catch (err) {
        done(err);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const userRes = await pgClient.query(`select * from users where id =$1`, [
      id,
    ]);
    const user = userRes.rows[0];
    done(null, user || false);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: `${host}/api/auth/facebook/callback`,
      profileFields: ["id", "emails", "name"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const providerRes = await pgClient.query(
          `
          SELECT * FROM users
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(coalesce(providers, '[]'::jsonb)) p
            WHERE p->>'provider' = $1
              AND p->>'providerId' = $2
          )
          LIMIT 1
          `,
          ["facebook", profile.id],
        );

        let user = providerRes.rows[0] || null;

        const email = profile.emails?.[0]?.value?.toLowerCase();

        const username = await generateUsername(
          profile?.name?.givenName || profile.name.familyName || "user",
        );

        if (!user && email) {
          const emailRes = await pgClient.query(
            `SELECT * FROM users WHERE email = $1`,
            [email],
          );
          user = emailRes.rows[0] || null;

          if (user) {
            const newProvider = {
              provider: "facebook",
              providerId: profile.id,
            };
            await pgClient.query(
              `UPDATE users SET providers = providers || $1::jsonb WHERE id = $2`,
              [JSON.stringify([newProvider]), user.id],
            );
          }
        }

        if (!user) {
          const newUserRes = await pgClient.query(
            `
            INSERT INTO users
            (first_name, last_name, username, email, providers, is_verified, validate_before_login)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            `,
            [
              profile.name.givenName || "",
              profile.name.familyName || "",
              username,
              email || null,
              JSON.stringify([
                { provider: "facebook", providerId: profile.id },
              ]),
              !!email,
              true,
            ],
          );
          user = newUserRes.rows[0];
        }

        if (!email) {
          return done(null, {
            id: user.id,
            provider: "facebook",
            providerId: profile.id,
            needsEmail: true,
          });
        }

        done(null, user);
      } catch (err) {
        console.error("FacebookStrategy error:", err);
        done(err, null);
      }
    },
  ),
);

passport.use(
  new GithubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${host}/api/auth/github/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          email = (await getGithubEmails(accessToken))?.toLowerCase();
        }

        const byProviderRes = await pgClient.query(
          `
          select *
          from users
          where exists (
            select 1
            from jsonb_array_elements(coalesce(providers, '[]'::jsonb)) p
            where p->>'provider' = 'github'
              and p->>'providerId' = $1
          )
          limit 1
          `,
          [profile.id],
        );

        if (byProviderRes.rows[0]) {
          return done(null, byProviderRes.rows[0]);
        }

        let user = null;

        if (email) {
          const byEmailRes = await pgClient.query(
            `select * from users where email = $1 limit 1`,
            [email],
          );
          user = byEmailRes.rows[0];

          if (user) {
            await pgClient.query(
              `
              update users
              set providers = coalesce(providers, '[]'::jsonb) || $1::jsonb
              where id = $2
              `,
              [
                JSON.stringify([
                  { provider: "github", providerId: profile.id },
                ]),
                user.id,
              ],
            );
            return done(null, user);
          }
        }

        const fullName = profile.displayName || profile.username || "";
        const [firstName, ...lastNameParts] = fullName.split(" ");
        const lastName = lastNameParts.join(" ");

        const username = await generateUsername(
          firstName || profile.username || "user",
        );

        const newUserRes = await pgClient.query(
          `
          insert into users (
            first_name,
            last_name,
            username,
            email,
            providers,
            is_verified,
            validate_before_login
          )
          values ($1,$2,$3,$4,$5,$6,true)
          returning *
          `,
          [
            firstName || "",
            lastName || "",
            username,
            email || null,
            JSON.stringify([{ provider: "github", providerId: profile.id }]),
            !!email,
          ],
        );

        done(null, newUserRes.rows[0]);
      } catch (err) {
        done(err);
      }
    },
  ),
);

module.exports = passport;
