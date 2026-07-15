import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  // Kalau buka /admin, minta password
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (authHeader !== `Basic ${Buffer.from('admin:kopi123').toString('base64')}`) {
      return new NextResponse('Authentication required', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic' },
      });
    }
  }
  return NextResponse.next();
}