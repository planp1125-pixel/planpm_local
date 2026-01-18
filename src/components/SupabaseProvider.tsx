'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface SupabaseContextState {
    supabase: SupabaseClient;
    user: User | null;
    isLoading: boolean;
}

const SupabaseContext = createContext<SupabaseContextState | undefined>(undefined);

export function SupabaseProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        // Get initial session immediately
        const getInitialSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (isMounted) {
                    setUser(session?.user ?? null);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Error getting initial session:', err);
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        getInitialSession();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (isMounted) {
                setUser(session?.user ?? null);
                // Loading should already be false from initial session
            }
        });

        // Fallback: ensure loading is false after 5 seconds max
        const fallback = setTimeout(() => {
            if (isMounted && isLoading) {
                console.warn('[SupabaseProvider] Fallback timeout - forcing loading to false');
                setIsLoading(false);
            }
        }, 5000);

        return () => {
            isMounted = false;
            clearTimeout(fallback);
            subscription.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <SupabaseContext.Provider value={{ supabase, user, isLoading }}>
            {children}
        </SupabaseContext.Provider>
    );
}

export function useSupabase() {
    const context = useContext(SupabaseContext);
    if (context === undefined) {
        throw new Error('useSupabase must be used within a SupabaseProvider');
    }
    return context;
}

export function useUser() {
    const { user, isLoading } = useSupabase();
    return { user, isLoading };
}
