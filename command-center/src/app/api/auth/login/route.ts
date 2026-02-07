import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSessionHeaders } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret } = body;

    if (!secret || !verifyPassword(secret)) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const headers = createSessionHeaders();
    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
