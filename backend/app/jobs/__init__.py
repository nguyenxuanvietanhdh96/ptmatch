"""Tác vụ chạy theo lịch, gọi từ cron.

Cố ý KHÔNG dùng scheduler trong tiến trình (APScheduler/Celery): backend chạy
một container duy nhất dưới `restart: unless-stopped`, và scheduler trong tiến
trình sẽ chạy trùng nếu sau này nhân đôi instance. Cron cấp máy đã là cách server
này quản backup DB rồi (xem scripts/setup-server.sh), nên đi theo cùng lối đó
giữ cho phần vận hành chỉ có một chỗ để nhìn.
"""
