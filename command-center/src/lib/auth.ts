import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SESSION_COOKIE = "dashboard_session";
const SESSION_VALUE = "authenticated";

function getSecret(): string {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) throw new Error("DASHBOARD_SECRET not configured");
  return secret;
}

export function verifyPassword(input: string): boolean {
  return input === getSecret();
}

export async function verifySession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session?.value === SESSION_VALUE;
}

export function verifySessionFromRequest(request: NextRequest): boolean {
  const session = request.cookies.get(SESSION_COOKIE);
  return session?.value === SESSION_VALUE;
}

export function createSessionHeaders(): Headers {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${SESSION_VALUE}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
  );
  return headers;
}

export function destroySessionHeaders(): Headers {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return headers;
}
