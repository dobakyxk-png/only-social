import { Router, Response } from 'express';
import { NotificationsService } from './notifications.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';

const router: Router = Router();

// GET /api/v1/notifications (Danh sách thông báo)
router.get('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = NotificationsService.getNotifications(req.user!.userId);
    const unreadCount = list.filter((n) => !n.isRead).length;

    res.json({
      success: true,
      unreadCount,
      count: list.length,
      data: list,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/notifications/:id/read (Đánh dấu 1 thông báo là đã đọc)
router.post('/:id/read', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = NotificationsService.markAsRead(req.user!.userId, req.params.id as string);
    res.json({
      success,
      message: success ? 'Đã đánh dấu đã đọc' : 'Không tìm thấy thông báo',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/notifications/read-all (Đánh dấu tất cả thông báo là đã đọc)
router.post('/read-all', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const count = NotificationsService.markAllAsRead(req.user!.userId);
    res.json({
      success: true,
      message: `Đã đánh dấu ${count} thông báo là đã đọc`,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export const notificationsRouter: Router = router;
