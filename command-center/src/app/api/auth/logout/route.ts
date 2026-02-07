import { NextResponse } from "next/server";
import { destroySessionHeaders } from "@/lib/auth";

export async function POST() {
  const headers = destroySessionHeaders();
  return NextResponse.json({ success: true }, { headers });
}
