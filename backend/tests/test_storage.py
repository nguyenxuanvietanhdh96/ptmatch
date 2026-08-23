from unittest.mock import MagicMock, patch

from app.services.storage import (
    build_object_key,
    extension_matches_content_type,
    is_allowed_content_type,
    is_safe_key,
    presign_gcs,
)


class TestObjectKey:
    def test_build_key_derives_extension_from_content_type(self):
        key = build_object_key("user-1", "image/jpeg")
        assert key.startswith("uploads/user-1/")
        assert key.endswith(".jpg")

    def test_build_key_ignores_client_filename_entirely(self):
        # build_object_key no longer takes a filename — the extension comes
        # only from the validated content-type, so there is nothing for a
        # client-supplied filename to smuggle in.
        key = build_object_key("user-1", "image/png")
        assert ".." not in key
        assert is_safe_key(key)

    def test_extension_must_match_declared_content_type(self):
        key = build_object_key("user-1", "image/png")
        assert extension_matches_content_type(key, "image/png")
        assert not extension_matches_content_type(key, "image/jpeg")
        # An attacker-chosen key extension not backed by the content-type map
        # (e.g. .html/.svg) never matches, regardless of declared type.
        assert not extension_matches_content_type("uploads/user-1/x.html", "image/png")
        assert not extension_matches_content_type("uploads/user-1/x.svg", "image/svg+xml")

    def test_safe_keys(self):
        assert is_safe_key("uploads/abc/file.png")
        assert is_safe_key("a/b/c.mp4")

    def test_path_traversal_rejected(self):
        assert not is_safe_key("../etc/passwd")
        assert not is_safe_key("uploads/../../etc/passwd")
        assert not is_safe_key("/absolute/path.png")
        assert not is_safe_key("uploads//double.png")
        assert not is_safe_key(".hidden/file.png")
        assert not is_safe_key("uploads/.././x.png")

    def test_backslash_rejected(self):
        assert not is_safe_key("uploads\\windows\\path.png")


class TestContentType:
    def test_image_and_video_allowed(self):
        assert is_allowed_content_type("image/png")
        assert is_allowed_content_type("image/jpeg")
        assert is_allowed_content_type("video/mp4")
        assert is_allowed_content_type("IMAGE/PNG")

    def test_other_types_rejected(self):
        assert not is_allowed_content_type("application/x-php")
        assert not is_allowed_content_type("text/html")
        assert not is_allowed_content_type("application/octet-stream")

    def test_svg_rejected(self):
        # SVG can carry <script> and is served same-origin under /media in
        # STORAGE_BACKEND=local — must never be in the allowed set.
        assert not is_allowed_content_type("image/svg+xml")


class TestGcsPresign:
    def test_signs_a_content_length_range_and_returns_it_for_the_client_to_send(self):
        # Without this header (both signed AND echoed back to the caller so
        # the actual PUT request carries it), a GCS signed URL only bounds
        # content-type — a client can PUT an arbitrarily large file.
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://signed.example/put"
        mock_client = MagicMock()
        mock_client.bucket.return_value.blob.return_value = mock_blob

        with patch("app.services.storage._get_gcs_client", return_value=mock_client), patch(
            "app.services.storage.settings"
        ) as mock_settings:
            mock_settings.gcs_bucket_name = "test-bucket"
            mock_settings.cdn_base_url = ""
            result = presign_gcs("uploads/user-1/x.jpg", "image/jpeg")

        signed_kwargs = mock_blob.generate_signed_url.call_args.kwargs
        assert signed_kwargs["headers"] == {"x-goog-content-length-range": "0,10485760"}
        assert result["x-goog-content-length-range"] == "0,10485760"
