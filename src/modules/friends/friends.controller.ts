import { Router, Response } from 'express';
import { FriendsService } from './friends.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';

const router = Router();

// POST /api/v1/friends/request/:targetUserId (Gửi lời mời kết bạn)
router.post('/request/:targetUserId', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = FriendsService.sendRequest(req.user!.userId, req.params.targetUserId as string);
    res.status(201).json({
      success: true,
      message: 'Đã gửi lời mời kết bạn',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi gửi lời mời kết bạn',
    });
  }
});

// POST /api/v1/friends/accept/:requestId (Chấp nhận lời mời)
router.post('/accept/:requestId', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = FriendsService.acceptRequest(req.user!.userId, req.params.requestId as string);
    res.json({
      success: true,
      message: 'Đã chấp nhận lời mời kết bạn',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi chấp nhận lời mời',
    });
  }
});

// POST /api/v1/friends/decline/:requestId (Từ chối lời mời)
router.post('/decline/:requestId', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = FriendsService.declineRequest(req.user!.userId, req.params.requestId as string);
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

// GET /api/v1/friends (Lấy danh sách bạn bè)
router.get('/', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const friends = FriendsService.getFriendList(req.user!.userId);
    res.json({
      success: true,
      count: friends.length,
      data: friends,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /api/v1/friends/requests (Lấy lời mời đang chờ)
router.get('/requests', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = FriendsService.getPendingRequests(req.user!.userId);
    res.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// DELETE /api/v1/friends/:targetUserId (Huỷ kết bạn)
router.delete('/:targetUserId', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = FriendsService.unfriend(req.user!.userId, req.params.targetUserId as string);
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

export const friendsRouter = router;
