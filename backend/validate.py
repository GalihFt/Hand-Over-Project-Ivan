import time
from datetime import datetime
from difflib import get_close_matches
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from logic import (
    CABANG_ALIASES,
    PORT_LOCATIONS,
    geocode_cache,
    resolve_coordinates,
)

REQUIRED_COLUMNS = [
    'NO SOPT', 'ALAMAT', 'CABANG', 'OPS DELIVERY TIME',
    'CUST ID', 'SIZE CONT', 'SERVICE TYPE', 'GRADE CONT'
]

COLUMN_ALIASES: Dict[str, str] = {
    'NOMOR SOPT': 'NO SOPT',
    'NO_SOPT': 'NO SOPT',
    'NOSOPT': 'NO SOPT',
    'NO CONTAINER': 'NO CONTAINER',
    'NO_CONTAINER': 'NO CONTAINER',
    'CONTAINER NO': 'NO CONTAINER',
    'CONTAINER_NO': 'NO CONTAINER',
    'VES VOY': 'VESVOY',
    'VES_VOY': 'VESVOY',
    'BONGKAR_FXD': 'BONGKAR FXD',
    'BONGKAR FIXED': 'BONGKAR FXD',
    'CUSTOMER ID': 'CUST ID',
    'CUSTOMER_ID': 'CUST ID',
    'CUSTID': 'CUST ID',
    'ADDRESS': 'ALAMAT',
    'LONG': 'LONGITUDE',
    'LON': 'LONGITUDE',
    'LNG': 'LONGITUDE',
    'LAT': 'LATITUDE',
    'SIZE': 'SIZE CONT',
    'SIZE_CONT': 'SIZE CONT',
    'ACT LOAD DATE': 'OPS DELIVERY TIME',
    'ACT_LOAD_DATE': 'OPS DELIVERY TIME',
    'ACTUAL LOAD DATE': 'OPS DELIVERY TIME',
    'LOAD DATE': 'OPS DELIVERY TIME',
    'ACT. LOAD DATE': 'OPS DELIVERY TIME',
    'OPS DELIVERY TIME': 'OPS DELIVERY TIME',
    'OPS_DELIVERY_TIME': 'OPS DELIVERY TIME',
    'SERVICE_TYPE': 'SERVICE TYPE',
    'SERVICETYPE': 'SERVICE TYPE',
    'GRADE_CONT': 'GRADE CONT',
    'GRADECONT': 'GRADE CONT',
}

VALID_SIZE_CONT = {'20DC', '20RM', '21DC', '40HC', '40RM'}
VALID_SERVICE_TYPE = {'INTERCHANGE', 'STRIPPING'}
VALID_GRADE_CONT = {'A', 'B', 'C', '-', '', 'NAN', 'NONE'}
VALID_CABANG_CODES = set(PORT_LOCATIONS.keys())
VALID_CABANG_NAMES = set(CABANG_ALIASES.keys())

DATETIME_FORMATS = [
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%d %H:%M',
    '%Y-%m-%dT%H:%M:%S',
    '%Y-%m-%dT%H:%M',
    '%d/%m/%Y %H:%M:%S',
    '%d/%m/%Y %H:%M',
    '%d-%m-%Y %H:%M:%S',
    '%d-%m-%Y %H:%M',
    '%d %b %Y %H:%M',
    '%d %B %Y %H:%M',
    '%Y/%m/%d %H:%M',
    '%Y-%m-%d',
    '%d/%m/%Y',
    '%d-%m-%Y',
]


def _normalize_column_name(raw: str) -> str:
    """Normalize a column name using aliases."""
    cleaned = raw.strip().upper().replace('  ', ' ')
    return COLUMN_ALIASES.get(cleaned, cleaned)


def _find_column_suggestion(col_name: str, existing_cols: List[str]) -> Optional[str]:
    """Find close match for a missing column among existing columns."""
    matches = get_close_matches(col_name, existing_cols, n=1, cutoff=0.6)
    return matches[0] if matches else None


def _try_parse_datetime(value: Any) -> Tuple[Optional[str], Optional[str]]:
    """
    Try to parse a value into ISO datetime string.
    Returns (parsed_iso, error_message).
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None, "Nilai kosong"

    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%dT%H:%M:%S'), None

    if isinstance(value, pd.Timestamp):
        return value.strftime('%Y-%m-%dT%H:%M:%S'), None

    s = str(value).strip()
    if not s or s.lower() in ('nat', 'nan', 'none', ''):
        return None, "Nilai kosong"

    # Try each format
    for fmt in DATETIME_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime('%Y-%m-%dT%H:%M:%S'), None
        except ValueError:
            continue

    # Try pandas as last resort (with dayfirst=True for DD/MM convention)
    try:
        dt = pd.to_datetime(s, dayfirst=True)
        if pd.notna(dt):
            return dt.strftime('%Y-%m-%dT%H:%M:%S'), None
    except Exception:
        pass

    return None, f"Format tidak dikenali: '{s}'"


def _validate_cabang(value: Any) -> Tuple[Optional[str], Optional[str]]:
    """
    Validate CABANG value.
    Returns (normalized_code, warning_message).
    """
    if pd.isna(value) or value is None:
        return None, "Nilai CABANG kosong"

    s = str(value).strip().upper()
    if not s:
        return None, "Nilai CABANG kosong"

    # Direct code match
    if s in VALID_CABANG_CODES:
        return s, None

    # Alias match
    if s in CABANG_ALIASES:
        return CABANG_ALIASES[s], None

    # Fuzzy match on names
    all_names = list(VALID_CABANG_NAMES) + list(VALID_CABANG_CODES)
    matches = get_close_matches(s, all_names, n=1, cutoff=0.7)
    if matches:
        suggestion = matches[0]
        if suggestion in CABANG_ALIASES:
            return None, f"'{s}' tidak dikenali. Mungkin maksud Anda '{suggestion}'?"
        elif suggestion in VALID_CABANG_CODES:
            return None, f"'{s}' tidak dikenali. Mungkin maksud Anda kode '{suggestion}'?"

    return None, f"'{s}' bukan nama/kode cabang yang valid"


def _validate_value(column: str, value: Any) -> Optional[str]:
    if pd.isna(value) or value is None:
        return None

    s = str(value).strip().upper()
    if not s:
        return None

    if column == 'SIZE CONT':
        s = s.replace(" ", "")
        if s not in VALID_SIZE_CONT:
            return f"'{value}' bukan SIZE CONT valid. Pilihan: {', '.join(sorted(VALID_SIZE_CONT))}"

    elif column == 'SERVICE TYPE':
        if s not in VALID_SERVICE_TYPE:
            return f"'{value}' bukan SERVICE TYPE valid. Pilihan: {', '.join(sorted(VALID_SERVICE_TYPE))}"

    elif column == 'GRADE CONT':
        if s not in VALID_GRADE_CONT:
            return f"'{value}' bukan GRADE CONT valid. Pilihan: A, B, C"

    return None


def _to_float(value: Any) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    s = str(value).strip().replace(",", ".")
    if not s or s.lower() in ("nan", "none", ""):
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def geocode_single_address(address: str) -> Dict[str, Any]:
    if not address or not address.strip():
        return {"lat": None, "lon": None, "error": "Alamat kosong", "match_level": "not_found"}

    address = address.strip()

    if address in geocode_cache and geocode_cache[address] == (None, None):
        del geocode_cache[address]

    lat, lon, match_level = resolve_coordinates(address)

    if lat is not None and lon is not None:
        return {"lat": lat, "lon": lon, "error": None, "match_level": match_level}
    else:
        return {"lat": None, "lon": None, "error": f"Alamat tidak ditemukan: '{address}'", "match_level": "not_found"}


def validate_dataframe(
    df: pd.DataFrame,
    label: str = "data"
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "column_issues": [],
        "rows": [],
        "summary": {
            "total_rows": len(df),
            "geocode_success": 0,
            "geocode_failed": 0,
            "datetime_success": 0,
            "datetime_failed": 0,
            "value_warnings": 0,
            "missing_required": 0,
        }
    }

    if len(df) == 0:
        return result

    original_cols = list(df.columns)
    rename_map = {}
    for col in original_cols:
        normalized = _normalize_column_name(col)
        if normalized != col:
            rename_map[col] = normalized
            result["column_issues"].append({
                "original": col,
                "suggestion": normalized,
                "type": "renamed"
            })

    if rename_map:
        df = df.rename(columns=rename_map)

    current_cols = list(df.columns)
    for req_col in REQUIRED_COLUMNS:
        if req_col not in current_cols:
            suggestion = _find_column_suggestion(req_col, current_cols)
            result["column_issues"].append({
                "original": req_col,
                "suggestion": suggestion or "",
                "type": "missing"
            })

    unique_address_requests: Dict[Tuple[str, Optional[float], Optional[float]], Tuple[Optional[float], Optional[float], str]] = {}
    address_col_exists = 'ALAMAT' in df.columns
    date_col_exists = 'OPS DELIVERY TIME' in df.columns

    if address_col_exists:
        for _, row in df.iterrows():
            addr = str(row.get('ALAMAT', '')).strip()
            if addr and addr.lower() not in ('nan', 'none', ''):
                row_lat = _to_float(row.get('LATITUDE'))
                row_lon = _to_float(row.get('LONGITUDE'))
                unique_address_requests[(addr, row_lat, row_lon)] = (None, None, "not_found")

    lookup_stats = {"Data Base": 0, "geocoded": 0, "not_found": 0}
    if unique_address_requests:
        total = len(unique_address_requests)
        print(f"[Validate] Resolving {total} alamat unik untuk {label}...")
        for i, (addr, input_lat, input_lon) in enumerate(unique_address_requests.keys()):
            print(f"  [{i + 1}/{total}] Resolve: {addr[:50]}...")
            lat, lon, match_level = resolve_coordinates(addr, input_lat=input_lat, input_lon=input_lon)
            unique_address_requests[(addr, input_lat, input_lon)] = (lat, lon, match_level)
            lookup_stats[match_level] = lookup_stats.get(match_level, 0) + 1
            if match_level == "geocoded":
                time.sleep(1.2 if lat is not None else 0.5)

    for idx, row in df.iterrows():
        row_result: Dict[str, Any] = {
            "index": int(idx),
            "datetime_parsed": None,
            "datetime_error": None,
            "geocode_lat": None,
            "geocode_lon": None,
            "geocode_error": None,
            "geocode_match_level": "not_found",
            "value_warnings": [],
        }

        if date_col_exists:
            date_val = row.get('OPS DELIVERY TIME')
            parsed, error = _try_parse_datetime(date_val)
            row_result["datetime_parsed"] = parsed
            row_result["datetime_error"] = error
            if parsed:
                result["summary"]["datetime_success"] += 1
            else:
                result["summary"]["datetime_failed"] += 1
        else:
            row_result["datetime_error"] = "Kolom 'OPS DELIVERY TIME' tidak ada"
            result["summary"]["datetime_failed"] += 1

        if address_col_exists:
            addr = str(row.get('ALAMAT', '')).strip()
            if addr and addr.lower() not in ('nan', 'none', ''):
                row_lat = _to_float(row.get('LATITUDE'))
                row_lon = _to_float(row.get('LONGITUDE'))
                coords = unique_address_requests.get((addr, row_lat, row_lon), (None, None, "not_found"))
                row_result["geocode_match_level"] = coords[2]
                if coords[0] is not None and coords[1] is not None:
                    row_result["geocode_lat"] = coords[0]
                    row_result["geocode_lon"] = coords[1]
                    result["summary"]["geocode_success"] += 1
                else:
                    row_result["geocode_error"] = f"Alamat tidak ditemukan: '{addr}'"
                    result["summary"]["geocode_failed"] += 1
            else:
                row_result["geocode_error"] = "Alamat kosong"
                row_result["geocode_match_level"] = "not_found"
                result["summary"]["geocode_failed"] += 1
        else:
            row_result["geocode_error"] = "Kolom 'ALAMAT' tidak ada"
            row_result["geocode_match_level"] = "not_found"
            result["summary"]["geocode_failed"] += 1

        if 'CABANG' in df.columns:
            cabang_val = row.get('CABANG')
            normalized_cabang, cabang_warning = _validate_cabang(cabang_val)
            if cabang_warning:
                row_result["value_warnings"].append({
                    "column": "CABANG",
                    "value": str(cabang_val),
                    "message": cabang_warning
                })
                result["summary"]["value_warnings"] += 1

        for col in ['SIZE CONT', 'SERVICE TYPE', 'GRADE CONT']:
            if col in df.columns:
                val = row.get(col)
                warning = _validate_value(col, val)
                if warning:
                    row_result["value_warnings"].append({
                        "column": col,
                        "value": str(val),
                        "message": warning
                    })
                    result["summary"]["value_warnings"] += 1

        for req_col in REQUIRED_COLUMNS:
            if req_col in df.columns:
                val = row.get(req_col)
                if pd.isna(val) or val is None or str(val).strip() == '':
                    result["summary"]["missing_required"] += 1

        result["rows"].append(row_result)

    print(
        f"[Validate][{label}] Lookup summary: "
        f"Data Base={lookup_stats.get('Data Base', 0)}, "
        f"geocoded={lookup_stats.get('geocoded', 0)}, "
        f"not_found={lookup_stats.get('not_found', 0)}"
    )

    return result


def validate_data(
    df_dest: pd.DataFrame,
    df_orig: pd.DataFrame
) -> Dict[str, Any]:
    print("=" * 60)
    print("STARTING DATA VALIDATION")
    print("=" * 60)

    dest_result = validate_dataframe(df_dest, "bongkar/destinasi")
    orig_result = validate_dataframe(df_orig, "muat/origin")

    print("=" * 60)
    print("VALIDATION COMPLETE")
    ds = dest_result["summary"]
    os_summary = orig_result["summary"]
    print(f"  Dest: {ds['geocode_success']}/{ds['total_rows']} geocoded, "
          f"{ds['datetime_success']}/{ds['total_rows']} date parsed")
    print(f"  Orig: {os_summary['geocode_success']}/{os_summary['total_rows']} geocoded, "
          f"{os_summary['datetime_success']}/{os_summary['total_rows']} date parsed")
    print("=" * 60)

    return {
        "dest": dest_result,
        "orig": orig_result
    }


def get_warning_row_indices(validation_result: Dict[str, Any]) -> List[int]:
    indices: List[int] = []
    for row in validation_result.get("rows", []):
        has_warning = (
            row.get("datetime_error") is not None
            or row.get("geocode_error") is not None
            or len(row.get("value_warnings", [])) > 0
        )
        if has_warning:
            indices.append(int(row.get("index", -1)))
    return sorted(set(i for i in indices if i >= 0))


def exclude_rows_with_warnings(
    df: pd.DataFrame,
    label: str
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    validation_result = validate_dataframe(df, label=label)
    warning_indices = set(get_warning_row_indices(validation_result))
    original_count = len(df)
    if not warning_indices:
        print(f"[Optimize][{label}] No warning rows excluded. Rows kept: {original_count}/{original_count}")
        return df, validation_result

    filtered_df = df.loc[~df.index.isin(warning_indices)].copy()
    print(
        f"[Optimize][{label}] Excluding warning rows: {len(warning_indices)} removed, "
        f"{len(filtered_df)}/{original_count} rows kept."
    )
    return filtered_df, validation_result
