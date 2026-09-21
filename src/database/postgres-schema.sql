-- ==============================================================================
-- CƠ SỞ DỮ LIỆU POSTGRESQL + POSTGIS CHO ỨNG DỤNG MẠNG XÃ HỘI VỊ TRÍ "ONLY"
-- Tuân thủ Nghị định 13/2023/NĐ-CP về Bảo vệ Dữ liệu Cá nhân
-- ==============================================================================

-- 1. Kích hoạt tiện ích mở rộng PostGIS & pgcrypto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Bảng tài khoản người dùng
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'deleted'
    is_verified BOOLEAN NOT NULL DEFAULT true,   -- Đơn giản hoá: đã xác thực trực tiếp
    role VARCHAR(20) NOT NULL DEFAULT 'user',    -- 'user', 'moderator', 'admin'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. Bảng hồ sơ cá nhân
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    nickname VARCHAR(50),
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL, -- 'male', 'female', 'other', 'prefer_not_to_say'
    bio VARCHAR(500),
    avatar_url VARCHAR(500),
    cover_url VARCHAR(500),
    interests TEXT[] DEFAULT '{}',
    general_city VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Bảng cài đặt quyền riêng tư & an toàn (Nghị định 13)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ghost_mode BOOLEAN NOT NULL DEFAULT false,
    map_visibility VARCHAR(20) NOT NULL DEFAULT 'everyone', -- 'everyone', 'friends', 'nobody'
    allow_stranger_messages BOOLEAN NOT NULL DEFAULT true,
    allow_stranger_calls BOOLEAN NOT NULL DEFAULT false,
    fuzz_radius_meters INT NOT NULL DEFAULT 200,
    language VARCHAR(10) NOT NULL DEFAULT 'vi',
    theme_mode VARCHAR(10) NOT NULL DEFAULT 'system'
);

-- 5. Bảng vị trí địa lý không gian (PostGIS Spatial Index)
CREATE TABLE IF NOT EXISTS user_locations (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    exact_location GEOGRAPHY(Point, 4326) NOT NULL,    -- Toạ độ thực tế (lưu nội bộ)
    blurred_location GEOGRAPHY(Point, 4326) NOT NULL,  -- Toạ độ làm mờ 100-300m (công khai)
    heading REAL,
    speed REAL,
    is_sharing_active BOOLEAN NOT NULL DEFAULT true,
    last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục GiST giúp truy vấn bán kính siêu tốc:
CREATE INDEX IF NOT EXISTS idx_user_locations_blurred ON user_locations USING GIST (blurred_location);
CREATE INDEX IF NOT EXISTS idx_user_locations_active_ping ON user_locations (is_sharing_active, last_ping_at);

-- 6. Bảng quan hệ bạn bè
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_friendship_pair UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);

-- 7. Bảng danh sách chặn (Block)
CREATE TABLE IF NOT EXISTS blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_block_pair UNIQUE (blocker_id, blocked_id)
);

-- 8. Bảng báo cáo vi phạm (Report)
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(30) NOT NULL, -- 'user', 'message', 'post'
    target_id UUID,
    reason_category VARCHAR(50) NOT NULL,
    description TEXT,
    evidence_urls TEXT[] DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Bảng hội thoại trò chuyện
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL DEFAULT 'direct', -- 'direct', 'group'
    member_ids UUID[] NOT NULL,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Bảng tin nhắn
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'image', 'emoji', 'location_pin'
    content TEXT,
    media_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'read'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);

-- 11. Bảng lưu vết đồng thuận bảo vệ dữ liệu cá nhân (Nghị định 13)
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_type VARCHAR(50) NOT NULL,
    policy_version VARCHAR(20) NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL
);
