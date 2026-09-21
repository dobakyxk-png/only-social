import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { FeedService } from '../src/modules/feed/feed.service';

describe('Phase 2: Notifications Service', () => {
  const userA = 'user-sample-01'; // Lan Anh
  const userB = 'user-sample-02'; // Minh Tuấn

  it('Tạo và nhận thông báo thành công', () => {
    const notif = NotificationsService.createNotification({
      recipientId: userA,
      senderId: userB,
      type: 'system',
      title: 'Chào mừng!',
      body: 'Chào mừng bạn đến với mạng xã hội Only Giai đoạn 2.',
    });

    expect(notif.id).toBeDefined();
    expect(notif.recipientId).toBe(userA);
    expect(notif.isRead).toBe(false);

    const list = NotificationsService.getNotifications(userA);
    expect(list.some((n) => n.id === notif.id)).toBe(true);
  });

  it('Đánh dấu 1 thông báo là đã đọc', () => {
    const notif = NotificationsService.createNotification({
      recipientId: userA,
      type: 'system',
      title: 'Test Read',
      body: 'Thông báo cần đọc',
    });

    expect(notif.isRead).toBe(false);
    const success = NotificationsService.markAsRead(userA, notif.id);
    expect(success).toBe(true);

    const list = NotificationsService.getNotifications(userA);
    const updated = list.find((n) => n.id === notif.id);
    expect(updated?.isRead).toBe(true);
  });

  it('Đánh dấu tất cả thông báo là đã đọc', () => {
    NotificationsService.createNotification({ recipientId: userB, title: 'N1', body: 'B1', type: 'system' });
    NotificationsService.createNotification({ recipientId: userB, title: 'N2', body: 'B2', type: 'system' });

    const readCount = NotificationsService.markAllAsRead(userB);
    expect(readCount).toBeGreaterThanOrEqual(2);

    const list = NotificationsService.getNotifications(userB);
    const unread = list.filter((n) => !n.isRead);
    expect(unread.length).toBe(0);
  });

  it('Tự động sinh thông báo khi có người khác Thả tim bài viết', () => {
    const post = FeedService.createPost(userA, {
      content: 'Bài viết test thông báo like',
      privacy: 'public',
    });

    // Minh Tuấn like bài của Lan Anh
    FeedService.toggleLike(userB, post.id);

    const notifs = NotificationsService.getNotifications(userA);
    const likeNotif = notifs.find((n) => n.type === 'post_like' && n.data?.postId === post.id);
    expect(likeNotif).toBeDefined();
    expect(likeNotif?.title).toBe('Lượt thích mới');
    expect(likeNotif?.body).toContain('Trần Minh Tuấn');
  });

  it('Tự động sinh thông báo khi có người khác Bình luận bài viết', () => {
    const post = FeedService.createPost(userA, {
      content: 'Bài viết test thông báo comment',
      privacy: 'public',
    });

    // Minh Tuấn comment bài của Lan Anh
    FeedService.addComment(userB, post.id, 'Hình chụp đẹp quá!');

    const notifs = NotificationsService.getNotifications(userA);
    const cmtNotif = notifs.find((n) => n.type === 'post_comment' && n.data?.postId === post.id);
    expect(cmtNotif).toBeDefined();
    expect(cmtNotif?.title).toBe('Bình luận mới');
    expect(cmtNotif?.body).toContain('Hình chụp đẹp quá!');
  });
});
