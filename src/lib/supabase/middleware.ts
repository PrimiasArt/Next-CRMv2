import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/register');
  const isApiRoute = path.startsWith('/api');

  if (!user && !isAuthRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && !isAuthRoute && !isApiRoute) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('invite_code')
        .eq('id', user.id)
        .single();

      if (profile?.invite_code) {
        return NextResponse.redirect(new URL('/login?verify=1', request.url));
      }
    } catch {
      // invite_code column may not exist yet — skip check
    }
  }

  if (user && isAuthRoute && !request.nextUrl.searchParams.has('verify')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}
