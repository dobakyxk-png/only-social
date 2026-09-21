import { CONFIG } from '../config';

/**
 * Tính khoảng cách giữa hai điểm toạ độ địa lý theo công thức Haversine (đơn vị: mét)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Bán kính Trái Đất tính theo mét
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Trả về số nguyên mét
}

/**
 * Thuật toán Làm mờ Vị trí (Location Fuzzing)
 * Tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân nhạy cảm.
 * 
 * Tạo toạ độ giả lập ngẫu nhiên cách toạ độ thực tế từ 100m đến 300m
 * theo phân phối toạ độ cực đồng đều (Uniform Polar Coordinates),
 * đảm bảo không bao giờ để lộ vị trí mét chính xác của người dùng cho bên thứ ba.
 */
export function fuzzLocation(
  realLat: number,
  realLon: number,
  minOffsetMeters: number = CONFIG.LOCATION_BLUR.MIN_METERS,
  maxOffsetMeters: number = CONFIG.LOCATION_BLUR.MAX_METERS
): { blurredLat: number; blurredLon: number; offsetMeters: number } {
  // Sinh khoảng cách ngẫu nhiên r trong đoạn [minOffsetMeters, maxOffsetMeters]
  // Sử dụng căn bậc hai phân phối diện tích hình tròn đồng đều
  const minSq = minOffsetMeters * minOffsetMeters;
  const maxSq = maxOffsetMeters * maxOffsetMeters;
  const r = Math.sqrt(Math.random() * (maxSq - minSq) + minSq);

  // Sinh góc ngẫu nhiên theta từ 0 đến 2*PI radian (0 - 360 độ)
  const theta = Math.random() * 2 * Math.PI;

  // Độ dịch chuyển theo hệ toạ độ phẳng địa phương (mét)
  const dx = r * Math.cos(theta); // Đông - Tây
  const dy = r * Math.sin(theta); // Bắc - Nam

  // Hằng số chuyển đổi mét sang độ vĩ độ và kinh độ
  // 1 độ Vĩ độ ~ 111,320 mét
  const deltaLat = dy / 111320;
  // 1 độ Kinh độ ~ 111,320 * cos(vĩ độ) mét
  const deltaLon = dx / (111320 * Math.cos((realLat * Math.PI) / 180));

  const blurredLat = Number((realLat + deltaLat).toFixed(6));
  const blurredLon = Number((realLon + deltaLon).toFixed(6));

  // Tính lại khoảng cách thực tế giữa điểm thực và điểm đã làm mờ
  const actualOffset = calculateDistance(realLat, realLon, blurredLat, blurredLon);

  return {
    blurredLat,
    blurredLon,
    offsetMeters: actualOffset,
  };
}

/**
 * Tính số tuổi từ chuỗi ngày sinh YYYY-MM-DD
 */
export function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
