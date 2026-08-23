"""Vùng phục vụ: chặn tỉnh chưa mở, và chuẩn hoá tên tỉnh về dạng danh mục.

Hai việc này đi cùng nhau có lý do. Chặn thôi thì chưa đủ: bộ lọc khu vực so
khớp theo chuỗi con, nên một hồ sơ lưu "HCM" sẽ không bao giờ gặp học viên chọn
"Thành phố Hồ Chí Minh" từ ô chọn — im lặng mất kết quả, đúng lỗi alembic 0012
đã phải dọn. Vì vậy validator nhận đầu vào khoan dung nhưng LƯU dạng chuẩn.
"""
import pytest
from pydantic import ValidationError

from app.schemas.pt import LocationCreate
from app.schemas.request import TraineeRequestCreate
from app.services.coverage import canonicalize_province

HCM = "Thành phố Hồ Chí Minh"
DONG_NAI = "Tỉnh Đồng Nai"


def _request(**overrides) -> dict:
    body = {
        "trainee_name": "Nguyen Van A",
        "trainee_phone": "0912345678",
    }
    body.update(overrides)
    return body


class TestCanonicalize:
    def test_exact_catalog_name_passes_through(self):
        assert canonicalize_province(HCM) == HCM
        assert canonicalize_province(DONG_NAI) == DONG_NAI

    @pytest.mark.parametrize(
        "written",
        [
            "Hồ Chí Minh",              # thiếu tiền tố "Thành phố"
            "thành phố hồ chí minh",    # hoa thường tuỳ ý
            "Ho Chi Minh",              # gõ không dấu
            "  Thành phố Hồ Chí Minh ", # thừa khoảng trắng
        ],
    )
    def test_tolerant_input_is_stored_canonically(self, written):
        """Nhận khoan dung nhưng trả về đúng một dạng — nếu không, DB có 4 biến
        thể của cùng một tỉnh và bộ lọc chỉ khớp được một trong số đó."""
        assert canonicalize_province(written) == HCM

    def test_dong_nai_without_prefix_and_diacritics(self):
        assert canonicalize_province("Dong Nai") == DONG_NAI

    @pytest.mark.parametrize(
        "abbrev",
        ["TP. Hồ Chí Minh", "TP Hồ Chí Minh", "TP.HCM", "TPHCM", "HCM", "Sài Gòn", "Saigon"],
    )
    def test_common_abbreviations_are_accepted(self, abbrev):
        """Cùng danh sách viết tắt mà alembic 0012 đã phải dọn khỏi dữ liệu cũ.
        Chấp nhận ở đầu vào rồi lưu dạng chuẩn thì không phải dọn lần nữa."""
        assert canonicalize_province(abbrev) == HCM

    def test_abbreviation_of_an_unserved_province_is_still_rejected(self):
        """Khoan dung về CÁCH VIẾT, không khoan dung về VÙNG."""
        with pytest.raises(ValueError, match="chưa được hỗ trợ"):
            canonicalize_province("HN")

    def test_province_outside_coverage_is_rejected(self):
        with pytest.raises(ValueError, match="chưa được hỗ trợ"):
            canonicalize_province("Thành phố Hà Nội")

    def test_error_message_names_the_served_provinces(self):
        """Thông báo phải nói rõ đang mở ở đâu — nó hiện thẳng lên form."""
        with pytest.raises(ValueError) as exc:
            canonicalize_province("Tỉnh Khánh Hòa")
        message = str(exc.value)
        assert HCM in message and DONG_NAI in message

    def test_empty_and_none_pass_through(self):
        """Khu vực là trường không bắt buộc: "chưa khai" khác "khai sai"."""
        assert canonicalize_province(None) is None
        assert canonicalize_province("") is None
        assert canonicalize_province("   ") is None

    def test_empty_setting_disables_the_limit(self, monkeypatch):
        """Mở toàn quốc phải là đổi một biến cấu hình, không phải sửa code."""
        from app.core.config import settings

        monkeypatch.setattr(settings, "served_provinces", "")
        assert canonicalize_province("Thành phố Hà Nội") == "Thành phố Hà Nội"

    def test_a_bare_substring_is_not_a_match(self):
        """"Minh" không được coi là TP.HCM — so khớp phải trọn tên sau khi
        chuẩn hoá, không phải chứa chuỗi con."""
        with pytest.raises(ValueError):
            canonicalize_province("Minh")


class TestSchemaEnforcement:
    def test_pt_location_rejects_unserved_province(self):
        with pytest.raises(ValidationError, match="chưa được hỗ trợ"):
            LocationCreate(gym_name="California Fitness", city="Thành phố Hà Nội")

    def test_pt_location_canonicalises_city(self):
        loc = LocationCreate(gym_name="Citigym", ward="Phường Bàn Cờ", city="HO CHI MINH")
        assert loc.city == HCM

    def test_trainee_request_rejects_unserved_province(self):
        with pytest.raises(ValidationError, match="chưa được hỗ trợ"):
            TraineeRequestCreate(**_request(city="Thành phố Đà Nẵng"))

    def test_trainee_request_canonicalises_city(self):
        req = TraineeRequestCreate(**_request(city="Đồng Nai", ward="Phường Biên Hòa"))
        assert req.city == DONG_NAI

    def test_request_without_city_is_still_valid(self):
        assert TraineeRequestCreate(**_request()).city is None
