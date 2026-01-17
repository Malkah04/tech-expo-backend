const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const GithubStrategy = require("passport-github2").Strategy;
const User = require("../models/user.model");
const { initializeSession } = require("../utils/session");
const { nanoid } = require("nanoid");

const axios = require("axios");

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
  let usernameExist = await User.findOne({ username: baseName });

  while (usernameExist) {
    let newName = `${baseName}_${nanoid(4)}`;
    usernameExist = await User.findOne({ username: newName });
    if (!usernameExist) {
      return newName;
    }
  }
  return baseName;
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
        let user = await User.findOne({
          providers: {
            $elemMatch: {
              providerId: profile.id,
              provider: "google",
            },
          },
        });
        if (!user) {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (email) {
            user = await User.findOne({ email });

            if (user) {
              const hasProvider = user.providers.some(
                (p) => p.providerId === profile.id && p.provider === "google"
              );

              if (!hasProvider) {
                user.providers.push({
                  provider: "google",
                  providerId: profile.id,
                });
                await user.save();
              }
            }
          }
        }

        const username = await generateUsername(profile.name.givenName);

        if (!user) {
          user = await User.create({
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            username: username,
            email: profile.emails[0].value.toLowerCase(),
            providers: [{ provider: "google", providerId: profile.id }],
            isVerified: true,
            validateBeforeLogin: true,
          });
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
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
        let user = await User.findOne({
          providers: {
            $elemMatch: {
              providerId: profile.id,
              provider: "facebook",
            },
          },
        });

        const email = profile.emails?.[0]?.value?.toLowerCase();

        const username = await generateUsername(
          profile?.name?.givenName || profile.name.familyName || "user"
        );

        if (!user) {
          const newUser = {
            firstName: profile.name.givenName || "",
            lastName: profile.name.familyName || "",
            username: username,
            providers: [
              {
                provider: "facebook",
                providerId: profile.id,
              },
            ],

            isVerified: !!email,
            validateBeforeLogin: true,
          };
          if (email) newUser.email = email;

          user = await User.create(newUser);
        }
        if (email) {
          return done(null, {
            id: user._id,
            provider: "facebook",
            providerId: profile.id,
            needsEmail: true,
          });
        }
        console.log(profile);

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
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
        let email = profile.emails?.[0]?.value;
        if (!email) {
          email = await getGithubEmails(accessToken);
        }
        let user = await User.findOne({
          providers: {
            $elemMatch: {
              providerId: profile.id,
              provider: "github",
            },
          },
        });

        if (!user && email) {
          user = await User.findOne({ email });
          if (user) {
            const hasProvider = user.providers.some(
              (p) => p.providerId === profile.id && p.provider === "github"
            );
            if (!hasProvider) {
              user.providers.push({
                provider: "github",
                providerId: profile.id,
              });
              await user.save();
            }
          }
        }

        const username = await generateUsername(
          profile?.name?.givenName || profile.username
        );

        if (!user) {
          const fullName = profile.displayName || profile.username || "";
          const [firstName, ...lastNameParts] = fullName.split(" ");
          const lastName = lastNameParts.join(" ");
          user = await User.create({
            firstName: firstName,
            lastName: lastName,
            username: username,
            email: email || "",
            providers: [{ provider: "github", providerId: profile.id }],
            isVerified: true,
            validateBeforeLogin: true,
          });
        }
        console.log(profile);

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;
