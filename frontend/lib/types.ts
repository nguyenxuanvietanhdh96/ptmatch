export type Role = "pt" | "trainee" | "admin";

export interface User {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  phone?: string | null;
  /**
   * `email` chỉ là địa chỉ tự sinh cho tài khoản mạng xã hội — không gửi thư
   * tới được. Zalo không trả email, Facebook thì người dùng từ chối chia sẻ
   * được. Cờ do backend tính (services/identity.py), frontend không tự đoán
   * theo tên miền.
   */
  needs_email?: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

/**
 * Kết quả đổi mã OAuth. `is_new` = lượt đăng nhập này vừa TẠO tài khoản.
 *
 * Cần nó vì vai trò chỉ được ghi một lần lúc tạo user, mà người bấm nút SNS ở
 * trang /login thì không chọn vai trò nào — phải hỏi lại tại /welcome.
 */
export interface OAuthAuthResponse extends AuthResponse {
  is_new?: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PTLocation {
  id?: string;
  gym_name: string;
  ward: string;
  city: string;
}

export type PortfolioType = "before_after" | "photo" | "video";

export interface PortfolioItem {
  id: string;
  type: PortfolioType;
  before_url?: string | null;
  after_url?: string | null;
  media_url?: string | null;
  description?: string | null;
  sort_order?: number;
}

export interface SocialLinks {
  facebook?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  zalo?: string | null;
}

export interface Pricing {
  per_session?: number | null;
  package_12?: number | null;
  package_24?: number | null;
  package_36?: number | null;
}

export interface CertificationItem {
  name: string;
  image_url?: string | null;
}

/** Tín hiệu "PT còn hoạt động và có trả lời không" (xem app/schemas/pt.py). */
export interface PTActivity {
  last_active_at?: string | null;
  /** Giờ phản hồi trung bình 90 ngày gần nhất; null khi chưa đủ dữ liệu. */
  response_hours?: number | null;
  students_coached?: number | null;
}

export interface PTProfile {
  id: string;
  slug: string;
  full_name: string;
  gender?: "male" | "female" | null;
  age?: number | null;
  experience_years?: number | null;
  bio?: string | null;
  avatar_url?: string | null;
  certifications?: (CertificationItem | string)[] | null;
  specialties?: string[] | null;
  social_links?: SocialLinks | null;
  pricing?: Pricing | null;
  avg_rating?: number | null;
  review_count?: number | null;
  locations?: PTLocation[] | null;
  portfolio_items?: PortfolioItem[] | null;
  activity?: PTActivity | null;
  is_active?: boolean | null;
  /**
   * Yêu cầu còn thiếu để hồ sơ được bày ra /pts và sitemap; rỗng nghĩa là đủ.
   * Chỉ có ở GET/PUT /api/pts/me — hồ sơ công khai không trả trường này.
   * Luật nằm ở backend (app/services/listing.py), frontend chỉ hiển thị.
   */
  missing_listing?: string[] | null;
  /** Bị admin đình chỉ — PT không tự tháo được, khác `is_active`. */
  suspended?: boolean;
  suspended_reason?: string | null;
}

/** Item trong kết quả tìm kiếm — phòng thủ với nhiều shape backend có thể trả về */
export interface PTSummary {
  id: string;
  slug: string;
  full_name: string;
  gender?: string | null;
  avatar_url?: string | null;
  experience_years?: number | null;
  specialties?: string[] | null;
  pricing?: Pricing | null;
  price_per_session?: number | null;
  avg_rating?: number | null;
  review_count?: number | null;
  last_active_at?: string | null;
  locations?: PTLocation[] | null;
}

export type LeadStatus = "new" | "contacted" | "closed" | "lost";

export interface Lead {
  id: string;
  trainee_name: string;
  trainee_phone: string;
  goal?: string | null;
  area?: string | null;
  budget?: string | null;
  status: LeadStatus;
  created_at?: string;
}

/** Phản hồi khi vừa tạo lead — bản DUY NHẤT mang track_token. */
export interface LeadCreated extends Lead {
  track_token: string;
}

/**
 * Trang tra cứu công khai. Cố ý KHÔNG có trainee_phone: link tra cứu có thể bị
 * chuyển tiếp, nên nó không được là đường lấy lại số điện thoại.
 */
export interface LeadTracking {
  pt_name: string;
  pt_slug: string;
  pt_avatar_url?: string | null;
  trainee_name: string;
  goal?: string | null;
  area?: string | null;
  budget?: string | null;
  status: LeadStatus;
  created_at: string;
  first_response_at?: string | null;
  reported_no_contact: boolean;
}

/** Một kênh thông báo và kết quả gửi. */
export interface ChannelStat {
  channel: string;
  sent: number;
  failed: number;
  skipped: number;
}

/** Mức độ phản hồi lead của một PT. */
export interface PTResponsiveness {
  slug: string;
  full_name: string;
  leads: number;
  answered: number;
  /** Số lead học viên bấm "PT chưa liên hệ" — đáng tin hơn `answered`. */
  disputed: number;
  avg_response_hours?: number | null;
}

export interface LeadOpsOverview {
  days: number;
  leads_total: number;
  leads_answered: number;
  leads_still_new: number;
  leads_disputed: number;
  leads_reminded: number;
  median_response_hours?: number | null;
  channels: ChannelStat[];
  pts: PTResponsiveness[];
}

/** Một tính năng và mức độ được dùng thật. `people` null = không đếm được người. */
export interface FeatureUse {
  key: string;
  label: string;
  people?: number | null;
  events: number;
}

export interface DemandSignal {
  label: string;
  count: number;
}

export interface AdminOverview {
  days: number;
  users_total: number;
  users_pt: number;
  users_trainee: number;
  users_new: number;
  pt_profiles: number;
  pt_active: number;
  pt_with_pricing: number;
  pt_with_location: number;
  pt_with_portfolio: number;
  pt_with_review: number;
  pt_receiving_leads: number;
  features: FeatureUse[];
  top_specialties: DemandSignal[];
  top_areas: DemandSignal[];
  feedback_pending: number;
}

/** Phễu chợ ngược — GET /api/requests/stats (chỉ admin). */
export interface RequestFunnel {
  window_days?: number | null;
  requests_posted: number;
  requests_claimed: number;
  requests_contacted: number;
  requests_won: number;
  /** Hết hạn mà không PT nào nhận. Lớn = thiếu cung, không phải thiếu cầu. */
  requests_expired_unclaimed: number;
  claims_total: number;
  /** Do chính học viên bấm — tin được hơn requests_won (PT tự khai). */
  closed_found_pt: number;
  closed_no_longer_needed: number;
}

export interface FeedbackItem {
  id: string;
  category: string;
  message: string;
  contact_email?: string | null;
  user_email?: string | null;
  created_at: string;
  handled_at?: string | null;
}

export interface FeedbackList {
  items: FeedbackItem[];
  total: number;
  page: number;
  page_size: number;
  pending: number;
}

export interface AdminReviewItem {
  id: string;
  pt_name: string;
  pt_slug: string;
  /** Trạng thái xử lý của PT — để giao diện không mời làm lại việc đã làm. */
  pt_suspended: boolean;
  pt_banned: boolean;
  pt_deleted: boolean;
  reviewer_name: string;
  reviewer_phone?: string | null;
  rating: number;
  content?: string | null;
  image_count: number;
  /** Viết được mà không cần tài khoản — nhóm đáng để ý khi kiểm duyệt. */
  is_anonymous: boolean;
  has_reply: boolean;
  created_at: string;
  /** null = chờ duyệt: chưa hiện trên hồ sơ và chưa tính vào điểm của PT. */
  approved_at?: string | null;
}

export interface AdminReviewList {
  items: AdminReviewItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReviewReply {
  content: string;
  created_at?: string;
}

export interface Review {
  id: string;
  reviewer_name: string;
  rating: number;
  content?: string | null;
  images?: string[] | null;
  created_at?: string;
  reply?: ReviewReply | string | null;
  reply_content?: string | null;
}

export interface MyLead {
  id: string;
  pt_name: string;
  pt_slug: string;
  pt_avatar_url?: string | null;
  goal?: string | null;
  area?: string | null;
  budget?: string | null;
  status: LeadStatus;
  created_at: string;
}

export interface MyReview {
  id: string;
  pt_name: string;
  pt_slug: string;
  pt_avatar_url?: string | null;
  rating: number;
  content?: string | null;
  images?: string[] | null;
  reply_content?: string | null;
  replied_at?: string | null;
  created_at: string;
  /** null = đang chờ duyệt, chưa hiển thị trên hồ sơ PT. */
  approved_at?: string | null;
}

export interface PTStats {
  profile_views: number;
  leads_total: number;
  leads_new: number;
  leads_contacted: number;
  leads_closed: number;
  leads_lost: number;
  leads_this_month: number;
  avg_rating: number;
  review_count: number;
}

export interface DailyLeadPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface PTAnalytics {
  days: number;
  leads_by_day: DailyLeadPoint[];
  leads_in_window: number;
  leads_total: number;
  leads_new: number;
  leads_contacted: number;
  leads_closed: number;
  leads_lost: number;
  conversion_rate: number; // 0..1
  profile_views: number;
  avg_rating: number;
  review_count: number;
  rating_distribution: Record<number, number>;
}

export interface PresignResponse {
  upload_url: string;
  method: "PUT";
  headers?: Record<string, string>;
  public_url: string;
}

// ---- Bảng "Học viên cần PT" (chợ ngược) ----

export type RequestStatus = "open" | "closed";

/** Yêu cầu công khai — backend cố tình KHÔNG trả trainee_phone. */
export interface TraineeRequest {
  id: string;
  trainee_name: string;
  specialty?: string | null;
  city?: string | null;
  /** Phường/xã — cấp hành chính ngay dưới tỉnh từ 01/07/2025. */
  ward?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  preferred_gender?: "male" | "female" | "other" | null;
  note?: string | null;
  status: RequestStatus;
  claim_count: number;
  expires_at: string;
  created_at: string;
  /** Chỉ có giá trị khi người xem là PT đã đăng nhập. */
  claimed_by_me?: boolean | null;
}

export interface ClaimingPT {
  slug: string;
  full_name: string;
  avatar_url?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  claimed_at: string;
}

/**
 * Vì sao học viên đóng yêu cầu.
 *
 * Đây là tín hiệu chuyển đổi đáng tin duy nhất của chợ ngược: trạng thái lead do
 * chính PT tự khai, còn cái này do người có nhu cầu khai.
 */
export type CloseReason = "found_pt" | "no_longer_needed";

export interface MyTraineeRequest extends TraineeRequest {
  claimed_by: ClaimingPT[];
  close_reason?: CloseReason | null;
}

export interface RequestClaimResult {
  request_id: string;
  lead_id: string;
  /** Tổng số PT đã nhận, tính cả lần này. */
  claim_count: number;
}
