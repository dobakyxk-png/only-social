import { Router, Response } from 'express';
import { CallingService } from './calling.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';

const router: Router = Router();

// GET /api/v1/calls/history (Lịch sử cuộc gọi)
router.get('/history', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = CallingService.getCallHistory(req.user!.userId);
    res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/calls/initiate (Khởi tạo cuộc gọi qua REST nếu cần fallback)
router.post('/initiate', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { receiverId, callType } = req.body;
    const session = CallingService.initiateCall(
      req.user!.userId,
      receiverId,
      callType || 'audio'
    );
    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/calls/:sessionId/end (Kết thúc cuộc gọi)
router.post('/:sessionId/end', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const log = CallingService.endCall(req.params.sessionId as string, req.user!.userId);
    res.json({
      success: true,
      message: 'Đã kết thúc cuộc gọi',
      data: log,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export const callingRouter: Router = router;
