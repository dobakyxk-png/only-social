import { db } from '../../database/data-store';
import { UserProfile, UserSettings, BlockRecord, ReportRecord } from '../../types';
import { calculateAge, calculateDistance } from '../../utils/geo';

export class UsersService {
  /**
   * Tìm người dùng theo tên, biệt danh hoặc số điện thoại.
   * Chỉ trả về dữ liệu hồ sơ an toàn, không lộ email/passwordHash.
   */
  static searchUsers(viewerId: string, query: string, limit = 20) {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) {
      throw new Error('Vui lòng nhập tên hoặc số điện thoại để tìm kiếm');
    }
    if (normalizedQuery.length < 2) {
      throw new Error('Vui lòng nhập ít nhất 2 ký tự');
    }

    return db.searchUsers(viewerId, normalizedQuery, limit);
  }

  /**
   * Cập nhật hồ sơ cá nhân
   */
  static updateProfile(userId: string, updateData: Partial<UserProfile>) {
    const profile = db.profiles.get(userId);
    if (!profile) {
      throw new Error('Không tìm thấy hồ sơ người dùng');
    }

    if (updateData.fullName) profile.fullName = updateData.fullName.trim();
    if (updateData.bio !== undefined) profile.bio = updateData.bio.trim();
    if (updateData.gender) profile.gender = updateData.gender;
    if (updateData.dateOfBirth) {
      const age = calculateAge(updateData.dateOfBirth);
      if (age < 16) {
        throw new Error('Độ tuổi tối thiểu là 16');
      }
      profile.dateOfBirth = updateData.dateOfBirth;
    }
    if (updateData.interests) profile.interests = updateData.interests;
    if (updateData.generalCity) profile.generalCity = updateData.generalCity;
    if (updateData.avatarUrl) profile.avatarUrl = updateData.avatarUrl;
    profile.updatedAt = new Date();

    db.profiles.set(userId, profile);
    return profile;
  }

  /**
   * Cập nhật cài đặt an toàn & quyền riêng tư (Ghost mode, hiển thị bản đồ, nhận tin nhắn lạ)
   */
  static updateSettings(userId: string, updateData: Partial<UserSettings>) {
    const settings = db.settings.get(userId);
    if (!settings) {
      throw new Error('Không tìm thấy cài đặt người dùng');
    }

    if (updateData.ghostMode !== undefined) {
      settings.ghostMode = Boolean(updateData.ghostMode);
      // Nếu bật Ghost Mode, cập nhật trạng thái không chia sẻ vị trí
      const loc = db.locations.get(userId);
      if (loc) {
        loc.isSharingActive = !settings.ghostMode;
        db.locations.set(userId, loc);
      }
    }

    if (updateData.mapVisibility) settings.mapVisibility = updateData.mapVisibility;
    if (updateData.allowStrangerMessages !== undefined) {
      settings.allowStrangerMessages = Boolean(updateData.allowStrangerMessages);
    }
    if (updateData.allowStrangerCalls !== undefined) {
      settings.allowStrangerCalls = Boolean(updateData.allowStrangerCalls);
    }
    if (updateData.fuzzRadiusMeters) settings.fuzzRadiusMeters = updateData.fuzzRadiusMeters;
    if (updateData.language) settings.language = updateData.language;
    if (updateData.themeMode) settings.themeMode = updateData.themeMode;

    db.settings.set(userId, settings);
    return settings;
  }

  /**
   * Xem trang cá nhân công khai của người khác
   */
  static getPublicProfile(viewerId: string, targetUserId: string) {
    if (db.isBlocked(viewerId, targetUserId)) {
      throw new Error('Không thể xem thông tin người dùng này');
    }

    const targetUser = db.users.get(targetUserId);
    const targetProfile = db.profiles.get(targetUserId);
    const targetSettings = db.settings.get(targetUserId);

    if (!targetUser || !targetProfile || targetUser.status !== 'active') {
      throw new Error('Người dùng không tồn tại hoặc đã ngừng hoạt động');
    }

    // Kiểm tra quan hệ bạn bè
    const friendship = db.getFriendship(viewerId, targetUserId);
    const isFriend = friendship?.status === 'accepted';

    // Tính khoảng cách ước tính nếu có toạ độ
    let distanceMeters: number | null = null;
    const viewerLoc = db.locations.get(viewerId);
    const targetLoc = db.locations.get(targetUserId);

    if (
      viewerLoc &&
      targetLoc &&
      targetLoc.isSharingActive &&
      !targetSettings?.ghostMode
    ) {
      distanceMeters = calculateDistance(
        viewerLoc.exactLat,
        viewerLoc.exactLon,
        targetLoc.blurredLat,
        targetLoc.blurredLon
      );
    }

    return {
      userId: targetUser.id,
      fullName: targetProfile.fullName,
      avatarUrl: targetProfile.avatarUrl,
      coverUrl: targetProfile.coverUrl,
      age: calculateAge(targetProfile.dateOfBirth),
      gender: targetProfile.gender,
      bio: targetProfile.bio,
      interests: targetProfile.interests,
      generalCity: targetProfile.generalCity,
      distanceMeters,
      isFriend,
      friendshipStatus: friendship ? friendship.status : 'none',
      allowStrangerMessages: targetSettings?.allowStrangerMessages ?? true,
    };
  }

  /**
   * Chặn người dùng
   */
  static blockUser(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) {
      throw new Error('Bạn không thể tự chặn chính mình');
    }

    const blockId = `blk_${blockerId}_${blockedId}`;
    const blockRecord: BlockRecord = {
      id: blockId,
      blockerId,
      blockedId,
      reason,
      createdAt: new Date(),
    };

    db.blocks.set(blockId, blockRecord);

    // Hủy quan hệ bạn bè nếu đang có
    const friendship = db.getFriendship(blockerId, blockedId);
    if (friendship) {
      db.friendships.delete(friendship.id);
    }

    return { message: 'Đã chặn người dùng thành công' };
  }

  /**
   * Bỏ chặn người dùng
   */
  static unblockUser(blockerId: string, blockedId: string) {
    const blockId = `blk_${blockerId}_${blockedId}`;
    db.blocks.delete(blockId);
    return { message: 'Đã bỏ chặn người dùng' };
  }

  /**
   * Báo cáo vi phạm nội dung / người dùng
   */
  static reportUser(
    reporterId: string,
    data: {
      reportedUserId: string;
      targetType: 'user' | 'message' | 'post';
      targetId?: string;
      reasonCategory: string;
      description?: string;
      evidenceUrls?: string[];
    }
  ) {
    const reportId = `rep_${Date.now()}`;
    const reportRecord: ReportRecord = {
      id: reportId,
      reporterId,
      reportedUserId: data.reportedUserId,
      targetType: data.targetType,
      targetId: data.targetId,
      reasonCategory: data.reasonCategory,
      description: data.description,
      evidenceUrls: data.evidenceUrls || [],
      status: 'pending',
      createdAt: new Date(),
    };

    db.reports.set(reportId, reportRecord);
    return {
      message: 'Báo cáo vi phạm của bạn đã được tiếp nhận. Đội ngũ kiểm duyệt sẽ xử lý trong vòng 24 giờ.',
      reportId,
    };
  }
}
