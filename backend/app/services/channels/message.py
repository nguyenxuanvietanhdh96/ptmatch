"""Soạn nội dung thông báo lead, dùng chung cho mọi kênh.

Tách khỏi từng kênh để email, Zalo và ZNS luôn nói cùng một chuyện — chỉ khác
độ dài. Sửa cách diễn đạt ở đây là sửa cho tất cả.
"""
from app.core.config import settings
from app.services.channels.base import LeadNotification


def subject_for(payload: LeadNotification) -> str:
    if payload.is_reminder:
        return "[PTMatch] Lead chưa xử lý từ %s" % payload.trainee_name
    if payload.is_claim:
        return "[PTMatch] Thông tin liên hệ của %s" % payload.trainee_name
    return "[PTMatch] Lead mới từ %s" % payload.trainee_name


def long_body(payload: LeadNotification) -> str:
    """Bản dài, cho email — nơi không bị giới hạn ký tự."""
    if payload.is_reminder:
        opening = (
            "Bạn có một yêu cầu tư vấn đã chờ %s giờ mà chưa được xử lý:"
            % (payload.hours_waiting or "?")
        )
    elif payload.is_claim:
        opening = (
            "Bạn vừa nhận một yêu cầu trên bảng \"Học viên cần PT\". "
            "Thông tin liên hệ để bạn gọi ngay:"
        )
    else:
        opening = "Bạn vừa nhận được một yêu cầu tư vấn mới trên PTMatch:"

    lines = [
        "Chào %s," % payload.pt_name,
        "",
        opening,
        "",
        "  Họ tên:    %s" % payload.trainee_name,
        "  SĐT:       %s" % payload.trainee_phone,
        "  Mục tiêu:  %s" % (payload.goal or "—"),
        "  Khu vực:   %s" % (payload.area or "—"),
        "  Ngân sách: %s" % (payload.budget or "—"),
        "",
        "Hãy liên hệ sớm — lead phản hồi trong 1 giờ đầu có tỷ lệ chốt cao nhất.",
        "",
        "Quản lý leads: %s/dashboard/leads" % settings.frontend_base_url,
    ]
    return "\n".join(lines)


def short_body(payload: LeadNotification) -> str:
    """Bản ngắn, cho tin nhắn (Zalo).

    Người đọc trên điện thoại và chỉ cần đủ để bấm gọi ngay: tên, số, mục tiêu.
    Chi tiết còn lại đã có trong dashboard.
    """
    if payload.is_reminder:
        head = "PTMatch — lead chưa xử lý (%s giờ)" % (payload.hours_waiting or "?")
    elif payload.is_claim:
        head = "PTMatch — bạn đã nhận yêu cầu này"
    else:
        head = "PTMatch — bạn có lead mới"
    lines = [
        head,
        "%s · %s" % (payload.trainee_name, payload.trainee_phone),
    ]
    if payload.goal:
        lines.append("Mục tiêu: %s" % payload.goal)
    if payload.area:
        lines.append("Khu vực: %s" % payload.area)
    if payload.budget:
        lines.append("Ngân sách: %s" % payload.budget)
    lines.append("%s/dashboard/leads" % settings.frontend_base_url)
    return "\n".join(lines)
