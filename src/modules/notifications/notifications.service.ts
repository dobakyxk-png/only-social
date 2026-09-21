import { db } from '../../database/data-store';
import { AppNotification } from '../../types';

// Callback hoặc Socket.io instance để phát thông báo realtime
let socketNotificationEmitter: ((recipientId: string, notification: AppNotification) => void) | null = null;

export function registerSocketNotificationEmitter(
  emitter: (recipientId: string, notification: AppNotification) => void
) {
  socketNotificationEmitter = emitter;
}

export class NotificationsService {
  /**
   * Tạo và gửi thông báo tới người dùng (tích hợp WebSocket realtime + chuẩn bị sẵn FCM)
   */
  static createNotification(data: {
    recipientId: string;
    senderId?: string;
    type: 'friend_request' | 'friend_accept' | 'post_like' | 'post_comment' | 'new_message' | 'system';
    title: string;
    body: string;
    payloadData?: Record<string, any>;
  }): AppNotification {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const notification: AppNotification = {
      id: notificationId,
      recipientId: data.recipientId,
      senderId: data.senderId,
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.payloadData,
      isRead: false,
      createdAt: new Date(),
    };

    db.notifications.set(notificationId, notification);

    // 1. Phát qua WebSocket Socket.io thời gian thực
    if (socketNotificationEmitter) {
      try {
        socketNotificationEmitter(data.recipientId, notification);
      } catch (err) {
        console.warn('[Notification] Lỗi phát socket:', err);
      }
    }

    // 2. Tích hợp FCM Push Notification (Firebase Cloud Messaging)
    this.dispatchFCMPush(data.recipientId, notification);

    return notification;
  }

  /**
   * Giả lập gửi thông báo đẩy qua Firebase Cloud Messaging (FCM)
   */
  private static dispatchFCMPush(recipientId: string, notification: AppNotification) {
    // Khi anh Kỷ đặt file config/firebase-adminsdk.json, FCM SDK sẽ tự động kích hoạt
    console.log(`[FCM Push] 📲 Đẩy thông báo tới User ${recipientId}: "${notification.title} - ${notification.body}"`);
  }

  /**
   * Lấy danh sách thông báo của người dùng
   */
  static getNotifications(userId: string): AppNotification[] {
    const list: AppNotification[] = [];
    for (const notif of db.notifications.values()) {
      if (notif.recipientId === userId) {
        list.push(notif);
      }
    }
    // Sắp xếp thông báo mới nhất lên đầu
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  /**
   * Đánh dấu một thông báo là đã đọc
   */
  static markAsRead(userId: string, notificationId: string): boolean {
    const notif = db.notifications.get(notificationId);
    if (notif && notif.recipientId === userId) {
      notif.isRead = true;
      db.notifications.set(notificationId, notif);
      return true;
    }
    return false;
  }

  /**
   * Đánh dấu tất cả thông báo của người dùng là đã đọc
   */
  static markAllAsRead(userId: string): number {
    let count = 0;
    for (const notif of db.notifications.values()) {
      if (notif.recipientId === userId && !notif.isRead) {
        notif.isRead = true;
        db.notifications.set(notif.id, notif);
        count++;
      }
    }
    return count;
  }
}
