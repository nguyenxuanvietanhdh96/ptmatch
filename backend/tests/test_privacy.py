from app.services.privacy import mask_phone


class TestMaskPhone:
    def test_masks_middle_of_vn_mobile(self):
        assert mask_phone("0912345678") == "091****678"

    def test_keeps_length_stable(self):
        assert len(mask_phone("0912345678")) == len("0912345678")

    def test_handles_country_code(self):
        assert mask_phone("+84912345678") == "+84******678"

    def test_short_input_is_almost_fully_hidden(self):
        assert mask_phone("12345") == "12***"

    def test_empty_input_passes_through(self):
        assert mask_phone("") == ""
