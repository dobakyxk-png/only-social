import { Router, Response } from 'express';
import { ChatService } from './chat.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';
import { uploadMiddleware, StorageService } from '../storage/storage.service';

const router = Router();

// POST /api/v1/chat/conversations (Tạo nhóm chat)
router.post('/conversations', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, memberIds } = req.body;
    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn thành viên cho nhóm' });
    }
    const group = ChatService.createGroupConversation(req.user!.userId, memberIds, name);
    res.status(201).json({ success: true, message: 'Đã tạo nhóm chat', data: group });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Không thể tạo nhóm chat' });
  }
});

// GET /api/v1/chat/conversations (Danh sách cuộc trò chuyện)
router.get('/conversations', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = ChatService.getConversations(req.user!.userId);
    res.json({
      success: true,
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

// GET /api/v1/chat/conversations/:id (Chi tiết nhóm chat)
router.get('/conversations/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const group = ChatService.getGroupConversation(req.user!.userId, req.params.id as string);
    res.json({ success: true, data: group });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// GET /api/v1/chat/conversations/:id/messages (Lấy lịch sử tin nhắn)
router.get(
  '/conversations/:id/messages',
  authMiddleware,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const messages = ChatService.getMessages(req.user!.userId, req.params.id as string);
      res.json({
        success: true,
        count: messages.length,
        data: messages,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// POST /api/v1/chat/send (Gửi tin nhắn 1-1 hoặc nhóm qua REST API)
router.post('/send', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { receiverId, conversationId, content, mediaUrl, type } = req.body;
    if (!receiverId && !conversationId) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp receiverId hoặc conversationId' });
    }

    const result = conversationId
      ? ChatService.sendMessageToConversation(req.user!.userId, conversationId, { content, mediaUrl, type })
      : ChatService.sendMessage(req.user!.userId, receiverId, { content, mediaUrl, type });

    res.status(201).json({ success: true, message: 'Đã gửi tin nhắn', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/chat/upload-media (Tải lên ảnh trong đoạn chat)
router.post(
  '/upload-media',
  authMiddleware,
  uploadMiddleware.single('file'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn tệp ảnh để gửi',
        });
      }

      const mediaUrl = StorageService.getPublicUrl(req.file.filename);
      res.json({
        success: true,
        data: { mediaUrl },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// POST /api/v1/chat/conversations/:id/read (Đánh dấu đã đọc)
router.post(
  '/conversations/:id/read',
  authMiddleware,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const readIds = ChatService.markAsRead(req.user!.userId, req.params.id as string);
      res.json({
        success: true,
        message: 'Đã đánh dấu đã đọc',
        data: { readIds },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

export const chatRouter = router;
