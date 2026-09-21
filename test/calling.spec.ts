import { CallingService } from '../src/modules/calling/calling.service';
import { FriendsService } from '../src/modules/friends/friends.service';
import { UsersService } from '../src/modules/users/users.service';
import { db } from '../src/database/data-store';

describe('Phase 3: WebRTC Calling & Call Logs Service', () => {
  const userA = 'user-sample-01'; // Lan Anh
  const userB = 'user-sample-02'; // Minh Tuấn
  const strangerC = 'user-sample-05'; // Mai Hoa (chưa kết bạn)

  beforeAll(() => {
    // Đảm bảo A và B là bạn bè
    const f = FriendsService.sendRequest(userA, userB);
    FriendsService.acceptRequest(userB, f.id);
  });

  describe('Call Initiation & Privacy Rules', () => {
    it('Khởi tạo cuộc gọi thoại thành công giữa hai người bạn', () => {
      const session = CallingService.initiateCall(userA, userB, 'audio');
      expect(session.sessionId).toBeDefined();
      expect(session.callerId).toBe(userA);
      expect(session.receiverId).toBe(userB);
      expect(session.callType).toBe('audio');
      expect(session.status).toBe('ringing');

      // Gác máy để dọn dẹp
      CallingService.endCall(session.sessionId, userA);
    });

    it('Khởi tạo cuộc gọi video thành công', () => {
      const session = CallingService.initiateCall(userA, userB, 'video');
      expect(session.callType).toBe('video');
      expect(session.status).toBe('ringing');

      CallingService.endCall(session.sessionId, userA);
    });

    it('Không thể tự gọi điện cho chính mình', () => {
      expect(() => CallingService.initiateCall(userA, userA, 'audio')).toThrow(
        'Không thể tự gọi điện cho chính mình'
      );
    });

    it('Từ chối cuộc gọi từ người lạ nếu người nhận tắt allowStrangerCalls', () => {
      // Mai Hoa tắt nhận cuộc gọi từ người lạ
      UsersService.updateSettings(strangerC, { allowStrangerCalls: false });

      // Minh Tuấn gọi cho Mai Hoa
      expect(() => CallingService.initiateCall(userB, strangerC, 'audio')).toThrow(
        'không nhận cuộc gọi từ người lạ'
      );
    });

    it('Không thể gọi điện cho người đã chặn mình', () => {
      UsersService.blockUser(userA, userB, 'Spam');

      expect(() => CallingService.initiateCall(userB, userA, 'audio')).toThrow(
        'Không thể thực hiện cuộc gọi với người dùng này'
      );

      // Bỏ chặn để khôi phục trạng thái
      UsersService.unblockUser(userA, userB);
    });
  });

  describe('Call Lifecycle: Accept, Reject & End', () => {
    beforeEach(() => {
      // Khôi phục quan hệ bạn bè giữa userA và userB nếu chưa có
      const existing = db.getFriendship(userA, userB);
      if (!existing) {
        const f = FriendsService.sendRequest(userA, userB);
        FriendsService.acceptRequest(userB, f.id);
      } else if (existing.status !== 'accepted') {
        existing.status = 'accepted';
        db.friendships.set(existing.id, existing);
      }
    });

    it('Người nhận bấm Đồng ý cuộc gọi -> Trạng thái chuyển sang accepted', () => {
      const session = CallingService.initiateCall(userA, userB, 'audio');
      const accepted = CallingService.acceptCall(session.sessionId, userB);

      expect(accepted.status).toBe('accepted');
      expect(accepted.startedAt).toBeDefined();

      // Kết thúc cuộc gọi
      const log = CallingService.endCall(session.sessionId, userA);
      expect(log.status).toBe('ended');
      expect(log.durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it('Người nhận bấm Từ chối cuộc gọi -> Ghi nhận log rejected', () => {
      const session = CallingService.initiateCall(userA, userB, 'video');
      const log = CallingService.rejectCall(session.sessionId, userB, 'Đang bận họp');

      expect(log.status).toBe('rejected');
      expect(log.durationSeconds).toBe(0);
      expect(log.callerId).toBe(userA);
      expect(log.receiverId).toBe(userB);
    });

    it('Lấy lịch sử cuộc gọi của người dùng chính xác', () => {
      const history = CallingService.getCallHistory(userA);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].partner).toBeDefined();
      expect(history[0].callType).toBeDefined();
    });
  });
});
