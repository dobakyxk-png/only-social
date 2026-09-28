import bcrypt from 'bcryptjs';
import {
  User,
  UserProfile,
  UserSettings,
  UserLocation,
  Friendship,
  BlockRecord,
  ReportRecord,
  Conversation,
  Message,
  UserConsent,
  Post,
  PostLike,
  PostComment,
  AppNotification,
  CallLog,
  CallSession,
  DriverProfile,
  DriverEarningMode,
  RideRequest,
  RideOffer,
  UserSearchResult,
} from '../types';
import { fuzzLocation } from '../utils/geo';

/**
 * DataStore - Cơ sở dữ liệu bộ nhớ đệm hiệu năng cao cho ứng dụng "Only"
 * Hỗ trợ lưu trữ, truy vấn nhanh, đồng thời chuẩn bị sẵn sàng tương thích với PostgreSQL PostGIS.
 */
class DataStore {
  public users = new Map<string, User>();
  public profiles = new Map<string, UserProfile>();
  public settings = new Map<string, UserSettings>();
  public locations = new Map<string, UserLocation>();
  public friendships = new Map<string, Friendship>();
  public blocks = new Map<string, BlockRecord>();
  public reports = new Map<string, ReportRecord>();
  public conversations = new Map<string, Conversation>();
  public messages = new Map<string, Message>();
  public consents = new Map<string, UserConsent>();

  // Giai đoạn 2: Bảng tin, Check-in, Like, Comment, Thông báo
  public posts = new Map<string, Post>();
  public likes = new Map<string, PostLike>();
  public comments = new Map<string, PostComment>();
  public notifications = new Map<string, AppNotification>();

  // Giai đoạn 3: Cuộc gọi WebRTC, Nhật ký gọi điện
  public callLogs = new Map<string, CallLog>();
  public activeCalls = new Map<string, CallSession>();

  // Giai đoạn 4: Only Ride - Đi lại, Tiện chuyến, Bật kiếm tiền
  public driverProfiles = new Map<string, DriverProfile>();
  public driverEarningModes = new Map<string, DriverEarningMode>();
  public rideRequests = new Map<string, RideRequest>();
  public rideOffers = new Map<string, RideOffer>();

  constructor() {
    this.seedInitialData();
  }

  /**
   * Tạo sẵn dữ liệu mẫu thực tế xung quanh khu vực Hà Nội (Hoàn Kiếm / Ba Đình / Cầu Giấy)
   * để anh Kỷ và người dùng có thể thấy ngay người xung quanh trên radar khi chạy thử
   */
  private seedInitialData() {
    const defaultPasswordHash = bcrypt.hashSync('123456', 10);

    // Toạ độ gốc tham chiếu: Khu vực trung tâm Hà Nội (21.0285, 105.8542)
    const baseLat = 21.028511;
    const baseLon = 105.854167;

    const sampleUsers = [
      {
        id: 'user-sample-01',
        phone: '0901234567',
        email: 'lananh@gmail.com',
        fullName: 'Nguyễn Lan Anh',
        dob: '2000-05-15',
        gender: 'female' as const,
        bio: 'Thích du lịch, cà phê phố cổ, chụp ảnh film 📸',
        interests: ['Du lịch', 'Cà phê', 'Nhiếp ảnh', 'Âm nhạc'],
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
        lat: baseLat + 0.0021, // ~250m
        lon: baseLon + 0.0018,
      },
      {
        id: 'user-sample-02',
        phone: '0912345678',
        email: 'minhtuan@gmail.com',
        fullName: 'Trần Minh Tuấn',
        dob: '1998-11-20',
        gender: 'male' as const,
        bio: 'Kỹ sư phần mềm, đam mê chạy bộ & cầu lông 🏸',
        interests: ['Công nghệ', 'Chạy bộ', 'Cầu lông', 'Đọc sách'],
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
        lat: baseLat - 0.0035, // ~400m
        lon: baseLon + 0.0022,
      },
      {
        id: 'user-sample-03',
        phone: '0987654321',
        email: 'thuhuong@gmail.com',
        fullName: 'Lê Thu Hương',
        dob: '2002-08-10',
        gender: 'female' as const,
        bio: 'Sinh viên Ngoại Thương. Tìm bạn học ngoại ngữ và dạo hồ Tây ☕',
        interests: ['Ngoại ngữ', 'Ẩm thực', 'Mèo', 'Phim ảnh'],
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face',
        lat: baseLat + 0.0052, // ~650m
        lon: baseLon - 0.0031,
      },
      {
        id: 'user-sample-04',
        phone: '0933445566',
        email: 'hoangviet@gmail.com',
        fullName: 'Phạm Hoàng Việt',
        dob: '1995-03-25',
        gender: 'male' as const,
        bio: 'Kiến trúc sư nội thất. Thích giao lưu kết nối bạn bè cùng tần số 🎨',
        interests: ['Kiến trúc', 'Guitar', 'Thiết kế', 'Bơi lội'],
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
        lat: baseLat - 0.0078, // ~950m
        lon: baseLon - 0.0045,
      },
      {
        id: 'user-sample-05',
        phone: '0944556677',
        email: 'maihoa@gmail.com',
        fullName: 'Đặng Mai Hoa',
        dob: '2001-12-05',
        gender: 'female' as const,
        bio: 'Yêu thiên nhiên, thích cắm trại cuối tuần và yoga 🌿',
        interests: ['Yoga', 'Camping', 'Nấu ăn', 'Trà đạo'],
        avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=face',
        lat: baseLat + 0.012, // ~1.4km
        lon: baseLon + 0.008,
      },
    ];

    for (const sample of sampleUsers) {
      // 1. User
      this.users.set(sample.id, {
        id: sample.id,
        phone: sample.phone,
        email: sample.email,
        passwordHash: defaultPasswordHash,
        status: 'active',
        isVerified: true,
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Profile
      this.profiles.set(sample.id, {
        userId: sample.id,
        fullName: sample.fullName,
        dateOfBirth: sample.dob,
        gender: sample.gender,
        bio: sample.bio,
        avatarUrl: sample.avatar,
        interests: sample.interests,
        generalCity: 'Hà Nội',
        updatedAt: new Date(),
      });

      // 3. Settings
      this.settings.set(sample.id, {
        userId: sample.id,
        ghostMode: false,
        mapVisibility: 'everyone',
        allowStrangerMessages: true,
        allowStrangerCalls: false,
        fuzzRadiusMeters: 200,
        language: 'vi',
        themeMode: 'system',
      });

      // 4. Location (được áp dụng thuật toán làm mờ vị trí)
      const fuzz = fuzzLocation(sample.lat, sample.lon, 100, 300);
      this.locations.set(sample.id, {
        userId: sample.id,
        exactLat: sample.lat,
        exactLon: sample.lon,
        blurredLat: fuzz.blurredLat,
        blurredLon: fuzz.blurredLon,
        isSharingActive: true,
        lastPingAt: new Date(),
      });
    }

    // 5. Khởi tạo Bảng tin & Check-in địa điểm mẫu (Giai đoạn 2)
    const samplePosts: Post[] = [
      {
        id: 'post-01',
        authorId: 'user-sample-01', // Lan Anh
        content: 'Chiều thu Hà Nội ngồi cà phê ngắm phố cổ thật bình yên ☕🍃. Bạn nào đang ở gần đây ghé làm quen nhé!',
        mediaUrls: ['https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&fit=crop'],
        checkinName: 'Cafe Giảng - 39 Nguyễn Hữu Huân, Hoàn Kiếm',
        checkinLat: baseLat + 0.002,
        checkinLon: baseLon + 0.0018,
        checkinBlurredLat: baseLat + 0.0022,
        checkinBlurredLon: baseLon + 0.0020,
        privacy: 'public',
        likesCount: 5,
        commentsCount: 2,
        createdAt: new Date(Date.now() - 3600000 * 2), // 2 giờ trước
        updatedAt: new Date(),
      },
      {
        id: 'post-02',
        authorId: 'user-sample-02', // Minh Tuấn
        content: 'Vừa hoàn thành 10km chạy bộ quanh Hồ Tây sáng nay! Thời tiết gió mát dễ chịu vô cùng 🏃‍♂️🌤️',
        mediaUrls: ['https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&fit=crop'],
        checkinName: 'Hồ Tây, Tây Hồ, Hà Nội',
        checkinLat: baseLat + 0.015,
        checkinLon: baseLon - 0.012,
        checkinBlurredLat: baseLat + 0.0153,
        checkinBlurredLon: baseLon - 0.0118,
        privacy: 'public',
        likesCount: 8,
        commentsCount: 1,
        createdAt: new Date(Date.now() - 3600000 * 5), // 5 giờ trước
        updatedAt: new Date(),
      },
      {
        id: 'post-03',
        authorId: 'user-sample-03', // Thu Hương
        content: 'Cuối tuần dạo bộ ngắm hoàng hôn trên cầu Long Biên 🌇. Ai chụp ảnh film cùng không nào?',
        mediaUrls: ['https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&fit=crop'],
        checkinName: 'Cầu Long Biên, Hà Nội',
        checkinLat: baseLat + 0.008,
        checkinLon: baseLon + 0.009,
        checkinBlurredLat: baseLat + 0.0082,
        checkinBlurredLon: baseLon + 0.0092,
        privacy: 'public',
        likesCount: 12,
        commentsCount: 3,
        createdAt: new Date(Date.now() - 3600000 * 8), // 8 giờ trước
        updatedAt: new Date(),
      },
      {
        id: 'post-04',
        authorId: 'user-sample-04', // Hoàng Việt
        content: 'Gợi ý ý tưởng thiết kế căn hộ tối giản theo phong cách Wabi-sabi đón năm mới 🎨📐',
        mediaUrls: ['https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&fit=crop'],
        checkinName: 'Tràng Tiền Plaza, Hoàn Kiếm',
        checkinLat: baseLat - 0.003,
        checkinLon: baseLon + 0.002,
        checkinBlurredLat: baseLat - 0.0028,
        checkinBlurredLon: baseLon + 0.0022,
        privacy: 'public',
        likesCount: 3,
        commentsCount: 0,
        createdAt: new Date(Date.now() - 3600000 * 24), // 1 ngày trước
        updatedAt: new Date(),
      },
    ];

    for (const post of samplePosts) {
      this.posts.set(post.id, post);
    }

    // 6. Bình luận mẫu
    this.comments.set('cmt-01', {
      id: 'cmt-01',
      postId: 'post-01',
      authorId: 'user-sample-02', // Minh Tuấn
      content: 'Cà phê trứng ở Giảng ngon nhất phố cổ luôn!',
      createdAt: new Date(Date.now() - 3600000 * 1.5),
    });
    this.comments.set('cmt-02', {
      id: 'cmt-02',
      postId: 'post-01',
      authorId: 'user-sample-03', // Thu Hương
      content: 'Cho mình xin tên quán với Lan Anh ơi 🥰',
      createdAt: new Date(Date.now() - 3600000 * 1.2),
    });

    // 7. Khởi tạo dữ liệu mẫu cho Only Ride (Người có xe đang bật chế độ kiếm tiền)
    // Minh Tuấn: có xe máy Honda SH, đang bật kiếm tiền rảnh rỗi quanh Hồ Gươm
    this.driverProfiles.set('user-sample-02', {
      userId: 'user-sample-02',
      vehicleType: 'motorbike',
      vehicleBrand: 'Honda SH 150i',
      licensePlate: '29B1-888.88',
      vehicleColor: 'Trắng',
      ratingAvg: 4.9,
      totalTrips: 38,
      isVerified: true,
    });
    this.driverEarningModes.set('user-sample-02', {
      userId: 'user-sample-02',
      isActive: true,
      vehicleType: 'motorbike',
      status: 'idle',
      lastPingAt: new Date(),
    });

    // Hoàng Việt: có ô tô VinFast VF5, đang bật kiếm tiền tiện chuyến
    this.driverProfiles.set('user-sample-04', {
      userId: 'user-sample-04',
      vehicleType: 'car_4seats',
      vehicleBrand: 'VinFast VF5 Plus',
      licensePlate: '30K-999.68',
      vehicleColor: 'Xanh dương',
      ratingAvg: 5.0,
      totalTrips: 15,
      isVerified: true,
    });
    this.driverEarningModes.set('user-sample-04', {
      userId: 'user-sample-04',
      isActive: true,
      vehicleType: 'car_4seats',
      status: 'idle',
      destinationFilter: {
        name: 'Cầu Giấy, Hà Nội',
        lat: baseLat + 0.02,
        lon: baseLon - 0.03,
      },
      lastPingAt: new Date(),
    });
  }

  // Tiện ích tìm user qua SĐT hoặc Email
  public findUserByIdentifier(identifier: string): User | undefined {
    const trimmed = identifier.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.phone === trimmed || (user.email && user.email.toLowerCase() === trimmed)) {
        return user;
      }
    }
    return undefined;
  }

  // Kiểm tra mối quan hệ chặn
  public isBlocked(userA: string, userB: string): boolean {
    for (const block of this.blocks.values()) {
      if (
        (block.blockerId === userA && block.blockedId === userB) ||
        (block.blockerId === userB && block.blockedId === userA)
      ) {
        return true;
      }
    }
    return false;
  }

  // Lấy trạng thái tình bạn
  public getFriendship(userA: string, userB: string): Friendship | undefined {
    for (const f of this.friendships.values()) {
      if (
        (f.requesterId === userA && f.addresseeId === userB) ||
        (f.requesterId === userB && f.addresseeId === userA)
      ) {
        return f;
      }
    }
    return undefined;
  }

  /** Search active users by exact phone, phone suffix, or name/nickname. */
  public searchUsers(viewerId: string, query: string, limit = 20): UserSearchResult[] {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    if (!normalizedQuery) return [];

    const results: UserSearchResult[] = [];
    for (const user of this.users.values()) {
      if (user.id === viewerId || user.status !== 'active' || this.isBlocked(viewerId, user.id)) continue;
      const profile = this.profiles.get(user.id);
      if (!profile) continue;

      const name = profile.fullName.toLocaleLowerCase('vi-VN');
      const nickname = (profile.nickname || '').toLocaleLowerCase('vi-VN');
      const phone = (user.phone || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const matches = name.includes(normalizedQuery) || nickname.includes(normalizedQuery) || phone.includes(normalizedQuery) || email.includes(normalizedQuery);
      if (!matches) continue;

      const friendship = this.getFriendship(viewerId, user.id);
      results.push({
        userId: user.id,
        fullName: profile.fullName,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        phoneMasked: user.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-2)}` : undefined,
        friendshipStatus: friendship?.status || 'none',
        isFriend: friendship?.status === 'accepted',
      });
    }

    return results
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
      .slice(0, Math.max(1, Math.min(limit, 50)));
  }

  // Tìm cuộc trò chuyện 1-1 giữa 2 người
  public findDirectConversation(userA: string, userB: string): Conversation | undefined {
    for (const conv of this.conversations.values()) {
      if (
        conv.type === 'direct' &&
        conv.memberIds.includes(userA) &&
        conv.memberIds.includes(userB)
      ) {
        return conv;
      }
    }
    return undefined;
  }
}

export const db = new DataStore();
