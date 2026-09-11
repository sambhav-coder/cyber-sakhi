import { cookies } from "next/headers";

/**
 * One-time credential hand-off for signup success.
 *
 * The generated plaintext password is placed in a short-lived HttpOnly cookie
 * instead of an in-memory module Map. In-memory singletons get a separate copy
 * per route bundle in Next.js dev and a fresh instance per worker/serverless
 * function in production, so the POST that stores and the GET that retrieves
 * can silently disagree (404). An HttpOnly cookie travels with the browser's
 * same-origin request, is deleted after being read once, and expires in 10
 * minutes — safe to return the password exactly once.
 */

export const ONETIME_COOKIE = "cyber_sakhi_onetime";
export const ONETIME_TTL_MS = 10 * 60 * 1000;

export function generateToken(): string {
  const array = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function storeOneTimeCredentials(data: {
  sakhiNumber: string;
  generatedPassword: string;
  name: string;
  email: string;
}): string {
  const token = generateToken();
  const payload = Buffer.from(
    JSON.stringify({ ...data, expiresAt: Date.now() + ONETIME_TTL_MS })
  ).toString("base64url");

  cookies().set(ONETIME_COOKIE, `${token}.${payload}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONETIME_TTL_MS / 1000,
  });

  return token;
}