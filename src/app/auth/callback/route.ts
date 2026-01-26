import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const origin = requestUrl.origin;

    console.log('[Auth Callback] Processing OAuth callback, code:', code ? 'present' : 'missing');

    if (code) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('[Auth Callback] Missing Supabase env vars');
            return NextResponse.redirect(new URL('/login?error=config', origin));
        }

        try {
            // Create Supabase client
            const supabase = createClient(supabaseUrl, supabaseAnonKey, {
                auth: {
                    flowType: 'pkce',
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                    persistSession: false,
                }
            });

            // Exchange the code for a session
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
                console.error('[Auth Callback] Error exchanging code:', error.message);
                return NextResponse.redirect(new URL('/login?error=auth', origin));
            }

            if (data.session) {
                console.log('[Auth Callback] Session obtained for:', data.session.user.email);

                // Create redirect response with cookies
                const response = NextResponse.redirect(new URL('/', origin));

                // Set the auth cookie that Supabase JS client looks for
                const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1] || 'supabase';
                const cookieName = `sb-${projectRef}-auth-token`;
                const cookieValue = JSON.stringify({
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    expires_at: Math.floor(Date.now() / 1000) + data.session.expires_in,
                    expires_in: data.session.expires_in,
                    token_type: 'bearer',
                    user: data.session.user
                });

                // Set cookie on the response
                response.cookies.set(cookieName, cookieValue, {
                    path: '/',
                    httpOnly: false, // Client needs to read this
                    secure: true,
                    sameSite: 'lax',
                    maxAge: data.session.expires_in
                });

                console.log('[Auth Callback] Cookie set, redirecting to home');
                return response;
            }
        } catch (err) {
            console.error('[Auth Callback] Exception:', err);
            return NextResponse.redirect(new URL('/login?error=exception', origin));
        }
    }

    console.log('[Auth Callback] No code provided, redirecting to login');
    return NextResponse.redirect(new URL('/login', origin));
}
