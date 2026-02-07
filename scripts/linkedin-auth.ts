/**
 * LinkedIn OAuth 2.0 Token Generator
 *
 * Usage: npx tsx scripts/linkedin-auth.ts
 *
 * 1. Opens your browser to LinkedIn's authorization page
 * 2. After you authorize, captures the callback code
 * 3. Exchanges it for an access token
 * 4. Prints the new token and updates your .env file
 */
import "dotenv/config";
import express from "express";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/auth/linkedin/callback";
const SCOPES = ["openid", "profile", "w_member_social", "email"];
const PORT = 3000;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET in .env");
  process.exit(1);
}

const app = express();

app.get("/auth/linkedin/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error(`\nAuthorization failed: ${error} - ${error_description}`);
    res.send(`<h2>Authorization Failed</h2><p>${error_description}</p>`);
    process.exit(1);
  }

  if (!code) {
    console.error("\nNo authorization code received");
    res.send("<h2>Error</h2><p>No authorization code received</p>");
    return;
  }

  console.log("\nAuthorization code received. Exchanging for access token...");

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${err}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;

    console.log("\n=== LinkedIn OAuth Success ===");
    console.log(`Access Token: ${accessToken.substring(0, 20)}...`);
    console.log(
      `Expires in: ${Math.round(expiresIn / 86400)} days (${expiresIn} seconds)`,
    );

    // Test the token
    const profileResponse = await fetch(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      console.log(`Authenticated as: ${profile.name} (${profile.email})`);
      console.log(`Person URN (sub): ${profile.sub}`);

      // Update .env file
      const envPath = resolve(process.cwd(), ".env");
      let envContent = readFileSync(envPath, "utf-8");

      // Replace access token
      envContent = envContent.replace(
        /LINKEDIN_ACCESS_TOKEN=.*/,
        `LINKEDIN_ACCESS_TOKEN=${accessToken}`,
      );

      // Replace person URN
      envContent = envContent.replace(
        /LINKEDIN_PERSON_URN=.*/,
        `LINKEDIN_PERSON_URN=${profile.sub}`,
      );

      writeFileSync(envPath, envContent);
      console.log("\n.env file updated with new token and person URN");
    } else {
      console.log("\nToken obtained but profile test failed. Token:");
      console.log(accessToken);
      console.log("\nManually update LINKEDIN_ACCESS_TOKEN in your .env file.");
    }

    res.send(
      "<h2>Success!</h2><p>LinkedIn access token obtained. You can close this window.</p>",
    );

    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error("\nError exchanging code for token:", err);
    res.send(`<h2>Error</h2><p>${err}</p>`);
    process.exit(1);
  }
});

const server = app.listen(PORT, () => {
  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", "social-agent-auth");

  console.log("LinkedIn OAuth 2.0 Token Generator");
  console.log("===================================");
  console.log(`\nLocal server listening on port ${PORT}`);
  console.log(`\nOpening browser for authorization...`);
  console.log(`\nIf the browser doesn't open, visit:\n${authUrl.toString()}\n`);

  // Open browser (macOS)
  try {
    execSync(`open "${authUrl.toString()}"`);
  } catch {
    console.log("Could not open browser automatically. Please visit the URL above.");
  }
});
