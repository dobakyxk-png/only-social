import { db } from '../../database/data-store';
import { Post, PostLike, PostComment, PostDTO } from '../../types';
import { calculateDistance, fuzzLocation } from '../../utils/geo';
import { NotificationsService } from '../notifications/notifications.service';

export interface CreatePostInput {
  content: string;
  mediaUrls?: string[];
  checkinName?: string;
  checkinLat?: number;
  checkinLon?: number;
  privacy?: 'public' | 'friends' | 'private';
}

export class FeedService {
  /**
   * Đăng bài viết mới kèm Check-in địa điểm và quyền riêng tư
   */
  static createPost(authorId: string, data: CreatePostInput): PostDTO {
    if (!data.content && (!data.mediaUrls || data.mediaUrls.length === 0)) {
      throw new Error('Bài viết cần có nội dung văn bản hoặc hình ảnh đính kèm');
    }

    const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const privacy = data.privacy || 'public';

    // Xử lý làm mờ toạ độ check-in để bảo vệ quyền riêng tư
    let checkinBlurredLat: number | undefined;
    let checkinBlurredLon: number | undefined;

    if (data.checkinLat !== undefined && data.checkinLon !== undefined) {
      const fuzz = fuzzLocation(data.checkinLat, data.checkinLon, 100, 300);
      checkinBlurredLat = fuzz.blurredLat;
      checkinBlurredLon = fuzz.blurredLon;
    }

    const newPost: Post = {
      id: postId,
      authorId,
      content: data.content ? data.content.trim() : '',
      mediaUrls: data.mediaUrls || [],
      checkinName: data.checkinName?.trim(),
      checkinLat: data.checkinLat,
      checkinLon: data.checkinLon,
      checkinBlurredLat,
      checkinBlurredLon,
      privacy,
      likesCount: 0,
      commentsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.posts.set(postId, newPost);

    return this.enrichPostDTO(authorId, newPost);
  }

  /**
   * Lấy dòng thời gian Bảng tin (Feed Timeline)
   * Tự động kiểm tra quyền riêng tư (Public / Friends / Private) và lọc danh sách chặn
   */
  static getFeed(
    viewerId: string,
    options: {
      filter?: 'all' | 'friends' | 'nearby';
      radiusMeters?: number;
      limit?: number;
    } = {}
  ): PostDTO[] {
    const filter = options.filter || 'all';
    const limit = options.limit || 50;
    const postsList: PostDTO[] = [];

    const viewerLoc = db.locations.get(viewerId);

    for (const post of db.posts.values()) {
      const authorId = post.authorId;

      // 1. Nếu là bài của chính mình -> luôn được thấy
      if (authorId === viewerId) {
        postsList.push(this.enrichPostDTO(viewerId, post));
        continue;
      }

      // 2. Kiểm tra chặn
      if (db.isBlocked(viewerId, authorId)) continue;

      // 3. Bài viết riêng tư 'private' -> chỉ tác giả được thấy
      if (post.privacy === 'private') continue;

      // 4. Kiểm tra quan hệ bạn bè
      const friendship = db.getFriendship(viewerId, authorId);
      const isFriend = friendship?.status === 'accepted';

      // Bài viết 'friends' -> bắt buộc phải là bạn bè
      if (post.privacy === 'friends' && !isFriend) continue;

      // 5. Áp dụng bộ lọc Tab
      if (filter === 'friends' && !isFriend) continue;

      if (filter === 'nearby') {
        // Lọc bài viết có checkin hoặc vị trí tác giả ở gần người xem
        let dist: number | null = null;
        if (viewerLoc && post.checkinBlurredLat && post.checkinBlurredLon) {
          dist = calculateDistance(
            viewerLoc.exactLat,
            viewerLoc.exactLon,
            post.checkinBlurredLat,
            post.checkinBlurredLon
          );
        }
        const maxDist = options.radiusMeters || 10000; // 10km
        if (!dist || dist > maxDist) continue;
      }

      postsList.push(this.enrichPostDTO(viewerId, post));
    }

    // Sắp xếp bài viết mới nhất lên đầu
    postsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return postsList.slice(0, limit);
  }

  /**
   * Lấy dòng thời gian trang cá nhân của một người dùng cụ thể
   */
  static getUserTimeline(viewerId: string, targetUserId: string): PostDTO[] {
    if (db.isBlocked(viewerId, targetUserId)) {
      throw new Error('Không thể xem dòng thời gian của người dùng này');
    }

    const isMe = viewerId === targetUserId;
    const friendship = db.getFriendship(viewerId, targetUserId);
    const isFriend = friendship?.status === 'accepted';

    const posts: PostDTO[] = [];

    for (const post of db.posts.values()) {
      if (post.authorId === targetUserId) {
        if (!isMe) {
          if (post.privacy === 'private') continue;
          if (post.privacy === 'friends' && !isFriend) continue;
        }
        posts.push(this.enrichPostDTO(viewerId, post));
      }
    }

    posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return posts;
  }

  /**
   * Lấy danh sách các bài viết Check-in xung quanh vị trí để hiển thị lên bản đồ
   */
  static getNearbyCheckinPins(viewerId: string, radiusMeters: number = 10000) {
    const viewerLoc = db.locations.get(viewerId);
    if (!viewerLoc) return [];

    const pins = [];

    for (const post of db.posts.values()) {
      if (post.checkinBlurredLat && post.checkinBlurredLon) {
        if (db.isBlocked(viewerId, post.authorId)) continue;
        if (post.privacy === 'private' && post.authorId !== viewerId) continue;

        if (post.privacy === 'friends' && post.authorId !== viewerId) {
          const friendship = db.getFriendship(viewerId, post.authorId);
          if (friendship?.status !== 'accepted') continue;
        }

        const dist = calculateDistance(
          viewerLoc.exactLat,
          viewerLoc.exactLon,
          post.checkinBlurredLat,
          post.checkinBlurredLon
        );

        if (dist <= radiusMeters) {
          const authorProfile = db.profiles.get(post.authorId);
          pins.push({
            postId: post.id,
            checkinName: post.checkinName,
            blurredLat: post.checkinBlurredLat,
            blurredLon: post.checkinBlurredLon,
            distanceMeters: dist,
            authorName: authorProfile?.fullName || 'Người dùng',
            authorAvatar: authorProfile?.avatarUrl,
            contentPreview: post.content.substring(0, 80),
            thumbnailUrl: post.mediaUrls[0] || null,
            createdAt: post.createdAt,
          });
        }
      }
    }

    return pins;
  }

  /**
   * Thả tim (Like) hoặc Bỏ thích (Unlike) bài viết
   */
  static toggleLike(userId: string, postId: string): { isLiked: boolean; likesCount: number } {
    const post = db.posts.get(postId);
    if (!post) {
      throw new Error('Bài viết không tồn tại');
    }

    const likeKey = `like_${userId}_${postId}`;
    const existingLike = db.likes.get(likeKey);

    if (existingLike) {
      // Đã like -> Bỏ like
      db.likes.delete(likeKey);
      post.likesCount = Math.max(0, post.likesCount - 1);
      db.posts.set(postId, post);
      return { isLiked: false, likesCount: post.likesCount };
    } else {
      // Chưa like -> Thêm like
      const newLike: PostLike = {
        id: likeKey,
        postId,
        userId,
        createdAt: new Date(),
      };
      db.likes.set(likeKey, newLike);
      post.likesCount += 1;
      db.posts.set(postId, post);

      // Gửi thông báo tới tác giả bài viết (nếu không phải tự like bài mình)
      if (post.authorId !== userId) {
        const likerProfile = db.profiles.get(userId);
        NotificationsService.createNotification({
          recipientId: post.authorId,
          senderId: userId,
          type: 'post_like',
          title: 'Lượt thích mới',
          body: `${likerProfile?.fullName || 'Một người bạn'} đã thích bài viết của bạn.`,
          payloadData: { postId },
        });
      }

      return { isLiked: true, likesCount: post.likesCount };
    }
  }

  /**
   * Thêm bình luận vào bài viết
   */
  static addComment(userId: string, postId: string, content: string, parentId?: string) {
    if (!content || content.trim().length === 0) {
      throw new Error('Nội dung bình luận không được để trống');
    }

    const post = db.posts.get(postId);
    if (!post) {
      throw new Error('Bài viết không tồn tại');
    }

    const commentId = `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newComment: PostComment = {
      id: commentId,
      postId,
      authorId: userId,
      parentId,
      content: content.trim(),
      createdAt: new Date(),
    };

    db.comments.set(commentId, newComment);
    post.commentsCount += 1;
    db.posts.set(postId, post);

    const authorProfile = db.profiles.get(userId);

    // Gửi thông báo tới tác giả bài viết
    if (post.authorId !== userId) {
      NotificationsService.createNotification({
        recipientId: post.authorId,
        senderId: userId,
        type: 'post_comment',
        title: 'Bình luận mới',
        body: `${authorProfile?.fullName || 'Một người bạn'} đã bình luận: "${content.substring(0, 40)}"`,
        payloadData: { postId, commentId },
      });
    }

    return {
      id: newComment.id,
      postId: newComment.postId,
      content: newComment.content,
      createdAt: newComment.createdAt,
      author: {
        userId,
        fullName: authorProfile?.fullName || 'Người dùng',
        avatarUrl: authorProfile?.avatarUrl,
      },
    };
  }

  /**
   * Lấy danh sách bình luận của bài viết
   */
  static getComments(postId: string) {
    const commentsList = [];
    for (const c of db.comments.values()) {
      if (c.postId === postId) {
        const authorProfile = db.profiles.get(c.authorId);
        commentsList.push({
          id: c.id,
          postId: c.postId,
          content: c.content,
          createdAt: c.createdAt,
          author: {
            userId: c.authorId,
            fullName: authorProfile?.fullName || 'Người dùng',
            avatarUrl: authorProfile?.avatarUrl,
          },
        });
      }
    }
    // Sắp xếp bình luận từ cũ đến mới
    commentsList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return commentsList;
  }

  /**
   * Xoá bài viết
   */
  static deletePost(userId: string, postId: string): boolean {
    const post = db.posts.get(postId);
    if (!post) throw new Error('Bài viết không tồn tại');
    if (post.authorId !== userId) {
      throw new Error('Bạn không có quyền xoá bài viết này');
    }

    db.posts.delete(postId);

    // Dọn dẹp likes và comments liên quan
    for (const [key, like] of db.likes.entries()) {
      if (like.postId === postId) db.likes.delete(key);
    }
    for (const [key, cmt] of db.comments.entries()) {
      if (cmt.postId === postId) db.comments.delete(key);
    }

    return true;
  }

  /**
   * Tiện ích đóng gói dữ liệu PostDTO đầy đủ
   */
  private static enrichPostDTO(viewerId: string, post: Post): PostDTO {
    const authorProfile = db.profiles.get(post.authorId);
    const isLikedByMe = db.likes.has(`like_${viewerId}_${post.id}`);

    // Lấy tối đa 2 bình luận gần nhất
    const recentComments = [];
    for (const cmt of db.comments.values()) {
      if (cmt.postId === post.id) {
        const cmtAuthor = db.profiles.get(cmt.authorId);
        recentComments.push({
          id: cmt.id,
          author: {
            userId: cmt.authorId,
            fullName: cmtAuthor?.fullName || 'Người dùng',
            avatarUrl: cmtAuthor?.avatarUrl,
          },
          content: cmt.content,
          createdAt: cmt.createdAt,
        });
      }
    }
    recentComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      ...post,
      author: {
        userId: post.authorId,
        fullName: authorProfile?.fullName || 'Người dùng',
        avatarUrl: authorProfile?.avatarUrl,
        generalCity: authorProfile?.generalCity,
      },
      isLikedByMe,
      recentComments: recentComments.slice(0, 2),
    };
  }
}
