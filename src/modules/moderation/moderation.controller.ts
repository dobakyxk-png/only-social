import { Router, Response } from 'express';
import { ModerationService } from './moderation.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';

const router: Router = Router();

// GET /api/v1/moderation/reports (Lấy danh sách báo cáo)
router.get('/reports', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const reports = ModerationService.getReports(status);
    res.json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/moderation/reports/:id/resolve (Xử lý báo cáo)
router.post('/reports/:id/resolve', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, note } = req.body;
    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp hành động xử lý (suspend_user, delete_content, dismiss)',
      });
    }

    const result = ModerationService.resolveReport(
      req.params.id as string,
      action,
      note
    );

    res.json({
      success: true,
      message: 'Xử lý báo cáo vi phạm thành công',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/moderation/check-text (Tiện ích kiểm tra từ ngữ thô tục)
router.post('/check-text', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { text } = req.body;
    const result = ModerationService.filterProfanity(text);
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export const moderationRouter: Router = router;
