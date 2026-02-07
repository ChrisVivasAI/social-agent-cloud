import { NextRequest, NextResponse } from "next/server";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://agent:3002";
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET;

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const path = "/" + params.path.join("/");
  const url = `${AGENT_API_URL}${path}${request.nextUrl.search}`;

  const headers = new Headers();
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
  if (DASHBOARD_SECRET) {
    headers.set("Authorization", `Bearer ${DASHBOARD_SECRET}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.text();
    if (body) init.body = body;
  }

  try {
    const agentRes = await fetch(url, init);

    // Handle SSE streaming
    if (agentRes.headers.get("content-type")?.includes("text/event-stream")) {
      return new Response(agentRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const responseBody = await agentRes.text();
    return new NextResponse(responseBody, {
      status: agentRes.status,
      headers: {
        "Content-Type": agentRes.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  return proxyRequest(request, params);
}
