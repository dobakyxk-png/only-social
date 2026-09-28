import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../../config';
import { ChatService } from './chat.service';
import { LocationService } from '../location/location.service';
import { db } from '../../database/data-store';
import { registerSocketNotificationEmitter } from '../notifications/notifications.service';
import { CallingService } from '../calling/calling.service';
import { RidesService, registerRideRealtimeEmitter } from '../rides/rides.service';

export function setupSocketGateway(io: Server) {
  // Đăng ký bộ phát thông báo thời gian thực qua WebSocket
  registerSocketNotificationEmitter((recipientId, notification) => {
    io.to(`user:${recipientId}`).emit('notification:new', notification);
  });

  registerRideRealtimeEmitter((event) => {
    const recipients = [event.ride.passengerId, event.ride.driverId].filter(Boolean) as string[];
    if (event.type === 'status_changed') {
      recipients.forEach((recipientId) => io.to(`user:${recipientId}`).emit('ride:status_changed', { ride: event.ride }));
    } else {
      io.to(`user:${event.ride.passengerId}`).emit('ride:driver_moved', {
        rideId: event.ride.id,
        lat: event.ride.driverLat,
        lon: event.ride.driverLon,
        updatedAt: event.ride.driverLocationUpdatedAt,
      });
    }
  });

  // Middleware xác thực JWT cho kết nối WebSocket
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token || (socket.handshake.query?.token as string);

    if (!token) {
      return next(new Error('Yêu cầu xác thực token khi kết nối WebSocket'));
    }

    try {
      const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as {
        userId: string;
        role: string;
      };
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Token không hợp lệ'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user?.userId;
    if (!userId) {
      socket.disconnect();
      return;
    }

    // Tham gia phòng riêng của tài khoản để nhận tin nhắn và thông báo
    socket.join(`user:${userId}`);

    console.log(`[Socket.io] Người dùng kết nối: ${userId} (Socket ID: ${socket.id})`);

    // 1. CẬP NHẬT VỊ TRÍ REALTIME & LÀM MỜ TỰ ĐỘNG
    socket.on('location:update', (data: {
      latitude: number;
      longitude: number;
      heading?: number;
      speed?: number;
    }) => {
      try {
        if (data.latitude !== undefined && data.longitude !== undefined) {
          const loc = LocationService.updateLocation(
            userId,
            data.latitude,
            data.longitude,
            data.heading,
            data.speed
          );

          socket.emit('location:updated', {
            success: true,
            blurredLat: loc.blurredLat,
            blurredLon: loc.blurredLon,
            isSharingActive: loc.isSharingActive,
          });
        }
      } catch (err: any) {
        socket.emit('location:error', { message: err.message });
      }
    });

    // 2. BẬT / TẮT GHOST MODE TRÊN SOCKET
    socket.on('location:toggle_ghost', (data: { ghostMode: boolean }) => {
      try {
        const settings = db.settings.get(userId);
        if (settings) {
          settings.ghostMode = Boolean(data.ghostMode);
          const loc = db.locations.get(userId);
          if (loc) {
            loc.isSharingActive = !settings.ghostMode;
            db.locations.set(userId, loc);
          }
          db.settings.set(userId, settings);

          socket.emit('location:ghost_updated', {
            ghostMode: settings.ghostMode,
            isSharingActive: !settings.ghostMode,
          });
        }
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // 3. GỬI TIN NHẮN 1-1 HOẶC NHÓM THỜI GIAN THỰC
    socket.on('chat:send', (data: {
      receiverId?: string;
      conversationId?: string;
      content?: string;
      mediaUrl?: string;
      type?: 'text' | 'image' | 'emoji' | 'location_pin';
    }) => {
      try {
        if (!data.receiverId && !data.conversationId) {
          throw new Error('Vui lòng cung cấp receiverId hoặc conversationId');
        }

        const result = data.conversationId
          ? ChatService.sendMessageToConversation(userId, data.conversationId, {
              content: data.content,
              mediaUrl: data.mediaUrl,
              type: data.type,
            })
          : ChatService.sendMessage(userId, data.receiverId as string, {
              content: data.content,
              mediaUrl: data.mediaUrl,
              type: data.type,
            });

        const { conversation, message } = result;
        socket.emit('chat:sent_success', { conversation, message });

        const recipients = data.conversationId
          ? conversation.memberIds.filter((memberId) => memberId !== userId)
          : [data.receiverId as string];
        recipients.forEach((recipientId) => {
          io.to(`user:${recipientId}`).emit('chat:receive_message', {
            conversation,
            message,
            senderProfile: db.profiles.get(userId),
          });
        });
      } catch (err: any) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    // 4. HIỆU ỨNG ĐANG NHẬP VĂN BẢN (TYPING INDICATOR)
    socket.on('chat:typing', (data: { receiverId: string; isTyping: boolean }) => {
      io.to(`user:${data.receiverId}`).emit('chat:user_typing', {
        userId,
        isTyping: data.isTyping,
      });
    });

    // 5. BÁO TRẠNG THÁI ĐÃ ĐỌC (READ RECEIPT)
    socket.on('chat:read', (data: { conversationId: string; partnerId: string }) => {
      try {
        const readIds = ChatService.markAsRead(userId, data.conversationId);
        if (readIds.length > 0) {
          io.to(`user:${data.partnerId}`).emit('chat:messages_read', {
            conversationId: data.conversationId,
            readIds,
          });
        }
      } catch (err: any) {
        socket.emit('error', { message: err.message });
      }
    });

    // 6. GIAI ĐOẠN 3: ĐIỀU PHỐI TÍN HIỆU CUỘC GỌI WEBRTC (CALLING SIGNALING)
    // Người gọi bấm "Gọi thoại" hoặc "Gọi video"
    socket.on('call:initiate', (data: { receiverId: string; callType: 'audio' | 'video' }) => {
      try {
        const session = CallingService.initiateCall(userId, data.receiverId, data.callType);
        const callerProfile = db.profiles.get(userId);

        // Báo cho người gọi biết đang đổ chuông
        socket.emit('call:ringing', { session });

        // Gửi thông báo chuông reo tới máy người nhận
        io.to(`user:${data.receiverId}`).emit('call:incoming', {
          session,
          caller: {
            userId,
            fullName: callerProfile?.fullName || 'Người gọi',
            avatarUrl: callerProfile?.avatarUrl,
          },
        });
      } catch (err: any) {
        socket.emit('call:error', { message: err.message });
      }
    });

    // Người nhận bấm "Đồng ý" cuộc gọi
    socket.on('call:accept', (data: { sessionId: string }) => {
      try {
        const session = CallingService.acceptCall(data.sessionId, userId);
        // Thông báo cho cả 2 bên biết cuộc gọi đã được kết nối
        io.to(`user:${session.callerId}`).emit('call:accepted', { session });
        socket.emit('call:accepted', { session });
      } catch (err: any) {
        socket.emit('call:error', { message: err.message });
      }
    });

    // Người nhận bấm "Từ chối" cuộc gọi
    socket.on('call:reject', (data: { sessionId: string; reason?: string }) => {
      try {
        const session = db.activeCalls.get(data.sessionId);
        if (session) {
          const callLog = CallingService.rejectCall(data.sessionId, userId, data.reason);
          io.to(`user:${session.callerId}`).emit('call:rejected', {
            sessionId: data.sessionId,
            reason: data.reason || 'Cuộc gọi bị từ chối',
            callLog,
          });
        }
      } catch (err: any) {
        socket.emit('call:error', { message: err.message });
      }
    });

    // Bất kỳ bên nào bấm "Gác máy" (Kết thúc cuộc gọi)
    socket.on('call:hangup', (data: { sessionId: string }) => {
      try {
        const session = db.activeCalls.get(data.sessionId);
        if (session) {
          const callLog = CallingService.endCall(data.sessionId, userId);
          const partnerId = session.callerId === userId ? session.receiverId : session.callerId;
          io.to(`user:${partnerId}`).emit('call:ended', { sessionId: data.sessionId, callLog });
          socket.emit('call:ended', { sessionId: data.sessionId, callLog });
        }
      } catch (err: any) {
        socket.emit('call:error', { message: err.message });
      }
    });

    // Chuyển tiếp tín hiệu WebRTC SDP Offer / Answer / ICE Candidates giữa 2 máy
    socket.on('call:signal', (data: { sessionId: string; targetUserId: string; signalData: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call:signal', {
        sessionId: data.sessionId,
        senderId: userId,
        signalData: data.signalData,
      });
    });

    // 7. GIAI ĐOẠN 4: ONLY RIDE - KẾT NỐI ĐI LẠI & THỎA THUẬN GIÁ REALTIME
    // Tài xế cập nhật vị trí GPS khi đang di chuyển tới đón khách
    socket.on('ride:driver_loc', (data: { rideId: string; lat: number; lon: number }) => {
      try {
        RidesService.updateDriverLocation(userId, data.rideId, Number(data.lat), Number(data.lon));
      } catch (err: any) {
        socket.emit('ride:error', { message: err.message });
      }
    });

    socket.on('ride:status_update', (data: { rideId: string; status: any }) => {
      try {
        const allowedStatuses = ['picking_up', 'arrived', 'in_trip', 'completed', 'cancelled'];
        if (!data || typeof data.rideId !== 'string' || !allowedStatuses.includes(data.status)) throw new Error('Trạng thái chuyến đi không hợp lệ');
        RidesService.updateRideStatus(userId, data.rideId, data.status);
      } catch (err: any) {
        socket.emit('ride:error', { message: err.message });
      }
    });

    // Thông báo sự kiện cuốc xe thời gian thực
    socket.on('ride:notify_passenger', (data: { rideId: string; passengerId: string; message: string }) => {
      try {
        const ride = db.rideRequests.get(data.rideId);
        if (!ride || ride.driverId !== userId || ride.passengerId !== data.passengerId) throw new Error('Bạn không có quyền gửi thông báo cho chuyến này');
        if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 500) throw new Error('Nội dung thông báo không hợp lệ');
        io.to(`user:${ride.passengerId}`).emit('ride:alert', {
          rideId: ride.id,
          message: data.message.trim(),
        });
      } catch (err: any) {
        socket.emit('ride:error', { message: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Người dùng ngắt kết nối: ${userId}`);
    });
  });
}
