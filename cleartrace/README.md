# ClearTrace

ClearTrace is an insurance fraud detection system built around graph feature engineering, boosted-tree claim scoring, and Louvain ring detection.

## Project Layout

- `phase1_graph.py`: loads `data/insurance_claims.csv`, validates schema, builds the insurance graph, and writes `graph_data.pkl`.
- `phase2_model.py`: creates leakage-safe temporal features, trains XGBoost, computes metrics, detects rings, and writes `trained_model.pkl`.
- `phase3_api/main.py`: serves the trained artifact through FastAPI.
- `phase4_frontend/`: React + D3 dashboard.

## Required CSV columns

- `policy_number`
- `insured_occupation`
- `auto_make`
- `incident_date`
- `total_claim_amount`
- `fraud_reported`

## Commands

```bash
cd "/Users/vedanshagarwal/Docs/ai arena/cleartrace"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 phase1_graph.py
python3 phase2_model.py
uvicorn phase3_api.main:app --reload --port 8000
cd phase4_frontend
npm install
npm run dev
```
