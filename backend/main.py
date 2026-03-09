from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from logic import process_optimization
from validate import (
    validate_data,
    geocode_single_address,
    exclude_rows_with_warnings,
    get_warning_row_indices,
)
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import io
import os
import time
import requests

app = FastAPI()

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002/route")

class ValhallaLocation(BaseModel):
    lat: float
    lon: float

class ValhallaRequest(BaseModel):
    locations: List[ValhallaLocation]
    costing: str = "auto"
    units: str = "km"

class GeocodeSingleRequest(BaseModel):
    address: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/valhalla/route")
async def valhalla_proxy(request: ValhallaRequest):
    try:
        payload = {
            "locations": [{"lat": loc.lat, "lon": loc.lon} for loc in request.locations],
            "costing": request.costing,
            "units": request.units
        }
        
        headers = {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true"
        }
        
        response = requests.post(VALHALLA_URL, json=payload, headers=headers, timeout=15, verify=False)
        
        if response.status_code == 200:
            return response.json()
        else:
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Valhalla error: {response.text[:200]}"
            )
            
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Valhalla timeout")
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="Tidak dapat terhubung ke Valhalla server")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/validate")
async def validate_endpoint(
    file_dest: UploadFile = File(...),
    file_orig: UploadFile = File(...)
):
    started_at = time.time()
    print("[API][Validate] Request received")
    try:
        content_dest = await file_dest.read()
        content_orig = await file_orig.read()

        df_d = pd.read_excel(io.BytesIO(content_dest))
        df_o = pd.read_excel(io.BytesIO(content_orig))

        result = validate_data(df_d, df_o)
        print(f"[API][Validate] Completed in {time.time() - started_at:.1f}s")
        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/geocode-single")
async def geocode_single_endpoint(request: GeocodeSingleRequest):
    try:
        result = geocode_single_address(request.address)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/optimize")
async def optimize_endpoint(
    file_dest: UploadFile = File(...),
    file_orig: UploadFile = File(...),
    exclude_warnings: bool = Form(False)
):
    started_at = time.time()
    print(f"[API][Optimize] Request received | exclude_warnings={exclude_warnings}")
    try:
        content_dest = await file_dest.read()
        content_orig = await file_orig.read()
        
        df_d = pd.read_excel(io.BytesIO(content_dest))
        df_o = pd.read_excel(io.BytesIO(content_orig))

        if 'OPS DELIVERY TIME' not in df_d.columns and 'ACT. LOAD DATE' in df_d.columns:
            df_d = df_d.rename(columns={'ACT. LOAD DATE': 'OPS DELIVERY TIME'})
        if 'OPS DELIVERY TIME' not in df_o.columns and 'ACT. LOAD DATE' in df_o.columns:
            df_o = df_o.rename(columns={'ACT. LOAD DATE': 'OPS DELIVERY TIME'})
        
        required = ['NO SOPT', 'ALAMAT', 'CABANG', 'OPS DELIVERY TIME', 'CUST ID'] 
        
        missing_d = [col for col in required if col not in df_d.columns]
        missing_o = [col for col in required if col not in df_o.columns]
        
        if missing_d:
            raise HTTPException(400, f"File Destinasi kurang kolom: {missing_d}")
        if missing_o:
            raise HTTPException(400, f"File Origin kurang kolom: {missing_o}")

        if exclude_warnings:
            df_d_filtered, dest_validation = exclude_rows_with_warnings(df_d, "bongkar/destinasi optimize")
            df_o_filtered, orig_validation = exclude_rows_with_warnings(df_o, "muat/origin optimize")

            print(
                "[Optimize] Filter warnings summary: "
                f"dest_kept={len(df_d_filtered)}/{len(df_d)}, "
                f"orig_kept={len(df_o_filtered)}/{len(df_o)}"
            )

            if len(df_d_filtered) == 0 or len(df_o_filtered) == 0:
                print("[Optimize] Tidak ada data tersisa setelah exclude warning. Mengembalikan hasil kosong.")
                response = {
                    "results": [],
                    "stats": {
                        "total_match": 0,
                        "total_origin": int(len(df_o_filtered)),
                        "total_dest": int(len(df_d_filtered)),
                        "saving": 0,
                        "saving_cost": 0,
                        "cabang_breakdown": []
                    },
                    "filtering": {
                        "exclude_warnings": True,
                        "dest_removed": int(len(df_d) - len(df_d_filtered)),
                        "orig_removed": int(len(df_o) - len(df_o_filtered)),
                        "dest_warning_rows": len(get_warning_row_indices(dest_validation)),
                        "orig_warning_rows": len(get_warning_row_indices(orig_validation)),
                    }
                }
                print(f"[API][Optimize] Completed in {time.time() - started_at:.1f}s (empty after filtering)")
                return response

            results = process_optimization(df_d_filtered, df_o_filtered)
            results["filtering"] = {
                "exclude_warnings": True,
                "dest_removed": int(len(df_d) - len(df_d_filtered)),
                "orig_removed": int(len(df_o) - len(df_o_filtered)),
                "dest_warning_rows": len(get_warning_row_indices(dest_validation)),
                "orig_warning_rows": len(get_warning_row_indices(orig_validation)),
            }
            print(f"[API][Optimize] Completed in {time.time() - started_at:.1f}s")
            return results

        print("[Optimize] exclude_warnings=False, semua data diproses (tanpa auto-exclude).")
        results = process_optimization(df_d, df_o)
        print(f"[API][Optimize] Completed in {time.time() - started_at:.1f}s")
        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
