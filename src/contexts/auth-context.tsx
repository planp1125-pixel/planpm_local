'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export interface UserPermissions {
    dashboard: 'hidden' | 'view' | 'edit';
    maintenance_history: 'hidden' | 'view' | 'edit';
    update_maintenance: 'hidden' | 'view' | 'edit';
    instruments: 'hidden' | 'view' | 'edit';
    design_templates: 'hidden' | 'view' | 'edit';
    settings: 'hidden' | 'view' | 'edit';
    user_management: 'hidden' | 'view' | 'edit';
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isAdmin: boolean;
    displayName: string;
    permissions: UserPermissions;
    passwordResetRequired: boolean;
    hasPermission: (feature: keyof UserPermissions, level: 'view' | 'edit') => boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
    signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

const defaultPermissions: UserPermissions = {
    dashboard: 'view',
    maintenance_history: 'view',
    update_maintenance: 'hidden',
    instruments: 'hidden',
    design_templates: 'hidden',
    settings: 'hidden',
    user_management: 'hidden',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);
    const [passwordResetRequired, setPasswordResetRequired] = useState(false);
    const router = useRouter();

    // Check if user has permission for a feature at a given level (memoized to prevent re-renders)
    const hasPermission = useCallback((feature: keyof UserPermissions, level: 'view' | 'edit'): boolean => {
        const userLevel = permissions[feature];
        if (userLevel === 'hidden') return false;
        if (level === 'view') return userLevel === 'view' || userLevel === 'edit';
        if (level === 'edit') return userLevel === 'edit';
        return false;
    }, [permissions]);

    // Fetch user profile including role, permissions, display name
    const fetchUserProfile = async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('role, display_name, permissions, password_reset_required')
            .eq('id', userId)
            .single();

        if (!error && data) {
            setIsAdmin(data.role === 'admin');
            setDisplayName(data.display_name || '');
            setPermissions(data.permissions || defaultPermissions);
            setPasswordResetRequired(data.password_reset_required || false);

            // Redirect to password reset if required
            if (data.password_reset_required && typeof window !== 'undefined' && !window.location.pathname.includes('/reset-password')) {
                router.push('/reset-password');
            }
        } else {
            setIsAdmin(false);
            setPermissions(defaultPermissions);
            setPasswordResetRequired(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        let retryCount = 0;
        const maxRetries = 2;

        // Get initial session with retry logic
        const getSession = async () => {
            console.log('[Auth] Starting session fetch...');
            try {
                console.log('[Auth] Calling supabase.auth.getSession()...');
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    throw error;
                }

                if (!isMounted) return;

                console.log('[Auth] Session received:', session ? 'User logged in' : 'No session');
                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user) {
                    console.log('[Auth] Fetching user profile...');
                    try {
                        await fetchUserProfile(session.user.id);
                        console.log('[Auth] Profile fetched successfully');
                    } catch (profileErr) {
                        console.warn('[Auth] Could not fetch user profile:', profileErr);
                        // Set defaults but continue - don't block the app
                        setIsAdmin(false);
                        setPermissions(defaultPermissions);
                    }
                }
            } catch (err) {
                console.error('[Auth] Error getting session:', err);
                // On error, retry a couple times
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`[Auth] Retrying session fetch (${retryCount}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    if (isMounted) {
                        return getSession();
                    }
                }
            } finally {
                if (isMounted) {
                    console.log('[Auth] Setting isLoading to false');
                    setIsLoading(false);
                }
            }
        };

        getSession();

        // Fallback timeout - ensure we never stay loading forever
        const fallbackTimeout = setTimeout(() => {
            if (isMounted && isLoading) {
                console.warn('[Auth] Fallback timeout triggered - forcing loading to false');
                setIsLoading(false);
            }
        }, 10000);

        return () => {
            isMounted = false;
            clearTimeout(fallbackTimeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[Auth] Auth state changed:', event);

                // Always update session and user state
                setSession(session);
                setUser(session?.user ?? null);

                // Only fetch profile on sign-in, not on token refresh
                if (event === 'SIGNED_IN' && session?.user) {
                    try {
                        await fetchUserProfile(session.user.id);
                    } catch (err) {
                        console.error('Failed to fetch profile on sign in:', err);
                        // Set defaults but don't block
                        setIsAdmin(false);
                        setPermissions(defaultPermissions);
                    }
                    router.push('/');
                }

                if (event === 'SIGNED_OUT') {
                    setIsAdmin(false);
                    setPermissions(defaultPermissions);
                    setDisplayName('');
                    router.push('/login');
                }

                // Don't change loading state on TOKEN_REFRESHED or INITIAL_SESSION
                // Only set loading false if we were waiting for auth
                if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                    setIsLoading(false);
                }
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, [router]);

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) {
            console.error('Error signing in with Google:', error);
        }
    };

    const signInWithEmail = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            return { error: error.message };
        }
        return { error: null };
    };

    const signUpWithEmail = async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) {
            return { error: error.message };
        }
        return { error: null };
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                isLoading,
                isAdmin,
                displayName,
                permissions,
                passwordResetRequired,
                hasPermission,
                signInWithGoogle,
                signInWithEmail,
                signUpWithEmail,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
