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
  name?: string;
  createdBy?: string;
  adminIds?: string[];
  lastMessageAt?: Date;
  createdAt: Date;
}

export interface UserSearchResult {
  userId: string;
  fullName: string;
  nickname?: string;
  avatarUrl?: string;
  phoneMasked?: string;
  friendshipStatus: 'none' | 'pending' | 'accepted' | 'declined';
  isFriend: boolean;
}

export interface GroupConversationDTO {
  conversationId: string;
  type: 'group';
  name: string;
  memberCount: number;
  members: Array<{
    userId: string;
    fullName: string;
    avatarUrl?: string;
  }>;
  createdBy: string;
  updatedAt: Date;
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

// ------------------------------------------------------------------------------
// GIAI ĐOẠN 4: ONLY RIDE - KẾT NỐI ĐI LẠI & TIỆN CHUYẾN CỘNG ĐỒNG
// ------------------------------------------------------------------------------

export interface DriverProfile {
  userId: string;
  vehicleType: 'motorbike' | 'car_4seats' | 'car_7seats';
  vehicleBrand: string; // VD: Honda Vision, VinFast VF5
  licensePlate: string; // VD: 29A-123.45
  vehicleColor?: string;
  ratingAvg: number;
  totalTrips: number;
  isVerified: boolean;
}

export interface DriverEarningMode {
  userId: string;
  isActive: boolean; // Đang bật chế độ kiếm tiền hay tắt
  vehicleType: 'motorbike' | 'car_4seats' | 'car_7seats';
  status: 'idle' | 'busy'; // Rảnh rỗi hoặc đang chở khách
  destinationFilter?: {
    name: string;
    lat: number;
    lon: number;
  };
  lastPingAt: Date;
}

export type RideStatus = 'searching' | 'negotiating' | 'accepted' | 'picking_up' | 'arrived' | 'in_trip' | 'completed' | 'cancelled';

export interface RideRequest {
  id: string;
  passengerId: string;
  driverId?: string; // Gán sau khi chốt tài xế
  pickupName: string;
  pickupLat: number;
  pickupLon: number;
  dropoffName: string;
  dropoffLat: number;
  dropoffLon: number;
  distanceKm: number;
  estimatedMins: number;
  routeProvider?: 'osrm' | 'estimate';
  vehicleType: 'motorbike' | 'car_4seats' | 'car_7seats';
  passengerNote?: string;
  suggestedPrice: number; // Giá khách đề xuất ban đầu (VNĐ)
  agreedPrice?: number; // Giá cuối cùng chốt thoả thuận (VNĐ)
  status: RideStatus;
  cancelledBy?: 'passenger' | 'driver' | 'timeout';
  driverLat?: number;
  driverLon?: number;
  driverLocationUpdatedAt?: Date;
  insurancePolicyId?: string; // Mã hợp đồng bảo hiểm tai nạn nhúng (Embedded Insurance)
  createdAt: Date;
  completedAt?: Date;
}

export interface RideOffer {
  id: string;
  rideId: string;
  driverId: string;
  offeredPrice: number; // Giá tài xế đưa ra
  estimatedPickupMins: number; // Dự kiến bao nhiêu phút đến đón
  note?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export interface RideDTO extends RideRequest {
  passenger: {
    userId: string;
    fullName: string;
    avatarUrl?: string;
    phone?: string;
  };
  driver?: {
    userId: string;
    fullName: string;
    avatarUrl?: string;
    phone?: string;
    vehicleType: string;
    vehicleBrand: string;
    licensePlate: string;
    ratingAvg: number;
  };
  offersCount: number;
}



