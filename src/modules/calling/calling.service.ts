import { db } from '../../database/data-store';
import { CallLog, CallSession } from '../../types';

export class CallingService {
  /**
   * Khởi tạo cuộc gọi thoại hoặc video WebRTC
   * Kiểm tra điều kiện chặn, người lạ và trạng thái bận
   */
  static initiateCall(
    callerId: string,
    receiverId: string,
    callType: 'audio' | 'video'
  ): CallSession {
    if (callerId === receiverId) {
      throw new Error('Không thể tự gọi điện cho chính mình');
    }

    // 1. Kiểm tra danh sách chặn
    if (db.isBlocked(callerId, receiverId)) {
      throw new Error('Không thể thực hiện cuộc gọi với người dùng này');
    }

    // 2. Kiểm tra quyền riêng tư: Nhận cuộc gọi từ người lạ
    const friendship = db.getFriendship(callerId, receiverId);
    const isFriend = friendship?.status === 'accepted';

    if (!isFriend) {
      const receiverSettings = db.settings.get(receiverId);
      if (receiverSettings && !receiverSettings.allowStrangerCalls) {
        throw new Error('Người dùng này không nhận cuộc gọi từ người lạ. Vui lòng kết bạn trước.');
      }
    }

    // 3. Kiểm tra xem người nhận có đang bận cuộc gọi khác không
    for (const session of db.activeCalls.values()) {
      if (
        (session.callerId === receiverId || session.receiverId === receiverId) &&
        (session.status === 'ringing' || session.status === 'accepted')
      ) {
        throw new Error('Người dùng hiện đang bận cuộc gọi khác');
      }
    }

    const sessionId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSession: CallSession = {
      sessionId,
      callerId,
      receiverId,
      callType,
      status: 'ringing',
      createdAt: new Date(),
    };

    db.activeCalls.set(sessionId, newSession);
    return newSession;
  }

  /**
   * Người nhận bấm "Đồng ý" cuộc gọi -> Bắt đầu kết nối WebRTC truyền âm thanh/hình ảnh
   */
  static acceptCall(sessionId: string, receiverId: string): CallSession {
    const session = db.activeCalls.get(sessionId);
    if (!session) {
      throw new Error('Cuộc gọi không tồn tại hoặc đã kết thúc');
    }

    if (session.receiverId !== receiverId) {
      throw new Error('Bạn không có quyền chấp nhận cuộc gọi này');
    }

    session.status = 'accepted';
    session.startedAt = new Date();
    db.activeCalls.set(sessionId, session);

    return session;
  }

  /**
   * Người nhận bấm "Từ chối" cuộc gọi
   */
  static rejectCall(sessionId: string, receiverId: string, reason?: string): CallLog {
    const session = db.activeCalls.get(sessionId);
    if (!session) {
      throw new Error('Cuộc gọi không tồn tại');
    }

    const callLog: CallLog = {
      id: `log_${session.sessionId}`,
      callerId: session.callerId,
      receiverId: session.receiverId,
      callType: session.callType,
      status: 'rejected',
      durationSeconds: 0,
      createdAt: new Date(),
    };

    db.callLogs.set(callLog.id, callLog);
    db.activeCalls.delete(sessionId);

    return callLog;
  }

  /**
   * Kết thúc cuộc gọi (Gác máy) và lưu nhật ký thời lượng
   */
  static endCall(sessionId: string, userId: string): CallLog {
    const session = db.activeCalls.get(sessionId);
    if (!session) {
      throw new Error('Cuộc gọi không còn tồn tại');
    }

    if (session.callerId !== userId && session.receiverId !== userId) {
      throw new Error('Bạn không thuộc phiên cuộc gọi này');
    }

    const endedAt = new Date();
    let durationSeconds = 0;
    if (session.startedAt) {
      durationSeconds = Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000);
    }

    const callLog: CallLog = {
      id: `log_${session.sessionId}`,
      callerId: session.callerId,
      receiverId: session.receiverId,
      callType: session.callType,
      status: session.status === 'accepted' ? 'ended' : 'missed',
      durationSeconds,
      startedAt: session.startedAt,
      endedAt,
      createdAt: new Date(),
    };

    db.callLogs.set(callLog.id, callLog);
    db.activeCalls.delete(sessionId);

    return callLog;
  }

  /**
   * Lấy lịch sử các cuộc gọi của người dùng
   */
  static getCallHistory(userId: string) {
    const history = [];

    for (const log of db.callLogs.values()) {
      if (log.callerId === userId || log.receiverId === userId) {
        const isOutgoing = log.callerId === userId;
        const partnerId = isOutgoing ? log.receiverId : log.callerId;
        const partnerProfile = db.profiles.get(partnerId);

        history.push({
          id: log.id,
          callType: log.callType,
          status: log.status,
          durationSeconds: log.durationSeconds,
          isOutgoing,
          startedAt: log.startedAt,
          createdAt: log.createdAt,
          partner: {
            userId: partnerId,
            fullName: partnerProfile?.fullName || 'Người dùng',
            avatarUrl: partnerProfile?.avatarUrl,
          },
        });
      }
    }

    history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return history;
  }
}
