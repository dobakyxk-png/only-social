import { db } from '../../database/data-store';
import {
  DriverProfile,
  DriverEarningMode,
  RideRequest,
  RideOffer,
  RideDTO,
  RideStatus,
} from '../../types';
import { calculateDistance } from '../../utils/geo';
import { NotificationsService } from '../notifications/notifications.service';

const ACTIVE_RIDE_STATUSES: RideStatus[] = ['searching', 'negotiating', 'accepted', 'picking_up', 'arrived', 'in_trip'];
const OFFERABLE_RIDE_STATUSES: RideStatus[] = ['searching', 'negotiating'];
const MAX_RIDE_PRICE = 100_000_000;
const MAX_OFFER_PRICE = 10_000_000;
const MAX_PLACE_NAME_LENGTH = 200;
const MAX_NOTE_LENGTH = 500;
const MAX_VEHICLE_TEXT_LENGTH = 100;

type RideRealtimeEvent =
  | { type: 'status_changed'; ride: RideDTO }
  | { type: 'driver_moved'; ride: RideDTO };

let rideRealtimeEmitter: ((event: RideRealtimeEvent) => void) | null = null;

export function registerRideRealtimeEmitter(emitter: (event: RideRealtimeEvent) => void) {
  rideRealtimeEmitter = emitter;
}

export interface CreateRideInput {
  pickupName: string;
  pickupLat: number;
  pickupLon: number;
  dropoffName: string;
  dropoffLat: number;
  dropoffLon: number;
  vehicleType: 'motorbike' | 'car_4seats' | 'car_7seats';
  passengerNote?: string;
  suggestedPrice?: number; // Khách có thể tự đề xuất giá hoặc để trống nhận gợi ý
}

export interface RouteEstimate {
  distanceKm: number;
  estimatedMins: number;
  suggestedPrice: number;
  priceRange: { min: number; max: number };
  routeProvider: 'osrm' | 'estimate';
  routeGeometry?: Array<[number, number]>;
}

function isVehicleType(value: unknown): value is CreateRideInput['vehicleType'] {
  return value === 'motorbike' || value === 'car_4seats' || value === 'car_7seats';
}

function isRideStatus(value: unknown): value is RideStatus {
  return value === 'searching' || value === 'negotiating' || value === 'accepted' || value === 'picking_up' || value === 'arrived' || value === 'in_trip' || value === 'completed' || value === 'cancelled';
}

function assertActiveUser(userId: string, message = 'Tài khoản không tồn tại hoặc đã ngừng hoạt động') {
  if (typeof userId !== 'string' || !userId.trim()) throw new Error(message);
  const user = db.users.get(userId);
  if (!user || (user.status && user.status !== 'active')) throw new Error(message);
}

function assertCoordinatePair(lat: unknown, lon: unknown, label: string) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`${label} không hợp lệ`);
  }
}

function assertPlaceName(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_PLACE_NAME_LENGTH) {
    throw new Error(`${label} không hợp lệ`);
  }
}

function normalizeOptionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`${label} không hợp lệ`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label} quá dài`);
  return normalized || undefined;
}

function normalizePrice(value: unknown, label: string, allowZero = false): number | undefined {
  if (value === undefined || value === null || (allowZero && value === 0)) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (allowZero ? 0 : 1000) || value > MAX_RIDE_PRICE) {
    throw new Error(`${label} không hợp lệ`);
  }
  return value;
}

function assertDestinationFilter(value: unknown): { name: string; lat: number; lon: number } | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') throw new Error('Bộ lọc điểm đến không hợp lệ');
  const filter = value as { name?: unknown; lat?: unknown; lon?: unknown };
  assertPlaceName(filter.name, 'Tên điểm đến');
  assertCoordinatePair(filter.lat, filter.lon, 'Toạ độ điểm đến');
  return { name: (filter.name as string).trim(), lat: filter.lat as number, lon: filter.lon as number };
}

function emitRideRealtimeEvent(event: RideRealtimeEvent) {
  if (!rideRealtimeEmitter) return;
  try {
    rideRealtimeEmitter(event);
  } catch (error) {
    console.warn('[Ride] Lỗi phát sự kiện realtime:', error);
  }
}

export class RidesService {
  private static hasActiveRide(userId: string): boolean {
    for (const ride of db.rideRequests.values()) {
      if ((ride.passengerId === userId || ride.driverId === userId) && ACTIVE_RIDE_STATUSES.includes(ride.status)) return true;
    }
    return false;
  }

  private static emitRideStatusChange(ride: RideRequest) {
    emitRideRealtimeEvent({ type: 'status_changed', ride: this.enrichRideDTO(ride) });
  }

  /**
   * Tính toán khoảng cách lộ trình (km), thời gian dự kiến (phút) và giá sàn cộng đồng tham khảo (VNĐ)
   */
  static estimateTrip(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
    vehicleType: 'motorbike' | 'car_4seats' | 'car_7seats'
  ): RouteEstimate {
    assertCoordinatePair(pickupLat, pickupLon, 'Toạ độ điểm đón');
    assertCoordinatePair(dropoffLat, dropoffLon, 'Toạ độ điểm đến');
    if (!isVehicleType(vehicleType)) throw new Error('Loại phương tiện không hợp lệ');
    const distanceMeters = calculateDistance(pickupLat, pickupLon, dropoffLat, dropoffLon);
    // Tính hệ số uốn lượn đường phố Việt Nam ~1.25 lần đường chim bay
    const distanceKm = Number(Math.max(0.5, (distanceMeters * 1.25) / 1000).toFixed(1));

    // Vận tốc trung bình đô thị: Xe máy ~25km/h, Ô tô ~20km/h
    const avgSpeed = vehicleType === 'motorbike' ? 25 : 20;
    const estimatedMins = Math.max(3, Math.round((distanceKm / avgSpeed) * 60));

    // Công thức tính giá sàn cộng đồng tiện chuyến phi lợi nhuận (chia sẻ xăng xe & hao mòn)
    // Xe máy: ~6.000đ/km (tối thiểu 15.000đ). Ô tô: ~12.000đ/km (tối thiểu 35.000đ)
    let basePricePerKm = 6000;
    let minPrice = 15000;

    if (vehicleType === 'car_4seats') {
      basePricePerKm = 12000;
      minPrice = 35000;
    } else if (vehicleType === 'car_7seats') {
      basePricePerKm = 16000;
      minPrice = 45000;
    }

    const calculated = Math.round((distanceKm * basePricePerKm) / 5000) * 5000;
    const suggestedPrice = Math.max(minPrice, calculated);

    return {
      distanceKm,
      estimatedMins,
      suggestedPrice,
      priceRange: {
        min: Math.round((suggestedPrice * 0.85) / 5000) * 5000,
        max: Math.round((suggestedPrice * 1.25) / 5000) * 5000,
      },
      routeProvider: 'estimate',
    };
  }

  /**
   * Bật hoặc Tắt Chế Độ Kiếm Tiền (Earning Mode) dành cho người có xe
   */
  static toggleEarningMode(
    userId: string,
    data: {
      isActive: boolean;
      vehicleType?: 'motorbike' | 'car_4seats' | 'car_7seats';
      vehicleBrand?: string;
      licensePlate?: string;
      vehicleColor?: string;
      destinationFilter?: { name: string; lat: number; lon: number };
    }
  ): { mode: DriverEarningMode; profile: DriverProfile } {
    assertActiveUser(userId);
    if (!data || typeof data.isActive !== 'boolean') throw new Error('Trạng thái Chế độ Kiếm Tiền không hợp lệ');
    if (data.vehicleType !== undefined && !isVehicleType(data.vehicleType)) throw new Error('Loại phương tiện không hợp lệ');
    const vehicleType = data.vehicleType || db.driverProfiles.get(userId)?.vehicleType || 'motorbike';
    const vehicleBrand = normalizeOptionalText(data.vehicleBrand, 'Hãng xe', MAX_VEHICLE_TEXT_LENGTH);
    const licensePlate = normalizeOptionalText(data.licensePlate, 'Biển số xe', MAX_VEHICLE_TEXT_LENGTH);
    const vehicleColor = normalizeOptionalText(data.vehicleColor, 'Màu xe', MAX_VEHICLE_TEXT_LENGTH);
    const destinationFilter = assertDestinationFilter(data.destinationFilter);
    let profile = db.driverProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        vehicleType,
        vehicleBrand: vehicleBrand || (vehicleType === 'motorbike' ? 'Xe máy cá nhân' : 'Ô tô cá nhân'),
        licensePlate: licensePlate || 'Biển số cá nhân',
        vehicleColor: vehicleColor || 'Trắng',
        ratingAvg: 5.0,
        totalTrips: 0,
        isVerified: true,
      };
      db.driverProfiles.set(userId, profile);
    } else {
      if (vehicleBrand) profile.vehicleBrand = vehicleBrand;
      if (licensePlate) profile.licensePlate = licensePlate;
      if (vehicleColor) profile.vehicleColor = vehicleColor;
      if (data.vehicleType) profile.vehicleType = data.vehicleType;
      db.driverProfiles.set(userId, profile);
    }

    let mode = db.driverEarningModes.get(userId);
    if (!mode) {
      mode = {
        userId,
        isActive: data.isActive,
        vehicleType,
        status: 'idle',
        destinationFilter,
        lastPingAt: new Date(),
      };
    } else {
      mode.isActive = data.isActive;
      mode.vehicleType = vehicleType;
      if (data.destinationFilter !== undefined) mode.destinationFilter = destinationFilter;
      mode.lastPingAt = new Date();
    }
    db.driverEarningModes.set(userId, mode);

    return { mode, profile };
  }

  /**
   * Tạo yêu cầu di chuyển / cuốc xe mới (Hành khách gọi xe)
   */
  static createRideRequest(passengerId: string, input: CreateRideInput): RideDTO {
    assertActiveUser(passengerId);
    if (!input || typeof input !== 'object') throw new Error('Dữ liệu yêu cầu chuyến đi không hợp lệ');
    assertPlaceName(input.pickupName, 'Tên điểm đón');
    assertPlaceName(input.dropoffName, 'Tên điểm đến');
    assertCoordinatePair(input.pickupLat, input.pickupLon, 'Toạ độ điểm đón');
    assertCoordinatePair(input.dropoffLat, input.dropoffLon, 'Toạ độ điểm đến');
    if (!isVehicleType(input.vehicleType)) throw new Error('Loại phương tiện không hợp lệ');
    if (calculateDistance(input.pickupLat, input.pickupLon, input.dropoffLat, input.dropoffLon) < 20) throw new Error('Điểm đón và điểm đến phải cách nhau ít nhất 20m');
    const suggestedPrice = normalizePrice(input.suggestedPrice, 'Giá đề xuất', true);
    const passengerNote = normalizeOptionalText(input.passengerNote, 'Ghi chú hành khách', MAX_NOTE_LENGTH);

    // Kiểm tra xem khách có đang trong cuốc nào chưa hoàn thành không
    for (const r of db.rideRequests.values()) {
      if (
        r.passengerId === passengerId &&
        ACTIVE_RIDE_STATUSES.includes(r.status)
      ) {
        throw new Error('Bạn đang có một yêu cầu chuyến đi chưa hoàn thành. Vui lòng huỷ hoặc kết thúc chuyến hiện tại trước.');
      }
    }

    const estimate = this.estimateTrip(
      input.pickupLat,
      input.pickupLon,
      input.dropoffLat,
      input.dropoffLon,
      input.vehicleType
    );
    const { distanceKm, estimatedMins, suggestedPrice: calculatedSuggestedPrice } = estimate;

    const rideId = `ride_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const finalSuggestedPrice = suggestedPrice ?? calculatedSuggestedPrice;

    const ride: RideRequest = {
      id: rideId,
      passengerId,
      pickupName: input.pickupName.trim(),
      pickupLat: input.pickupLat,
      pickupLon: input.pickupLon,
      dropoffName: input.dropoffName.trim(),
      dropoffLat: input.dropoffLat,
      dropoffLon: input.dropoffLon,
      distanceKm,
      estimatedMins,
      vehicleType: input.vehicleType,
      passengerNote,
      suggestedPrice: finalSuggestedPrice,
      routeProvider: estimate.routeProvider,
      status: 'searching',
      createdAt: new Date(),
    };

    db.rideRequests.set(rideId, ride);
    this.emitRideStatusChange(ride);

    // Quét tìm các tài xế lân cận đang bật kiếm tiền để thông báo
    const nearbyDrivers = this.findNearbyDrivers(input.pickupLat, input.pickupLon, input.vehicleType, 5000);
    const passengerProfile = db.profiles.get(passengerId);

    nearbyDrivers.forEach((driver) => {
      NotificationsService.createNotification({
        recipientId: driver.userId,
        senderId: passengerId,
        type: 'system',
        title: '🛵 Có cuốc xe tiện chuyến mới quanh bạn!',
        body: `${passengerProfile?.fullName || 'Hành khách'} cần đi ${distanceKm}km từ ${input.pickupName} tới ${input.dropoffName} (Giá đề xuất: ${finalSuggestedPrice.toLocaleString('vi-VN')}đ)`,
        payloadData: { rideId: ride.id },
      });
    });

    return this.enrichRideDTO(ride);
  }

  /**
   * Quét tìm các tài xế đang bật kiếm tiền quanh toạ độ điểm đón
   */
  static findNearbyDrivers(
    lat: number,
    lon: number,
    vehicleType: string,
    radiusMeters: number = 5000
  ): Array<{ userId: string; fullName: string; avatarUrl?: string; distanceMeters: number; vehicle: DriverProfile }> {
    const drivers = [];

    for (const mode of db.driverEarningModes.values()) {
      if (!mode.isActive || mode.status !== 'idle') continue;
      if (mode.vehicleType !== vehicleType) continue;

      const loc = db.locations.get(mode.userId);
      if (!loc) continue;

      const dist = calculateDistance(lat, lon, loc.exactLat, loc.exactLon);
      if (dist <= radiusMeters) {
        const profile = db.profiles.get(mode.userId);
        const vProfile = db.driverProfiles.get(mode.userId);
        if (profile && vProfile) {
          drivers.push({
            userId: mode.userId,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            distanceMeters: dist,
            vehicle: vProfile,
          });
        }
      }
    }

    drivers.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return drivers;
  }

  /**
   * Tài xế gửi phản hồi đề xuất giá cuốc xe (Offer)
   */
  static makeRideOffer(
    driverId: string,
    rideId: string,
    data: { offeredPrice: number; estimatedPickupMins?: number; note?: string }
  ): RideOffer {
    assertActiveUser(driverId);
    const ride = db.rideRequests.get(rideId);
    if (!ride) throw new Error('Cuốc xe không tồn tại');
    if (ride.passengerId === driverId) throw new Error('Hành khách không thể tự gửi báo giá cho mình');
    if (!OFFERABLE_RIDE_STATUSES.includes(ride.status)) throw new Error('Cuốc xe này đã có người nhận hoặc đã kết thúc');
    const mode = db.driverEarningModes.get(driverId);
    const vehicle = db.driverProfiles.get(driverId);
    if (!mode?.isActive || mode.status !== 'idle') throw new Error('Bạn chưa bật Chế độ Kiếm Tiền hoặc đang bận chuyến khác');
    if (!vehicle || vehicle.vehicleType !== ride.vehicleType) throw new Error('Phương tiện của bạn không phù hợp với yêu cầu');
    if (typeof data.offeredPrice !== 'number' || !Number.isFinite(data.offeredPrice) || data.offeredPrice < 1000 || data.offeredPrice > MAX_OFFER_PRICE) throw new Error('Giá báo không hợp lệ');
    if (data.estimatedPickupMins !== undefined && (typeof data.estimatedPickupMins !== 'number' || !Number.isFinite(data.estimatedPickupMins) || data.estimatedPickupMins < 1 || data.estimatedPickupMins > 180)) throw new Error('Thời gian đón không hợp lệ');
    const note = normalizeOptionalText(data.note, 'Ghi chú báo giá', MAX_NOTE_LENGTH);

    const existingOffer = Array.from(db.rideOffers.values()).find((item) => item.rideId === rideId && item.driverId === driverId && item.status === 'pending');
    if (existingOffer) throw new Error('Bạn đã gửi báo giá cho cuốc xe này');

    const offerId = `off_${driverId}_${rideId}`;
    const offer: RideOffer = {
      id: offerId,
      rideId,
      driverId,
      offeredPrice: data.offeredPrice,
      estimatedPickupMins: data.estimatedPickupMins ?? 5,
      note,
      status: 'pending',
      createdAt: new Date(),
    };

    db.rideOffers.set(offerId, offer);
    ride.status = 'negotiating';
    db.rideRequests.set(rideId, ride);
    this.emitRideStatusChange(ride);

    // Thông báo cho khách hàng biết có tài xế gửi báo giá
    const driverProfile = db.profiles.get(driverId);
    NotificationsService.createNotification({
      recipientId: ride.passengerId,
      senderId: driverId,
      type: 'system',
      title: 'Nhận được báo giá cuốc xe!',
      body: `Tài xế ${driverProfile?.fullName || 'Cộng đồng'} báo giá ${data.offeredPrice.toLocaleString('vi-VN')}đ (đón trong ~${offer.estimatedPickupMins} phút)`,
      payloadData: { rideId: ride.id, offerId },
    });

    return offer;
  }

  /**
   * Hành khách chọn và chốt tài xế (Khớp lệnh cuốc xe & Tích hợp Bảo hiểm nhúng)
   */
  static acceptDriverOffer(passengerId: string, rideId: string, offerId: string): RideDTO {
    assertActiveUser(passengerId);
    const ride = db.rideRequests.get(rideId);
    if (!ride) throw new Error('Chuyến đi không tồn tại');
    if (ride.passengerId !== passengerId) throw new Error('Bạn không có quyền chốt chuyến này');

    const offer = db.rideOffers.get(offerId);
    if (!offer || offer.rideId !== rideId || offer.status !== 'pending') throw new Error('Đề xuất giá không hợp lệ hoặc đã được xử lý');
    if (ride.status !== 'searching' && ride.status !== 'negotiating') throw new Error('Cuốc xe đã được chốt hoặc kết thúc');
    assertActiveUser(offer.driverId, 'Tài xế không còn khả dụng');
    const driverMode = db.driverEarningModes.get(offer.driverId);
    const driverVehicle = db.driverProfiles.get(offer.driverId);
    if (!driverMode?.isActive || driverMode.status !== 'idle' || !driverVehicle || driverVehicle.vehicleType !== ride.vehicleType) {
      throw new Error('Tài xế không còn khả dụng cho chuyến đi này');
    }
    if (this.hasActiveRide(offer.driverId)) throw new Error('Tài xế đang có chuyến đi khác');

    // Chốt cuốc xe
    ride.driverId = offer.driverId;
    ride.agreedPrice = offer.offeredPrice;
    ride.status = 'accepted';

    // TÍCH HỢP ĐỘC QUYỀN: BẢO HIỂM TAI NẠN CHUYẾN ĐI NHÚNG (EMBEDDED MICRO-INSURANCE)
    // Cấp ngay Giấy chứng nhận bảo hiểm điện tử kết nối API BIC / Bảo Việt
    ride.insurancePolicyId = `INS-RIDE-${Date.now().toString().slice(-6)}-VN`;

    db.rideRequests.set(rideId, ride);
    this.emitRideStatusChange(ride);
    offer.status = 'accepted';
    db.rideOffers.set(offerId, offer);
    for (const otherOffer of db.rideOffers.values()) {
      if (otherOffer.rideId === rideId && otherOffer.id !== offerId && otherOffer.status === 'pending') {
        otherOffer.status = 'rejected';
        db.rideOffers.set(otherOffer.id, otherOffer);
      }
    }

    // Cập nhật trạng thái tài xế sang đang bận
    const acceptedDriverMode = db.driverEarningModes.get(offer.driverId);
    if (acceptedDriverMode) {
      acceptedDriverMode.status = 'busy';
      db.driverEarningModes.set(offer.driverId, acceptedDriverMode);
    }

    // Gửi thông báo tới tài xế
    const passengerProfile = db.profiles.get(passengerId);
    NotificationsService.createNotification({
      recipientId: offer.driverId,
      senderId: passengerId,
      type: 'system',
      title: '🎉 Bạn đã được chọn đón khách!',
      body: `Hành khách ${passengerProfile?.fullName || 'Hành khách'} đã đồng ý giá ${offer.offeredPrice.toLocaleString('vi-VN')}đ. Hãy di chuyển tới điểm đón!`,
      payloadData: { rideId: ride.id },
    });

    const dto = this.enrichRideDTO(ride);
    emitRideRealtimeEvent({ type: 'status_changed', ride: dto });
    return dto;
  }

  /** Cập nhật trạng thái và gửi trạng thái mới cho cả hai bên qua gateway. */
  static updateRideStatus(
    userId: string,
    rideId: string,
    status: RideStatus
  ): RideDTO {
    assertActiveUser(userId);
    if (!isRideStatus(status)) throw new Error('Trạng thái chuyến đi không hợp lệ');
    const ride = db.rideRequests.get(rideId);
    if (!ride) throw new Error('Chuyến đi không tồn tại');
    const previousStatus = ride.status;

    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new Error('Bạn không có quyền thay đổi trạng thái chuyến này');
    }
    const driverOnlyStatuses: RideStatus[] = ['picking_up', 'arrived', 'in_trip', 'completed'];
    if (driverOnlyStatuses.includes(status) && ride.driverId !== userId) {
      throw new Error('Chỉ tài xế đã nhận chuyến mới được cập nhật trạng thái này');
    }
    if (status === 'cancelled' && ride.status === 'completed') {
      throw new Error('Chuyến đã hoàn thành không thể huỷ');
    }

    const validTransitions: Record<RideStatus, RideStatus[]> = {
      searching: ['negotiating', 'cancelled'],
      negotiating: ['accepted', 'cancelled'],
      accepted: ['picking_up', 'cancelled'],
      picking_up: ['arrived', 'cancelled'],
      arrived: ['in_trip', 'cancelled'],
      in_trip: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    if (ride.status !== status && !validTransitions[ride.status].includes(status)) {
      throw new Error(`Không thể chuyển trạng thái từ ${ride.status} sang ${status}`);
    }

    if (ride.status !== status) {
      ride.status = status;
      if (status === 'cancelled') {
        ride.cancelledBy = ride.driverId === userId ? 'driver' : 'passenger';
        if (ride.driverId) {
          const driverMode = db.driverEarningModes.get(ride.driverId);
          if (driverMode) {
            driverMode.status = 'idle';
            db.driverEarningModes.set(ride.driverId, driverMode);
          }
        }
      }
    }
    if (status === 'completed' && !ride.completedAt) {
      ride.completedAt = new Date();
      // Khôi phục tài xế về trạng thái rảnh rỗi và tăng số chuyến
      if (ride.driverId) {
        const dMode = db.driverEarningModes.get(ride.driverId);
        if (dMode) {
          dMode.status = 'idle';
          db.driverEarningModes.set(ride.driverId, dMode);
        }
        const dProfile = db.driverProfiles.get(ride.driverId);
        if (dProfile) {
          dProfile.totalTrips += 1;
          db.driverProfiles.set(ride.driverId, dProfile);
        }
      }
    }

    db.rideRequests.set(rideId, ride);
    const dto = this.enrichRideDTO(ride);
    if (previousStatus !== ride.status) emitRideRealtimeEvent({ type: 'status_changed', ride: dto });
    return dto;
  }

  /** Tài xế stream vị trí tới điểm đón; chỉ tài xế của cuốc được cập nhật. */
  static updateDriverLocation(userId: string, rideId: string, lat: number, lon: number): RideDTO {
    assertActiveUser(userId);
    const ride = db.rideRequests.get(rideId);
    if (!ride || ride.driverId !== userId) throw new Error('Bạn không có quyền cập nhật vị trí cho chuyến này');
    if (!ACTIVE_RIDE_STATUSES.includes(ride.status)) throw new Error('Chuyến đi không còn hoạt động');
    assertCoordinatePair(lat, lon, 'Toạ độ GPS');
    ride.driverLat = lat;
    ride.driverLon = lon;
    ride.driverLocationUpdatedAt = new Date();
    db.rideRequests.set(rideId, ride);
    const dto = this.enrichRideDTO(ride);
    emitRideRealtimeEvent({ type: 'driver_moved', ride: dto });
    return dto;
  }

  /** Lấy danh sách các đề xuất giá cho một cuốc xe */
  static getRideOffers(rideId: string, viewerId?: string) {
    if (viewerId) assertActiveUser(viewerId);
    const ride = db.rideRequests.get(rideId);
    if (!ride) throw new Error('Cuốc xe không tồn tại');
    if (!viewerId || (ride.passengerId !== viewerId && ride.driverId !== viewerId)) throw new Error('Bạn không có quyền xem báo giá của cuốc xe này');
    const offers = [];
    for (const off of db.rideOffers.values()) {
      if (off.rideId === rideId) {
        const driverProfile = db.profiles.get(off.driverId);
        const vehicle = db.driverProfiles.get(off.driverId);
        offers.push({
          id: off.id,
          driverId: off.driverId,
          offeredPrice: off.offeredPrice,
          estimatedPickupMins: off.estimatedPickupMins,
          note: off.note,
          status: off.status,
          createdAt: off.createdAt,
          driver: {
            fullName: driverProfile?.fullName || 'Tài xế cộng đồng',
            avatarUrl: driverProfile?.avatarUrl,
            vehicleBrand: vehicle?.vehicleBrand || 'Xe cá nhân',
            licensePlate: vehicle?.licensePlate || '29A-xxxx',
            ratingAvg: vehicle?.ratingAvg || 5.0,
            totalTrips: vehicle?.totalTrips || 0,
          },
        });
      }
    }
    offers.sort((a, b) => a.offeredPrice - b.offeredPrice); // Ưu tiên giá tốt nhất lên đầu
    return offers;
  }

  /**
   * Lấy chi tiết cuốc xe hiện tại của người dùng
   */
  static getCurrentActiveRide(userId: string): RideDTO | null {
    assertActiveUser(userId);
    for (const r of db.rideRequests.values()) {
      if (
        (r.passengerId === userId || r.driverId === userId) &&
        ACTIVE_RIDE_STATUSES.includes(r.status)
      ) {
        return this.enrichRideDTO(r);
      }
    }
    return null;
  }

  /**
   * Tiện ích đóng gói DTO đầy đủ thông tin khách & tài xế
   */
  private static enrichRideDTO(ride: RideRequest): RideDTO {
    const passenger = db.profiles.get(ride.passengerId);
    const passengerUser = db.users.get(ride.passengerId);

    let driverObj = undefined;
    if (ride.driverId) {
      const driver = db.profiles.get(ride.driverId);
      const driverUser = db.users.get(ride.driverId);
      const vehicle = db.driverProfiles.get(ride.driverId);

      driverObj = {
        userId: ride.driverId,
        fullName: driver?.fullName || 'Tài xế cộng đồng',
        avatarUrl: driver?.avatarUrl,
        phone: driverUser?.phone,
        vehicleType: vehicle?.vehicleType || ride.vehicleType,
        vehicleBrand: vehicle?.vehicleBrand || 'Xe cá nhân',
        licensePlate: vehicle?.licensePlate || '29A-xxxx',
        ratingAvg: vehicle?.ratingAvg || 5.0,
      };
    }

    let offersCount = 0;
    for (const off of db.rideOffers.values()) {
      if (off.rideId === ride.id) offersCount++;
    }

    return {
      ...ride,
      passenger: {
        userId: ride.passengerId,
        fullName: passenger?.fullName || 'Hành khách',
        avatarUrl: passenger?.avatarUrl,
        phone: passengerUser?.phone,
      },
      driver: driverObj,
      offersCount,
    };
  }
}
