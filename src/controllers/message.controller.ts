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
// Original backup: c:\Users\HP\Desktop\university-portal-backend\backup-mongodb-20260102-062910\message.controller.ts
// =============================================================================
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import notificationService from '../services/notification.service';

// Typed rows
interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string;
  body: string;
  attachments: unknown[] | null;
  is_read: boolean;
  read_at: string | null;
  thread_id: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  avatar?: string | null;
}

// @desc    Get all messages (inbox)
// @route   GET /api/v1/messages
// @access  Private
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { type = 'inbox', page = 1, limit = 20 } = req.query;

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const skip = (pageNum - 1) * limitNum;

  let query = db.from('messages').select('*', { count: 'exact' });
  if (type === 'inbox') {
    query = query.eq('recipient_id', userId);
  } else if (type === 'sent') {
    query = query.eq('sender_id', userId);
  } else {
    throw ApiError.badRequest('Invalid type parameter');
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(skip, skip + limitNum - 1);

  if (error) throw ApiError.internal(`Failed to fetch messages: ${error.message}`);

  const items = (data || []) as MessageRow[];
  const senderIds = items.map((m) => m.sender_id);
  const recipientIds = items.map((m) => m.recipient_id);
  const profileIds = Array.from(new Set([...senderIds, ...recipientIds]));

  let profilesMap = new Map<string, ProfileRow>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profilesError } = await db
      .from('profiles')
      .select('id, first_name, last_name, email, avatar')
      .in('id', profileIds);
    if (profilesError) throw ApiError.internal(`Failed to fetch profiles: ${profilesError.message}`);
    profilesMap = new Map((profiles || []).map((p) => [p.id, p as ProfileRow]));
  }

  const { count: unreadCount } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  res.json(
    ApiResponse.success('Messages fetched successfully', {
      messages: items.map((m) => ({
        id: m.id,
        sender: (() => {
          const sp = profilesMap.get(m.sender_id);
          return sp
            ? { id: sp.id, name: `${sp.first_name} ${sp.last_name}`, email: sp.email, avatar: sp.avatar }
            : { id: m.sender_id, name: undefined, email: undefined, avatar: undefined };
        })(),
        recipient: (() => {
          const rp = profilesMap.get(m.recipient_id);
          return rp
            ? { id: rp.id, name: `${rp.first_name} ${rp.last_name}`, email: rp.email, avatar: rp.avatar }
            : { id: m.recipient_id, name: undefined, email: undefined, avatar: undefined };
        })(),
        subject: m.subject,
        body: m.body,
        attachments: m.attachments || [],
        isRead: m.is_read,
        readAt: m.read_at,
        thread: m.thread_id,
        created_at: m.created_at,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
      unreadCount: unreadCount || 0,
    })
  );
});

// @desc    Get message thread
// @route   GET /api/v1/messages/:id
// @access  Private
export const getMessageThread = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  // Get the main message
  const { data: message, error: fetchError } = await db
    .from('messages')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw ApiError.internal(`Failed to fetch message: ${fetchError.message}`);
  if (!message) throw ApiError.notFound('Message not found');

  // Check authorization
  if (message.sender_id !== userId && message.recipient_id !== userId) {
    throw ApiError.forbidden('Not authorized to view this message');
  }

  // Mark as read if user is recipient and message is unread
  if (message.recipient_id === userId && !message.is_read) {
    const { error: updateError } = await db
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) throw ApiError.internal(`Failed to mark message as read: ${updateError.message}`);
    message.is_read = true;
    message.read_at = new Date().toISOString();
  }

  // Get thread messages
  let threadMessages: MessageRow[] = [];
  if (message.thread_id) {
    const threadId = message.thread_id;
    const { data: tData, error: tErr } = await db
      .from('messages')
      .select('*')
      .or(`id.eq.${threadId},thread_id.eq.${threadId},thread_id.eq.${message.id}`)
      .order('created_at', { ascending: true });
    if (tErr) throw ApiError.internal(`Failed to fetch thread: ${tErr.message}`);
    threadMessages = (tData || []) as MessageRow[];
  } else {
    const { data: replies, error: rErr } = await db
      .from('messages')
      .select('*')
      .eq('thread_id', message.id)
      .order('created_at', { ascending: true });
    if (rErr) throw ApiError.internal(`Failed to fetch replies: ${rErr.message}`);
    threadMessages = (replies || []) as MessageRow[];
  }

  // Profiles for mapping
  const ids = Array.from(
    new Set([
      message.sender_id,
      message.recipient_id,
      ...threadMessages.map((m) => m.sender_id),
      ...threadMessages.map((m) => m.recipient_id),
    ])
  );
  let profilesMap = new Map<string, ProfileRow>();
  if (ids.length > 0) {
    const { data: profiles, error: pErr } = await db
      .from('profiles')
      .select('id, first_name, last_name, email, avatar')
      .in('id', ids);
    if (pErr) throw ApiError.internal(`Failed to fetch profiles: ${pErr.message}`);
    profilesMap = new Map((profiles || []).map((p) => [p.id, p as ProfileRow]));
  }

  const formatMessage = (m: MessageRow) => {
    const sp = profilesMap.get(m.sender_id);
    const rp = profilesMap.get(m.recipient_id);
    return {
      id: m.id,
      sender: sp
        ? { id: sp.id, name: `${sp.first_name} ${sp.last_name}`, email: sp.email, avatar: sp.avatar }
        : { id: m.sender_id, name: undefined, email: undefined, avatar: undefined },
      recipient: rp
        ? { id: rp.id, name: `${rp.first_name} ${rp.last_name}`, email: rp.email, avatar: rp.avatar }
        : { id: m.recipient_id, name: undefined, email: undefined, avatar: undefined },
      subject: m.subject,
      body: m.body,
      attachments: m.attachments || [],
      isRead: m.is_read,
      readAt: m.read_at,
      created_at: m.created_at,
    };
  };

  res.json(
    ApiResponse.success('Message thread fetched successfully', {
      message: formatMessage(message as MessageRow),
      thread: threadMessages.map(formatMessage),
    })
  );
});

// @desc    Send a message
// @route   POST /api/v1/messages
// @access  Private
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { recipientId, subject, body, attachments, threadId } = req.body as {
    recipientId: string;
    subject: string;
    body: string;
    attachments?: unknown[];
    threadId?: string;
  };

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  if (!recipientId) throw ApiError.badRequest('recipientId is required');
  if (!subject) throw ApiError.badRequest('subject is required');
  if (!body) throw ApiError.badRequest('body is required');

  // Validate recipient exists
  const { data: recipient, error: recipientError } = await db
    .from('profiles')
    .select('id, first_name, last_name, email, avatar')
    .eq('id', recipientId)
    .maybeSingle();
  if (recipientError) throw ApiError.internal(`Failed to fetch recipient: ${recipientError.message}`);
  if (!recipient) throw ApiError.notFound('Recipient not found');

  // Create message
  const { data: message, error } = await db
    .from('messages')
    .insert({
      sender_id: userId,
      recipient_id: recipientId,
      subject,
      body,
      attachments: attachments || [],
      thread_id: threadId || null,
      is_read: false,
    })
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to send message: ${error.message}`);

  // Fetch sender profile for notification text
  const { data: senderProfile } = await db
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  const senderName = senderProfile ? `${senderProfile.first_name} ${senderProfile.last_name}` : 'A user';

  // Send notification to recipient
  await notificationService.createNotification(
    recipientId,
    'info',
    'New Message',
    `You have a new message from ${senderName}`,
    `/messages/${message.id}`
  );

  res.status(201).json(
    ApiResponse.success('Message sent successfully', {
      id: message.id,
      sender: { id: userId, name: senderName },
      recipient: { id: recipient.id, name: `${recipient.first_name} ${recipient.last_name}`, email: recipient.email, avatar: recipient.avatar },
      subject: message.subject,
      body: message.body,
      attachments: message.attachments || [],
      created_at: message.created_at,
    })
  );
});

// @desc    Mark message as read
// @route   PUT /api/v1/messages/:id/read
// @access  Private
export const markMessageAsRead = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: message, error: fetchError } = await db
    .from('messages')
    .select('id, recipient_id, is_read, read_at')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw ApiError.internal(`Failed to fetch message: ${fetchError.message}`);
  if (!message) throw ApiError.notFound('Message not found');

  // Check if user is the recipient
  if (message.recipient_id !== userId) {
    throw ApiError.forbidden('Not authorized to mark this message as read');
  }

  const { data: updated, error: updateError } = await db
    .from('messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, is_read, read_at')
    .single();
  if (updateError) throw ApiError.internal(`Failed to update message: ${updateError.message}`);

  res.json(
    ApiResponse.success('Message marked as read', {
      id: updated.id,
      isRead: updated.is_read,
      readAt: updated.read_at,
    })
  );
});

// @desc    Delete a message
// @route   DELETE /api/v1/messages/:id
// @access  Private
export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: message, error: fetchError } = await db
    .from('messages')
    .select('id, sender_id, recipient_id')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw ApiError.internal(`Failed to fetch message: ${fetchError.message}`);
  if (!message) throw ApiError.notFound('Message not found');

  // Check if user is sender or recipient
  if (message.sender_id !== userId && message.recipient_id !== userId) {
    throw ApiError.forbidden('Not authorized to delete this message');
  }

  const { error: delError } = await db.from('messages').delete().eq('id', id);
  if (delError) throw ApiError.internal(`Failed to delete message: ${delError.message}`);

  res.json(ApiResponse.success('Message deleted successfully', null));
});

// @desc    Get unread message count
// @route   GET /api/v1/messages/unread/count
// @access  Private
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { count, error } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);
  if (error) throw ApiError.internal(`Failed to count unread messages: ${error.message}`);

  res.json(ApiResponse.success('Unread count fetched successfully', { unreadCount: count || 0 }));
});

