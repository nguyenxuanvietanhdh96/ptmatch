"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { isServedProvince, normalizeProvinceName } from "@/lib/constants";

interface Province {
  code: number;
  name: string;
}

interface Ward {
  code: number;
  name: string;
}

interface LocationSelectProps {
  cityValue?: string;
  wardValue?: string;
  cityName?: string;
  wardName?: string;
  layout?: "row" | "col" | "contents";
  inputClassName?: string;
  labelClassName?: string;
  /**
   * Form dùng state React (không submit native) thì truyền callback để nhận
   * giá trị; các form GET sẵn có vẫn dựa vào input hidden bên dưới.
   */
  onCityChange?: (value: string) => void;
  onWardChange?: (value: string) => void;
}

/**
 * Chọn tỉnh/thành và phường/xã theo cơ cấu hành chính 2 cấp.
 *
 * Từ 01/07/2025 Việt Nam còn 34 tỉnh/thành và bỏ cấp huyện — dưới tỉnh là
 * phường/xã trực tiếp. Vì vậy không còn bước "quận/huyện" ở giữa.
 *
 * Dữ liệu phục vụ từ chính origin của mình (public/vn-locations/), không gọi
 * API cộng đồng ở runtime: API đó sập là ô chọn trống trơn mà không báo lỗi gì,
 * và bản v1 của nó vẫn trả về cơ cấu 63 tỉnh đã bị bãi bỏ.
 *
 * Tách làm hai tầng file vì danh sách phường/xã cả nước là 3.321 mục (~134KB):
 * chỉ tải index 34 tỉnh (~1,3KB) lúc đầu, phường/xã của tỉnh nào lấy khi người
 * dùng chọn tỉnh đó (~4KB).
 *
 * Danh sách tỉnh hiện ra còn bị lọc theo SERVED_PROVINCES (lib/constants.ts) —
 * xem loadProvinces() bên dưới. Đây chỉ là UI; bên thực sự chặn là backend
 * (app/services/coverage.py), vì API vẫn nhận giá trị bất kỳ nếu gọi trực tiếp.
 *
 * Cập nhật dữ liệu: xem scripts/fetch-locations.sh
 */
const PROVINCES_URL = "/vn-locations/provinces.json";
const wardsUrl = (provinceCode: string) => `/vn-locations/wards/${provinceCode}.json`;

let cachedProvinces: Province[] | null = null;
let provincesInflight: Promise<Province[]> | null = null;
// Cache phường/xã theo mã tỉnh — chuyển qua lại giữa hai tỉnh không tải lại.
const wardCache = new Map<string, Ward[]>();

function loadProvinces(): Promise<Province[]> {
  if (cachedProvinces) return Promise.resolve(cachedProvinces);
  // Gộp các lời gọi đồng thời: một trang có thể render nhiều LocationSelect.
  if (!provincesInflight) {
    provincesInflight = fetch(PROVINCES_URL)
      .then((r) => r.json())
      .then((data: Province[]) => {
        // Lọc theo vùng đang phục vụ. LỌC Ở ĐÂY, không lọc lúc sinh file
        // provinces.json: file đó là danh mục hành chính, phải phản ánh đúng 34
        // tỉnh thật — mở thêm tỉnh chỉ là đổi SERVED_PROVINCES, không phải chạy
        // lại scripts/fetch-locations.sh.
        cachedProvinces = data.filter((p) => isServedProvince(p.name));
        return cachedProvinces;
      })
      .catch(() => {
        provincesInflight = null;
        return [];
      });
  }
  return provincesInflight;
}

async function loadWards(provinceCode: string): Promise<Ward[]> {
  const cached = wardCache.get(provinceCode);
  if (cached) return cached;
  try {
    const data: Ward[] = await (await fetch(wardsUrl(provinceCode))).json();
    wardCache.set(provinceCode, data);
    return data;
  } catch {
    return [];
  }
}

export default function LocationSelect({
  cityValue = "",
  wardValue = "",
  cityName = "city",
  wardName = "ward",
  layout = "col",
  inputClassName = "input",
  labelClassName = "label",
  onCityChange,
  onWardChange,
}: LocationSelectProps) {
  const t = useTranslations("location");
  const [provinces, setProvinces] = useState<Province[]>(cachedProvinces ?? []);
  const [wards, setWards] = useState<Ward[]>([]);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedWard, setSelectedWard] = useState(wardValue);

  // id duy nhất cho mỗi instance: hai LocationSelect trên cùng trang mà trùng id
  // thì bấm nhãn này lại nhảy vào ô kia.
  const uid = useId();
  const cityId = `loc-city-${uid}`;
  const wardId = `loc-ward-${uid}`;

  useEffect(() => {
    let alive = true;
    loadProvinces().then((data) => {
      if (alive) setProvinces(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Khôi phục lựa chọn từ giá trị có sẵn (URL param, hoặc hồ sơ đang sửa).
  useEffect(() => {
    if (!cityValue || provinces.length === 0) return;
    const wanted = normalizeProvinceName(cityValue);
    const match = provinces.find((p) => {
      const name = normalizeProvinceName(p.name);
      return name === wanted || name.includes(wanted) || wanted.includes(name);
    });
    if (match) setSelectedProvince(String(match.code));
  }, [cityValue, provinces]);

  useEffect(() => {
    if (!selectedProvince) {
      setWards([]);
      return;
    }
    let alive = true;
    loadWards(selectedProvince).then((data) => {
      if (alive) setWards(data);
    });
    return () => {
      alive = false;
    };
  }, [selectedProvince]);

  const provinceName = provinces.find((p) => String(p.code) === selectedProvince)?.name ?? "";

  const wrapperClass =
    layout === "row" ? "flex gap-2" : layout === "contents" ? "contents" : "space-y-3";
  const fieldClass = layout === "row" ? "flex-1 min-w-[180px]" : "";
  const showLabels = layout === "col" || layout === "contents";

  return (
    <div className={wrapperClass}>
      <div className={fieldClass}>
        {showLabels && <label className={labelClassName} htmlFor={cityId}>{t("province")}</label>}
        <select
          id={cityId}
          className={inputClassName}
          value={selectedProvince}
          onChange={(e) => {
            setSelectedProvince(e.target.value);
            setSelectedWard("");
            onCityChange?.(
              provinces.find((p) => String(p.code) === e.target.value)?.name ?? ""
            );
            onWardChange?.("");
          }}
        >
          <option value="">{t("allProvinces")}</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="hidden" name={cityName} value={provinceName} />
      </div>
      <div className={fieldClass}>
        {showLabels && <label className={labelClassName} htmlFor={wardId}>{t("ward")}</label>}
        <select
          id={wardId}
          className={inputClassName}
          value={selectedWard}
          onChange={(e) => {
            setSelectedWard(e.target.value);
            onWardChange?.(e.target.value);
          }}
          disabled={!selectedProvince}
        >
          <option value="">{selectedProvince ? t("allWards") : t("pickProvinceFirst")}</option>
          {wards.map((w) => (
            <option key={w.code} value={w.name}>
              {w.name}
            </option>
          ))}
        </select>
        <input type="hidden" name={wardName} value={selectedWard} />
      </div>
    </div>
  );
}
