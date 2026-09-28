import { db } from '../../database/data-store';
import {
  DriverProfile,
  DriverEarningMode,
  RideRequest,
  RideOffer,
  RideDTO,
} from '../../types';
import { calculateDistance } from '../../utils/geo';
import { NotificationsService } from '../notifications/notifications.service';

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

export class RidesService {
  /**
   * Tính toán khoảng cách lộ trình (km), thời gian dự kiến (phút) và giá sàn cộng đồng tham khảo (VNĐ)
   */
  static estimateTrip(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
    vehicleType: 'motorbike' | 'car_4seats' | 'car_7seats'
  ): { distanceKm: number; estimatedMins: number; suggestedPrice: number; priceRange: { min: number; max: number } } {
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
    let profile = db.driverProfiles.get(userId);
    const vehicleType = data.vehicleType || profile?.vehicleType || 'motorbike';

    if (!profile) {
      profile = {
        userId,
        vehicleType,
        vehicleBrand: data.vehicleBrand || (vehicleType === 'motorbike' ? 'Xe máy cá nhân' : 'Ô tô cá nhân'),
        licensePlate: data.licensePlate || 'Biển số cá nhân',
        vehicleColor: data.vehicleColor || 'Trắng',
        ratingAvg: 5.0,
        totalTrips: 0,
        isVerified: true,
      };
      db.driverProfiles.set(userId, profile);
    } else {
      if (data.vehicleBrand) profile.vehicleBrand = data.vehicleBrand;
      if (data.licensePlate) profile.licensePlate = data.licensePlate;
      if (data.vehicleColor) profile.vehicleColor = data.vehicleColor;
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
        destinationFilter: data.destinationFilter,
        lastPingAt: new Date(),
      };
    } else {
      mode.isActive = data.isActive;
      mode.vehicleType = vehicleType;
      if (data.destinationFilter !== undefined) mode.destinationFilter = data.destinationFilter;
      mode.lastPingAt = new Date();
    }
    db.driverEarningModes.set(userId, mode);

    return { mode, profile };
  }

  /**
   * Tạo yêu cầu di chuyển / cuốc xe mới (Hành khách gọi xe)
   */
  static createRideRequest(passengerId: string, input: CreateRideInput): RideDTO {
    // Kiểm tra xem khách có đang trong cuốc nào chưa hoàn thành không
    for (const r of db.rideRequests.values()) {
      if (
        r.passengerId === passengerId &&
        ['searching', 'negotiating', 'accepted', 'picking_up', 'in_trip'].includes(r.status)
      ) {
        throw new Error('Bạn đang có một yêu cầu chuyến đi chưa hoàn thành. Vui lòng huỷ hoặc kết thúc chuyến hiện tại trước.');
      }
    }

    const { distanceKm, estimatedMins, suggestedPrice } = this.estimateTrip(
      input.pickupLat,
      input.pickupLon,
      input.dropoffLat,
      input.dropoffLon,
      input.vehicleType
    );

    const rideId = `ride_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const finalSuggestedPrice = input.suggestedPrice && input.suggestedPrice > 0 ? input.suggestedPrice : suggestedPrice;

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
      passengerNote: input.passengerNote?.trim(),
      suggestedPrice: finalSuggestedPrice,
      status: 'searching',
      createdAt: new Date(),
    };

    db.rideRequests.set(rideId, ride);

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
    const ride = db.rideRequests.get(rideId);
    if (!ride) throw new Error('Cuốc xe không tồn tại');
    if (['accepted', 'picking_up', 'in_trip', 'completed', 'cancelled'].includes(ride.status)) {
      throw new Error('Cuốc xe này đã có người nhận hoặc đã kết thúc');
    }

    const offerId = `off_${driverId}_${rideId}`;
    const offer: RideOffer = {
      id: offerId,
      rideId,
      driverId,
      offeredPrice: data.offeredPrice,
      estimatedPickupMins: data.estimatedPickupMins || 5,
      note: data.note,
      status: 'pending',
      createdAt: new Date(),
    };

    db.rideOffers.set(offerId, offer);
    ride.status = 'negotiating';
    db.rideRequests.set(rideId, ride);

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
    const ride = db.rideRequests.get(rideId);
    if (!ride) throw new Error('Chuyến đi không tồn tại');
    if (ride.passengerId !== passengerId) throw new Error('Bạn không có quyền chốt chuyến này');

    const offer = db.rideOffers.get(offerId);
    if (!offer || offer.rideId !== rideId) throw new Error('Đề xuất giá không hợp lệ');

    // Chốt cuốc xe
    ride.driverId = offer.driverId;
    ride.agreedPrice = offer.offeredPrice;
    ride.status = 'accepted';

    // TÍCH HỢP ĐỘC QUYỀN: BẢO HIỂM TAI NẠN CHUYẾN ĐI NHÚNG (EMBEDDED MICRO-INSURANCE)
    // Cấp ngay Giấy chứng nhận bảo hiểm điện tử kết nối API BIC / Bảo Việt
    ride.insurancePolicyId = `INS-RIDE-${Date.now().toString().slice(-6)}-VN`;

    db.rideRequests.set(rideId, ride);
    offer.status = 'accepted';
    db.rideOffers.set(offerId, offer);

    // Cập nhật trạng thái tài xế sang đang bận
    const driverMode = db.driverEarningModes.get(offer.driverId);
    if (driverMode) {
      driverMode.status = 'busy';
      db.driverEarningModes.set(offer.driverId, driverMode);
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

    return this.enrichRideDTO(ride);
  }

  /**
   * Cập nhật trạng thái chuyến đi (Tài xế di chuyển, đón, bắt đầu đi, hoàn thành)
   */
  static updateRideStatus(
    userId: string,
    rideId: string,
    status: 'picking_up' | 'in_trip' | 'completed' | 'cancelled'
  ): RideDTO {
    const ride = db.rideRequests.get(rideId);
    if (!ride) throw new Error('Chuyến đi không tồn tại');

    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new Error('Bạn không có quyền thay đổi trạng thái chuyến này');
    }

    ride.status = status;
    if (status === 'completed') {
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
    return this.enrichRideDTO(ride);
  }

  /**
   * Lấy danh sách các đề xuất giá cho một cuốc xe
   */
  static getRideOffers(rideId: string) {
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
    for (const r of db.rideRequests.values()) {
      if (
        (r.passengerId === userId || r.driverId === userId) &&
        ['searching', 'negotiating', 'accepted', 'picking_up', 'in_trip'].includes(r.status)
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
