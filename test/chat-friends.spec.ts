import { FriendsService } from '../src/modules/friends/friends.service';
import { ChatService } from '../src/modules/chat/chat.service';
import { UsersService } from '../src/modules/users/users.service';

describe('Friends & 1-1 Chat Service', () => {
  const userA = 'user-sample-01'; // Lan Anh
  const userB = 'user-sample-02'; // Minh Tuấn
  const strangerC = 'user-sample-03'; // Thu Hương

  describe('Friendship Lifecycle', () => {
    let requestId: string;

    it('Gửi lời mời kết bạn thành công', () => {
      const friendship = FriendsService.sendRequest(userA, userB);
      expect(friendship.status).toBe('pending');
      expect(friendship.requesterId).toBe(userA);
      expect(friendship.addresseeId).toBe(userB);
      requestId = friendship.id;
    });

    it('Không thể tự kết bạn với chính mình', () => {
      expect(() => FriendsService.sendRequest(userA, userA)).toThrow(
        'Bạn không thể tự gửi lời mời kết bạn cho chính mình'
      );
    });

    it('Chấp nhận lời mời kết bạn thành công', () => {
      const accepted = FriendsService.acceptRequest(userB, requestId);
      expect(accepted.status).toBe('accepted');

      const friendsOfA = FriendsService.getFriendList(userA);
      expect(friendsOfA.some((f) => f.userId === userB)).toBe(true);

      const friendsOfB = FriendsService.getFriendList(userB);
      expect(friendsOfB.some((f) => f.userId === userA)).toBe(true);
    });
  });

  describe('1-1 Realtime Chat & Stranger Privacy', () => {
    it('Hai người bạn có thể nhắn tin cho nhau bình thường', () => {
      const { conversation, message } = ChatService.sendMessage(userA, userB, {
        content: 'Chào Tuấn, cuối tuần này rảnh cà phê không?',
        type: 'text',
      });

      expect(conversation.id).toBeDefined();
      expect(message.content).toBe('Chào Tuấn, cuối tuần này rảnh cà phê không?');
      expect(message.status).toBe('sent');
    });

    it('Đánh dấu tin nhắn đã xem (Read Receipt)', () => {
      const conv = ChatService.getOrCreateDirectConversation(userA, userB);
      const readIds = ChatService.markAsRead(userB, conv.id);
      expect(readIds.length).toBeGreaterThan(0);

      const messages = ChatService.getMessages(userB, conv.id);
      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.status).toBe('read');
    });

    it('Nếu người dùng tắt quyền nhận tin nhắn từ người lạ, người lạ không thể nhắn tin', () => {
      // Thu Hương tắt nhận tin nhắn người lạ
      UsersService.updateSettings(strangerC, { allowStrangerMessages: false });

      // Minh Tuấn (chưa kết bạn với Thu Hương) thử nhắn tin
      expect(() =>
        ChatService.sendMessage(userB, strangerC, {
          content: 'Chào em, làm quen nhé!',
          type: 'text',
        })
      ).toThrow('không nhận tin nhắn từ người lạ');

      // Khôi phục lại
      UsersService.updateSettings(strangerC, { allowStrangerMessages: true });
    });

    it('Người bị chặn không thể gửi tin nhắn', () => {
      // Lan Anh chặn Minh Tuấn
      UsersService.blockUser(userA, userB, 'Spam');

      expect(() =>
        ChatService.sendMessage(userB, userA, { content: 'Alo alo?' })
      ).toThrow('Không thể gửi tin nhắn cho người dùng này');

      // Bỏ chặn để dọn dẹp trạng thái
      UsersService.unblockUser(userA, userB);
    });
  });
});
