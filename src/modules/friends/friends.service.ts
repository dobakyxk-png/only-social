import { db } from '../../database/data-store';
import { Friendship } from '../../types';
import { calculateAge } from '../../utils/geo';
import { NotificationsService } from '../notifications/notifications.service';

export class FriendsService {
  /**
   * Gửi lời mời kết bạn
   */
  static sendRequest(requesterId: string, addresseeId: string): Friendship {
    if (requesterId === addresseeId) {
      throw new Error('Bạn không thể tự gửi lời mời kết bạn cho chính mình');
    }

    if (db.isBlocked(requesterId, addresseeId)) {
      throw new Error('Không thể gửi lời mời kết bạn cho người dùng này');
    }

    const targetUser = db.users.get(addresseeId);
    if (!targetUser || targetUser.status !== 'active') {
      throw new Error('Người dùng không tồn tại hoặc đã ngừng hoạt động');
    }

    // Kiểm tra xem đã có quan hệ hay chưa
    const existing = db.getFriendship(requesterId, addresseeId);
    if (existing) {
      if (existing.status === 'accepted') {
        throw new Error('Hai bạn đã là bạn bè của nhau rồi');
      }
      if (existing.status === 'pending') {
        if (existing.requesterId === requesterId) {
          throw new Error('Bạn đã gửi lời mời kết bạn rồi, vui lòng chờ phản hồi');
        } else {
          // Đối phương đã gửi lời mời trước đó -> Tự động chấp nhận luôn
          existing.status = 'accepted';
          existing.updatedAt = new Date();
          db.friendships.set(existing.id, existing);
          return existing;
        }
      }
    }

    const requestId = `fr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newFriendship: Friendship = {
      id: requestId,
      requesterId,
      addresseeId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.friendships.set(requestId, newFriendship);

    // Gửi thông báo tới người nhận lời mời
    const senderProfile = db.profiles.get(requesterId);
    NotificationsService.createNotification({
      recipientId: addresseeId,
      senderId: requesterId,
      type: 'friend_request',
      title: 'Lời mời kết bạn mới',
      body: `${senderProfile?.fullName || 'Ai đó'} đã gửi cho bạn một lời mời kết bạn.`,
      payloadData: { requestId, requesterId },
    });

    return newFriendship;
  }

  /**
   * Chấp nhận lời mời kết bạn
   */
  static acceptRequest(userId: string, requestId: string): Friendship {
    const friendship = db.friendships.get(requestId);
    if (!friendship) {
      throw new Error('Không tìm thấy lời mời kết bạn');
    }

    if (friendship.addresseeId !== userId) {
      throw new Error('Bạn không có quyền chấp nhận lời mời này');
    }

    if (friendship.status === 'accepted') {
      return friendship;
    }

    friendship.status = 'accepted';
    friendship.updatedAt = new Date();
    db.friendships.set(friendship.id, friendship);

    // Gửi thông báo cho người gửi lời mời ban đầu biết lời mời đã được chấp thuận
    const accepterProfile = db.profiles.get(userId);
    NotificationsService.createNotification({
      recipientId: friendship.requesterId,
      senderId: userId,
      type: 'friend_accept',
      title: 'Đã chấp nhận lời mời',
      body: `${accepterProfile?.fullName || 'Người bạn'} đã đồng ý lời mời kết bạn của bạn.`,
      payloadData: { friendshipId: friendship.id, userId },
    });

    return friendship;
  }

  /**
   * Từ chối lời mời kết bạn
   */
  static declineRequest(userId: string, requestId: string): { message: string } {
    const friendship = db.friendships.get(requestId);
    if (!friendship) {
      throw new Error('Không tìm thấy lời mời kết bạn');
    }

    if (friendship.addresseeId !== userId) {
      throw new Error('Bạn không có quyền từ chối lời mời này');
    }

    friendship.status = 'declined';
    friendship.updatedAt = new Date();
    db.friendships.set(friendship.id, friendship);

    return { message: 'Đã từ chối lời mời kết bạn' };
  }

  /**
   * Lấy danh sách bạn bè chính thức
   */
  static getFriendList(userId: string) {
    const friends = [];

    for (const f of db.friendships.values()) {
      if (f.status === 'accepted' && (f.requesterId === userId || f.addresseeId === userId)) {
        const friendId = f.requesterId === userId ? f.addresseeId : f.requesterId;
        const profile = db.profiles.get(friendId);
        const location = db.locations.get(friendId);
        const settings = db.settings.get(friendId);

        if (profile) {
          friends.push({
            friendshipId: f.id,
            userId: friendId,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            age: calculateAge(profile.dateOfBirth),
            bio: profile.bio,
            interests: profile.interests,
            isOnline: true,
            isSharingLocation: location?.isSharingActive && !settings?.ghostMode,
          });
        }
      }
    }

    return friends;
  }

  /**
   * Lấy danh sách lời mời kết bạn đang chờ (gửi đến và đã gửi đi)
   */
  static getPendingRequests(userId: string) {
    const received = [];
    const sent = [];

    for (const f of db.friendships.values()) {
      if (f.status === 'pending') {
        if (f.addresseeId === userId) {
          const senderProfile = db.profiles.get(f.requesterId);
          if (senderProfile) {
            received.push({
              requestId: f.id,
              userId: f.requesterId,
              fullName: senderProfile.fullName,
              avatarUrl: senderProfile.avatarUrl,
              age: calculateAge(senderProfile.dateOfBirth),
              bio: senderProfile.bio,
              createdAt: f.createdAt,
            });
          }
        } else if (f.requesterId === userId) {
          const targetProfile = db.profiles.get(f.addresseeId);
          if (targetProfile) {
            sent.push({
              requestId: f.id,
              userId: f.addresseeId,
              fullName: targetProfile.fullName,
              avatarUrl: targetProfile.avatarUrl,
              createdAt: f.createdAt,
            });
          }
        }
      }
    }

    return { received, sent };
  }

  /**
   * Huỷ kết bạn
   */
  static unfriend(userId: string, targetUserId: string): { message: string } {
    const friendship = db.getFriendship(userId, targetUserId);
    if (!friendship || friendship.status !== 'accepted') {
      throw new Error('Hai người chưa phải là bạn bè');
    }

    db.friendships.delete(friendship.id);
    return { message: 'Đã huỷ kết bạn' };
  }
}
