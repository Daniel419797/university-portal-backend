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
  theme: 'light' | 'dark' | 'system' | string;
  language?: string | null;
  timezone?: string | null;
  notifications?: Notifications | null;
  privacy?: Privacy | null;
  accessibility?: Accessibility | null;
  dashboard_layout?: string[] | null;
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
  theme: doc.theme,
  language: doc.language || null,
  timezone: doc.timezone || null,
  notifications: doc.notifications || { email: true, sms: false, push: true },
  privacy: doc.privacy || { showProfile: true, showEmail: false, showPhone: false },
  accessibility: doc.accessibility || { highContrast: false, textScale: 1 },
  dashboardLayout: (doc.dashboard_layout && doc.dashboard_layout.length > 0) ? doc.dashboard_layout : DEFAULT_LAYOUT,
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
    const defaults: Omit<SettingsRow, 'id'> = {
      user_id: uid,
      theme: 'system',
      language: null,
      timezone: null,
      notifications: { email: true, sms: false, push: true },
      privacy: { showProfile: true, showEmail: false, showPhone: false },
      accessibility: { highContrast: false, textScale: 1 },
      dashboard_layout: DEFAULT_LAYOUT,
      updated_at: new Date().toISOString(),
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

  const updates: Partial<SettingsRow> = {};

  if (payload.theme) {
    if (!allowedThemes.has(payload.theme)) {
      throw ApiError.badRequest('theme must be one of light, dark, or system');
    }
    updates.theme = payload.theme;
  }

  if (payload.language) {
    updates.language = String(payload.language);
  }

  if (payload.timezone) {
    updates.timezone = String(payload.timezone);
  }

  if (payload.notifications) {
    updates.notifications = {
      email: normalizeBoolean(payload.notifications.email, true),
      sms: normalizeBoolean(payload.notifications.sms, false),
      push: normalizeBoolean(payload.notifications.push, true),
    };
  }

  if (payload.privacy) {
    updates.privacy = {
      showProfile: normalizeBoolean(payload.privacy.showProfile, true),
      showEmail: normalizeBoolean(payload.privacy.showEmail, false),
      showPhone: normalizeBoolean(payload.privacy.showPhone, false),
    };
  }

  if (payload.accessibility) {
    const scale = Number(payload.accessibility.textScale ?? 1);
    if (Number.isNaN(scale) || scale < 0.8 || scale > 1.5) {
      throw ApiError.badRequest('textScale must be between 0.8 and 1.5');
    }

    updates.accessibility = {
      highContrast: normalizeBoolean(payload.accessibility.highContrast, false),
      textScale: parseFloat(scale.toFixed(2)),
    };
  }

  if (payload.dashboardLayout) {
    if (!Array.isArray(payload.dashboardLayout)) {
      throw ApiError.badRequest('dashboardLayout must be an array');
    }
    const items = (payload.dashboardLayout as unknown[]).map((item) => String(item).trim()).filter((item) => item.length > 0);
    updates.dashboard_layout = items;
  }

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid settings provided');
  }

  updates.updated_at = new Date().toISOString();

  const { data: existing, error: fetchErr } = await db
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch settings: ${fetchErr.message}`);

  if (!existing) {
    const uid = userId as string;
    const defaults: Omit<SettingsRow, 'id'> = {
      user_id: uid,
      theme: 'system',
      language: null,
      timezone: null,
      notifications: { email: true, sms: false, push: true },
      privacy: { showProfile: true, showEmail: false, showPhone: false },
      accessibility: { highContrast: false, textScale: 1 },
      dashboard_layout: DEFAULT_LAYOUT,
      updated_at: updates.updated_at,
    };
    const merged = { ...defaults, ...updates };
    const { data: created, error: insErr } = await db
      .from('user_settings')
      .insert(merged)
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

