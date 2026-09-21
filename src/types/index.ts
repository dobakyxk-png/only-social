export interface User {
  id: string;
  phone?: string;
  email?: string;
  passwordHash: string;
  status: 'active' | 'suspended' | 'deleted';
  isVerified: boolean;
  role: 'user' | 'moderator' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  userId: string;
  fullName: string;
  nickname?: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  interests: string[];
  generalCity?: string;
  updatedAt: Date;
}

export interface UserSettings {
  userId: string;
  ghostMode: boolean; // True = Ẩn hoàn toàn khỏi radar
  mapVisibility: 'everyone' | 'friends' | 'nobody';
  allowStrangerMessages: boolean;
  allowStrangerCalls: boolean;
  fuzzRadiusMeters: number; // 100 - 300m
  language: 'vi' | 'en';
  themeMode: 'light' | 'dark' | 'system';
}

export interface UserLocation {
  userId: string;
  exactLat: number;      // Vĩ độ thực tế (lưu nội bộ)
  exactLon: number;      // Kinh độ thực tế (lưu nội bộ)
  blurredLat: number;    // Vĩ độ đã làm mờ (công khai cho người khác)
  blurredLon: number;    // Kinh độ đã làm mờ (công khai cho người khác)
  heading?: number;
  speed?: number;
  isSharingActive: boolean;
  lastPingAt: Date;
}

export interface NearbyUserDTO {
  userId: string;
  fullName: string;
  avatarUrl?: string;
  gender: string;
  age: number;
  bio?: string;
  interests: string[];
  distanceMeters: number; // Khoảng cách ước tính
  blurredLat: number;
  blurredLon: number;
  isFriend: boolean;
  friendshipStatus?: 'none' | 'pending' | 'accepted' | 'declined';
}

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
  updatedAt: Date;
}

export interface BlockRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: Date;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  reportedUserId: string;
  targetType: 'user' | 'message' | 'post';
  targetId?: string;
  reasonCategory: string;
  description?: string;
  evidenceUrls: string[];
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  createdAt: Date;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  memberIds: string[];
  lastMessageAt?: Date;
  createdAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image' | 'emoji' | 'location_pin';
  content?: string;
  mediaUrl?: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: Date;
}

export interface UserConsent {
  id: string;
  userId: string;
  policyType: 'terms_of_service' | 'privacy_policy' | 'location_tracking';
  policyVersion: string;
  consentedAt: Date;
  ipAddress: string;
  userAgent: string;
}

// ------------------------------------------------------------------------------
// GIAI ĐOẠN 2: BẢNG TIN, CHECK-IN, LIKE, COMMENT & THÔNG BÁO
// ------------------------------------------------------------------------------

export interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaUrls: string[];
  checkinName?: string;
  checkinLat?: number;
  checkinLon?: number;
  checkinBlurredLat?: number;
  checkinBlurredLon?: number;
  privacy: 'public' | 'friends' | 'private';
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostLike {
  id: string;
  postId: string;
  userId: string;
  createdAt: Date;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  parentId?: string;
  content: string;
  createdAt: Date;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  senderId?: string;
  type: 'friend_request' | 'friend_accept' | 'post_like' | 'post_comment' | 'new_message' | 'system';
  title: string;
  body: string;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: Date;
}

export interface PostDTO extends Post {
  author: {
    userId: string;
    fullName: string;
    avatarUrl?: string;
    generalCity?: string;
  };
  isLikedByMe: boolean;
  recentComments?: Array<{
    id: string;
    author: {
      userId: string;
      fullName: string;
      avatarUrl?: string;
    };
    content: string;
    createdAt: Date;
  }>;
}

// ------------------------------------------------------------------------------
// GIAI ĐOẠN 3: WEBRTC CALLING, CALL LOGS & MODERATION
// ------------------------------------------------------------------------------

export interface CallLog {
  id: string;
  callerId: string;
  receiverId: string;
  callType: 'audio' | 'video';
  status: 'missed' | 'rejected' | 'accepted' | 'busy' | 'ended';
  durationSeconds: number;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

export interface CallSession {
  sessionId: string;
  callerId: string;
  receiverId: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended';
  startedAt?: Date;
  createdAt: Date;
}


