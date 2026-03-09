import json
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd
import requests
import urllib3
from scipy.optimize import linear_sum_assignment

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002/route")

GEOCODE_TIMEOUT = 10        
GEOCODE_MAX_RETRIES = 3
GEOCODE_RETRY_DELAY = 2     

PREP_TIME_HOURS = 2.0       
MAX_IDLE_HOURS = 4.0        

TRUCK_SPEED_FULL_KMH = 25.0    # Truk bermuatan (port→bongkar, muat→port)
TRUCK_SPEED_EMPTY_KMH = 40.0   # Truk kosong (bongkar→muat)

MAX_MUNDURKAN_BONGKAR = 8   # Max waktu jadwal bongkar mundur
MAX_MUNDURKAN_MUAT = 8      # Max waktu jadwal muat mundur
MAX_MAJUKAN_BONGKAR = 24    # Max waktu jadwal bongkar maju
MAX_MAJUKAN_MUAT = 12       # Max waktu jadwal muat maju

WEIGHT_SAVING = 1000        
PENALTY_PER_HOUR = 500      

PORT_LOCATIONS: Dict[str, Dict[str, float]] = {
    'AMB': {'lat':-3.6936513307915373, 'lon': 128.1781638108562},
    'BAU': {'lat':-5.455903265878138, 'lon': 122.60938584960972},
    'BIA': {'lat':-1.1851603736014757, 'lon': 136.07682156714358},
    'BIT': {'lat':1.442401944168893, 'lon': 125.19794740287165},
    'BKS': {'lat':-3.9071848201989816, 'lon': 102.30519879122947},
    'BMS': {'lat':-3.3327669305844285, 'lon': 114.55564290033476},
    'BOE': {'lat':-4.785618909408796, 'lon': 121.58287938017267},
    'BPN': {'lat': -1.1568616485972183, 'lon': 116.78528031499359},
    'BRU': {'lat':2.157605639533901, 'lon': 117.49494602063376},
    'BTL': {'lat':-3.4314766905578593, 'lon': 116.00777973943374},
    'BTM': {'lat':1.1629469531427101, 'lon': 104.00468304195515},
    'FAK': {'lat':-2.932392940033229, 'lon': 132.3096808628934},
    'GTO': {'lat':0.5101940472432188, 'lon': 123.06327209675729},
    'JYP': {'lat': -2.544847344680502, 'lon': 140.71329620822493},
    'KAI': {'lat':-3.6628405435755065, 'lon': 133.76092774448097},
    'KDR': {'lat': -3.9895283429207495, 'lon': 122.6190354078469},
    'KTG': {'lat': -5.113802573807123, 'lon': 119.41037950498233},
    'KTJ': {'lat':3.3619660255236283, 'lon': 99.44941303103899},
    'MDN': {'lat':3.787506344211553, 'lon': 98.71314917267185},
    'MKE': {'lat':-8.478256116269572, 'lon': 140.39305845664322},
    'MKS': {'lat': -5.113802573807123, 'lon': 119.41037950498233},
    'MRI': {'lat':-0.8675417506615584, 'lon': 134.07615720492146},
    'NBR': {'lat':-3.238797960851654, 'lon': 135.58323888258386},
    'NNK': {'lat':4.142988216468162, 'lon': 117.66599727361431},
    'PAL': {'lat':-0.5812817099682415, 'lon': 119.79329655793101},
    'PDG': {'lat':-0.9981727894996993, 'lon': 100.36979280361531},
    'PLM': {'lat':-2.9798136965465556, 'lon': 104.78229673306087},
    'PNK': {'lat': -0.018584509467722148, 'lon': 109.33400183258493},
    'PRW': {'lat':0.6832287747358564, 'lon': 101.65075633957173},
    'SDA': {'lat': -0.5755879460602218, 'lon': 117.2067604145952},
    'SMG': {'lat': -6.942867577132296, 'lon': 110.42457707933995},
    'SPT': {'lat':-2.5408470599064956, 'lon': 112.96458506972988},
    'SRG': {'lat':-0.8775088266820529, 'lon': 131.24542609539967},
    'SRI': {'lat':-1.881488025976306, 'lon': 136.243383575054},
    'TGK': {'lat':-1.209244825216147, 'lon': 122.62847485731344},
    'TIM': {'lat':-4.802100356221503, 'lon': 136.76805472331185},
    'TRK': {'lat':3.284967648005647, 'lon': 117.59585253796989},
    'TTE': {'lat':0.7817073187610769, 'lon': 127.38794865150044},
    'TUA': {'lat':-5.633732846975406, 'lon': 132.7426128381603},
    'SBY': {'lat': -7.218371647800905, 'lon': 112.72841955208024},
    'JKT': {'lat': -6.108317688297046, 'lon': 106.87547242239924},
}

CABANG_ALIASES: Dict[str, str] = {
'AMBON': 'AMB',
'BAU-BAU': 'BAU',
'BIAK': 'BIA',
'BITUNG': 'BIT',
'BANJARMASIN': 'BMS',
'BALIKPAPAN': 'BPN',
'BERAU': 'BRU',
'BATULICIN': 'BTL',
'BATAM': 'BTM',
'FAKFAK': 'FAK',
'GORONTALO': 'GTO',
'JAYAPURA': 'JYP',
'KAIMANA': 'KAI',
'KENDARI': 'KDR',
'KETAPANG': 'KTG',
'KUALA TANJUNG': 'KTJ',
'MEDAN': 'MDN',
'MERAUKE': 'MKE',
'MAKASSAR': 'MKS',
'MANOKWARI': 'MRI',
'NABIRE': 'NBR',
'NUNUKAN': 'NNK',
'PALU': 'PAL',
'PADANG': 'PDG',
'PONTIANAK': 'PNK',
'PERAWANG': 'PRW',
'SAMARINDA': 'SDA',
'SEMARANG': 'SMG',
'SAMPIT': 'SPT',
'SORONG': 'SRG',
'SERUI': 'SRI',
'TANGKIANG': 'TGK',
'TIMIKA': 'TIM',
'TARAKAN': 'TRK',
'TERNATE': 'TTE',
'TUAL': 'TUA',
'SURABAYA': 'SBY',
'JAKARTA': 'JKT'
}

TRUCKING_COST_MODEL: Dict[str, Dict[int, Dict[str, int]]] = {
    'AMB': {
        20: {'base': 1614033, 'per_km': 79722},   # R²=0.934, n=33
        40: {'base': 3886774, 'per_km': 13556},   # R²=0.012, n=7
    },
    'BAU': {
        20: {'base': 1119186, 'per_km': 52230},   # R²=0.885, n=48
        40: {'base': 2589798, 'per_km': 108403},   # R²=0.984, n=8
    },
    'BIA': {
        20: {'base': 2359216, 'per_km': 147538},   # R²=0.11, n=6
        40: {'base': 1000000, 'per_km': 50000},   # R²=0, n=0
    },
    'BIT': {
        20: {'base': 1260803, 'per_km': 20888},   # R²=0.335, n=182
        40: {'base': 1524331, 'per_km': 28734},   # R²=0.23, n=61
    },
    'BMS': {
        20: {'base': 594371, 'per_km': 31275},   # R²=0.671, n=268
        40: {'base': 894914, 'per_km': 42427},   # R²=0.531, n=97
    },
    'BPN': {
        20: {'base': 974899, 'per_km': 67692},   # R²=0.646, n=236
        40: {'base': 2165839, 'per_km': 84821},   # R²=0.459, n=91
    },
    'BRU': {
        20: {'base': 3406990, 'per_km': 52272},   # R²=0.8, n=151
        40: {'base': 1000000, 'per_km': 50000},   # R²=0, n=0
    },
    'BTL': {
        20: {'base': 1660287, 'per_km': 40460},   # R²=0.615, n=28
        40: {'base': 1000000, 'per_km': 50000},   # R²=0, n=0
    },
    'BTM': {
        20: {'base': 987645, 'per_km': 12517},   # R²=0.041, n=157
        40: {'base': 929887, 'per_km': 27891},   # R²=0.605, n=65
    },
    'FAK': {
        20: {'base': 3239105, 'per_km': -121225},   # R²=0.086, n=5
        40: {'base': 1000000, 'per_km': 2506266},   # R²=0, n=1
    },
    'GTO': {
        20: {'base': 853478, 'per_km': 25364},   # R²=0.902, n=111
        40: {'base': 1573261, 'per_km': 43556},   # R²=0.838, n=27
    },
    'JYP': {
        20: {'base': 2147488, 'per_km': 13825},   # R²=0.05, n=59
        40: {'base': 4404528, 'per_km': 277301},   # R²=0.762, n=10
    },
    'KAI': {
        20: {'base': 3734979, 'per_km': 44806},   # R²=0.188, n=5
        40: {'base': 1000000, 'per_km': 50000},   # R²=0, n=0
    },
    'KDR': {
        20: {'base': 1062738, 'per_km': 31920},   # R²=0.718, n=159
        40: {'base': 1240141, 'per_km': 57552},   # R²=0.84, n=59
    },
    'KTG': {
        20: {'base': 1185780, 'per_km': 66563},   # R²=0.804, n=129
        40: {'base': 2328730, 'per_km': 119520},   # R²=0.926, n=35
    },
    'KTJ': {
        20: {'base': 1000000, 'per_km': 15843},   # R²=0, n=1
        40: {'base': 1000000, 'per_km': 50000},   # R²=0, n=0
    },
    'MDN': {
        20: {'base': 1137761, 'per_km': 19972},   # R²=0.809, n=441
        40: {'base': 1418268, 'per_km': 25977},   # R²=0.785, n=159
    },
    'MKE': {
        20: {'base': 2753493, 'per_km': 69972},   # R²=0.797, n=32
        40: {'base': 5368136, 'per_km': 170874},   # R²=0.611, n=12
    },
    'MKS': {
        20: {'base': 1191595, 'per_km': 15765},   # R²=0.692, n=449
        40: {'base': 1650161, 'per_km': 30059},   # R²=0.519, n=145
    },
    'MRI': {
        20: {'base': 2068758, 'per_km': 61628},   # R²=0.872, n=29
        40: {'base': 3978182, 'per_km': 54214},   # R²=0.14, n=6
    },
    'NBR': {
        20: {'base': 1267122, 'per_km': 68983},   # R²=0.841, n=22
        40: {'base': 3507323, 'per_km': 112545},   # R²=0.85, n=6
    },
    'NNK': {
        20: {'base': 3323953, 'per_km': 152794},   # R²=0.473, n=21
        40: {'base': 1000000, 'per_km': 50000},   # R²=0, n=0
    },
    'PAL': {
        20: {'base': 933104, 'per_km': 33897},   # R²=0.914, n=97
        40: {'base': 2607104, 'per_km': 36712},   # R²=0.86, n=36
    },
    'PDG': {
        20: {'base': 2036944, 'per_km': 6315},   # R²=0.237, n=51
        40: {'base': 3423013, 'per_km': 33926},   # R²=0.697, n=18
    },
    'PNK': {
        20: {'base': 1720838, 'per_km': 31480},   # R²=0.651, n=183
        40: {'base': 2715683, 'per_km': 44559},   # R²=0.741, n=68
    },
    'PRW': {
        20: {'base': 1177854, 'per_km': 29299},   # R²=0.773, n=141
        40: {'base': 1479783, 'per_km': 47751},   # R²=0.644, n=51
    },
    'SDA': {
        20: {'base': 1268345, 'per_km': 68670},   # R²=0.828, n=255
        40: {'base': 1887260, 'per_km': 91306},   # R²=0.819, n=80
    },
    'SMG': {
        20: {'base': 1126369, 'per_km': 13724},   # R²=0.847, n=40
        40: {'base': 1504052, 'per_km': 12384},   # R²=0.635, n=13
    },
    'SPT': {
        20: {'base': 1996378, 'per_km': 25314},   # R²=0.608, n=91
        40: {'base': 2938327, 'per_km': 33299},   # R²=0.58, n=19
    },
    'SRG': {
        20: {'base': 1209135, 'per_km': 102230},   # R²=0.923, n=66
        40: {'base': 3855251, 'per_km': 55001},   # R²=0.28, n=21
    },
    'SRI': {
        20: {'base': 1000000, 'per_km': 6698886},   # R²=0, n=4
        40: {'base': 1000000, 'per_km': 5019305},   # R²=0, n=1
    },
    'TGK': {
        20: {'base': 912096, 'per_km': 32945},   # R²=0.665, n=39
        40: {'base': 1175252, 'per_km': 76463},   # R²=0.806, n=10
    },
    'TIM': {
        20: {'base': 2254624, 'per_km': 48206},   # R²=0.117, n=32
        40: {'base': 1000000, 'per_km': 244138},   # R²=0, n=4
    },
    'TRK': {
        20: {'base': 3287449, 'per_km': -26129},   # R²=0.025, n=51
        40: {'base': 6286036, 'per_km': -117539},   # R²=0.272, n=12
    },
    'TTE': {
        20: {'base': 2821820, 'per_km': 24319},   # R²=0.793, n=33
        40: {'base': 6108893, 'per_km': 62815},   # R²=0.764, n=13
    },
    'TUA': {
        20: {'base': 4891380, 'per_km': -131743},   # R²=0.069, n=13
        40: {'base': 1000000, 'per_km': 2546914},   # R²=0, n=4
    },
}

DEFAULT_COST_MODEL: Dict[int, Dict[str, int]] = {
    20: {'base': 1200000, 'per_km': 25000},
    40: {'base': 1800000, 'per_km': 40000},
}

route_cache: Dict[str, Tuple[float, float, str]] = {}
geocode_cache: Dict[str, Tuple[Optional[float], Optional[float]]] = {}
geocode_source_cache: Dict[str, str] = {}

COORDINATE_DB_FILENAMES = [
    "final_data_koordinat.xlsx",
    "data_master_koordinat.xlsx",
    "data_koordinat.xlsx",
]
coordinate_lookup_db: Dict[str, Tuple[float, float]] = {}
coordinate_lookup_db_file: Optional[Path] = None

DEFAULT_DURASI_BONGKAR_JAM = 5.0
DEFAULT_DURASI_MUAT_JAM = 5.0

DURATION_LOOKUP_PATH = Path(__file__).parent / "duration_lookup.json"
DURATION_LOOKUP: Dict[str, Any] = {}

if DURATION_LOOKUP_PATH.exists():
    with open(DURATION_LOOKUP_PATH, "r", encoding="utf-8") as _f:
        DURATION_LOOKUP = json.load(_f)
    print(f"Duration lookup loaded: {len(DURATION_LOOKUP.get('customers', {}))} customers")
else:
    print("Warning: duration_lookup.json not found. Using global defaults.")


def get_customer_duration(
    customer_id: str,
    cabang: str,
    tipe: str = "bongkar"
) -> float:
    key = f"median_{tipe}_hours"

    composite = f"{customer_id}__{cabang}"
    cust_data = DURATION_LOOKUP.get("customers", {}).get(composite)
    if cust_data and key in cust_data:
        return cust_data[key]
    cabang_data = DURATION_LOOKUP.get("cabang_defaults", {}).get(cabang)
    if cabang_data and key in cabang_data:
        return cabang_data[key]

    if tipe == "bongkar":
        return DURATION_LOOKUP.get("global_default", DEFAULT_DURASI_BONGKAR_JAM)
    else:
        return DURATION_LOOKUP.get("global_default", DEFAULT_DURASI_MUAT_JAM)


def get_customer_time_profile(customer_id: str, cabang: str, tipe: str = "bongkar") -> Dict[str, Any]:
    composite = f"{customer_id}__{cabang}"
    cust_data = DURATION_LOOKUP.get("customers", {}).get(composite, {})

    mode_key = f"mode_hour_{tipe}"
    dist_key = f"hour_distribution_{tipe}"
    count_key = f"count_hours_{tipe}"

    if mode_key in cust_data:
        return {
            "mode_hour": cust_data[mode_key],
            "distribution": cust_data.get(dist_key, {}),
            "sample_count": cust_data.get(count_key, 0),
            "source": "customer"
        }

    cabang_data = DURATION_LOOKUP.get("cabang_defaults", {}).get(cabang, {})
    if mode_key in cabang_data:
        return {
            "mode_hour": cabang_data[mode_key],
            "distribution": {},
            "sample_count": 0,
            "source": "cabang_default"
        }

    return {"mode_hour": None, "distribution": {}, "sample_count": 0, "source": "none"}


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = "roundtrip_mapping_optimization_v2"


def _normalize_address_key(address: Any) -> str:
    if address is None:
        return ""
    s = str(address).strip().upper()
    s = re.sub(r"\s+", " ", s)
    return s


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    s = str(value).strip().replace(",", ".")
    if not s or s.lower() in {"nan", "none"}:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _is_valid_lat_lon(lat: Optional[float], lon: Optional[float]) -> bool:
    if lat is None or lon is None:
        return False
    return -90 <= lat <= 90 and -180 <= lon <= 180


def _load_coordinate_lookup_db() -> None:
    global coordinate_lookup_db, coordinate_lookup_db_file
    base_dir = Path(__file__).parent

    chosen_path: Optional[Path] = None
    for filename in COORDINATE_DB_FILENAMES:
        candidate = base_dir / filename
        if candidate.exists():
            chosen_path = candidate
            break

    if chosen_path is None:
        print(
            "Warning: coordinate master file not found. "
            f"Tried: {', '.join(COORDINATE_DB_FILENAMES)}. "
            "Fallback to external geocoding only."
        )
        coordinate_lookup_db = {}
        coordinate_lookup_db_file = None
        return

    try:
        db_df = pd.read_excel(chosen_path)
    except Exception as e:
        print(f"Warning: failed reading coordinate master '{chosen_path.name}': {e}")
        coordinate_lookup_db = {}
        coordinate_lookup_db_file = None
        return

    required_cols = {"ALAMAT", "LONGITUDE", "LATITUDE"}
    if not required_cols.issubset(set(db_df.columns)):
        print(
            f"Warning: coordinate master '{chosen_path.name}' missing required columns "
            f"{sorted(required_cols)}. Available: {list(db_df.columns)}. "
            "Fallback to external geocoding only."
        )
        coordinate_lookup_db = {}
        coordinate_lookup_db_file = None
        return

    loaded: Dict[str, Tuple[float, float]] = {}
    for _, row in db_df.iterrows():
        key = _normalize_address_key(row.get("ALAMAT"))
        lat = _to_float(row.get("LATITUDE"))
        lon = _to_float(row.get("LONGITUDE"))
        if not key:
            continue
        if not _is_valid_lat_lon(lat, lon):
            continue
        loaded[key] = (lat, lon)

    coordinate_lookup_db = loaded
    coordinate_lookup_db_file = chosen_path
    print(
        f"Coordinate lookup DB loaded from '{chosen_path.name}': "
        f"{len(coordinate_lookup_db)} alamat valid."
    )


_load_coordinate_lookup_db()

def geocode_helper(
    address: str,
    max_retries: int = GEOCODE_MAX_RETRIES
) -> Tuple[Optional[float], Optional[float]]:
    lat, lon, _ = resolve_coordinates(address, max_retries=max_retries)
    return lat, lon


def _geocode_external(
    address: str,
    max_retries: int = GEOCODE_MAX_RETRIES
) -> Tuple[Optional[float], Optional[float], str]:
    if not address or not str(address).strip():
        return (None, None, "not_found")

    for attempt in range(max_retries):
        try:
            query = str(address)
            if "indonesia" not in query.lower():
                query += ", Indonesia"

            response = requests.get(
                NOMINATIM_URL,
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": NOMINATIM_USER_AGENT},
                timeout=GEOCODE_TIMEOUT
            )

            if response.status_code == 200:
                data = response.json()
                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    geocode_cache[address] = (lat, lon)
                    geocode_source_cache[address] = "geocoded"
                    return (lat, lon, "geocoded")

                geocode_cache[address] = (None, None)
                geocode_source_cache[address] = "not_found"
                return (None, None, "not_found")

            if response.status_code in (429, 509):
                print(f"Geocoding attempt {attempt + 1}/{max_retries} rate-limited for '{address}': HTTP {response.status_code}")
                if attempt < max_retries - 1:
                    time.sleep(GEOCODE_RETRY_DELAY * (attempt + 1))
                continue

            print(f"Geocoding attempt {attempt + 1}/{max_retries} failed for '{address}': HTTP {response.status_code}")
            if attempt < max_retries - 1:
                time.sleep(GEOCODE_RETRY_DELAY * (attempt + 1))
            continue

        except requests.exceptions.Timeout:
            print(f"Geocoding attempt {attempt + 1}/{max_retries} timed out for '{address}'")
            if attempt < max_retries - 1:
                time.sleep(GEOCODE_RETRY_DELAY * (attempt + 1))
            continue

        except Exception as e:
            print(f"Unexpected geocoding error for '{address}': {e}")
            break

    geocode_cache[address] = (None, None)
    geocode_source_cache[address] = "not_found"
    return (None, None, "not_found")


def resolve_coordinates(
    address: str,
    input_lat: Optional[float] = None,
    input_lon: Optional[float] = None,
    max_retries: int = GEOCODE_MAX_RETRIES
) -> Tuple[Optional[float], Optional[float], str]:
    normalized_address = _normalize_address_key(address)

    if _is_valid_lat_lon(input_lat, input_lon):
        return input_lat, input_lon, "Data Base"

    if normalized_address in coordinate_lookup_db:
        lat, lon = coordinate_lookup_db[normalized_address]
        geocode_cache[address] = (lat, lon)
        geocode_source_cache[address] = "Data Base"
        return lat, lon, "Data Base"

    if address in geocode_cache:
        return (
            geocode_cache[address][0],
            geocode_cache[address][1],
            geocode_source_cache.get(address, "not_found"),
        )

    return _geocode_external(address, max_retries=max_retries)


def geocode_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if {'ALAMAT_LAT', 'ALAMAT_LONG'}.issubset(df.columns) and df['ALAMAT_LAT'].notna().all() and df['ALAMAT_LONG'].notna().all():
        return df

    if 'ALAMAT' not in df.columns:
        return df

    df = df.copy()
    df['SEARCH_QUERY'] = df['ALAMAT'].astype(str).str.strip()
    df['_INPUT_LAT'] = df['LATITUDE'].apply(_to_float) if 'LATITUDE' in df.columns else None
    df['_INPUT_LON'] = df['LONGITUDE'].apply(_to_float) if 'LONGITUDE' in df.columns else None

    unique_requests: List[Tuple[str, Optional[float], Optional[float]]] = list(
        df[['SEARCH_QUERY', '_INPUT_LAT', '_INPUT_LON']]
        .drop_duplicates()
        .itertuples(index=False, name=None)
    )

    address_coords: Dict[Tuple[str, Optional[float], Optional[float]], Tuple[Optional[float], Optional[float], str]] = {}
    total = len(unique_requests)
    source_stats = {"Data Base": 0, "geocoded": 0, "not_found": 0}

    print(f"Resolve koordinat {total} alamat unik...")

    for idx, (addr, input_lat, input_lon) in enumerate(unique_requests):
        print(f"  [{idx + 1}/{total}] Resolve: {addr[:50]}...")
        lat, lon, match_level = resolve_coordinates(addr, input_lat=input_lat, input_lon=input_lon)
        address_coords[(addr, input_lat, input_lon)] = (lat, lon, match_level)
        source_stats[match_level] = source_stats.get(match_level, 0) + 1

        if match_level == "geocoded":
            time.sleep(1.2 if lat is not None and lon is not None else 0.5)

    df['_COORD_KEY'] = list(zip(df['SEARCH_QUERY'], df['_INPUT_LAT'], df['_INPUT_LON']))
    df['ALAMAT_LAT'] = df['_COORD_KEY'].map(lambda x: address_coords.get(x, (None, None, "not_found"))[0])
    df['ALAMAT_LONG'] = df['_COORD_KEY'].map(lambda x: address_coords.get(x, (None, None, "not_found"))[1])
    df['ALAMAT_MATCH_LEVEL'] = df['_COORD_KEY'].map(lambda x: address_coords.get(x, (None, None, "not_found"))[2])
    df = df.drop(columns=['_COORD_KEY', '_INPUT_LAT', '_INPUT_LON'])

    success_count = df['ALAMAT_LAT'].notna().sum()
    print(
        "Resolve koordinat selesai: "
        f"{success_count}/{len(df)} alamat berhasil | "
        f"Data Base={source_stats.get('Data Base', 0)}, "
        f"geocoded={source_stats.get('geocoded', 0)}, "
        f"not_found={source_stats.get('not_found', 0)}"
    )

    return df

def _create_route_cache_key(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    return f"{round(lat1, 5)},{round(lon1, 5)}|{round(lat2, 5)},{round(lon2, 5)}"

def get_valhalla_route(
    lat_start: float,
    lon_start: float,
    lat_end: float,
    lon_end: float
) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    cache_key = _create_route_cache_key(lat_start, lon_start, lat_end, lon_end)
    
    if cache_key in route_cache:
        return route_cache[cache_key]
    
    payload = {
        "locations": [
            {"lat": lat_start, "lon": lon_start},
            {"lat": lat_end, "lon": lon_end}
        ],
        "costing": "truck",
        "units": "km"
    }
    
    headers = {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
    }
    
    try:
        response = requests.post(
            VALHALLA_URL,
            json=payload,
            headers=headers,
            timeout=15,
            verify=False
        )
        
        if response.status_code == 200:
            data = response.json()
            shape = data['trip']['legs'][0]['shape']
            distance_km = data['trip']['summary']['length']
            time_hours = data['trip']['summary']['time'] / 3600.0
            
            result = (distance_km, time_hours, shape)
            route_cache[cache_key] = result
            return result
            
    except Exception:
        pass
    
    return (None, None, None)

def normalize_cabang(cabang: Any) -> Optional[str]:
    if pd.isna(cabang) or cabang is None:
        return None
    
    cabang_str = str(cabang).strip().upper()
    return CABANG_ALIASES.get(cabang_str, cabang_str)


def normalize_size_cont(size_cont: Any) -> str:
    if size_cont is None:
        return ""
    return str(size_cont).upper().replace(" ", "").strip()

def get_port_location(cabang: str) -> Dict[str, float]:
    return PORT_LOCATIONS.get(cabang, PORT_LOCATIONS['JKT'])

def calculate_trucking_cost(cabang: str, size: int, distance_km: float) -> float:
    normalized_size = 20 if size in [20, 21] else 40
    
    if cabang in TRUCKING_COST_MODEL:
        model = TRUCKING_COST_MODEL[cabang].get(normalized_size, DEFAULT_COST_MODEL[normalized_size])
    else:
        model = DEFAULT_COST_MODEL[normalized_size]
    
    cost = model['base'] + model['per_km'] * distance_km
    return cost

def is_grade_match(grade_dest: str, grade_orig: str) -> bool:
    invalid_values = ['-', 'nan', 'None', '']
    
    d_grade = str(grade_dest).strip()
    o_grade = str(grade_orig).strip()
    
    if d_grade in invalid_values or o_grade in invalid_values:
        return True
    
    return d_grade == o_grade

def evaluate_time_feasibility(
    time_gap: float
) -> Tuple[str, float, List[str]]:
    if time_gap < 0:
        shortage = abs(time_gap)
        can_delay_load = shortage <= MAX_MUNDURKAN_MUAT
        can_advance_unload = shortage <= MAX_MAJUKAN_BONGKAR
        
        if can_delay_load or can_advance_unload:
            options = []
            if can_delay_load:
                options.append("MUNDUR_MUAT")
            if can_advance_unload:
                options.append("MAJU_BONGKAR")
            return ("LATE_SHIFT_POSSIBLE", shortage, options)
        else:
            return ("UNFEASIBLE", 0, [])
    
    elif time_gap > MAX_IDLE_HOURS:
        excess = time_gap - MAX_IDLE_HOURS
        can_advance_load = excess <= MAX_MAJUKAN_MUAT
        can_delay_unload = excess <= MAX_MUNDURKAN_BONGKAR
        
        if can_advance_load or can_delay_unload:
            options = []
            if can_advance_load:
                options.append("MAJU_MUAT")
            if can_delay_unload:
                options.append("MUNDUR_BONGKAR")
            return ("IDLE_REDUCE_POSSIBLE", excess, options)
        else:
            return ("UNFEASIBLE", 0, [])
    
    else:
        return ("OPTIMAL", 0, ["PERFECT"])

def calculate_match_score(saving_km: float, shift_hours: float) -> float:
    saving_value = saving_km * WEIGHT_SAVING
    penalty_value = shift_hours * PENALTY_PER_HOUR
    return saving_value - penalty_value

def build_recommendation_text(
    pool_category: str,
    shift_hours: float,
    time_gap: float,
    options: List[str],
    unload_time: datetime,
    load_time: datetime
) -> Tuple[str, Optional[str], Optional[str]]:
    date_format = "%d-%b %H:%M"
    origin_text: Optional[str] = None
    dest_text: Optional[str] = None
    
    if pool_category == "OPTIMAL":
        main_text = f"MATCH OPTIMAL. Idle {time_gap:.1f} jam."
        origin_text = f"Tidak perlu penyesuaian. Jadwal muat: {load_time.strftime(date_format)}"
        dest_text = f"Tidak perlu penyesuaian. Selesai bongkar: {unload_time.strftime(date_format)}"
        
    elif pool_category == "LATE_SHIFT_POSSIBLE":
        main_text = f"TERLAMBAT {shift_hours:.1f} JAM. Perlu penyesuaian jadwal."
        
        if "MUNDUR_MUAT" in options:
            new_time = load_time + timedelta(hours=shift_hours)
            origin_text = (
                f"Mundurkan jadwal muat dari {load_time.strftime(date_format)} "
                f"ke {new_time.strftime(date_format)} (+{shift_hours:.1f} jam)"
            )
            main_text += f"\n-> Opsi Origin: {origin_text}"
        else:
            origin_text = f"Tidak dapat memundurkan muat (melebihi batas {MAX_MUNDURKAN_MUAT} jam)"
        
        if "MAJU_BONGKAR" in options:
            new_time = unload_time - timedelta(hours=shift_hours)
            dest_text = (
                f"Percepat bongkar dari {unload_time.strftime(date_format)} "
                f"ke {new_time.strftime(date_format)} (-{shift_hours:.1f} jam)"
            )
            main_text += f"\n-> Opsi Dest: {dest_text}"
        else:
            dest_text = f"Tidak dapat mempercepat bongkar (melebihi batas {MAX_MAJUKAN_BONGKAR} jam)"
            
    elif pool_category == "IDLE_REDUCE_POSSIBLE":
        main_text = f"IDLE TINGGI ({time_gap:.1f} Jam). Bisa dikurangi dengan penyesuaian."
        
        if "MAJU_MUAT" in options:
            new_time = load_time - timedelta(hours=shift_hours)
            origin_text = (
                f"Majukan jadwal muat dari {load_time.strftime(date_format)} "
                f"ke {new_time.strftime(date_format)} (-{shift_hours:.1f} jam)"
            )
            main_text += f"\n-> Opsi Origin: {origin_text}"
        else:
            origin_text = f"Tidak dapat memajukan muat (melebihi batas {MAX_MAJUKAN_MUAT} jam)"
        
        if "MUNDUR_BONGKAR" in options:
            new_time = unload_time + timedelta(hours=shift_hours)
            dest_text = (
                f"Mundurkan bongkar dari {unload_time.strftime(date_format)} "
                f"ke {new_time.strftime(date_format)} (+{shift_hours:.1f} jam)"
            )
            main_text += f"\n-> Opsi Dest: {dest_text}"
        else:
            dest_text = f"Tidak dapat memundurkan bongkar (melebihi batas {MAX_MUNDURKAN_BONGKAR} jam)"
    
    else:
        main_text = "Status tidak diketahui"
    
    return (main_text, origin_text, dest_text)

def process_optimization(
    df_dest: pd.DataFrame,
    df_origin: pd.DataFrame
) -> List[Dict[str, Any]]:
    process_started_at = time.time()
    print("[Optimize] Start process_optimization")

    if 'OPS DELIVERY TIME' not in df_dest.columns and 'ACT. LOAD DATE' in df_dest.columns:
        df_dest = df_dest.rename(columns={'ACT. LOAD DATE': 'OPS DELIVERY TIME'})
    if 'OPS DELIVERY TIME' not in df_origin.columns and 'ACT. LOAD DATE' in df_origin.columns:
        df_origin = df_origin.rename(columns={'ACT. LOAD DATE': 'OPS DELIVERY TIME'})

    df_dest['OPS DELIVERY TIME'] = pd.to_datetime(
        df_dest['OPS DELIVERY TIME'],
        errors='coerce'
    )
    df_origin['OPS DELIVERY TIME'] = pd.to_datetime(
        df_origin['OPS DELIVERY TIME'],
        errors='coerce'
    )
    
    if 'ALAMAT_LAT' not in df_dest.columns:
        print("[Optimize] Resolving coordinates for destinasi...")
        df_dest = geocode_dataframe(df_dest)
    if 'ALAMAT_LAT' not in df_origin.columns:
        print("[Optimize] Resolving coordinates for origin...")
        df_origin = geocode_dataframe(df_origin)
    
    df_dest = df_dest.dropna(
        subset=['ALAMAT_LAT', 'ALAMAT_LONG', 'OPS DELIVERY TIME']
    ).reset_index(drop=True)
    
    df_origin = df_origin.dropna(
        subset=['ALAMAT_LAT', 'ALAMAT_LONG', 'OPS DELIVERY TIME']
    ).reset_index(drop=True)
    
    num_dest = len(df_dest)
    num_origin = len(df_origin)
    
    print(f"Data valid: {num_dest} destinasi, {num_origin} origin")
    
    INFINITY_COST = 1e9
    cost_matrix = np.full((num_dest, num_origin), INFINITY_COST)
    
    match_details: Dict[Tuple[int, int], Dict[str, Any]] = {}
    
    print("Membangun cost matrix...")
    matrix_started_at = time.time()
    total_pairs_est = num_dest * num_origin
    progress_interval = max(1, min(250, num_dest // 20 if num_dest > 0 else 1))
    evaluated_pairs = 0
    feasible_pairs = 0
    route_calls_started = len(route_cache)
    
    for i, dest_row in df_dest.iterrows():
        if i % progress_interval == 0:
            elapsed = time.time() - matrix_started_at
            avg_per_dest = elapsed / (i + 1) if i >= 0 else 0
            remaining_dest = max(0, num_dest - (i + 1))
            eta_sec = remaining_dest * avg_per_dest
            pct = ((i + 1) / num_dest * 100.0) if num_dest > 0 else 100.0
            print(
                f"[Optimize][Matrix] {i + 1}/{num_dest} dest ({pct:.1f}%) | "
                f"evaluated~{evaluated_pairs}/{total_pairs_est} pairs | "
                f"feasible={feasible_pairs} | "
                f"elapsed={elapsed:.1f}s eta={eta_sec:.1f}s"
            )

        dest_id = dest_row['NO SOPT']
        dest_lat = float(dest_row['ALAMAT_LAT'])
        dest_lon = float(dest_row['ALAMAT_LONG'])
        dest_load_time = dest_row['OPS DELIVERY TIME']
        dest_cabang = normalize_cabang(dest_row['CABANG'])
        
        if dest_cabang is None:
            print(f"  Warning: DEST {dest_id} memiliki cabang kosong, dilewati.")
            continue
        
        dest_service = str(dest_row.get('SERVICE TYPE', '')).strip().upper()
        if dest_service == 'STRIPPING':
            continue
            
        port = get_port_location(dest_cabang)
        
        dist_port_to_dest, _, _ = get_valhalla_route(
            port['lat'], port['lon'],
            dest_lat, dest_lon
        )
        dist_port_to_dest = dist_port_to_dest if dist_port_to_dest else 99999
        time_port_to_dest = dist_port_to_dest / TRUCK_SPEED_FULL_KMH

        # OPS DELIVERY TIME + waktu tempuh port -> customer bongkar
        dest_arrival = dest_load_time + timedelta(hours=time_port_to_dest)
        
        dist_dest_to_port, _, _ = get_valhalla_route(
            dest_lat, dest_lon, 
            port['lat'], port['lon']
        )
        dist_dest_to_port = dist_dest_to_port if dist_dest_to_port else 99999
        
        for j, orig_row in df_origin.iterrows():
            evaluated_pairs += 1
            orig_cabang = normalize_cabang(orig_row['CABANG'])

            if dest_cabang != orig_cabang:
                continue

            orig_service = str(orig_row.get('SERVICE TYPE', '')).strip().upper()
            if orig_service == 'STRIPPING':
                continue
            
            dest_size_cont = normalize_size_cont(dest_row.get('SIZE CONT'))
            orig_size_cont = normalize_size_cont(orig_row.get('SIZE CONT'))
            if dest_size_cont != orig_size_cont:
                continue
            
            if not is_grade_match(
                dest_row.get('GRADE CONT', '-'),
                orig_row.get('GRADE CONT', '-')
            ):
                continue

            orig_lat = float(orig_row['ALAMAT_LAT'])
            orig_lon = float(orig_row['ALAMAT_LONG'])
            
            dist_direct, _, route_shape = get_valhalla_route(
                dest_lat, dest_lon,
                orig_lat, orig_lon
            )
            
            if dist_direct is None:
                continue
            
            dist_port_to_orig, _, _ = get_valhalla_route(
                port['lat'], port['lon'],
                orig_lat, orig_lon
            )
            dist_port_to_orig = dist_port_to_orig if dist_port_to_orig else 99999
            time_port_to_orig = dist_port_to_orig / TRUCK_SPEED_FULL_KMH

            # OPS DELIVERY TIME + waktu tempuh port -> customer muat
            orig_arrival = orig_row['OPS DELIVERY TIME'] + timedelta(hours=time_port_to_orig)
            
            dist_orig_to_port, _, _ = get_valhalla_route(
                orig_lat, orig_lon,
                port['lat'], port['lon']
            )
            dist_orig_to_port = dist_orig_to_port if dist_orig_to_port else 99999
            
            dist_via_port_full = (
                dist_port_to_dest +   
                dist_dest_to_port +   
                dist_port_to_orig +   
                dist_orig_to_port     
            )
            
            dist_triangulasi_full = (
                dist_port_to_dest +   
                dist_direct +         
                dist_orig_to_port     
            )
            
            saving_km = dist_via_port_full - dist_triangulasi_full
            
            if saving_km <= 0:
                continue
            
            dest_cust_id = str(dest_row.get('CUST ID', '')).strip()
            orig_cust_id = str(orig_row.get('CUST ID', '')).strip()
            durasi_bongkar = get_customer_duration(dest_cust_id, dest_cabang, tipe='bongkar')
            durasi_muat = get_customer_duration(orig_cust_id, dest_cabang, tipe='muat')

            # Waktu selesai bongkar = tiba di customer + durasi bongkar
            selesai_bongkar = dest_arrival + timedelta(hours=durasi_bongkar)

            # Estimasi waktu tiba di lokasi muat
            time_bongkar_to_muat = dist_direct / TRUCK_SPEED_EMPTY_KMH
            est_tiba_muat = selesai_bongkar + timedelta(hours=PREP_TIME_HOURS + time_bongkar_to_muat)

            # Time gap = deadline muat - estimasi tiba
            time_gap = (orig_arrival - est_tiba_muat).total_seconds() / 3600.0
            
            pool_category, shift_needed, options = evaluate_time_feasibility(time_gap)
            
            if pool_category == "UNFEASIBLE":
                continue
            
            score = calculate_match_score(saving_km, shift_needed)
            
            size_cont = dest_size_cont
            size_int = 20 if '20' in str(size_cont) or '21' in str(size_cont) else 40
            
            cost_via_port = calculate_trucking_cost(dest_cabang, size_int, dist_via_port_full)
            
            cost_triangulasi = calculate_trucking_cost(dest_cabang, size_int, dist_triangulasi_full)
            
            saving_cost = cost_via_port - cost_triangulasi
            
            cost_matrix[i, j] = 10_000_000 - score
            feasible_pairs += 1
            
            match_details[(i, j)] = {
                'dest_id': dest_id,
                'orig_id': orig_row['NO SOPT'],
                'cabang': dest_cabang,
                'size_cont': size_cont,
                'pool': pool_category,
                'score': score,
                'saving_km': saving_km,
                'saving_cost': saving_cost,
                'cost_triangulasi': cost_triangulasi,
                'cost_via_port': cost_via_port,
                'dist_triangulasi': dist_triangulasi_full,  
                'dist_via_port': dist_via_port_full,        
                'dist_direct': dist_direct,                  
                'est_travel': time_bongkar_to_muat,
                'shift': shift_needed,
                'gap': time_gap,
                'opsi': options,
                'shape': route_shape,
                'waktu_bongkar': dest_arrival,
                'waktu_muat': orig_arrival,
                'durasi_bongkar_est': durasi_bongkar,
                'durasi_muat_est': durasi_muat,
                'selesai_bongkar': selesai_bongkar,
                'est_tiba_muat': est_tiba_muat,
                'dest_cust_id': dest_cust_id,
                'orig_cust_id': orig_cust_id,
                'dest_lat': dest_lat,
                'dest_lon': dest_lon,
                'orig_lat': orig_lat,
                'orig_lon': orig_lon
            }

    matrix_elapsed = time.time() - matrix_started_at
    route_calls_used = len(route_cache) - route_calls_started
    print(
        f"[Optimize][Matrix] Done in {matrix_elapsed:.1f}s | "
        f"evaluated_pairs={evaluated_pairs} feasible_pairs={feasible_pairs} "
        f"new_route_cache={route_calls_used}"
    )

    print("Menjalankan Hungarian Algorithm untuk optimasi global...")
    hungarian_started_at = time.time()
    row_indices, col_indices = linear_sum_assignment(cost_matrix)
    hungarian_elapsed = time.time() - hungarian_started_at
    print(f"[Optimize][Hungarian] Done in {hungarian_elapsed:.2f}s")
    
    results: List[Dict[str, Any]] = []
    
    for row_idx, col_idx in zip(row_indices, col_indices):
        if cost_matrix[row_idx, col_idx] >= INFINITY_COST:
            continue
        
        details = match_details[(row_idx, col_idx)]
        
        dest_cabang = df_dest.iloc[row_idx]['CABANG'] if row_idx < num_dest else 'JKT'
        port_loc = get_port_location(str(dest_cabang).upper())
        
        rekom_text, opsi_origin, opsi_dest = build_recommendation_text(
            pool_category=details['pool'],
            shift_hours=details['shift'],
            time_gap=details['gap'],
            options=details['opsi'],
            unload_time=details['waktu_bongkar'],
            load_time=details['waktu_muat']
        )
        
        results.append({
            "DEST_ID": str(details['dest_id']),
            "ORIG_ID": str(details['orig_id']),
            "CABANG": details['cabang'],
            "SIZE_CONT": str(details['size_cont']),
            "STATUS": "MATCHED",
            "KATEGORI_POOL": details['pool'],
            "JARAK_TRIANGULASI": round(details['dist_triangulasi'], 2),  
            "JARAK_VIA_PORT": round(details['dist_via_port'], 2),        
            "JARAK_BONGKAR_MUAT": round(details['dist_direct'], 2),      
            "SAVING_KM": round(details['saving_km'], 2),
            "COST_TRIANGULASI": round(details['cost_triangulasi']),
            "COST_VIA_PORT": round(details['cost_via_port']),
            "SAVING_COST": round(details['saving_cost']),
            "SCORE_FINAL": round(details['score'], 2),
            "EST_PERJALANAN_JAM": round(details['est_travel'], 2),
            "GAP_WAKTU_ASLI": round(details['gap'], 2),
            "REKOMENDASI_TINDAKAN": rekom_text,
            "OPSI_SISI_ORIGIN": opsi_origin,
            "OPSI_SISI_DEST": opsi_dest,
            "WAKTU_BONGKAR_ASLI": details['waktu_bongkar'].strftime('%Y-%m-%d %H:%M:%S'),
            "WAKTU_MUAT_ASLI": details['waktu_muat'].strftime('%Y-%m-%d %H:%M:%S'),
            "DURASI_BONGKAR_EST": details['durasi_bongkar_est'],
            "DURASI_MUAT_EST": details['durasi_muat_est'],
            "SELESAI_BONGKAR": details['selesai_bongkar'].strftime('%Y-%m-%d %H:%M:%S'),
            "EST_TIBA_MUAT": details['est_tiba_muat'].strftime('%Y-%m-%d %H:%M:%S'),
            "DEST_CUST_ID": details['dest_cust_id'],
            "ORIG_CUST_ID": details['orig_cust_id'],
            "DEST_TIME_PROFILE": get_customer_time_profile(
                details['dest_cust_id'], details['cabang'], "bongkar"
            ),
            "ORIG_TIME_PROFILE": get_customer_time_profile(
                details['orig_cust_id'], details['cabang'], "muat"
            ),
            "geometry": details['shape'],
            "origin_coords": [details['orig_lat'], details['orig_lon']],
            "dest_coords": [details['dest_lat'], details['dest_lon']],
            "port_coords": [port_loc['lat'], port_loc['lon']]
        })
    
    df_dest['CABANG_NORM'] = df_dest['CABANG'].apply(normalize_cabang)
    df_origin['CABANG_NORM'] = df_origin['CABANG'].apply(normalize_cabang)
    
    cabang_stats = {}
    
    all_cabangs = set(df_dest['CABANG_NORM'].dropna().unique()) | set(df_origin['CABANG_NORM'].dropna().unique())
    
    for cabang in all_cabangs:
        if not cabang: continue
        cabang_stats[str(cabang)] = {
            "total_origin": int(df_origin[df_origin['CABANG_NORM'] == cabang].shape[0]),
            "total_dest": int(df_dest[df_dest['CABANG_NORM'] == cabang].shape[0]),
            "match": 0,
            "saving": 0,
            "saving_cost": 0
        }
    
    for res in results:
        cbg = str(res['CABANG'])
        if cbg in cabang_stats:
            cabang_stats[cbg]['match'] += 1
            cabang_stats[cbg]['saving'] += res['SAVING_KM']
            cabang_stats[cbg]['saving_cost'] += res['SAVING_COST']
            
    cabang_breakdown = [
        {"cabang": k, **v} for k, v in cabang_stats.items()
    ]
    
    total_saving_km = sum(r['SAVING_KM'] for r in results)
    total_saving_cost = sum(r['SAVING_COST'] for r in results)
    
    print(f"Selesai! Ditemukan {len(results)} rute optimal.")
    print(f"Total Penghematan Jarak: {total_saving_km:,.2f} km")
    print(f"Total Penghematan Biaya: Rp {total_saving_cost:,.0f}")
    print(f"[Optimize] Total elapsed: {time.time() - process_started_at:.1f}s")
    
    return {
        "results": results,
        "stats": {
            "total_match": len(results),
            "total_origin": num_origin,
            "total_dest": num_dest,
            "saving": total_saving_km,
            "saving_cost": total_saving_cost,
            "cabang_breakdown": cabang_breakdown
        }
    }
