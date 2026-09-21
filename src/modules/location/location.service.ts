import { db } from '../../database/data-store';
import { UserLocation, NearbyUserDTO } from '../../types';
import { calculateDistance, fuzzLocation, calculateAge } from '../../utils/geo';

export interface NearbyFilterOptions {
  radiusMeters?: number; // 500, 1000, 5000, 10000
  minAge?: number;
  maxAge?: number;
  gender?: string;
  interest?: string;
  interests?: string[];
  onlineOnly?: boolean;
}

export class LocationService {
  /**
   * Cập nhật toạ độ người dùng và tự động làm mờ vị trí (100 - 300m)
   */
  static updateLocation(
    userId: string,
    exactLat: number,
    exactLon: number,
    heading?: number,
    speed?: number
  ): UserLocation {
    const settings = db.settings.get(userId);
    const minMeters = 100;
    const maxMeters = settings?.fuzzRadiusMeters || 300;

    // Sinh toạ độ làm mờ ngẫu nhiên
    const { blurredLat, blurredLon } = fuzzLocation(exactLat, exactLon, minMeters, maxMeters);

    const locationRecord: UserLocation = {
      userId,
      exactLat,
      exactLon,
      blurredLat,
      blurredLon,
      heading,
      speed,
      isSharingActive: settings ? !settings.ghostMode : true,
      lastPingAt: new Date(),
    };

    db.locations.set(userId, locationRecord);
    return locationRecord;
  }

  /**
   * Tìm kiếm những người dùng xung quanh trên bản đồ Radar (Nearby Users)
   * Tự động lọc các điều kiện bảo mật, quyền riêng tư và bán kính
   */
  static getNearbyUsers(viewerId: string, options: NearbyFilterOptions = {}): NearbyUserDTO[] {
    const viewerLoc = db.locations.get(viewerId);
    if (!viewerLoc) {
      throw new Error('Chưa có thông tin vị trí của bạn. Vui lòng bật định vị trước khi quét radar.');
    }

    const radiusMeters = options.radiusMeters || 5000; // Mặc định 5km
    const results: NearbyUserDTO[] = [];

    for (const [targetUserId, targetLoc] of db.locations.entries()) {
      // 1. Không hiển thị chính mình
      if (targetUserId === viewerId) continue;

      // 2. Không hiển thị nếu người dùng đã tắt chia sẻ hoặc không hoạt động
      if (!targetLoc.isSharingActive) continue;

      // 3. Kiểm tra cài đặt quyền riêng tư của đối phương
      const targetSettings = db.settings.get(targetUserId);
      if (targetSettings?.ghostMode) continue; // Bật Ghost mode -> Ẩn hoàn toàn
      if (targetSettings?.mapVisibility === 'nobody') continue;

      // 4. Kiểm tra danh sách chặn
      if (db.isBlocked(viewerId, targetUserId)) continue;

      // 5. Kiểm tra quan hệ bạn bè nếu họ chỉ hiển thị với bạn bè
      const friendship = db.getFriendship(viewerId, targetUserId);
      const isFriend = friendship?.status === 'accepted';
      if (targetSettings?.mapVisibility === 'friends' && !isFriend) {
        continue;
      }

      // 6. Tính khoảng cách giữa toạ độ người xem và toạ độ làm mờ của đối phương
      const dist = calculateDistance(
        viewerLoc.exactLat,
        viewerLoc.exactLon,
        targetLoc.blurredLat,
        targetLoc.blurredLon
      );

      if (dist > radiusMeters) continue;

      // 7. Lấy thông tin hồ sơ và áp dụng bộ lọc (Giới tính, Độ tuổi, Sở thích)
      const targetProfile = db.profiles.get(targetUserId);
      if (!targetProfile) continue;

      const age = calculateAge(targetProfile.dateOfBirth);

      if (options.minAge && age < options.minAge) continue;
      if (options.maxAge && age > options.maxAge) continue;
      if (options.gender && options.gender !== 'all' && targetProfile.gender !== options.gender) {
        continue;
      }
      if (
        options.interest &&
        !targetProfile.interests.some(
          (i) => i.toLowerCase() === options.interest!.toLowerCase()
        )
      ) {
        continue;
      }
      if (
        options.interests &&
        options.interests.length > 0 &&
        !targetProfile.interests.some((i) =>
          options.interests!.some((req) => req.toLowerCase() === i.toLowerCase())
        )
      ) {
        continue;
      }
      if (options.onlineOnly) {
        const pingDiffSeconds = (Date.now() - new Date(targetLoc.lastPingAt).getTime()) / 1000;
        if (pingDiffSeconds > 1800) { // Quá 30 phút -> xem như offline
          continue;
        }
      }

      results.push({
        userId: targetUserId,
        fullName: targetProfile.fullName,
        avatarUrl: targetProfile.avatarUrl,
        gender: targetProfile.gender,
        age,
        bio: targetProfile.bio,
        interests: targetProfile.interests,
        distanceMeters: dist,
        blurredLat: targetLoc.blurredLat,
        blurredLon: targetLoc.blurredLon,
        isFriend,
        friendshipStatus: friendship ? friendship.status : 'none',
      });
    }

    // Sắp xếp người dùng từ gần đến xa
    results.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return results;
  }
}
