"""Seed demo data. Run: python -m app.seed (idempotent)."""
import asyncio
import os
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.models import (
    REQUEST_LIFETIME_DAYS,
    Favorite,
    Gender,
    Lead,
    LeadStatus,
    PortfolioItem,
    PortfolioType,
    PTLocation,
    PTProfile,
    Review,
    TraineeRequest,
    User,
    UserRole,
)
from app.services.slug import slugify

DEMO_PASSWORD = "password123"
TRAINEE_EMAIL = "hocvien@ptmatch.vn"
ADMIN_EMAIL = "admin@ptmatch.vn"

PT_SEED = [
    {
        "email": "pt@ptmatch.vn",  # demo account
        "full_name": "Nguyễn Minh Tuấn",
        "gender": "male",
        "age": 29,
        "experience_years": 7,
        "bio": (
            "Huấn luyện viên cá nhân với 7 năm kinh nghiệm, chuyên về tăng cơ và "
            "bodybuilding. Từng thi đấu Men's Physique và đồng hành cùng hơn 200 học viên "
            "đạt mục tiêu hình thể. Phương châm: kỷ luật tạo nên sự khác biệt."
        ),
        "certifications": [
            {"name": "NASM-CPT", "image_url": "https://picsum.photos/seed/ptmatch-cert-1a/600/400"},
            {"name": "ISSA Bodybuilding Specialist", "image_url": "https://picsum.photos/seed/ptmatch-cert-1b/600/400"},
        ],
        "specialties": ["muscle_gain", "bodybuilding"],
        "pricing": {"per_session": 500000, "package_12": 5400000, "package_24": 10000000, "package_36": 14000000},
        "social_links": {"facebook": "https://facebook.com/pt.minhtuan", "instagram": "https://instagram.com/pt.minhtuan"},
        "locations": [
            {"gym_name": "California Fitness & Yoga", "ward": "Phường Sài Gòn", "city": "Thành phố Hồ Chí Minh"},
            {"gym_name": "Citigym", "ward": "Phường Bàn Cờ", "city": "Thành phố Hồ Chí Minh"},
        ],
        "reviews": [
            ("Trần Quốc Đạt", 5, "Anh Tuấn rất tận tâm, sau 3 tháng mình tăng 5kg cơ. Giáo án rõ ràng, theo sát từng buổi."),
            ("Lê Văn Hoà", 5, "PT chuyên nghiệp nhất mình từng tập. Đáng từng đồng!"),
            ("Phạm Hữu Nghĩa", 4, "Giáo án tốt, lịch hơi khó book vào giờ cao điểm."),
        ],
    },
    {
        "email": "pt2@ptmatch.vn",
        "full_name": "Trần Thị Thu Hà",
        "gender": "female",
        "age": 26,
        "experience_years": 4,
        "bio": (
            "Nữ HLV chuyên giảm cân và fitness cho nữ. Mình hiểu những khó khăn của "
            "phái nữ khi bắt đầu tập gym và sẽ giúp bạn tự tin hơn mỗi ngày. "
            "Đã giúp hơn 80 học viên nữ giảm cân thành công."
        ),
        "certifications": ["ACE-CPT", "Pre & Postnatal Coaching"],
        "specialties": ["weight_loss", "female_fitness"],
        "pricing": {"per_session": 400000, "package_12": 4300000, "package_24": 8200000, "package_36": 11500000},
        "social_links": {"instagram": "https://instagram.com/ha.fitcoach", "tiktok": "https://tiktok.com/@ha.fitcoach"},
        "locations": [
            {"gym_name": "Citigym", "ward": "Phường Bàn Cờ", "city": "Thành phố Hồ Chí Minh"},
        ],
        "reviews": [
            ("Nguyễn Thuỳ Linh", 5, "Chị Hà siêu dễ thương, mình giảm 6kg trong 2 tháng mà không bị mất sức."),
            ("Võ Thị Kim Ngân", 5, "Tập với chị Hà vui lắm, động lực mỗi ngày!"),
            ("Đỗ Mỹ Duyên", 4, "Hiệu quả rõ rệt, chế độ ăn dễ theo."),
        ],
    },
    {
        "email": "pt3@ptmatch.vn",
        "full_name": "Lê Hoàng Nam",
        "gender": "male",
        "age": 24,
        "experience_years": 2,
        "bio": (
            "HLV trẻ năng động, chuyên hỗ trợ người mới bắt đầu và giảm cân. "
            "Giá hợp lý cho sinh viên và người đi làm. Cam kết xây nền tảng kỹ thuật chuẩn ngay từ đầu."
        ),
        "certifications": ["FLC Vietnam CPT"],
        "specialties": ["beginner", "weight_loss"],
        "pricing": {"per_session": 300000, "package_12": 3200000, "package_24": 6000000, "package_36": 8500000},
        "social_links": {"facebook": "https://facebook.com/nam.lefit"},
        "locations": [
            {"gym_name": "The New Gym", "ward": "Phường Tân Thuận", "city": "Thành phố Hồ Chí Minh"},
        ],
        "reviews": [
            ("Bùi Anh Khoa", 5, "Lần đầu tập gym mà được anh Nam chỉ kỹ từng động tác, rất yên tâm."),
            ("Trương Gia Bảo", 4, "Giá tốt, nhiệt tình. Recommend cho bạn nào mới tập."),
        ],
    },
    {
        "email": "pt4@ptmatch.vn",
        "full_name": "Phạm Quốc Bảo",
        "gender": "male",
        "age": 33,
        "experience_years": 10,
        "bio": (
            "10 năm kinh nghiệm huấn luyện bodybuilding, cựu VĐV thể hình quốc gia. "
            "Chuyên contest prep và transformation chuyên sâu cho học viên nghiêm túc."
        ),
        "certifications": ["IFBB Academy Coach", "NSCA-CSCS"],
        "specialties": ["bodybuilding", "muscle_gain"],
        "pricing": {"per_session": 600000, "package_12": 6500000, "package_24": 12000000, "package_36": 17000000},
        "social_links": {"facebook": "https://facebook.com/baopham.coach", "instagram": "https://instagram.com/baopham.coach"},
        "locations": [
            {"gym_name": "Fit24 Fitness Center", "ward": "Phường Bình Thạnh", "city": "Thành phố Hồ Chí Minh"},
        ],
        "reviews": [
            ("Hồ Tấn Phát", 5, "Anh Bảo giúp mình lên sân khấu thi Classic Physique lần đầu. Kiến thức cực sâu."),
            ("Lý Thành Công", 5, "Đỉnh của chóp, không có gì để chê."),
            ("Ngô Văn Sang", 4, "Chuyên môn rất cao, yêu cầu kỷ luật nghiêm."),
        ],
    },
    {
        "email": "pt5@ptmatch.vn",
        "full_name": "Võ Ngọc Ánh",
        "gender": "female",
        "age": 28,
        "experience_years": 5,
        "bio": (
            "HLV nữ chuyên fitness cho nữ và online coaching. Hỗ trợ học viên ở xa "
            "qua giáo án online kèm video call check form hàng tuần. Tập trung vào vóc dáng săn chắc, khoẻ đẹp bền vững."
        ),
        "certifications": ["ACE-CPT", "Precision Nutrition L1"],
        "specialties": ["female_fitness", "online_coaching"],
        "pricing": {"per_session": 450000, "package_12": 4800000, "package_24": 9000000, "package_36": 12800000},
        "social_links": {"instagram": "https://instagram.com/anhvo.fit", "zalo": "https://zalo.me/0901234567"},
        "locations": [
            {"gym_name": "California Fitness & Yoga", "ward": "Phường Sài Gòn", "city": "Thành phố Hồ Chí Minh"},
        ],
        "reviews": [
            ("Phan Thảo Vy", 5, "Online coaching của chị Ánh rất chất lượng, giáo án đổi mỗi 4 tuần."),
            ("Đặng Khánh Chi", 5, "Mình tập online từ Đà Nẵng vẫn hiệu quả, chị check form kỹ lắm."),
        ],
    },
    {
        "email": "pt6@ptmatch.vn",
        "full_name": "Đặng Văn Hùng",
        "gender": "male",
        "age": 38,
        "experience_years": 12,
        "bio": (
            "Chuyên gia phục hồi chấn thương và huấn luyện người lớn tuổi. "
            "Nền tảng vật lý trị liệu, phối hợp với bác sĩ khi cần. An toàn là ưu tiên số một."
        ),
        "certifications": ["NASM-CES", "Cử nhân Vật lý trị liệu"],
        "specialties": ["rehab", "senior"],
        "pricing": {"per_session": 550000, "package_12": 6000000, "package_24": 11000000, "package_36": 15500000},
        "social_links": {"facebook": "https://facebook.com/hungdang.rehab"},
        "locations": [
            {"gym_name": "Elite Fitness", "ward": "Phường Biên Hòa", "city": "Tỉnh Đồng Nai"},
        ],
        "reviews": [
            ("Trần Văn Bình", 5, "Sau chấn thương khớp gối, nhờ anh Hùng mình đã chạy bộ lại được. Rất biết ơn."),
            ("Nguyễn Thị Lan", 5, "Mẹ mình 62 tuổi tập với thầy Hùng, sức khoẻ cải thiện rõ."),
            ("Lê Đức Anh", 4, "Bài tập phục hồi bài bản, tiến triển chậm mà chắc."),
        ],
    },
    {
        "email": "pt7@ptmatch.vn",
        "full_name": "Bùi Thị Mai Linh",
        "gender": "female",
        "age": 25,
        "experience_years": 3,
        "bio": (
            "HLV nữ tại Hà Nội, chuyên giảm cân cho người mới bắt đầu. "
            "Không phán xét, không áp lực — mình sẽ đồng hành cùng bạn từ con số 0."
        ),
        "certifications": ["VFC Personal Trainer"],
        "specialties": ["weight_loss", "beginner"],
        "pricing": {"per_session": 350000, "package_12": 3800000, "package_24": 7200000, "package_36": 10000000},
        "social_links": {"instagram": "https://instagram.com/mailinh.coach", "tiktok": "https://tiktok.com/@mailinh.coach"},
        "locations": [
            {"gym_name": "California Fitness & Yoga", "ward": "Phường Trấn Biên", "city": "Tỉnh Đồng Nai"},
        ],
        "reviews": [
            ("Hoàng Thu Trang", 5, "Chị Linh kiên nhẫn cực kỳ, mình từ 70kg xuống 62kg sau 4 tháng."),
            ("Vũ Hà My", 4, "Buổi tập vui, đỡ ngại gym hẳn."),
        ],
    },
    {
        "email": "pt8@ptmatch.vn",
        "full_name": "Hoàng Đức Thịnh",
        "gender": "male",
        "age": 31,
        "experience_years": 8,
        "bio": (
            "Coach tăng cơ và online coaching cho dân văn phòng bận rộn. "
            "Giáo án tối ưu 3-4 buổi/tuần, dinh dưỡng linh hoạt không ép ăn khắt khe."
        ),
        "certifications": ["NASM-CPT", "NASM-PES"],
        "specialties": ["muscle_gain", "online_coaching"],
        "pricing": {"per_session": 800000, "package_12": 8800000, "package_24": 16500000, "package_36": 23000000},
        "social_links": {"facebook": "https://facebook.com/thinh.hoangcoach", "instagram": "https://instagram.com/thinh.hoangcoach"},
        "locations": [
            {"gym_name": "Citigym", "ward": "Phường Tam Hiệp", "city": "Tỉnh Đồng Nai"},
        ],
        "reviews": [
            ("Đinh Công Minh", 5, "Đắt nhưng xắt ra miếng. Body thay đổi hoàn toàn sau 6 tháng."),
            ("Phùng Quang Huy", 5, "Anh Thịnh rất khoa học, đo lường mọi thứ bằng số liệu."),
            ("Tạ Hồng Phong", 4, "Chất lượng cao, phù hợp ai có ngân sách tốt."),
        ],
    },
    {
        "email": "pt9@ptmatch.vn",
        "full_name": "Ngô Thanh Trúc",
        "gender": "female",
        "age": 35,
        "experience_years": 9,
        "bio": (
            "HLV nữ chuyên người lớn tuổi và phục hồi sau sinh, sau chấn thương nhẹ. "
            "Giá mềm, lịch linh hoạt buổi sáng. Tập nhẹ nhàng đúng khoa học."
        ),
        "certifications": ["ACE-CPT", "Yoga Instructor 200h"],
        "specialties": ["senior", "rehab"],
        "pricing": {"per_session": 250000, "package_12": 2700000, "package_24": 5000000, "package_36": 7000000},
        "social_links": {"zalo": "https://zalo.me/0907654321", "facebook": "https://facebook.com/truc.ngo.fit"},
        "locations": [
            {"gym_name": "The New Gym", "ward": "Phường Thủ Đức", "city": "Thành phố Hồ Chí Minh"},
        ],
        "reviews": [
            ("Lưu Thị Hồng", 5, "Cô Trúc tập cho mẹ mình 65 tuổi, rất nhẹ nhàng và chu đáo."),
            ("Mai Xuân Quỳnh", 5, "Phục hồi sau sinh với chị Trúc rất hiệu quả, đau lưng giảm hẳn."),
        ],
    },
]

DEMO_LEADS = [
    ("Trần Văn An", "0912345678", "Giảm 8kg trong 3 tháng", "Phường Sài Gòn, Thành phố Hồ Chí Minh", "5-7 triệu/tháng", LeadStatus.new),
    ("Nguyễn Thị Bích", "0987654321", "Tăng cơ, cải thiện vóc dáng", "Phường Bàn Cờ, Thành phố Hồ Chí Minh", "Khoảng 500k/buổi", LeadStatus.new),
    ("Lê Minh Châu", "0909123456", "Tập cho người mới bắt đầu", "Phường Tân Thuận, Thành phố Hồ Chí Minh", "3-4 triệu/tháng", LeadStatus.contacted),
    ("Phạm Đức Dũng", "0978111222", "Chuẩn bị thi đấu thể hình", "Phường Bình Thạnh, Thành phố Hồ Chí Minh", "Trên 10 triệu/tháng", LeadStatus.closed),
    ("Vũ Hải Đăng", "0966333444", "Giảm mỡ bụng", "Phường Sài Gòn, Thành phố Hồ Chí Minh", "Dưới 3 triệu/tháng", LeadStatus.lost),
]


# Yêu cầu mở cho bảng "Học viên cần PT" — đủ đa dạng để thử bộ lọc
# (chuyên môn, quận, ngân sách, giới tính mong muốn).
DEMO_REQUESTS = [
    {
        "trainee_name": "Ngô Thị Lan",
        "trainee_phone": "0901222333",
        "specialty": "weight_loss",
        "city": "Thành phố Hồ Chí Minh",
        "ward": "Phường Tân Thuận",
        "budget_min": 300000,
        "budget_max": 500000,
        "preferred_gender": Gender.female,
        "note": "Mình muốn giảm 8kg trong 3 tháng, tập được sau 19h các ngày trong tuần.",
    },
    {
        "trainee_name": "Trần Quốc Huy",
        "trainee_phone": "0912888999",
        "specialty": "muscle_gain",
        "city": "Thành phố Hồ Chí Minh",
        "ward": "Phường Bình Thạnh",
        "budget_min": 400000,
        "budget_max": 700000,
        "preferred_gender": None,
        "note": "Tập được 1 năm nhưng chững lại, cần người xây giáo án tăng cơ bài bản.",
    },
    {
        "trainee_name": "Phạm Minh Thư",
        "trainee_phone": "0938444555",
        "specialty": "beginner",
        "city": "Thành phố Hồ Chí Minh",
        "ward": "Phường Sài Gòn",
        "budget_min": None,
        "budget_max": 300000,
        "preferred_gender": Gender.female,
        "note": "Chưa từng đi gym, muốn có người hướng dẫn từ đầu cho đỡ sai tư thế.",
    },
    {
        "trainee_name": "Đỗ Văn Kiên",
        "trainee_phone": "0977666111",
        "specialty": "rehab",
        "city": "Tỉnh Đồng Nai",
        "ward": "Phường Hố Nai",
        "budget_min": 500000,
        "budget_max": 900000,
        "preferred_gender": None,
        "note": "Đau lưng dưới sau chấn thương, cần PT có kinh nghiệm phục hồi.",
    },
]


def _portfolio_for(index: int, full_name: str):
    seed_base = "ptmatch-%d" % index
    items = [
        PortfolioItem(
            type=PortfolioType.before_after,
            before_url="https://picsum.photos/seed/%s-before/800/600" % seed_base,
            after_url="https://picsum.photos/seed/%s-after/800/600" % seed_base,
            description="Học viên giảm 7kg sau 12 tuần cùng %s" % full_name,
            sort_order=0,
        ),
        PortfolioItem(
            type=PortfolioType.photo,
            media_url="https://picsum.photos/seed/%s-photo/800/600" % seed_base,
            description="Buổi tập cùng học viên",
            sort_order=1,
        ),
    ]
    if index % 2 == 0:
        items.append(
            PortfolioItem(
                type=PortfolioType.video,
                media_url="https://picsum.photos/seed/%s-video/800/600" % seed_base,
                description="Video transformation 6 tháng",
                sort_order=2,
            )
        )
    return items


async def seed() -> None:
    random.seed(42)
    async with async_session_factory() as db:
        existing = await db.scalar(
            select(User.id).where(User.email == "pt@ptmatch.vn")
        )
        if existing:
            print("Seed data already exists (pt@ptmatch.vn found) — skipping.")
            return

        password_hash = hash_password(DEMO_PASSWORD)
        first_profile = None
        profiles_by_email = {}
        now = datetime.now(timezone.utc)

        for index, data in enumerate(PT_SEED, start=1):
            user = User(
                email=data["email"],
                phone="09%08d" % random.randint(0, 99999999),
                password_hash=password_hash,
                role=UserRole.pt,
            )
            db.add(user)
            await db.flush()

            reviews = data["reviews"]
            ratings = [r[1] for r in reviews]
            profile = PTProfile(
                user_id=user.id,
                slug=slugify(data["full_name"]),
                full_name=data["full_name"],
                gender=data["gender"],
                age=data["age"],
                experience_years=data["experience_years"],
                bio=data["bio"],
                avatar_url="https://picsum.photos/seed/ptmatch-avatar-%d/400/400" % index,
                certifications=data["certifications"],
                specialties=data["specialties"],
                social_links=data["social_links"],
                pricing=data["pricing"],
                is_active=True,
                avg_rating=round(sum(ratings) / len(ratings), 2),
                review_count=len(ratings),
                view_count=random.randint(50, 800),
                # Mốc hoạt động khác nhau để thấy đủ các trạng thái trên UI:
                # vài PT vừa online, vài PT đã lâu không vào.
                last_active_at=now - timedelta(hours=[2, 20, 30, 26 * 24][index % 4]),
            )
            db.add(profile)
            await db.flush()

            if first_profile is None:
                first_profile = profile
            profiles_by_email[data["email"]] = profile

            for loc in data["locations"]:
                db.add(PTLocation(pt_profile_id=profile.id, **loc))

            for item in _portfolio_for(index, data["full_name"]):
                item.pt_profile_id = profile.id
                db.add(item)

            for r_index, (name, rating, content) in enumerate(reviews):
                images = (
                    ["https://picsum.photos/seed/ptmatch-rv-%d-%d/600/400" % (index, r_index)]
                    if rating == 5
                    else []
                )
                review = Review(
                    pt_profile_id=profile.id,
                    reviewer_name=name,
                    reviewer_phone="09%08d" % random.randint(0, 99999999),
                    rating=rating,
                    content=content,
                    images=images,
                    # `approved_at` = đang hiển thị (xem alembic 0015 và
                    # app/api/reviews.py). Đặt tường minh để dữ liệu demo không
                    # phụ thuộc vào giá trị mặc định của cột.
                    approved_at=now - timedelta(days=1),
                )
                # Give the first two PTs a reply on their first review so the
                # "PT đã phản hồi" state is testable.
                if index <= 2 and r_index == 0:
                    review.reply_content = (
                        "Cảm ơn bạn rất nhiều! Rất vui khi được đồng hành cùng bạn. "
                        "Hẹn gặp lại ở phòng tập nhé 💪"
                    )
                    review.replied_at = now - timedelta(days=1)
                db.add(review)

        # Demo leads for the demo account's profile.
        # Lead đã rời trạng thái 'new' được gán thời điểm phản hồi thật, để hồ
        # sơ công khai tính ra được "thường phản hồi trong ~N giờ".
        for lead_index, (name, phone, goal, area, budget, status) in enumerate(DEMO_LEADS):
            created_at = now - timedelta(days=lead_index + 1)
            responded_after = timedelta(hours=[2, 5, 1, 8, 3][lead_index % 5])
            db.add(
                Lead(
                    pt_profile_id=first_profile.id,
                    trainee_name=name,
                    trainee_phone=phone,
                    goal=goal,
                    area=area,
                    budget=budget,
                    status=status,
                    created_at=created_at,
                    first_response_at=(
                        created_at + responded_after
                        if status is not LeadStatus.new
                        else None
                    ),
                )
            )

        # ---- Tài khoản admin để mở /admin ----
        #
        # Không có tài khoản này thì trang /admin không vào được bằng cách nào
        # cả: API đăng ký cố ý chỉ nhận role pt/trainee. Chỉ tạo ở dev — seed đã
        # tự từ chối chạy khi ENVIRONMENT=production, và trên server thật thì
        # dùng `python -m app.jobs.grant_admin <email>`.
        db.add(
            User(
                email=ADMIN_EMAIL,
                full_name="Quản Trị Demo",
                password_hash=password_hash,
                role=UserRole.admin,
            )
        )

        # ---- Demo trainee account with data for all 4 trainee features ----
        trainee = User(
            email=TRAINEE_EMAIL,
            full_name="Học Viên Demo",
            phone="0909123456",
            password_hash=password_hash,
            role=UserRole.trainee,
        )
        db.add(trainee)
        await db.flush()

        # Favorites: 3 saved PTs
        for email in ("pt@ptmatch.vn", "pt5@ptmatch.vn", "pt9@ptmatch.vn"):
            db.add(Favorite(user_id=trainee.id, pt_profile_id=profiles_by_email[email].id))

        # Lead history: requests sent by this trainee, varied status
        trainee_leads = [
            ("pt@ptmatch.vn", "Tăng cơ, cải thiện vóc dáng", "Phường Sài Gòn, Thành phố Hồ Chí Minh", "500k/buổi", LeadStatus.contacted),
            ("pt5@ptmatch.vn", "Online coaching giảm mỡ", "Online", "4-5 triệu/tháng", LeadStatus.new),
        ]
        for email, goal, area, budget, status in trainee_leads:
            db.add(
                Lead(
                    pt_profile_id=profiles_by_email[email].id,
                    trainee_id=trainee.id,
                    trainee_name=trainee.full_name,
                    trainee_phone=trainee.phone,
                    goal=goal,
                    area=area,
                    budget=budget,
                    status=status,
                )
            )

        # Reviews authored by this trainee (one already replied by the PT)
        demo_pt = profiles_by_email["pt@ptmatch.vn"]
        rv1 = Review(
            pt_profile_id=demo_pt.id,
            trainee_id=trainee.id,
            reviewer_name=trainee.full_name,
            reviewer_phone=trainee.phone,
            rating=5,
            content="Tập với anh Tuấn 2 tháng, lên 3kg cơ. Rất hài lòng!",
            images=[],
            reply_content="Cảm ơn bạn đã tin tưởng! Cùng cố gắng tiếp nhé 💪",
            replied_at=now - timedelta(hours=6),
            approved_at=now - timedelta(hours=8),
        )
        rv2 = Review(
            pt_profile_id=profiles_by_email["pt9@ptmatch.vn"].id,
            trainee_id=trainee.id,
            reviewer_name=trainee.full_name,
            reviewer_phone=trainee.phone,
            rating=4,
            content="Cô Trúc nhẹ nhàng, phù hợp người mới. Lịch sáng hơi sớm với mình.",
            images=[],
            approved_at=now - timedelta(hours=8),
        )
        db.add_all([rv1, rv2])
        # Reflect the two extra reviews in the affected profiles' rating counts.
        await db.flush()
        for profile in (demo_pt, profiles_by_email["pt9@ptmatch.vn"]):
            avg, count = (
                await db.execute(
                    select(func.avg(Review.rating), func.count()).where(
                        Review.pt_profile_id == profile.id,
                        # Cùng tập với những gì hiện công khai — xem
                        # app/services/rating.py.
                        Review.approved_at.isnot(None),
                    )
                )
            ).one()
            profile.avg_rating = round(float(avg), 2) if avg is not None else 0.0
            profile.review_count = int(count or 0)

        for offset, data in enumerate(DEMO_REQUESTS):
            created_at = now - timedelta(days=offset, hours=3)
            db.add(
                TraineeRequest(
                    created_at=created_at,
                    expires_at=created_at + timedelta(days=REQUEST_LIFETIME_DAYS),
                    **data,
                )
            )

        await db.commit()

        total_pts = await db.scalar(select(func.count()).select_from(PTProfile))
        print("Seeded %s PT profiles." % total_pts)
        print("Demo PT account:      pt@ptmatch.vn / %s" % DEMO_PASSWORD)
        print("Demo trainee account: %s / %s" % (TRAINEE_EMAIL, DEMO_PASSWORD))
        print("Demo admin account:   %s / %s  (mở /admin)" % (ADMIN_EMAIL, DEMO_PASSWORD))


def _refuse_on_production() -> None:
    """Chặn seed chạy nhầm vào production.

    Dữ liệu seed gồm tài khoản demo với mật khẩu nằm sẵn trong repo và trong
    scripts/smoke-test.sh. Chạy nhầm lệnh này lên server thật là tạo ra một tài
    khoản PT mà ai đọc repo cũng đăng nhập được.

    Đặt SEED_ALLOW_PRODUCTION=1 để cố tình bỏ qua (ví dụ dựng môi trường demo
    công khai) — phải là một hành động có ý thức, không phải mặc định.
    """
    if settings.environment != "production":
        return
    if os.getenv("SEED_ALLOW_PRODUCTION") == "1":
        print("CẢNH BÁO: seed dữ liệu demo vào ENVIRONMENT=production.")
        return
    raise SystemExit(
        "Từ chối seed khi ENVIRONMENT=production: dữ liệu demo dùng mật khẩu "
        "công khai trong repo.\n"
        "Nếu thật sự muốn, chạy lại với SEED_ALLOW_PRODUCTION=1."
    )


async def main() -> None:
    _refuse_on_production()
    try:
        await seed()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
