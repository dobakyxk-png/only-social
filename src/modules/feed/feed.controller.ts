import { Router, Response } from 'express';
import { FeedService } from './feed.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';
import { uploadMiddleware, StorageService } from '../storage/storage.service';

const router: Router = Router();

// POST /api/v1/feed/posts (Tạo bài viết mới / Check-in kèm ảnh)
router.post(
  '/posts',
  authMiddleware,
  uploadMiddleware.array('images', 5),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content, checkinName, checkinLat, checkinLon, privacy } = req.body;

      // Xử lý các ảnh đã tải lên
      const mediaUrls: string[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          mediaUrls.push(StorageService.getPublicUrl(file.filename));
        }
      }

      const post = FeedService.createPost(req.user!.userId, {
        content,
        mediaUrls,
        checkinName,
        checkinLat: checkinLat !== undefined ? Number(checkinLat) : undefined,
        checkinLon: checkinLon !== undefined ? Number(checkinLon) : undefined,
        privacy,
      });

      res.status(201).json({
        success: true,
        message: 'Đăng bài viết thành công',
        data: post,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Lỗi khi đăng bài viết',
      });
    }
  }
);

// GET /api/v1/feed/posts (Lấy bảng tin)
router.get('/posts', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = (req.query.filter as 'all' | 'friends' | 'nearby') || 'all';
    const radiusMeters = req.query.radius ? parseInt(req.query.radius as string, 10) : 10000;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const posts = FeedService.getFeed(req.user!.userId, {
      filter,
      radiusMeters,
      limit,
    });

    res.json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /api/v1/feed/checkins (Lấy các ghim Check-in xung quanh để vẽ lên Bản đồ)
router.get('/checkins', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const radiusMeters = req.query.radius ? parseInt(req.query.radius as string, 10) : 10000;
    const pins = FeedService.getNearbyCheckinPins(req.user!.userId, radiusMeters);

    res.json({
      success: true,
      count: pins.length,
      data: pins,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /api/v1/feed/users/:userId/timeline (Dòng thời gian cá nhân của người dùng)
router.get('/users/:userId/timeline', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const posts = FeedService.getUserTimeline(req.user!.userId, req.params.userId as string);
    res.json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/feed/posts/:id/like (Thả tim / Bỏ thích)
router.post('/posts/:id/like', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = FeedService.toggleLike(req.user!.userId, req.params.id as string);
    res.json({
      success: true,
      message: result.isLiked ? 'Đã thích bài viết' : 'Đã bỏ thích bài viết',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/v1/feed/posts/:id/comments (Thêm bình luận)
router.post('/posts/:id/comments', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, parentId } = req.body;
    const comment = FeedService.addComment(
      req.user!.userId,
      req.params.id as string,
      content,
      parentId
    );

    res.status(201).json({
      success: true,
      message: 'Đã thêm bình luận',
      data: comment,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /api/v1/feed/posts/:id/comments (Lấy tất cả bình luận)
router.get('/posts/:id/comments', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const comments = FeedService.getComments(req.params.id as string);
    res.json({
      success: true,
      count: comments.length,
      data: comments,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// DELETE /api/v1/feed/posts/:id (Xoá bài viết)
router.delete('/posts/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    FeedService.deletePost(req.user!.userId, req.params.id as string);
    res.json({
      success: true,
      message: 'Đã xoá bài viết thành công',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export const feedRouter: Router = router;
