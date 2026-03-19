from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from cleartrace_lib.config import MODEL_ARTIFACT_PATH
from cleartrace_lib.pipeline import load_pickle, make_single_claim_features, model_matrix


class ClaimRequest(BaseModel):
    policy_number: str = Field(..., description="Claimant policy number")
    insured_occupation: str = Field(..., description="Provider or doctor identifier")
    auto_make: str = Field(..., description="Garage identifier")
    incident_date: str = Field(..., description="Claim date")
    total_claim_amount: float = Field(..., ge=0, description="Claim amount")
    policy_bind_date: Optional[str] = None
    months_as_customer: Optional[float] = 0
    age: Optional[float] = 0
    policy_deductable: Optional[float] = 0
    policy_annual_premium: Optional[float] = 0
    umbrella_limit: Optional[float] = 0
    capital_gains: Optional[float] = Field(0, alias="capital-gains")
    capital_loss: Optional[float] = Field(0, alias="capital-loss")
    incident_hour_of_the_day: Optional[float] = 0
    number_of_vehicles_involved: Optional[float] = 0
    bodily_injuries: Optional[float] = 0
    witnesses: Optional[float] = 0
    injury_claim: Optional[float] = 0
    property_claim: Optional[float] = 0
    vehicle_claim: Optional[float] = 0
    auto_year: Optional[float] = 0
    policy_state: Optional[str] = "UNKNOWN"
    policy_csl: Optional[str] = "UNKNOWN"
    insured_sex: Optional[str] = "UNKNOWN"
    insured_education_level: Optional[str] = "UNKNOWN"
    insured_hobbies: Optional[str] = "UNKNOWN"
    insured_relationship: Optional[str] = "UNKNOWN"
    incident_type: Optional[str] = "UNKNOWN"
    collision_type: Optional[str] = "UNKNOWN"
    incident_severity: Optional[str] = "UNKNOWN"
    authorities_contacted: Optional[str] = "UNKNOWN"
    incident_state: Optional[str] = "UNKNOWN"
    incident_city: Optional[str] = "UNKNOWN"
    property_damage: Optional[str] = "UNKNOWN"
    police_report_available: Optional[str] = "UNKNOWN"
    auto_model: Optional[str] = "UNKNOWN"

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class AppState:
    artifact = None


def _ring_for_claim(payload: ClaimRequest, rings: List[dict]) -> Optional[int]:
    policy = str(payload.policy_number)
    for ring in rings:
        if policy in ring.get("policy_numbers", []):
            return int(ring["ring_id"])
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[API] Loading model artifact from {MODEL_ARTIFACT_PATH}")
    AppState.artifact = load_pickle(MODEL_ARTIFACT_PATH)
    print("[API] Model artifact loaded")
    yield


app = FastAPI(title="ClearTrace API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    if AppState.artifact is None:
        raise HTTPException(status_code=503, detail="Model artifact not loaded")
    return {"status": "ok", "model_loaded": True}


@app.get("/graph-data")
def graph_data():
    if AppState.artifact is None:
        raise HTTPException(status_code=503, detail="Model artifact not loaded")
    return AppState.artifact["graph_json"]


@app.get("/fraud-rings")
def fraud_rings():
    if AppState.artifact is None:
        raise HTTPException(status_code=503, detail="Model artifact not loaded")
    return {
        "metrics": AppState.artifact["metrics"],
        "rings": AppState.artifact["rings"][:5],
        "ring_graph": AppState.artifact["ring_graph"],
    }


@app.post("/analyze-claim")
def analyze_claim(payload: ClaimRequest):
    if AppState.artifact is None:
        raise HTTPException(status_code=503, detail="Model artifact not loaded")

    frame = make_single_claim_features(
        payload.model_dump(by_alias=True),
        AppState.artifact["inference_state"],
    )
    cols = AppState.artifact["feature_columns"]
    X_frame, _ = model_matrix(frame, cols)
    probability = float(AppState.artifact["model"].predict_proba(X_frame)[:, 1][0])
    threshold = float(AppState.artifact["metrics"]["default_ring_threshold"])
    ring_id = _ring_for_claim(payload, AppState.artifact["rings"]) if probability >= threshold else None

    if probability >= threshold:
        brief = "High-risk claim pattern. Shared-entity or repeat-relationship features crossed the fraud threshold."
    elif probability >= 0.4:
        brief = "Medium-risk claim. Review claimant-provider and claimant-garage relationship history."
    else:
        brief = "Low-risk claim based on current graph feature profile."

    return {
        "risk_score": probability,
        "ring_id": ring_id,
        "brief": brief,
        "threshold": threshold,
        "feature_snapshot": frame.iloc[0].to_dict(),
    }
