import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  let storageOrigin = "";
  try {
    const endpoint = new URL(process.env.S3_ENDPOINT || "");
    if (endpoint.protocol === "https:") storageOrigin = endpoint.origin;
  } catch {
    /* No direct storage uploads until configured. */
  }
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${storageOrigin} ${process.env.NODE_ENV === "development" ? "ws: wss:" : ""}; worker-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`;
  const headers = new Headers(request.headers);
  headers.set("x-frame-path", request.nextUrl.pathname);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|artwork|icon.svg).*)",
  ],
};
