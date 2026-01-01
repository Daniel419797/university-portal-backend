import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import logger from '../config/logger';

export const handlePaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  logger.info('Payment webhook received', { payload: req.body });

  // TODO: Verify signature and update payment records when provider details are finalized.

  res.json(ApiResponse.success('Payment webhook processed', { received: true }));
});

export const handleEmailWebhook = asyncHandler(async (req: Request, res: Response) => {
  logger.info('Email webhook received', { payload: req.body });

  // TODO: Update email delivery logs / notification statuses once provider metadata is defined.

  res.json(ApiResponse.success('Email webhook processed', { received: true }));
});
