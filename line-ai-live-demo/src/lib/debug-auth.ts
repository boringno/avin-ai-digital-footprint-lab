import { getRuntimeConfig } from "@/lib/live-demo-config";

export function isLocalDebugRequest(requestUrl: string) {
  const hostname = new URL(requestUrl).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export function hasValidDebugToken(request: Request) {
  const debugToken = getRuntimeConfig().debugToken;
  if (!debugToken) {
    return false;
  }

  const headerToken = request.headers.get("x-debug-token") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  return headerToken === debugToken || authorization === `Bearer ${debugToken}`;
}

export function isAuthorizedDebugRequest(request: Request) {
  return isLocalDebugRequest(request.url) || hasValidDebugToken(request);
}
