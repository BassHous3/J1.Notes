import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'j1notes-secret-change-in-production');

// Diese Pfade sind IMMER zugänglich
const PUBLIC_PATHS = [
  '/login',
  '/reset-password',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/settings/auth',
];

function denyAccess(request: NextRequest) {
  // API-Aufrufe bekommen ein 401, Seiten werden zum Login geleitet
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/settings/auth: Lesen (GET) ist öffentlich, weil die Login-Seite es braucht.
  // Schreiben (POST) läuft durch die normale Prüfung unten.
  const isSettingsWrite = pathname.startsWith('/api/settings/auth') && request.method !== 'GET';

  // Statische Assets und öffentliche Pfade durchlassen
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/uploads') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico' ||
    (PUBLIC_PATHS.some(p => pathname.startsWith(p)) && !isSettingsWrite)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('j1notes-auth')?.value;

  // Wenn Token vorhanden: validieren
  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET);
      return NextResponse.next(); // Token gültig
    } catch {
      // Token ungültig — aber wir wissen noch nicht ob Auth aktiviert ist
    }
  }

  // Kein oder ungültiges Token: Auth-Status prüfen.
  // Der Server fragt sich selbst über Loopback (nicht über die öffentliche URL, die
  // hinter Docker/Tunnel/Access von innen oft nicht erreichbar ist).
  try {
    const port = process.env.PORT || request.nextUrl.port || '3000';
    const settingsRes = await fetch(`http://127.0.0.1:${port}/api/settings/auth`, {
      headers: { 'x-middleware-check': '1' },
    });
    if (!settingsRes.ok) throw new Error(`settings check failed: ${settingsRes.status}`);
    const settings = await settingsRes.json();

    if (!settings.auth_enabled) {
      return NextResponse.next(); // Auth aus → freier Zugang
    }

    // Auth aktiviert aber kein gültiges Token → Login
    return denyAccess(request);
  } catch {
    // Bei Fehler: zugriff verweigern (fail-closed). Ein Fehler darf nie zu offenem Zugang führen.
    return denyAccess(request);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
