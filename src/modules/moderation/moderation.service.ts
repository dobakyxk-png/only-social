import { db } from '../../database/data-store';
import { ReportRecord } from '../../types';

// Danh sách từ khoá nhạy cảm, thô tục cần tự động kiểm duyệt
const PROFANITY_WORDS = [
  'đm', 'đcm', 'vcl', 'clgt', 'đụ', 'đéo', 'lồn', 'buồi', 'cặc', 'chịch',
  'bitch', 'fuck', 'shit', 'scam', 'lừa đảo', 'hack', 'dkm'
];

export class ModerationService {
  /**
   * Tự động kiểm tra và làm sạch từ ngữ thô tục (Profanity Filter)
   */
  static filterProfanity(text: string): { cleanText: string; hasProfanity: boolean; matchedWords: string[] } {
    if (!text) return { cleanText: '', hasProfanity: false, matchedWords: [] };

    let cleanText = text;
    const matchedWords: string[] = [];

    for (const word of PROFANITY_WORDS) {
      // Regex tìm kiếm từ nguyên vẹn hoặc đứng riêng (case-insensitive)
      const regex = new RegExp(`\\b${word}\\b|${word}`, 'gi');
      if (regex.test(cleanText)) {
        matchedWords.push(word);
        cleanText = cleanText.replace(regex, '***');
      }
    }

    return {
      cleanText,
      hasProfanity: matchedWords.length > 0,
      matchedWords,
    };
  }

  /**
   * Lấy danh sách các báo cáo vi phạm nội dung & người dùng
   */
  static getReports(statusFilter?: string) {
    const reportsList = [];

    for (const report of db.reports.values()) {
      if (!statusFilter || report.status === statusFilter) {
        const reporterProfile = db.profiles.get(report.reporterId);
        const reportedUserProfile = db.profiles.get(report.reportedUserId);
        const reportedUser = db.users.get(report.reportedUserId);

        reportsList.push({
          id: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          reasonCategory: report.reasonCategory,
          description: report.description,
          status: report.status,
          evidenceUrls: report.evidenceUrls,
          createdAt: report.createdAt,
          reporter: {
            userId: report.reporterId,
            fullName: reporterProfile?.fullName || 'Người báo cáo',
          },
          reportedUser: {
            userId: report.reportedUserId,
            fullName: reportedUserProfile?.fullName || 'Người bị báo cáo',
            accountStatus: reportedUser?.status || 'active',
          },
        });
      }
    }

    reportsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return reportsList;
  }

  /**
   * Xử lý báo cáo vi phạm (Dành cho Quản trị viên / Kiểm duyệt viên)
   * Hành động: Tạm khoá tài khoản (suspend_user), Xoá nội dung (delete_content), Bỏ qua (dismiss)
   */
  static resolveReport(
    reportId: string,
    action: 'suspend_user' | 'delete_content' | 'dismiss',
    note?: string
  ) {
    const report = db.reports.get(reportId);
    if (!report) {
      throw new Error('Không tìm thấy bản ghi báo cáo');
    }

    let actionTaken = '';

    if (action === 'suspend_user') {
      const targetUser = db.users.get(report.reportedUserId);
      if (targetUser) {
        targetUser.status = 'suspended';
        db.users.set(targetUser.id, targetUser);
      }
      report.status = 'resolved';
      actionTaken = `Đã tạm khoá tài khoản người dùng vi phạm: ${report.reportedUserId}`;
    } else if (action === 'delete_content') {
      if (report.targetType === 'post' && report.targetId) {
        db.posts.delete(report.targetId);
      }
      report.status = 'resolved';
      actionTaken = `Đã gỡ bỏ nội dung bài viết vi phạm: ${report.targetId}`;
    } else if (action === 'dismiss') {
      report.status = 'dismissed';
      actionTaken = 'Đã bác bỏ báo cáo do không đủ căn cứ vi phạm';
    }

    db.reports.set(reportId, report);

    return {
      reportId,
      status: report.status,
      actionTaken,
      note,
    };
  }
}
