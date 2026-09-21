import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { db } from '../../database/data-store';
import { CONFIG } from '../../config';
import { User, UserProfile, UserSettings, UserConsent } from '../../types';
import { calculateAge } from '../../utils/geo';

export class AuthService {
  /**
   * Đăng ký tài khoản trực tiếp (Bỏ qua OTP theo yêu cầu tinh gọn)
   * Đồng thời lưu vết chấp thuận Điều khoản & Chính sách Bảo vệ Dữ liệu Cá nhân (Nghị định 13)
   */
  static async register(data: {
    phone?: string;
    email?: string;
    password: string;
    fullName: string;
    dateOfBirth: string; // YYYY-MM-DD
    gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { phone, email, password, fullName, dateOfBirth, gender, ipAddress, userAgent } = data;

    if (!phone && !email) {
      throw new Error('Cần cung cấp Số điện thoại hoặc Email để đăng ký');
    }

    if (!password || password.length < 6) {
      throw new Error('Mật khẩu phải có tối thiểu 6 ký tự');
    }

    if (!fullName || fullName.trim().length === 0) {
      throw new Error('Vui lòng nhập Họ và tên');
    }

    if (!dateOfBirth) {
      throw new Error('Vui lòng nhập ngày sinh');
    }

    // Kiểm tra độ tuổi (quy định từ 16 tuổi trở lên)
    const age = calculateAge(dateOfBirth);
    if (age < 16) {
      throw new Error('Người dùng phải từ đủ 16 tuổi trở lên để tham gia mạng xã hội Only');
    }

    // Kiểm tra xem SĐT hoặc Email đã tồn tại hay chưa
    const identifier = phone || email!;
    const existing = db.findUserByIdentifier(identifier);
    if (existing) {
      throw new Error(`Tài khoản với ${phone ? 'số điện thoại' : 'email'} này đã tồn tại trên hệ thống`);
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. Tạo bản ghi User
    const newUser: User = {
      id: userId,
      phone: phone?.trim(),
      email: email?.trim().toLowerCase(),
      passwordHash,
      status: 'active',
      isVerified: true, // Trực tiếp kích hoạt tài khoản
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.users.set(userId, newUser);

    // 2. Tạo bản ghi Hồ sơ cá nhân (UserProfile)
    const newProfile: UserProfile = {
      userId,
      fullName: fullName.trim(),
      dateOfBirth,
      gender: gender || 'prefer_not_to_say',
      bio: 'Xin chào, mình là thành viên mới của Only!',
      interests: [],
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
      generalCity: 'Việt Nam',
      updatedAt: new Date(),
    };
    db.profiles.set(userId, newProfile);

    // 3. Tạo bản ghi Cài đặt an toàn & quyền riêng tư (UserSettings)
    const newSettings: UserSettings = {
      userId,
      ghostMode: false,
      mapVisibility: 'everyone',
      allowStrangerMessages: true,
      allowStrangerCalls: false,
      fuzzRadiusMeters: 200,
      language: 'vi',
      themeMode: 'system',
    };
    db.settings.set(userId, newSettings);

    // 4. Lưu vết chấp thuận Nghị định 13/2023/NĐ-CP (Consent Log)
    const consentRecord: UserConsent = {
      id: `cst_${Date.now()}`,
      userId,
      policyType: 'terms_of_service',
      policyVersion: 'v1.0.0-nd13',
      consentedAt: new Date(),
      ipAddress: ipAddress || '127.0.0.1',
      userAgent: userAgent || 'Unknown Device',
    };
    db.consents.set(consentRecord.id, consentRecord);

    // 5. Cấp phát JWT Access Token
    const signOptions: SignOptions = { expiresIn: '7d' };
    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      CONFIG.JWT_SECRET,
      signOptions
    );

    return {
      token,
      user: {
        id: newUser.id,
        phone: newUser.phone,
        email: newUser.email,
        profile: newProfile,
        settings: newSettings,
      },
    };
  }

  /**
   * Đăng nhập tài khoản bằng SĐT / Email và Mật khẩu
   */
  static async login(identifier: string, password: string) {
    if (!identifier || !password) {
      throw new Error('Vui lòng nhập số điện thoại/email và mật khẩu');
    }

    const user = db.findUserByIdentifier(identifier);
    if (!user) {
      throw new Error('Tài khoản hoặc mật khẩu không chính xác');
    }

    if (user.status === 'suspended') {
      throw new Error('Tài khoản của bạn đã bị tạm khoá do vi phạm quy định cộng đồng');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Tài khoản hoặc mật khẩu không chính xác');
    }

    const signOptions: SignOptions = { expiresIn: '7d' };
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      CONFIG.JWT_SECRET,
      signOptions
    );

    const profile = db.profiles.get(user.id);
    const settings = db.settings.get(user.id);

    return {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        profile,
        settings,
      },
    };
  }

  /**
   * Lấy thông tin tài khoản hiện tại của người dùng
   */
  static getMe(userId: string) {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }
    const profile = db.profiles.get(userId);
    const settings = db.settings.get(userId);
    const location = db.locations.get(userId);

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      profile,
      settings,
      location: location ? {
        blurredLat: location.blurredLat,
        blurredLon: location.blurredLon,
        isSharingActive: location.isSharingActive,
        lastPingAt: location.lastPingAt,
      } : null,
    };
  }
}
