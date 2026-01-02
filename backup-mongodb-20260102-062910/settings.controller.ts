import { Request, Response } from 'express';
import UserSettings from '../models/UserSettings.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

const DEFAULT_LAYOUT = ['overview', 'notifications', 'tasks', 'payments'];

const normalizeBoolean = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) {
      return false;
    }
  }
  return fallback;
};

const mapSettingsPayload = (doc: any) => ({
  id: doc._id,
  theme: doc.theme,
  language: doc.language,
  timezone: doc.timezone,
  notifications: doc.notifications,
  privacy: doc.privacy,
  accessibility: doc.accessibility,
  dashboardLayout: doc.dashboardLayout?.length ? doc.dashboardLayout : DEFAULT_LAYOUT,
  updatedAt: doc.updatedAt,
});

export const getUserSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user._id;

  const settings = await UserSettings.findOneAndUpdate(
    { user: userId },
    {},
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return res.json(ApiResponse.success('Settings retrieved successfully', mapSettingsPayload(settings)));
});

const allowedThemes = new Set(['light', 'dark', 'system']);

export const updateUserSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user._id;
  const payload = req.body || {};

  const updates: Record<string, any> = {};

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
    updates.dashboardLayout = payload.dashboardLayout
      .map((item: any) => String(item).trim())
      .filter((item: string) => item.length > 0);
  }

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid settings provided');
  }

  const settings = await UserSettings.findOneAndUpdate(
    { user: userId },
    { $set: updates },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return res.json(ApiResponse.success('Settings updated successfully', mapSettingsPayload(settings)));
});

