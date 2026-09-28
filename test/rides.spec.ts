import { RidesService } from '../src/modules/rides/rides.service';
import { db } from '../src/database/data-store';
import { calculateDistance } from '../src/utils/geo';

describe('Only Ride Service (Kết nối Đi lại & Tiện chuyến Cộng đồng)', () => {
  let passengerId: string;
  let driverId: string;

  beforeEach(() => {
    // Isolate ride state because DataStore is a process-wide singleton.
    db.rideRequests.clear();
    db.rideOffers.clear();
    db.driverProfiles.clear();
    db.driverEarningModes.clear();

    // Tạo 2 user test: passenger và driver
    passengerId = 'pass-test-001';
    driverId = 'driver-test-001';

    db.users.set(passengerId, {
      id: passengerId,
      phone: '0911111111',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    db.profiles.set(passengerId, {
      userId: passengerId,
      fullName: 'Nguyễn Văn Passenger',
      dateOfBirth: '1995-03-15',
      gender: 'male',
      bio: '',
      interests: [],
      avatarUrl: '',
      updatedAt: new Date(),
    });

    db.users.set(driverId, {
      id: driverId,
      phone: '0922222222',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    db.profiles.set(driverId, {
      userId: driverId,
      fullName: 'Trần Văn Driver',
      dateOfBirth: '1990-06-20',
      gender: 'male',
      bio: '',
      interests: [],
      avatarUrl: '',
      updatedAt: new Date(),
    });

    db.locations.set(driverId, {
      userId: driverId,
      exactLat: 21.0285,
      exactLon: 105.8542,
      blurredLat: 21.0290,
      blurredLon: 105.8550,
      isSharingActive: true,
      lastPingAt: new Date(),
    });
  });

  it('Tính toán ước tính chuyến đi (km, phút, giá gợi ý)', () => {
    const estimate = RidesService.estimateTrip(
      21.0285, 105.8542, // Pickup: Hoàn Kiếm
      21.0520, 105.8340, // Dropoff: Ba Đình (~2.7km)
      'motorbike'
    );

    expect(estimate.distanceKm).toBeGreaterThan(2);
    expect(estimate.distanceKm).toBeLessThan(5);
    expect(estimate.estimatedMins).toBeGreaterThan(5);
    expect(estimate.suggestedPrice).toBeGreaterThan(10000);
    expect(estimate.priceRange).toHaveProperty('min');
    expect(estimate.priceRange).toHaveProperty('max');
  });

  it('Bật Chế độ Kiếm Tiền cho tài xế', () => {
    const result = RidesService.toggleEarningMode(driverId, {
      isActive: true,
      vehicleType: 'motorbike',
      vehicleBrand: 'Honda SH 150i',
      licensePlate: '29B1-12345',
    });

    expect(result.mode.isActive).toBe(true);
    expect(result.mode.vehicleType).toBe('motorbike');
    expect(result.profile.vehicleBrand).toBe('Honda SH 150i');
    expect(result.profile.licensePlate).toBe('29B1-12345');

    const savedMode = db.driverEarningModes.get(driverId);
    expect(savedMode?.isActive).toBe(true);
  });

  it('Tạo yêu cầu chuyến đi thành công', () => {
    const ride = RidesService.createRideRequest(passengerId, {
      pickupName: 'Hồ Hoàn Kiếm',
      pickupLat: 21.0285,
      pickupLon: 105.8542,
      dropoffName: 'Lăng Chủ Tịch Hồ Chí Minh',
      dropoffLat: 21.0365,
      dropoffLon: 105.8346,
      vehicleType: 'motorbike',
      suggestedPrice: 25000,
    });

    expect(ride.id).toBeDefined();
    expect(ride.status).toBe('searching');
    expect(ride.passengerId).toBe(passengerId);
    expect(ride.distanceKm).toBeGreaterThan(0);
    expect(ride.suggestedPrice).toBe(25000);
    expect(ride.passenger.fullName).toBe('Nguyễn Văn Passenger');
  });

  it('Tài xế gửi đề xuất giá cuốc xe', () => {
    // Bật earning mode trước
    RidesService.toggleEarningMode(driverId, {
      isActive: true,
      vehicleType: 'motorbike',
    });

    // Tạo ride
    const ride = RidesService.createRideRequest(passengerId, {
      pickupName: 'Điểm A',
      pickupLat: 21.0285,
      pickupLon: 105.8542,
      dropoffName: 'Điểm B',
      dropoffLat: 21.0365,
      dropoffLon: 105.8346,
      vehicleType: 'motorbike',
      suggestedPrice: 20000,
    });

    // Driver gửi offer
    const offer = RidesService.makeRideOffer(driverId, ride.id, {
      offeredPrice: 22000,
      estimatedPickupMins: 5,
      note: 'Tôi đang ở gần',
    });

    expect(offer.id).toBeDefined();
    expect(offer.driverId).toBe(driverId);
    expect(offer.offeredPrice).toBe(22000);
    expect(offer.status).toBe('pending');

    const savedOffer = db.rideOffers.get(offer.id);
    expect(savedOffer).toBeDefined();
  });

  it('Hành khách chốt tài xế và kích hoạt bảo hiểm', () => {
    RidesService.toggleEarningMode(driverId, {
      isActive: true,
      vehicleType: 'motorbike',
    });

    const ride = RidesService.createRideRequest(passengerId, {
      pickupName: 'Start',
      pickupLat: 21.0285,
      pickupLon: 105.8542,
      dropoffName: 'End',
      dropoffLat: 21.0365,
      dropoffLon: 105.8346,
      vehicleType: 'motorbike',
      suggestedPrice: 25000,
    });

    const offer = RidesService.makeRideOffer(driverId, ride.id, {
      offeredPrice: 23000,
      estimatedPickupMins: 6,
    });

    const result = RidesService.acceptDriverOffer(passengerId, ride.id, offer.id);

    expect(result.status).toBe('accepted');
    expect(result.driverId).toBe(driverId);
    expect(result.agreedPrice).toBe(23000);
    expect(result.insurancePolicyId).toBeDefined();
    expect(result.insurancePolicyId).toMatch(/^INS-RIDE-/);

    const savedRide = db.rideRequests.get(ride.id);
    expect(savedRide?.status).toBe('accepted');
    expect(savedRide?.driverId).toBe(driverId);

    // Kiểm tra driver mode đã chuyển sang busy
    const driverMode = db.driverEarningModes.get(driverId);
    expect(driverMode?.status).toBe('busy');
  });

  it('Cập nhật trạng thái chuyến đi', () => {
    RidesService.toggleEarningMode(driverId, {
      isActive: true,
      vehicleType: 'motorbike',
    });

    const ride = RidesService.createRideRequest(passengerId, {
      pickupName: 'A',
      pickupLat: 21.0285,
      pickupLon: 105.8542,
      dropoffName: 'B',
      dropoffLat: 21.0365,
      dropoffLon: 105.8346,
      vehicleType: 'motorbike',
      suggestedPrice: 25000,
    });

    const offer = RidesService.makeRideOffer(driverId, ride.id, {
      offeredPrice: 25000,
      estimatedPickupMins: 5,
    });

    RidesService.acceptDriverOffer(passengerId, ride.id, offer.id);

    // Tài xế cập nhật trạng thái đang đón
    const pickingUp = RidesService.updateRideStatus(driverId, ride.id, 'picking_up');
    expect(pickingUp.status).toBe('picking_up');

    // Hoàn thành chuyến
    const completed = RidesService.updateRideStatus(driverId, ride.id, 'completed');
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();

    // Kiểm tra driver mode đã về idle
    const driverMode = db.driverEarningModes.get(driverId);
    expect(driverMode?.status).toBe('idle');

    // Kiểm tra tổng số chuyến tài xế tăng
    const driverProfile = db.driverProfiles.get(driverId);
    expect(driverProfile?.totalTrips).toBeGreaterThan(0);
  });

  it('Lấy danh sách đề xuất giá cho một cuốc xe', () => {
    RidesService.toggleEarningMode(driverId, {
      isActive: true,
      vehicleType: 'motorbike',
    });

    const ride = RidesService.createRideRequest(passengerId, {
      pickupName: 'Pickup',
      pickupLat: 21.0285,
      pickupLon: 105.8542,
      dropoffName: 'Dropoff',
      dropoffLat: 21.0365,
      dropoffLon: 105.8346,
      vehicleType: 'motorbike',
      suggestedPrice: 20000,
    });

    RidesService.makeRideOffer(driverId, ride.id, {
      offeredPrice: 22000,
      estimatedPickupMins: 5,
    });

    const offers = RidesService.getRideOffers(ride.id);
    expect(offers.length).toBe(1);
    expect(offers[0].driverId).toBe(driverId);
    expect(offers[0].driver.fullName).toBe('Trần Văn Driver');
  });

  it('Lấy chuyến đi đang hoạt động của người dùng', () => {
    const ride = RidesService.createRideRequest(passengerId, {
      pickupName: 'X',
      pickupLat: 21.0285,
      pickupLon: 105.8542,
      dropoffName: 'Y',
      dropoffLat: 21.0365,
      dropoffLon: 105.8346,
      vehicleType: 'motorbike',
      suggestedPrice: 25000,
    });

    const activeRide = RidesService.getCurrentActiveRide(passengerId);
    expect(activeRide).toBeDefined();
    expect(activeRide?.id).toBe(ride.id);
    expect(activeRide?.passengerId).toBe(passengerId);
  });

  it('Không cho phép tạo nhiều chuyến cùng lúc', () => {
    RidesService.createRideRequest(passengerId, {
      pickupName: 'A',
      pickupLat: 21.0285,
      pickupLon: 105.8542,
      dropoffName: 'B',
      dropoffLat: 21.0365,
      dropoffLon: 105.8346,
      vehicleType: 'motorbike',
      suggestedPrice: 20000,
    });

    expect(() =>
      RidesService.createRideRequest(passengerId, {
        pickupName: 'C',
        pickupLat: 21.0300,
        pickupLon: 105.8600,
        dropoffName: 'D',
        dropoffLat: 21.0400,
        dropoffLon: 105.8700,
        vehicleType: 'motorbike',
        suggestedPrice: 25000,
      })
    ).toThrow(/chưa hoàn thành/);
  });
});

