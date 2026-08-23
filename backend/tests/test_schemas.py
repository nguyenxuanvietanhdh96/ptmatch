import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest
from app.schemas.lead import LeadCreate, LeadStatusUpdate
from app.schemas.pt import Pricing, PTProfileUpdate
from app.schemas.review import ReviewCreate


class TestRegisterRequest:
    def test_valid_pt(self):
        req = RegisterRequest(
            email="pt@example.com",
            phone="0912345678",
            password="password123",
            role="pt",
            full_name="Nguyễn Văn A",
        )
        assert req.role == "pt"

    def test_invalid_email(self):
        with pytest.raises(ValidationError):
            RegisterRequest(
                email="not-an-email",
                password="password123",
                role="pt",
                full_name="Nguyễn Văn A",
            )

    def test_short_password(self):
        with pytest.raises(ValidationError):
            RegisterRequest(
                email="pt@example.com",
                password="short",
                role="pt",
                full_name="Nguyễn Văn A",
            )

    def test_admin_role_rejected(self):
        with pytest.raises(ValidationError):
            RegisterRequest(
                email="admin@example.com",
                password="password123",
                role="admin",
                full_name="Admin",
            )


class TestPTProfileUpdate:
    def test_valid_specialties(self):
        upd = PTProfileUpdate(specialties=["weight_loss", "muscle_gain"])
        assert upd.specialties == ["weight_loss", "muscle_gain"]

    def test_custom_specialty_allowed(self):
        # Specialties are not a closed list: PTs may add their own slug as long
        # as it stays lowercase alphanumeric + underscores.
        upd = PTProfileUpdate(specialties=["crossfit"])
        assert upd.specialties == ["crossfit"]

    def test_malformed_specialty_rejected(self):
        with pytest.raises(ValidationError):
            PTProfileUpdate(specialties=["Cross Fit!"])

    def test_specialties_deduped(self):
        upd = PTProfileUpdate(specialties=["beginner", "beginner", "rehab"])
        assert upd.specialties == ["beginner", "rehab"]

    def test_negative_price_rejected(self):
        with pytest.raises(ValidationError):
            Pricing(per_session=-1)

    def test_age_bounds(self):
        with pytest.raises(ValidationError):
            PTProfileUpdate(age=10)
        with pytest.raises(ValidationError):
            PTProfileUpdate(age=120)


class TestLeadSchemas:
    def test_valid_lead(self):
        lead = LeadCreate(
            pt_slug="nguyen-van-a",
            trainee_name="Trần Văn B",
            trainee_phone="0912345678",
            goal="Giảm cân",
            area="Quận 1",
            budget="5 triệu",
        )
        assert lead.pt_slug == "nguyen-van-a"

    def test_short_phone_rejected(self):
        with pytest.raises(ValidationError):
            LeadCreate(
                pt_slug="nguyen-van-a",
                trainee_name="Trần Văn B",
                trainee_phone="123",
            )

    def test_invalid_status_rejected(self):
        with pytest.raises(ValidationError):
            LeadStatusUpdate(status="pending")

    def test_valid_status(self):
        assert LeadStatusUpdate(status="contacted").status == "contacted"


class TestReviewCreate:
    def test_valid_review(self):
        review = ReviewCreate(
            reviewer_name="Lê Thị C",
            rating=5,
            content="Tuyệt vời!",
            images=["https://example.com/1.jpg"],
        )
        assert review.rating == 5

    def test_rating_too_low(self):
        with pytest.raises(ValidationError):
            ReviewCreate(reviewer_name="Lê Thị C", rating=0)

    def test_rating_too_high(self):
        with pytest.raises(ValidationError):
            ReviewCreate(reviewer_name="Lê Thị C", rating=6)

    def test_images_default_empty(self):
        review = ReviewCreate(reviewer_name="Lê Thị C", rating=4)
        assert review.images == []

    def test_too_many_images(self):
        with pytest.raises(ValidationError):
            ReviewCreate(
                reviewer_name="Lê Thị C",
                rating=5,
                images=["https://example.com/%d.jpg" % i for i in range(11)],
            )
