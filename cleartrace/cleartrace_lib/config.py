from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
RAW_DATA_PATH = DATA_DIR / "insurance_claims.csv"
GRAPH_ARTIFACT_PATH = ROOT_DIR / "graph_data.pkl"
MODEL_ARTIFACT_PATH = ROOT_DIR / "trained_model.pkl"
GRAPH_EXPORT_PATH = ROOT_DIR / "graph_data.json"
RINGS_EXPORT_PATH = ROOT_DIR / "fraud_rings.json"

REQUIRED_COLUMNS = [
    "policy_number",
    "insured_occupation",
    "auto_make",
    "incident_date",
    "total_claim_amount",
    "fraud_reported",
]
