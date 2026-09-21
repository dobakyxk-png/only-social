import { Router, Response } from 'express';
import { UsersService } from './users.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';
import { uploadMiddleware, StorageService } from '../storage/storage.service';

const router = Router();

// PUT /api/v1/users/profile (Cập nhật hồ sơ)
router.put('/profile', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = UsersService.updateProfile(req.user!.userId, req.body);
    res.json({
      success: true,
      message: 'Cập nhật thông tin hồ sơ thành công',
      data: updated,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi cập nhật hồ sơ',
    });
  }
});

// POST /api/v1/users/avatar (Tải lên ảnh đại diện)
router.post(
  '/avatar',
  authMiddleware,
  uploadMiddleware.single('avatar'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn tệp ảnh để tải lên',
        });
      }

      const avatarUrl = StorageService.getPublicUrl(req.file.filename);
      const updated = UsersService.updateProfile(req.user!.userId, { avatarUrl });

      res.json({
        success: true,
        message: 'Tải lên ảnh đại diện thành công',
        data: {
          avatarUrl,
          profile: updated,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Lỗi khi tải ảnh lên',
      });
    }
  }
);

// PUT /api/v1/users/settings (Cập nhật cài đặt Ghost Mode, quyền riêng tư)
router.put('/settings', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = UsersService.updateSettings(req.user!.userId, req.body);
    res.json({
      success: true,
      message: 'Cập nhật cài đặt thành công',
      data: updated,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi cập nhật cài đặt',
    });
  }
});

// GET /api/v1/users/:id (Xem trang cá nhân người khác)
router.get('/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = req.params.id as string;
    const profile = UsersService.getPublicProfile(req.user!.userId, targetUserId);
    res.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: error.message || 'Không tìm thấy người dùng',
    });
  }
});

// POST /api/v1/users/:id/block (Chặn người dùng)
router.post('/:id/block', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = UsersService.blockUser(req.user!.userId, req.params.id as string, req.body.reason);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/users/:id/unblock (Bỏ chặn người dùng)
router.post('/:id/unblock', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = UsersService.unblockUser(req.user!.userId, req.params.id as string);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/users/:id/report (Báo cáo người dùng)
router.post('/:id/report', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = UsersService.reportUser(req.user!.userId, {
      reportedUserId: req.params.id as string,
      targetType: req.body.targetType || 'user',
      targetId: req.body.targetId,
      reasonCategory: req.body.reasonCategory || 'other',
      description: req.body.description,
      evidenceUrls: req.body.evidenceUrls,
    });
    res.json({
      success: true,
      message: result.message,
      data: { reportId: result.reportId },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export const usersRouter = router;
