import { calculateDistance, fuzzLocation, calculateAge } from '../src/utils/geo';

describe('Geo Utilities & Location Fuzzing (Nghị định 13/2023/NĐ-CP)', () => {
  // Toạ độ Hồ Hoàn Kiếm, Hà Nội
  const hoanKiemLat = 21.028511;
  const hoanKiemLon = 105.854167;

  // Toạ độ Chùa Trấn Quốc (Hồ Tây), Hà Nội (~2.5km)
  const hoTayLat = 21.0478;
  const hoTayLon = 105.8368;

  describe('calculateDistance (Haversine Formula)', () => {
    it('Khoảng cách từ 1 điểm đến chính nó phải bằng 0', () => {
      const dist = calculateDistance(hoanKiemLat, hoanKiemLon, hoanKiemLat, hoanKiemLon);
      expect(dist).toBe(0);
    });

    it('Khoảng cách giữa Hồ Hoàn Kiếm và Hồ Tây phải xấp xỉ 2.5km - 2.8km (2400m - 3000m)', () => {
      const dist = calculateDistance(hoanKiemLat, hoanKiemLon, hoTayLat, hoTayLon);
      expect(dist).toBeGreaterThanOrEqual(2400);
      expect(dist).toBeLessThanOrEqual(3000);
    });
  });

  describe('fuzzLocation (Thuật toán Làm mờ Toạ độ Bảo vệ Quyền Riêng Tư)', () => {
    it('Toạ độ làm mờ phải khác toạ độ thực tế và nằm trong khoảng [100m, 300m]', () => {
      // Chạy thử nghiệm 20 lần ngẫu nhiên
      for (let i = 0; i < 20; i++) {
        const { blurredLat, blurredLon, offsetMeters } = fuzzLocation(hoanKiemLat, hoanKiemLon, 100, 300);

        expect(blurredLat).not.toBe(hoanKiemLat);
        expect(blurredLon).not.toBe(hoanKiemLon);

        // Khoảng cách thực tế giữa điểm gốc và điểm làm mờ phải trong khoảng sai số cho phép [90m, 310m]
        expect(offsetMeters).toBeGreaterThanOrEqual(90);
        expect(offsetMeters).toBeLessThanOrEqual(310);
      }
    });
  });

  describe('calculateAge', () => {
    it('Phải tính đúng số tuổi dựa trên ngày sinh', () => {
      const dob = '2000-01-01';
      const age = calculateAge(dob);
      expect(age).toBeGreaterThanOrEqual(24);
    });
  });
});
