import { db } from '../../database/data-store';
import { Conversation, GroupConversationDTO, Message } from '../../types';

export class ChatService {
  /**
   * Tạo hoặc lấy cuộc trò chuyện 1-1 giữa 2 người dùng
   */
  static getOrCreateDirectConversation(userA: string, userB: string): Conversation {
    if (userA === userB) {
      throw new Error('Không thể tạo cuộc trò chuyện với chính mình');
    }

    if (db.isBlocked(userA, userB)) {
      throw new Error('Không thể trò chuyện với người dùng này');
    }

    let conv = db.findDirectConversation(userA, userB);
    if (!conv) {
      const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      conv = {
        id: convId,
        type: 'direct',
        memberIds: [userA, userB],
        createdAt: new Date(),
        lastMessageAt: new Date(),
      };
      db.conversations.set(convId, conv);
    }

    return conv;
  }

  /**
   * Tạo nhóm chat mới. Creator luôn là admin và cũng là thành viên nhóm.
   */
  static createGroupConversation(creatorId: string, memberIds: string[], name: string): GroupConversationDTO {
    const cleanName = name?.trim();
    if (!cleanName) throw new Error('Vui lòng nhập tên nhóm chat');
    if (cleanName.length > 80) throw new Error('Tên nhóm chat tối đa 80 ký tự');

    const uniqueMemberIds = Array.from(new Set([creatorId, ...(memberIds || [])]));
    if (uniqueMemberIds.length < 2) {
      throw new Error('Nhóm chat cần ít nhất 2 thành viên');
    }
    if (uniqueMemberIds.length > 50) {
      throw new Error('Nhóm chat tối đa 50 thành viên');
    }

    for (const memberId of uniqueMemberIds) {
      const user = db.users.get(memberId);
      if (!user || user.status !== 'active') {
        throw new Error('Một hoặc nhiều thành viên không tồn tại hoặc đã ngừng hoạt động');
      }
      if (memberId !== creatorId && db.isBlocked(creatorId, memberId)) {
        throw new Error('Không thể thêm người dùng đã bị chặn vào nhóm');
      }
    }

    const createdAt = new Date();
    const conversation: Conversation = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'group',
      memberIds: uniqueMemberIds,
      name: cleanName,
      createdBy: creatorId,
      adminIds: [creatorId],
      createdAt,
      lastMessageAt: createdAt,
    };
    db.conversations.set(conversation.id, conversation);
    return this.toGroupDTO(conversation);
  }

  /** Gửi tin nhắn vào nhóm; thành viên được xác thực ở server. */
  static sendMessageToConversation(
    senderId: string,
    conversationId: string,
    payload: {
      content?: string;
      mediaUrl?: string;
      type?: 'text' | 'image' | 'emoji' | 'location_pin';
    }
  ): { conversation: Conversation; message: Message } {
    const conversation = db.conversations.get(conversationId);
    if (!conversation || !conversation.memberIds.includes(senderId)) {
      throw new Error('Bạn không phải thành viên của cuộc trò chuyện này');
    }
    if (conversation.type !== 'group') {
      throw new Error('Hội thoại này không phải nhóm chat');
    }

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId,
      senderId,
      type: payload.type || (payload.mediaUrl ? 'image' : 'text'),
      content: payload.content,
      mediaUrl: payload.mediaUrl,
      status: 'sent',
      createdAt: new Date(),
    };
    db.messages.set(message.id, message);
    conversation.lastMessageAt = message.createdAt;
    db.conversations.set(conversation.id, conversation);
    return { conversation, message };
  }

  /**
   * Gửi tin nhắn 1-1
   */
  static sendMessage(
    senderId: string,
    receiverId: string,
    payload: {
      content?: string;
      mediaUrl?: string;
      type?: 'text' | 'image' | 'emoji' | 'location_pin';
    }
  ): { conversation: Conversation; message: Message } {
    if (senderId === receiverId) {
      throw new Error('Không thể gửi tin nhắn cho chính mình');
    }

    // 1. Kiểm tra chặn
    if (db.isBlocked(senderId, receiverId)) {
      throw new Error('Không thể gửi tin nhắn cho người dùng này');
    }

    // 2. Kiểm tra quyền riêng tư: Nhận tin nhắn từ người lạ
    const friendship = db.getFriendship(senderId, receiverId);
    const isFriend = friendship?.status === 'accepted';

    if (!isFriend) {
      const receiverSettings = db.settings.get(receiverId);
      if (receiverSettings && !receiverSettings.allowStrangerMessages) {
        throw new Error('Người dùng này không nhận tin nhắn từ người lạ. Vui lòng kết bạn trước khi trò chuyện.');
      }
    }

    // 3. Lấy hoặc tạo cuộc trò chuyện
    const conversation = this.getOrCreateDirectConversation(senderId, receiverId);

    // 4. Tạo tin nhắn
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const message: Message = {
      id: msgId,
      conversationId: conversation.id,
      senderId,
      type: payload.type || (payload.mediaUrl ? 'image' : 'text'),
      content: payload.content,
      mediaUrl: payload.mediaUrl,
      status: 'sent',
      createdAt: new Date(),
    };

    db.messages.set(msgId, message);
    conversation.lastMessageAt = message.createdAt;
    db.conversations.set(conversation.id, conversation);

    return { conversation, message };
  }

  private static toGroupDTO(conversation: Conversation): GroupConversationDTO {
    const members = conversation.memberIds
      .map((memberId) => {
        const profile = db.profiles.get(memberId);
        return profile
          ? { userId: memberId, fullName: profile.fullName, avatarUrl: profile.avatarUrl }
          : null;
      })
      .filter(Boolean) as GroupConversationDTO['members'];

    return {
      conversationId: conversation.id,
      type: 'group',
      name: conversation.name || 'Nhóm chat Only',
      memberCount: conversation.memberIds.length,
      members,
      createdBy: conversation.createdBy || conversation.memberIds[0],
      updatedAt: conversation.lastMessageAt || conversation.createdAt,
    };
  }

  /**
   * Lấy một nhóm chat theo quyền thành viên
   */
  static getGroupConversation(userId: string, conversationId: string): GroupConversationDTO {
    const conversation = db.conversations.get(conversationId);
    if (!conversation || conversation.type !== 'group' || !conversation.memberIds.includes(userId)) {
      throw new Error('Không tìm thấy nhóm chat hoặc bạn không phải thành viên');
    }
    return this.toGroupDTO(conversation);
  }

  /**
   * Đánh dấu các tin nhắn trong hội thoại là đã đọc
   */
  static markAsRead(userId: string, conversationId: string): string[] {
    const conversation = db.conversations.get(conversationId);
    if (!conversation || !conversation.memberIds.includes(userId)) {
      throw new Error('Bạn không phải thành viên của cuộc trò chuyện này');
    }

    const readMessageIds: string[] = [];

    for (const msg of db.messages.values()) {
      if (
        msg.conversationId === conversationId &&
        msg.senderId !== userId &&
        msg.status !== 'read'
      ) {
        msg.status = 'read';
        db.messages.set(msg.id, msg);
        readMessageIds.push(msg.id);
      }
    }

    return readMessageIds;
  }

  /**
   * Lấy danh sách các cuộc trò chuyện của người dùng
   */
  static getConversations(userId: string) {
    const list = [];

    for (const conv of db.conversations.values()) {
      if (conv.memberIds.includes(userId)) {
        const partnerId = conv.memberIds.find((id) => id !== userId);
        const partnerProfile = partnerId ? db.profiles.get(partnerId) : null;
        const partnerSettings = partnerId ? db.settings.get(partnerId) : null;
        const partnerLoc = partnerId ? db.locations.get(partnerId) : null;

        // Lấy tin nhắn mới nhất
        let lastMessage: Message | null = null;
        let unreadCount = 0;

        for (const msg of db.messages.values()) {
          if (msg.conversationId === conv.id) {
            if (!lastMessage || msg.createdAt > lastMessage.createdAt) {
              lastMessage = msg;
            }
            if (msg.senderId !== userId && msg.status !== 'read') {
              unreadCount++;
            }
          }
        }

        const isGroup = conv.type === 'group';
        const groupMembers = isGroup
          ? conv.memberIds
              .filter((id) => id !== userId)
              .map((id) => {
                const p = db.profiles.get(id);
                return p ? { userId: id, fullName: p.fullName, avatarUrl: p.avatarUrl } : null;
              })
              .filter(Boolean)
          : undefined;

        list.push({
          conversationId: conv.id,
          type: conv.type,
          name: isGroup ? conv.name || 'Nhóm chat Only' : undefined,
          memberCount: isGroup ? conv.memberIds.length : undefined,
          members: groupMembers,
          partner: !isGroup && partnerProfile
            ? {
                userId: partnerId,
                fullName: partnerProfile.fullName,
                avatarUrl: partnerProfile.avatarUrl,
                isOnline: true,
                isSharingLocation: partnerLoc?.isSharingActive && !partnerSettings?.ghostMode,
              }
            : null,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                senderId: lastMessage.senderId,
                content: lastMessage.content || (lastMessage.mediaUrl ? '[Hình ảnh]' : ''),
                type: lastMessage.type,
                status: lastMessage.status,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
          updatedAt: conv.lastMessageAt || conv.createdAt,
        });
      }
    }

    // Sắp xếp cuộc trò chuyện có tin nhắn mới nhất lên đầu
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return list;
  }

  /**
   * Lấy lịch sử tin nhắn của một cuộc trò chuyện
   */
  static getMessages(userId: string, conversationId: string): Message[] {
    const conv = db.conversations.get(conversationId);
    if (!conv || !conv.memberIds.includes(userId)) {
      throw new Error('Bạn không phải thành viên của cuộc trò chuyện này');
    }

    const messages: Message[] = [];
    for (const msg of db.messages.values()) {
      if (msg.conversationId === conversationId) {
        messages.push(msg);
      }
    }

    // Sắp xếp tin nhắn theo thứ tự thời gian tăng dần
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return messages;
  }
}
