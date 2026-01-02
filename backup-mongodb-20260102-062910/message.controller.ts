import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import Message from '../models/Message.model';
import User from '../models/User.model';
import notificationService from '../services/notification.service';

// @desc    Get all messages (inbox)
// @route   GET /api/v1/messages
// @access  Private
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { type = 'inbox', page = 1, limit = 20 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  let query: any = {};

  if (type === 'inbox') {
    query.recipient = userId;
  } else if (type === 'sent') {
    query.sender = userId;
  }

  const messages = await Message.find(query)
    .populate('sender', 'firstName lastName email avatar')
    .populate('recipient', 'firstName lastName email avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const total = await Message.countDocuments(query);
  const unreadCount = await Message.countDocuments({
    recipient: userId,
    isRead: false
  });

  res.json(
    ApiResponse.success('Messages fetched successfully', {
      messages: messages.map(m => ({
        id: m._id,
        sender: {
          id: (m.sender as any)._id,
          name: (m.sender as any).firstName + ' ' + (m.sender as any).lastName,
          email: (m.sender as any).email,
          avatar: (m.sender as any).avatar
        },
        recipient: {
          id: (m.recipient as any)._id,
          name: (m.recipient as any).firstName + ' ' + (m.recipient as any).lastName,
          email: (m.recipient as any).email,
          avatar: (m.recipient as any).avatar
        },
        subject: m.subject,
        body: m.body,
        attachments: m.attachments,
        isRead: m.isRead,
        readAt: m.readAt,
        thread: m.thread,
        createdAt: m.createdAt
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      },
      unreadCount
    })
  );
});

// @desc    Get message thread
// @route   GET /api/v1/messages/:id
// @access  Private
export const getMessageThread = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  // Get the main message
  const message = await Message.findById(id)
    .populate('sender', 'firstName lastName email avatar')
    .populate('recipient', 'firstName lastName email avatar');

  if (!message) {
    res.status(404);
    throw new Error('Message not found');
  }

  // Check authorization
  if (
    message.sender.toString() !== userId &&
    message.recipient.toString() !== userId
  ) {
    res.status(403);
    throw new Error('Not authorized to view this message');
  }

  // Mark as read if user is recipient and message is unread
  if (message.recipient.toString() === userId && !message.isRead) {
    message.isRead = true;
    message.readAt = new Date();
    await message.save();
  }

  // Get thread messages if this message is part of a thread
  let threadMessages: any[] = [];
  if (message.thread) {
    threadMessages = await Message.find({
      $or: [
        { _id: message.thread },
        { thread: message.thread },
        { thread: message._id }
      ]
    })
      .populate('sender', 'firstName lastName email avatar')
      .populate('recipient', 'firstName lastName email avatar')
      .sort({ createdAt: 1 });
  } else {
    // Get replies to this message
    threadMessages = await Message.find({ thread: message._id })
      .populate('sender', 'firstName lastName email avatar')
      .populate('recipient', 'firstName lastName email avatar')
      .sort({ createdAt: 1 });
  }

  const formatMessage = (m: any) => ({
    id: m._id,
    sender: {
      id: (m.sender as any)._id,
      name: (m.sender as any).firstName + ' ' + (m.sender as any).lastName,
      email: (m.sender as any).email,
      avatar: (m.sender as any).avatar
    },
    recipient: {
      id: (m.recipient as any)._id,
      name: (m.recipient as any).firstName + ' ' + (m.recipient as any).lastName,
      email: (m.recipient as any).email,
      avatar: (m.recipient as any).avatar
    },
    subject: m.subject,
    body: m.body,
    attachments: m.attachments,
    isRead: m.isRead,
    readAt: m.readAt,
    createdAt: m.createdAt
  });

  res.json(
    ApiResponse.success('Message thread fetched successfully', {
      message: formatMessage(message),
      thread: threadMessages.map(formatMessage)
    })
  );
});

// @desc    Send a message
// @route   POST /api/v1/messages
// @access  Private
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { recipientId, subject, body, attachments, threadId } = req.body;

  // Validate recipient exists
  const recipient = await User.findById(recipientId);
  if (!recipient) {
    res.status(404);
    throw new Error('Recipient not found');
  }

  // Create message
  const message = await Message.create({
    sender: userId,
    recipient: recipientId,
    subject,
    body,
    attachments: attachments || [],
    thread: threadId || undefined
  });

  const populatedMessage = await Message.findById(message._id)
    .populate('sender', 'firstName lastName email avatar')
    .populate('recipient', 'firstName lastName email avatar');

  // Send notification to recipient
  await notificationService.createNotification(
    recipientId,
    'info',
    'New Message',
    `You have a new message from ${(req as any).user.firstName} ${(req as any).user.lastName}`,
    `/messages/${message._id}`
  );

  res.status(201).json(
    ApiResponse.success('Message sent successfully', {
      id: (populatedMessage as any)._id,
      sender: {
        id: ((populatedMessage as any).sender as any)._id,
        name: ((populatedMessage as any).sender as any).firstName + ' ' + ((populatedMessage as any).sender as any).lastName,
        email: ((populatedMessage as any).sender as any).email
      },
      recipient: {
        id: ((populatedMessage as any).recipient as any)._id,
        name: ((populatedMessage as any).recipient as any).firstName + ' ' + ((populatedMessage as any).recipient as any).lastName,
        email: ((populatedMessage as any).recipient as any).email
      },
      subject: (populatedMessage as any).subject,
      body: (populatedMessage as any).body,
      attachments: (populatedMessage as any).attachments,
      createdAt: (populatedMessage as any).createdAt
    })
  );
});

// @desc    Mark message as read
// @route   PUT /api/v1/messages/:id/read
// @access  Private
export const markMessageAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  const message = await Message.findById(id);

  if (!message) {
    res.status(404);
    throw new Error('Message not found');
  }

  // Check if user is the recipient
  if (message.recipient.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to mark this message as read');
  }

  message.isRead = true;
  message.readAt = new Date();
  await message.save();

  res.json(
    ApiResponse.success('Message marked as read', {
      id: message._id,
      isRead: message.isRead,
      readAt: message.readAt
    })
  );
});

// @desc    Delete a message
// @route   DELETE /api/v1/messages/:id
// @access  Private
export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  const message = await Message.findById(id);

  if (!message) {
    res.status(404);
    throw new Error('Message not found');
  }

  // Check if user is sender or recipient
  if (
    message.sender.toString() !== userId &&
    message.recipient.toString() !== userId
  ) {
    res.status(403);
    throw new Error('Not authorized to delete this message');
  }

  await message.deleteOne();

  res.json(
    ApiResponse.success('Message deleted successfully', null)
  );
});

// @desc    Get unread message count
// @route   GET /api/v1/messages/unread/count
// @access  Private
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  const unreadCount = await Message.countDocuments({
    recipient: userId,
    isRead: false
  });

  res.json(
    ApiResponse.success('Unread count fetched successfully', {
      unreadCount
    })
  );
});

