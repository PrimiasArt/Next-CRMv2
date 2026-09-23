'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';

interface AuthCtx {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string, tenantName: string) => Promise<{ error?: string }>;
  signUpWithInvite: (email: string, password: string, fullName: string, inviteCode: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserClient();

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data as Profile | null);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchProfile(user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };

  const signUp = async (email: string, password: string, fullName: string, tenantName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, tenant_name: tenantName },
      },
    });
    if (error) return { error: error.message };

    if (data.user && data.session) {
      const existing = await supabase.from('profiles').select('id').eq('id', data.user.id).single();
      if (!existing.data) {
        const slug = tenantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { data: tenant } = await supabase
          .from('tenants')
          .insert({ name: tenantName, slug: slug + '-' + data.user.id.slice(0, 8) })
          .select()
          .single();
        if (tenant) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            tenant_id: (tenant as { id: string }).id,
            role: 'admin',
            full_name: fullName,
          });
        }
      }
    }
    return {};
  };

  const signUpWithInvite = async (email: string, password: string, fullName: string, inviteCode: string) => {
    const { data: invite } = await supabase
      .from('invites')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .is('used_at', null)
      .single();

    if (!invite) return { error: 'Mã mời không hợp lệ hoặc đã được sử dụng' };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, invite_code: inviteCode },
      },
    });
    if (error) return { error: error.message };

    if (data.user && data.session) {
      const existing = await supabase.from('profiles').select('id').eq('id', data.user.id).single();
      if (!existing.data) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          tenant_id: (invite as { tenant_id: string }).tenant_id,
          role: (invite as { role: string }).role,
          full_name: fullName,
        });
      }
      await supabase
        .from('invites')
        .update({ used_at: new Date().toISOString() })
        .eq('id', (invite as { id: string }).id);
    }
    return {};
  };

  const signUpWithInvite = async (email: string, password: string, fullName: string, inviteCode: string) => {
    const { data: invite } = await supabase
      .from('invites')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .is('used_at', null)
      .single();

    if (!invite) return { error: 'Invalid or expired invite code' };

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        tenant_id: (invite as { tenant_id: string }).tenant_id,
        role: (invite as { role: string }).role,
        full_name: fullName,
      });

      await supabase
        .from('invites')
        .update({ used_at: new Date().toISOString() })
        .eq('id', (invite as { id: string }).id);
    }
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return <Ctx.Provider value={{ user, profile, loading, signIn, signUp, signUpWithInvite, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
