import { LocationService } from '../src/modules/location/location.service';
import { UsersService } from '../src/modules/users/users.service';
import { db } from '../src/database/data-store';

describe('Location & Radar Service (Tìm kiếm người xung quanh & Ghost Mode)', () => {
  const viewerId = 'user-viewer-01';
  const baseLat = 21.028511; // Hoàn Kiếm, Hà Nội
  const baseLon = 105.854167;

  beforeAll(() => {
    // Giả lập toạ độ của người xem
    LocationService.updateLocation(viewerId, baseLat, baseLon);
  });

  it('Cập nhật vị trí lưu toạ độ thực và tự động tạo toạ độ làm mờ', () => {
    const loc = LocationService.updateLocation(viewerId, baseLat, baseLon);
    expect(loc.exactLat).toBe(baseLat);
    expect(loc.exactLon).toBe(baseLon);
    expect(loc.blurredLat).toBeDefined();
    expect(loc.blurredLon).toBeDefined();
    expect(loc.blurredLat).not.toBe(baseLat);
    expect(loc.isSharingActive).toBe(true);
  });

  it('Quét radar trong bán kính 1km tìm thấy các người dùng mẫu ở gần', () => {
    const nearby = LocationService.getNearbyUsers(viewerId, { radiusMeters: 1000 });
    expect(Array.isArray(nearby)).toBe(true);
    expect(nearby.length).toBeGreaterThan(0);

    // Đảm bảo không chứa chính mình
    const hasSelf = nearby.some((u) => u.userId === viewerId);
    expect(hasSelf).toBe(false);

    // Đảm bảo tất cả kết quả đều nằm trong bán kính 1000m
    nearby.forEach((u) => {
      expect(u.distanceMeters).toBeLessThanOrEqual(1000);
      expect(u.blurredLat).toBeDefined();
    });

    // Kết quả phải được sắp xếp tăng dần theo khoảng cách
    for (let i = 0; i < nearby.length - 1; i++) {
      expect(nearby[i].distanceMeters).toBeLessThanOrEqual(nearby[i + 1].distanceMeters);
    }
  });

  it('Bộ lọc giới tính hoạt động chính xác (chỉ trả về nữ hoặc nam theo yêu cầu)', () => {
    const femalesOnly = LocationService.getNearbyUsers(viewerId, {
      radiusMeters: 5000,
      gender: 'female',
    });
    femalesOnly.forEach((u) => {
      expect(u.gender).toBe('female');
    });

    const malesOnly = LocationService.getNearbyUsers(viewerId, {
      radiusMeters: 5000,
      gender: 'male',
    });
    malesOnly.forEach((u) => {
      expect(u.gender).toBe('male');
    });
  });

  it('Khi một người dùng bật Ghost Mode, họ lập tức biến mất khỏi Radar của người khác', () => {
    const targetUserId = 'user-sample-01'; // Lan Anh

    // Trước khi bật Ghost mode: Có trong radar
    let nearby = LocationService.getNearbyUsers(viewerId, { radiusMeters: 5000 });
    let isVisible = nearby.some((u) => u.userId === targetUserId);
    expect(isVisible).toBe(true);

    // Bật Ghost Mode cho Lan Anh
    UsersService.updateSettings(targetUserId, { ghostMode: true });

    // Quét lại radar: Lan Anh phải biến mất hoàn toàn
    nearby = LocationService.getNearbyUsers(viewerId, { radiusMeters: 5000 });
    isVisible = nearby.some((u) => u.userId === targetUserId);
    expect(isVisible).toBe(false);

    // Khôi phục lại trạng thái bình thường
    UsersService.updateSettings(targetUserId, { ghostMode: false });
    nearby = LocationService.getNearbyUsers(viewerId, { radiusMeters: 5000 });
    expect(nearby.some((u) => u.userId === targetUserId)).toBe(true);
  });
});
