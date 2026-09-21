import { ModerationService } from '../src/modules/moderation/moderation.service';
import { UsersService } from '../src/modules/users/users.service';
import { FeedService } from '../src/modules/feed/feed.service';
import { db } from '../src/database/data-store';

describe('Phase 3: Moderation & Profanity Filter Service', () => {
  const reporterId = 'user-sample-01'; // Lan Anh
  const badUserId = 'user-sample-04'; // Hoàng Việt

  describe('Profanity Filter', () => {
    it('Phát hiện và làm sạch các từ ngữ thô tục nhạy cảm', () => {
      const dirtySentence = 'Ứng dụng này như lồn, đm lừa đảo vcl';
      const result = ModerationService.filterProfanity(dirtySentence);

      expect(result.hasProfanity).toBe(true);
      expect(result.matchedWords.length).toBeGreaterThanOrEqual(3);
      expect(result.cleanText).toContain('***');
      expect(result.cleanText).not.toContain('lồn');
      expect(result.cleanText).not.toContain('đm');
      expect(result.cleanText).not.toContain('vcl');
    });

    it('Giữ nguyên các văn bản lịch sự an toàn', () => {
      const cleanSentence = 'Hôm nay thời tiết Hà Nội thật đẹp và mát mẻ!';
      const result = ModerationService.filterProfanity(cleanSentence);

      expect(result.hasProfanity).toBe(false);
      expect(result.matchedWords.length).toBe(0);
      expect(result.cleanText).toBe(cleanSentence);
    });
  });

  describe('Report Violation & Resolution', () => {
    let reportId: string;
    let badPostId: string;

    beforeAll(() => {
      // Tạo bài viết vi phạm
      const post = FeedService.createPost(badUserId, {
        content: 'Bài viết chứa nội dung spam lừa đảo',
        privacy: 'public',
      });
      badPostId = post.id;

      // Lan Anh gửi báo cáo
      const rep = UsersService.reportUser(reporterId, {
        reportedUserId: badUserId,
        targetType: 'post',
        targetId: badPostId,
        reasonCategory: 'spam',
        description: 'Tài khoản này liên tục đăng bài spam',
      });
      reportId = rep.reportId;
    });

    it('Lấy danh sách các báo cáo vi phạm cần xử lý', () => {
      const reports = ModerationService.getReports();
      expect(Array.isArray(reports)).toBe(true);
      const target = reports.find((r) => r.id === reportId);
      expect(target).toBeDefined();
      expect(target?.reportedUser.fullName).toBeDefined();
      expect(target?.status).toBe('pending');
    });

    it('Kiểm duyệt viên gỡ bài viết vi phạm (delete_content)', () => {
      const res = ModerationService.resolveReport(reportId, 'delete_content', 'Gỡ bỏ bài viết spam');
      expect(res.status).toBe('resolved');

      // Kiểm tra bài viết đã bị gỡ khỏi hệ thống
      const post = db.posts.get(badPostId);
      expect(post).toBeUndefined();
    });

    it('Kiểm duyệt viên tạm khoá tài khoản tái phạm (suspend_user)', () => {
      const rep2 = UsersService.reportUser(reporterId, {
        reportedUserId: badUserId,
        targetType: 'user',
        reasonCategory: 'harassment',
      });

      const res = ModerationService.resolveReport(rep2.reportId, 'suspend_user', 'Khoá do tái phạm nhiều lần');
      expect(res.status).toBe('resolved');

      // Kiểm tra tài khoản đã bị suspended
      const user = db.users.get(badUserId);
      expect(user?.status).toBe('suspended');

      // Khôi phục lại trạng thái để không ảnh hưởng test khác
      if (user) {
        user.status = 'active';
        db.users.set(user.id, user);
      }
    });
  });
});
