import { FeedService } from '../src/modules/feed/feed.service';
import { FriendsService } from '../src/modules/friends/friends.service';
import { UsersService } from '../src/modules/users/users.service';
import { LocationService } from '../src/modules/location/location.service';

describe('Phase 2: Feed, Check-in, Like & Comment Service', () => {
  const authorA = 'user-sample-01'; // Lan Anh
  const friendB = 'user-sample-02'; // Minh Tuấn
  const strangerC = 'user-sample-04'; // Hoàng Việt (chưa kết bạn với Lan Anh)

  beforeAll(() => {
    // Đảm bảo A và B là bạn bè
    const f = FriendsService.sendRequest(authorA, friendB);
    FriendsService.acceptRequest(friendB, f.id);

    // Đặt vị trí người xem
    LocationService.updateLocation(authorA, 21.028511, 105.854167);
  });

  describe('Post Creation & Check-in', () => {
    it('Tạo bài viết công khai kèm Check-in địa điểm thành công', () => {
      const post = FeedService.createPost(authorA, {
        content: 'Check-in tại Nhà Hát Lớn Hà Nội 🏛️',
        checkinName: 'Nhà Hát Lớn Hà Nội',
        checkinLat: 21.0244,
        checkinLon: 105.8576,
        privacy: 'public',
      });

      expect(post.id).toBeDefined();
      expect(post.content).toBe('Check-in tại Nhà Hát Lớn Hà Nội 🏛️');
      expect(post.checkinName).toBe('Nhà Hát Lớn Hà Nội');
      expect(post.checkinBlurredLat).toBeDefined();
      expect(post.checkinBlurredLon).toBeDefined();
      // Toạ độ làm mờ phải khác toạ độ thực tế (bảo vệ quyền riêng tư)
      expect(post.checkinBlurredLat).not.toBe(21.0244);
      expect(post.likesCount).toBe(0);
      expect(post.commentsCount).toBe(0);
    });

    it('Từ chối tạo bài viết nếu không có nội dung lẫn hình ảnh', () => {
      expect(() =>
        FeedService.createPost(authorA, {
          content: '',
          mediaUrls: [],
        })
      ).toThrow('Bài viết cần có nội dung văn bản hoặc hình ảnh đính kèm');
    });
  });

  describe('Privacy Control (Public / Friends / Private)', () => {
    let publicPostId: string;
    let friendsPostId: string;
    let privatePostId: string;

    beforeAll(() => {
      const pub = FeedService.createPost(authorA, {
        content: 'Bài viết công khai mọi người đều thấy',
        privacy: 'public',
      });
      publicPostId = pub.id;

      const fr = FeedService.createPost(authorA, {
        content: 'Bài viết chỉ bạn bè mới thấy',
        privacy: 'friends',
      });
      friendsPostId = fr.id;

      const priv = FeedService.createPost(authorA, {
        content: 'Nhật ký riêng tư chỉ mình tôi',
        privacy: 'private',
      });
      privatePostId = priv.id;
    });

    it('Tác giả có thể thấy tất cả bài viết của chính mình', () => {
      const myFeed = FeedService.getFeed(authorA);
      const postIds = myFeed.map((p) => p.id);
      expect(postIds).toContain(publicPostId);
      expect(postIds).toContain(friendsPostId);
      expect(postIds).toContain(privatePostId);
    });

    it('Bạn bè (friendB) thấy bài công khai và bài bạn bè, nhưng KHÔNG thấy bài riêng tư', () => {
      const friendFeed = FeedService.getFeed(friendB);
      const postIds = friendFeed.map((p) => p.id);
      expect(postIds).toContain(publicPostId);
      expect(postIds).toContain(friendsPostId);
      expect(postIds).not.toContain(privatePostId);
    });

    it('Người lạ (strangerC) chỉ thấy bài công khai, KHÔNG thấy bài bạn bè hay riêng tư', () => {
      const strangerFeed = FeedService.getFeed(strangerC);
      const postIds = strangerFeed.map((p) => p.id);
      expect(postIds).toContain(publicPostId);
      expect(postIds).not.toContain(friendsPostId);
      expect(postIds).not.toContain(privatePostId);
    });
  });

  describe('Tương tác: Thả tim (Like/Unlike) & Bình luận', () => {
    let testPostId: string;

    beforeAll(() => {
      const post = FeedService.createPost(authorA, {
        content: 'Bài viết để test like và comment',
        privacy: 'public',
      });
      testPostId = post.id;
    });

    it('Thả tim lần 1 -> Đã thích và tăng likesCount lên 1', () => {
      const result = FeedService.toggleLike(friendB, testPostId);
      expect(result.isLiked).toBe(true);
      expect(result.likesCount).toBe(1);
    });

    it('Bấm thả tim lần 2 -> Bỏ thích và giảm likesCount về 0', () => {
      const result = FeedService.toggleLike(friendB, testPostId);
      expect(result.isLiked).toBe(false);
      expect(result.likesCount).toBe(0);
    });

    it('Thêm bình luận mới thành công và tăng commentsCount', () => {
      const cmt = FeedService.addComment(friendB, testPostId, 'Bài viết hay quá!');
      expect(cmt.id).toBeDefined();
      expect(cmt.content).toBe('Bài viết hay quá!');
      expect(cmt.author.fullName).toBe('Trần Minh Tuấn');

      const comments = FeedService.getComments(testPostId);
      expect(comments.length).toBe(1);
      expect(comments[0].content).toBe('Bài viết hay quá!');
    });

    it('Từ chối bình luận nếu nội dung rỗng', () => {
      expect(() => FeedService.addComment(friendB, testPostId, '   ')).toThrow(
        'Nội dung bình luận không được để trống'
      );
    });
  });

  describe('Check-in Pins trên Bản đồ', () => {
    it('Lấy các ghim Check-in xung quanh vị trí người xem', () => {
      const pins = FeedService.getNearbyCheckinPins(authorA, 15000);
      expect(Array.isArray(pins)).toBe(true);
      expect(pins.length).toBeGreaterThan(0);
      pins.forEach((p) => {
        expect(p.checkinName).toBeDefined();
        expect(p.blurredLat).toBeDefined();
        expect(p.blurredLon).toBeDefined();
        expect(p.distanceMeters).toBeLessThanOrEqual(15000);
      });
    });
  });
});
