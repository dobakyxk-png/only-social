import { AuthService } from '../src/modules/auth/auth.service';
import { db } from '../src/database/data-store';

describe('Auth Service (Đăng ký không cần OTP & Đăng nhập)', () => {
  const testPhone = '0988776655';
  const testPassword = 'MySecretPassword123';

  it('Đăng ký tài khoản thành công không cần OTP', async () => {
    const result = await AuthService.register({
      phone: testPhone,
      password: testPassword,
      fullName: 'Nguyễn Văn Test',
      dateOfBirth: '2001-05-10',
      gender: 'male',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest Test Runner',
    });

    expect(result).toHaveProperty('token');
    expect(result.user).toHaveProperty('id');
    expect(result.user.phone).toBe(testPhone);
    expect(result.user.profile.fullName).toBe('Nguyễn Văn Test');
    expect(result.user.settings.ghostMode).toBe(false);

    // Kiểm tra bản ghi đồng thuận Nghị định 13
    let hasConsent = false;
    for (const c of db.consents.values()) {
      if (c.userId === result.user.id) {
        hasConsent = true;
        expect(c.policyVersion).toBe('v1.0.0-nd13');
      }
    }
    expect(hasConsent).toBe(true);
  });

  it('Từ chối đăng ký nếu người dùng dưới 16 tuổi', async () => {
    const youngYear = new Date().getFullYear() - 14;
    await expect(
      AuthService.register({
        phone: '0977665544',
        password: 'password123',
        fullName: 'Em Bé',
        dateOfBirth: `${youngYear}-01-01`,
        gender: 'female',
      })
    ).rejects.toThrow('Người dùng phải từ đủ 16 tuổi trở lên');
  });

  it('Từ chối đăng ký nếu số điện thoại đã tồn tại', async () => {
    await expect(
      AuthService.register({
        phone: testPhone,
        password: 'anotherPassword',
        fullName: 'Trùng Số',
        dateOfBirth: '1999-01-01',
        gender: 'male',
      })
    ).rejects.toThrow('đã tồn tại trên hệ thống');
  });

  it('Đăng nhập thành công với thông tin chính xác', async () => {
    const result = await AuthService.login(testPhone, testPassword);
    expect(result).toHaveProperty('token');
    expect(result.user.phone).toBe(testPhone);
  });

  it('Từ chối đăng nhập khi sai mật khẩu', async () => {
    await expect(AuthService.login(testPhone, 'WrongPassword')).rejects.toThrow(
      'Tài khoản hoặc mật khẩu không chính xác'
    );
  });
});
