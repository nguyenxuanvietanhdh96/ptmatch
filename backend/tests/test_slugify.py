from app.services.slug import slugify, strip_diacritics


def test_strip_diacritics():
    assert strip_diacritics("Nguyễn Văn Đạt") == "Nguyen Van Dat"
    assert strip_diacritics("Tuấn") == "Tuan"
    assert strip_diacritics("abc 123") == "abc 123"


def test_basic_vietnamese_name():
    assert slugify("Nguyễn Văn A") == "nguyen-van-a"


def test_d_with_stroke():
    assert slugify("Đặng Thị Mỹ Lệ") == "dang-thi-my-le"


def test_mixed_diacritics():
    assert slugify("Trần Thị Thu Hà") == "tran-thi-thu-ha"


def test_special_characters_collapsed():
    assert slugify("  PT --- Pro!!  2024 ") == "pt-pro-2024"


def test_uppercase_lowered():
    assert slugify("HOÀNG ĐỨC THỊNH") == "hoang-duc-thinh"


def test_empty_falls_back():
    assert slugify("!!!") == "pt"
    assert slugify("") == "pt"


def test_numbers_preserved():
    assert slugify("Lê Văn Tám 123") == "le-van-tam-123"
