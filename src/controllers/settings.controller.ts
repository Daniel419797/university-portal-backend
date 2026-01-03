// =============================================================================
// MIGRATION STATUS: AUTO-CONVERTED - REQUIRES MANUAL REVIEW
// =============================================================================
// This file has been automatically migrated from MongoDB to Supabase.
// Search for /* MIGRATE: */ comments to find areas needing manual completion.
// 
// Key changes needed:
// 1. Complete query conversions (findById, find, create, etc.)
// 2. Add error handling for Supabase queries
// 3. Convert .populate() to JOIN syntax
// 4. Update field names (camelCase -> snake_case)
// 5. Test all endpoints
// 
// Original backup: c:\Users\HP\Desktop\university-portal-backend\backup-mongodb-20260102-062910\settings.controller.ts
// =============================================================================
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

const DEFAULT_LAYOUT = ['overview', 'notifications', 'tasks', 'payments'];

type Notifications = { email: boolean; sms: boolean; push: boolean };
type Privacy = { showProfile: boolean; showEmail: boolean; showPhone: boolean };
type Accessibility = { highContrast: boolean; textScale: number };

interface SettingsRow {
  id: string;
  user_id: string;
  preferences: {
    theme?: 'light' | 'dark' | 'system' | string;
    language?: string | null;
    timezone?: string | null;
    notifications?: Notifications | null;
    accessibility?: Accessibility | null;
    dashboard_layout?: string[] | null;
  };
  privacy: Privacy | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
  }
  return fallback;
};

const mapSettingsPayload = (doc: SettingsRow) => ({
  id: doc.id,
  theme: doc.preferences?.theme || 'system',
  language: doc.preferences?.language || null,
  timezone: doc.preferences?.timezone || null,
  notifications: doc.preferences?.notifications || { email: true, sms: false, push: true },
  privacy: doc.privacy || { showProfile: true, showEmail: false, showPhone: false },
  accessibility: doc.preferences?.accessibility || { highContrast: false, textScale: 1 },
  dashboardLayout: (doc.preferences?.dashboard_layout && doc.preferences.dashboard_layout.length > 0) ? doc.preferences.dashboard_layout : DEFAULT_LAYOUT,
  updated_at: doc.updated_at || null,
});

type UserLike = { userId?: string; id?: string };
export const getUserSettings = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userLike = req.user as UserLike | undefined;
  const userId = userLike?.userId || userLike?.id;
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: existing, error } = await db
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch settings: ${error.message}`);

  if (!existing) {
    const uid = userId as string;
    const defaults = {
      user_id: uid,
      preferences: {
        theme: 'system',
        language: null,
        timezone: null,
        notifications: { email: true, sms: false, push: true },
        accessibility: { highContrast: false, textScale: 1 },
        dashboard_layout: DEFAULT_LAYOUT,
      },
      privacy: { showProfile: true, showEmail: false, showPhone: false },
    };
    const { data: created, error: insErr } = await db
      .from('user_settings')
      .insert(defaults)
      .select()
      .single();
    if (insErr) throw ApiError.internal(`Failed to initialize settings: ${insErr.message}`);
    return res.json(ApiResponse.success('Settings retrieved successfully', mapSettingsPayload(created as SettingsRow)));
  }

  return res.json(ApiResponse.success('Settings retrieved successfully', mapSettingsPayload(existing as SettingsRow)));
});

const allowedThemes = new Set(['light', 'dark', 'system']);

export const updateUserSettings = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userLike = req.user as UserLike | undefined;
  const userId = userLike?.userId || userLike?.id;
  const payload = req.body || {};

  const { data: existing, error: fetchErr } = await db
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch settings: ${fetchErr.message}`);

  const currentPrefs = existing?.preferences || {};
  const currentPrivacy = existing?.privacy || {};

  const newPrefs = { ...currentPrefs };
  const newPrivacy = { ...currentPrivacy };

  if (payload.theme) {
    if (!allowedThemes.has(payload.theme)) {
      throw ApiError.badRequest('theme must be one of light, dark, or system');
    }
    newPrefs.theme = payload.theme;
  }

  if (payload.language !== undefined) {
    newPrefs.language = payload.language ? String(payload.language) : null;
  }

  if (payload.timezone !== undefined) {
    newPrefs.timezone = payload.timezone ? String(payload.timezone) : null;
  }

  if (payload.notifications) {
    newPrefs.notifications = {
      email: normalizeBoolean(payload.notifications.email, true),
      sms: normalizeBoolean(payload.notifications.sms, false),
      push: normalizeBoolean(payload.notifications.push, true),
    };
  }

  if (payload.privacy) {
    newPrivacy.showProfile = normalizeBoolean(payload.privacy.showProfile, true);
    newPrivacy.showEmail = normalizeBoolean(payload.privacy.showEmail, false);
    newPrivacy.showPhone = normalizeBoolean(payload.privacy.showPhone, false);
  }

  if (payload.accessibility) {
    const scale = Number(payload.accessibility.textScale ?? 1);
    if (Number.isNaN(scale) || scale < 0.8 || scale > 1.5) {
      throw ApiError.badRequest('textScale must be between 0.8 and 1.5');
    }

    newPrefs.accessibility = {
      highContrast: normalizeBoolean(payload.accessibility.highContrast, false),
      textScale: parseFloat(scale.toFixed(2)),
    };
  }

  if (payload.dashboardLayout) {
    if (!Array.isArray(payload.dashboardLayout)) {
      throw ApiError.badRequest('dashboardLayout must be an array');
    }
    const items = (payload.dashboardLayout as unknown[]).map((item) => String(item).trim()).filter((item) => item.length > 0);
    newPrefs.dashboard_layout = items;
  }

  if (Object.keys(newPrefs).length === 0 && Object.keys(newPrivacy).length === 0) {
    throw ApiError.badRequest('No valid settings provided');
  }

  const updates: Partial<SettingsRow> = {};
  if (Object.keys(newPrefs).length > 0) updates.preferences = newPrefs;
  if (Object.keys(newPrivacy).length > 0) updates.privacy = newPrivacy;
  updates.updated_at = new Date().toISOString();

  if (!existing) {
    const uid = userId as string;
    const defaults = {
      user_id: uid,
      preferences: {
        theme: 'system',
        language: null,
        timezone: null,
        notifications: { email: true, sms: false, push: true },
        accessibility: { highContrast: false, textScale: 1 },
        dashboard_layout: DEFAULT_LAYOUT,
        ...newPrefs,
      },
      privacy: {
        showProfile: true,
        showEmail: false,
        showPhone: false,
        ...newPrivacy,
      },
    };
    const { data: created, error: insErr } = await db
      .from('user_settings')
      .insert(defaults)
      .select()
      .single();
    if (insErr) throw ApiError.internal(`Failed to create settings: ${insErr.message}`);
    return res.json(ApiResponse.success('Settings updated successfully', mapSettingsPayload(created as SettingsRow)));
  }

  const { data: updatedRow, error: updErr } = await db
    .from('user_settings')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();
  if (updErr) throw ApiError.internal(`Failed to update settings: ${updErr.message}`);

  return res.json(ApiResponse.success('Settings updated successfully', mapSettingsPayload(updatedRow as SettingsRow)));
});

