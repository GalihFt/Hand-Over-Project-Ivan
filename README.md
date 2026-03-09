# Roundtrip Mapping Optimization

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?style=for-the-badge&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-Latest-009688?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

**Sistem Optimasi Roundtrip untuk Efisiensi Logistik Trucking**

[Demo](#demo) • [Fitur](#-fitur-utama) • [Instalasi](#-instalasi) • [Penggunaan](#-penggunaan) • [API](#-api-documentation)

</div>

---

## Tentang Aplikasi

Aplikasi ini merupakan web yang mengoptimasi rute trucking dengan memetakan kegiatan **bongkar** dan **muat** yang memenuhi syarat untuk dilakukan **roundtrip**. Dengan roundtrip, truk dapat langsung menuju lokasi muat setelah bongkar tanpa harus kembali ke port terlebih dahulu, sehingga menghemat jarak tempuh dan biaya operasional.

### Tujuan Utama

- **Mengurangi jarak tempuh** dengan menghindari perjalanan kosong kembali ke port
- **Menghemat biaya trucking** melalui triangulasi rute yang efisien
- **Mengoptimasi penjadwalan** dengan mempertimbangkan constraint waktu bongkar dan muat
- **Menyediakan visualisasi** hasil mapping untuk analisis dan pengambilan keputusan

---

## Fitur Utama

### Mapping & Optimization

- **Hungarian Algorithm** untuk pencocokan optimal antara destinasi dan origin
- **Geocoding otomatis** alamat menggunakan Nominatim OpenStreetMap
- **Routing real-time** dengan Valhalla Routing Engine
- **Cost matrix calculation** dengan constraint multi-dimensi

### Analisis & Visualisasi

- **Dashboard interaktif** dengan statistik saving jarak dan biaya
- **Peta visualisasi** rute triangulasi menggunakan Leaflet
- **Filter by cabang** untuk analisis per lokasi
- **Detail view** dengan informasi lengkap setiap match

### Data Management

- **Upload Excel** untuk data bongkar dan muat (.xlsx)
- **Export hasil** ke Excel untuk dokumentasi
- **Mode Simulasi** untuk membuka kembali hasil mapping sebelumnya
- **IndexedDB storage** untuk persistensi data di browser

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Landing   │  │   Mapping   │  │   Results & Detail      │  │
│  │    Page     │→ │   Upload    │→ │   Visualization         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ API Calls
┌─────────────────────────────────────────────────────────────────┐
│                       Backend (FastAPI)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Geocoding  │  │   Routing   │  │   Hungarian Algorithm   │  │
│  │  (Nominatim)│  │  (Valhalla) │  │   Optimization          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Valhalla Routing Engine (Docker)                   │
│                    Map: Indonesia OSM                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend

| Technology               | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| **FastAPI**        | REST API Framework                          |
| **Python 3.10+**   | Core Language                               |
| **Pandas & NumPy** | Data Processing                             |
| **SciPy**          | Hungarian Algorithm (linear_sum_assignment) |
| **GeoPy**          | Geocoding Service                           |
| **Valhalla**       | Self-hosted Routing Engine                  |

### Frontend

| Technology             | Purpose                      |
| ---------------------- | ---------------------------- |
| **Next.js 16**   | React Framework (App Router) |
| **TypeScript**   | Type Safety                  |
| **Tailwind CSS** | Styling                      |
| **Leaflet**      | Map Visualization            |
| **Axios**        | HTTP Client                  |
| **XLSX**         | Excel Import/Export          |

---

## Instalasi

### Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Docker** (untuk Valhalla)
- **Map Indonesia** dari [Geofabrik](https://download.geofabrik.de/asia/indonesia.html)

### 1. Clone Repository

```bash
git clone https://github.com/GalihFt/Hand-Over-Project-Ivan
cd mapping_by_design
```

### 2. Setup Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install
```

### 4. Setup Valhalla (Docker)

```bash
# Download Indonesia map
wget https://download.geofabrik.de/asia/indonesia-latest.osm.pbf

# Run Valhalla container
docker run -d --name valhalla \
  -p 8002:8002 \
  -v $(pwd)/custom_files:/custom_files \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest
```

---

## Penggunaan

### Menjalankan Aplikasi

**Terminal 1 - Backend:**

```bash
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

**Akses aplikasi:** http://localhost:3000

### Workflow Aplikasi

```
1. Landing Page
   ├── Pilih "Mapping Baru" → Upload data bongkar & muat
   └── Pilih "Simulasi" → Upload hasil mapping sebelumnya

2. Upload Data
   ├── File Destinasi (Data Bongkar) - .xlsx
   └── File Origin (Data Muat) - .xlsx

3. Processing
   ├── Geocoding alamat
   ├── Routing calculation
   └── Hungarian optimization

4. Results
   ├── Download hasil (.xlsx)
   └── Lihat detail visualisasi
```

### Format Data Input

**Required Columns:**

| Column                | Description                             |
| --------------------- | --------------------------------------- |
| `NO SOPT`           | ID unik shipment                        |
| `ALAMAT`            | Alamat lengkap untuk geocoding          |
| `CABANG`            | Kode cabang (SBY, JKT, SMG, MKS, etc.)  |
| `SIZE CONT`         | Ukuran container (20/40 feet)           |
| `ACT. FINISH DATE`  | Waktu selesai bongkar (untuk destinasi) |
| `PICK / DELIV DATE` | Waktu mulai muat (untuk origin)         |

**Optional Columns:**

- `GRADE CONT` - Grade container untuk matching
- `ALAMAT_LAT`, `ALAMAT_LONG` - Koordinat (jika sudah tersedia)

---

## API Documentation

### Base URL

```
http://127.0.0.1:8000
```

### Endpoints

#### POST `/api/optimize`

Upload dan proses optimasi mapping roundtrip.

**Request:**

- `file_dest`: File Excel data bongkar (multipart/form-data)
- `file_orig`: File Excel data muat (multipart/form-data)

**Response:**

```json
[
  {
    "DEST_ID": "SOPT001",
    "ORIG_ID": "SOPT002",
    "CABANG": "SBY",
    "SAVING_KM": 45.5,
    "SAVING_COST": 650000,
    "KATEGORI_POOL": "OPTIMAL",
    "REKOMENDASI_TINDAKAN": "MATCH OPTIMAL. Idle 2.5 jam.",
    ...
  }
]
```

#### POST `/api/valhalla/route`

Proxy untuk Valhalla routing.

**Request:**

```json
{
  "locations": [
    { "lat": -7.25, "lon": 112.75 },
    { "lat": -7.3, "lon": 112.8 }
  ],
  "costing": "auto",
  "units": "km"
}
```

---

## Struktur Project

```
mapping_by_design/
├── backend/
│   ├── main.py          # FastAPI endpoints
│   ├── logic.py         # Core optimization algorithm
│   └── requirements.txt # Python dependencies
│
├── frontend/
│   ├── app/             # Next.js App Router
│   │   ├── page.tsx     # Landing page
│   │   ├── mapping/     # Mapping upload route
│   │   ├── simulation/  # Simulation upload route
│   │   ├── download/    # Download results route
│   │   ├── results/     # Results table route
│   │   ├── detail/      # Detail view route
│   │   └── components/  # UI Components
│   │
│   ├── context/         # React Context (state management)
│   ├── hooks/           # Custom hooks (IndexedDB)
│   ├── types/           # TypeScript interfaces
│   └── utils/           # Utility functions
│
└── README.md
```

---

## Cabang yang Didukung

| Code | Lokasi     | Port Coordinates |
| ---- | ---------- | ---------------- |
| SBY  | Surabaya   | -7.218, 112.728  |
| JKT  | Jakarta    | -6.108, 106.875  |
| SMG  | Semarang   | -6.943, 110.425  |
| MKS  | Makassar   | -5.114, 119.410  |
| BPN  | Balikpapan | -1.157, 116.785  |
| SDA  | Samarinda  | -0.576, 117.207  |
| PNK  | Pontianak  | -0.019, 109.334  |
| KDR  | Kendari    | -3.990, 122.619  |
| JYP  | Jayapura   | -2.545, 140.713  |

---

## Konfigurasi

### Environment Variables (Backend)

| Variable         | Default                         | Description           |
| ---------------- | ------------------------------- | --------------------- |
| `VALHALLA_URL` | `http://localhost:8002/route` | Valhalla API endpoint |

### Constraint Parameters (logic.py)

```python
PREP_TIME_HOURS = 2.0        # Waktu persiapan per trip
MAX_IDLE_HOURS = 4.0         # Maksimal waktu idle
MAX_MUNDURKAN_BONGKAR = 8    # Maks mundur jadwal bongkar (jam)
MAX_MUNDURKAN_MUAT = 8       # Maks mundur jadwal muat (jam)
MAX_MAJUKAN_BONGKAR = 24     # Maks maju jadwal bongkar (jam)
MAX_MAJUKAN_MUAT = 12        # Maks maju jadwal muat (jam)
```

---

## Troubleshooting

### Mapping stuck di "Membangun cost matrix..."

- Pastikan Valhalla server berjalan di port 8002
- Cek koneksi ke Valhalla: `curl http://localhost:8002/status`
- Periksa log backend untuk timeout errors

### Geocoding gagal

- Rate limit Nominatim: aplikasi sudah menghandle dengan retry + delay
- Pastikan format alamat valid dan mengandung informasi lokasi yang jelas

### Frontend tidak terhubung ke backend

- Pastikan backend berjalan di port 8000
- Cek CORS settings di `main.py`

---

## 🌐 Deployment

| Item                         | Link                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| **URL Website**        | [https://mapping-by-design.vercel.app/](https://mapping-by-design.vercel.app/)                       |
| **Source Code GitHub** | [https://github.com/mlikiwe/mapping_by_design](https://github.com/mlikiwe/mapping_by_design)         |
| **Data Testing**       | [Google Drive](https://drive.google.com/drive/folders/13gIlUDpNNBPpIPec-GVL8ye9MstrCzGB?usp=sharing) |

---

<div align="center">

</div>
