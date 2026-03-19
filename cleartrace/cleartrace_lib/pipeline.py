import json
import math
import pickle
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import networkx as nx
import numpy as np
import pandas as pd

from .config import GRAPH_EXPORT_PATH, REQUIRED_COLUMNS, RINGS_EXPORT_PATH

try:
    import community as community_louvain
except ImportError:  # pragma: no cover
    community_louvain = None

try:
    import xgboost as xgb
except Exception:  # pragma: no cover
    xgb = None

from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import auc, precision_recall_curve, roc_auc_score


DEFAULT_THRESHOLD = 0.7
WINDOWS = {
    "7d": pd.Timedelta(days=7),
    "30d": pd.Timedelta(days=30),
    "90d": pd.Timedelta(days=90),
    "72h": pd.Timedelta(hours=72),
}


@dataclass
class GraphArtifacts:
    dataframe: pd.DataFrame
    node_lookup: Dict[str, int]
    node_types: Dict[int, str]
    temporal_split_index: int
    graph_json: Dict
    stats: Dict


def _require_columns(df: pd.DataFrame) -> None:
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")


def _safe_text(series: pd.Series, prefix: str) -> pd.Series:
    return prefix + "::" + series.fillna("UNKNOWN").astype(str).str.strip().replace("", "UNKNOWN")


def _binary_label(series: pd.Series) -> pd.Series:
    return series.astype(str).str.upper().map({"Y": 1, "N": 0}).fillna(0).astype(int)


def build_graph_artifacts(csv_path: Path) -> GraphArtifacts:
    print(f"[Phase 1] Loading CSV from {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"[Phase 1] Loaded {len(df):,} rows and {len(df.columns)} columns")

    _require_columns(df)
    print("[Phase 1] Required columns are present")

    df = df.copy()
    df["incident_time"] = pd.to_datetime(df["incident_date"], errors="coerce")
    df = df.dropna(subset=["incident_time"]).sort_values("incident_time").reset_index(drop=True)
    df["total_claim_amount"] = pd.to_numeric(df["total_claim_amount"], errors="coerce").fillna(0.0)
    df["fraud_label"] = _binary_label(df["fraud_reported"])

    df["claimant_key"] = _safe_text(df["policy_number"], "claimant")
    df["provider_key"] = _safe_text(df["insured_occupation"], "provider")
    df["garage_key"] = _safe_text(df["auto_make"], "garage")
    df["claim_id"] = np.arange(len(df), dtype=np.int64)

    print("[Phase 1] Building shared node ID space with deterministic offsets")
    claimant_keys = pd.Index(df["claimant_key"].unique())
    provider_keys = pd.Index(df["provider_key"].unique())
    garage_keys = pd.Index(df["garage_key"].unique())

    claimant_map = {key: idx for idx, key in enumerate(claimant_keys)}
    provider_offset = len(claimant_map)
    provider_map = {key: provider_offset + idx for idx, key in enumerate(provider_keys)}
    garage_offset = provider_offset + len(provider_map)
    garage_map = {key: garage_offset + idx for idx, key in enumerate(garage_keys)}

    node_lookup = {}
    node_lookup.update(claimant_map)
    node_lookup.update(provider_map)
    node_lookup.update(garage_map)

    node_types = {}
    for key, idx in claimant_map.items():
        node_types[idx] = "claimant"
    for key, idx in provider_map.items():
        node_types[idx] = "provider"
    for key, idx in garage_map.items():
        node_types[idx] = "garage"

    df["claimant_id"] = df["claimant_key"].map(claimant_map).astype(int)
    df["provider_id"] = df["provider_key"].map(provider_map).astype(int)
    df["garage_id"] = df["garage_key"].map(garage_map).astype(int)

    split_index = int(len(df) * 0.8)
    df["split"] = np.where(df.index < split_index, "train", "test")

    print("[Phase 1] Building D3-compatible graph export")
    graph_json = build_graph_json(df, node_types)
    stats = {
        "rows": int(len(df)),
        "train_rows": int((df["split"] == "train").sum()),
        "test_rows": int((df["split"] == "test").sum()),
        "fraud_rate": float(df["fraud_label"].mean()),
        "claimants": int(len(claimant_map)),
        "providers": int(len(provider_map)),
        "garages": int(len(garage_map)),
    }
    print(f"[Phase 1] Stats: {json.dumps(stats, indent=2)}")

    return GraphArtifacts(
        dataframe=df,
        node_lookup=node_lookup,
        node_types=node_types,
        temporal_split_index=split_index,
        graph_json=graph_json,
        stats=stats,
    )


def build_graph_json(df: pd.DataFrame, node_types: Dict[int, str]) -> Dict:
    node_scores = defaultdict(float)
    node_labels = {}
    for row in df.itertuples(index=False):
        node_scores[row.claimant_id] = max(node_scores[row.claimant_id], float(row.fraud_label))
        node_scores[row.provider_id] = max(node_scores[row.provider_id], float(row.fraud_label))
        node_scores[row.garage_id] = max(node_scores[row.garage_id], float(row.fraud_label))
        node_labels[row.claimant_id] = row.claimant_key.split("::", 1)[1]
        node_labels[row.provider_id] = row.provider_key.split("::", 1)[1]
        node_labels[row.garage_id] = row.garage_key.split("::", 1)[1]

    nodes = []
    for node_id, node_type in node_types.items():
        nodes.append(
            {
                "id": int(node_id),
                "label": node_labels.get(node_id, str(node_id)),
                "type": node_type,
                "fraud_score": float(node_scores.get(node_id, 0.0)),
            }
        )

    links = []
    for row in df.itertuples(index=False):
        links.append(
            {
                "id": f"claim-{row.claim_id}-provider",
                "claim_id": int(row.claim_id),
                "source": int(row.claimant_id),
                "target": int(row.provider_id),
                "relation": "certified_by",
                "timestamp": row.incident_time.isoformat(),
                "amount": float(row.total_claim_amount),
                "fraud_label": int(row.fraud_label),
            }
        )
        links.append(
            {
                "id": f"claim-{row.claim_id}-garage",
                "claim_id": int(row.claim_id),
                "source": int(row.claimant_id),
                "target": int(row.garage_id),
                "relation": "repaired_at",
                "timestamp": row.incident_time.isoformat(),
                "amount": float(row.total_claim_amount),
                "fraud_label": int(row.fraud_label),
            }
        )
    return {"nodes": nodes, "links": links}


def _update_window(queue: deque, current_time: pd.Timestamp, window: pd.Timedelta) -> int:
    while queue and current_time - queue[0] > window:
        queue.popleft()
    return len(queue)


def build_feature_table(df: pd.DataFrame) -> pd.DataFrame:
    print("[Phase 2] Creating leakage-safe temporal graph features")
    df = df.sort_values("incident_time").reset_index(drop=True).copy()
    df["policy_bind_time"] = pd.to_datetime(df.get("policy_bind_date"), errors="coerce")
    numeric_columns = [
        "months_as_customer",
        "age",
        "policy_deductable",
        "policy_annual_premium",
        "umbrella_limit",
        "capital-gains",
        "capital-loss",
        "incident_hour_of_the_day",
        "number_of_vehicles_involved",
        "bodily_injuries",
        "witnesses",
        "injury_claim",
        "property_claim",
        "vehicle_claim",
        "auto_year",
    ]
    categorical_columns = [
        "policy_state",
        "policy_csl",
        "insured_sex",
        "insured_education_level",
        "insured_occupation",
        "insured_hobbies",
        "insured_relationship",
        "incident_type",
        "collision_type",
        "incident_severity",
        "authorities_contacted",
        "incident_state",
        "incident_city",
        "property_damage",
        "police_report_available",
        "auto_make",
        "auto_model",
    ]
    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    for col in categorical_columns:
        if col in df.columns:
            df[col] = df[col].fillna("UNKNOWN").astype(str)

    claimant_counts = defaultdict(int)
    provider_counts = defaultdict(int)
    garage_counts = defaultdict(int)
    cp_pair_counts = defaultdict(int)
    cg_pair_counts = defaultdict(int)

    claimant_provider_sets = defaultdict(set)
    claimant_garage_sets = defaultdict(set)
    provider_claimant_sets = defaultdict(set)
    garage_claimant_sets = defaultdict(set)

    claimant_amount_sum = defaultdict(float)
    claimant_amount_sq_sum = defaultdict(float)
    provider_amount_sum = defaultdict(float)
    provider_amount_sq_sum = defaultdict(float)
    claimant_fraud_sum = defaultdict(int)
    provider_fraud_sum = defaultdict(int)
    garage_fraud_sum = defaultdict(int)
    cp_pair_fraud_sum = defaultdict(int)
    cg_pair_fraud_sum = defaultdict(int)
    category_counts = {col: defaultdict(int) for col in categorical_columns if col in df.columns}
    category_fraud = {col: defaultdict(int) for col in categorical_columns if col in df.columns}

    claimant_time_windows = {name: defaultdict(deque) for name in WINDOWS}
    provider_time_windows = {name: defaultdict(deque) for name in WINDOWS}
    garage_time_windows = {name: defaultdict(deque) for name in WINDOWS}

    rows: List[Dict] = []

    for row in df.itertuples(index=False):
        row_dict = row._asdict()
        current_time = row.incident_time
        claimant = row.claimant_key
        provider = row.provider_key
        garage = row.garage_key
        amount = float(row.total_claim_amount)

        claimant_claims_prior = claimant_counts[claimant]
        provider_claims_prior = provider_counts[provider]
        garage_claims_prior = garage_counts[garage]
        cp_pair_prior = cp_pair_counts[(claimant, provider)]
        cg_pair_prior = cg_pair_counts[(claimant, garage)]

        claimant_unique_providers_prior = len(claimant_provider_sets[claimant])
        claimant_unique_garages_prior = len(claimant_garage_sets[claimant])
        provider_unique_claimants_prior = len(provider_claimant_sets[provider])
        garage_unique_claimants_prior = len(garage_claimant_sets[garage])

        claimant_mean = claimant_amount_sum[claimant] / claimant_claims_prior if claimant_claims_prior else 0.0
        provider_mean = provider_amount_sum[provider] / provider_claims_prior if provider_claims_prior else 0.0
        claimant_var = (
            claimant_amount_sq_sum[claimant] / claimant_claims_prior - claimant_mean**2
            if claimant_claims_prior
            else 0.0
        )
        provider_var = (
            provider_amount_sq_sum[provider] / provider_claims_prior - provider_mean**2
            if provider_claims_prior
            else 0.0
        )
        claimant_std = math.sqrt(max(claimant_var, 0.0))
        provider_std = math.sqrt(max(provider_var, 0.0))

        recent_features = {}
        for name, delta in WINDOWS.items():
            recent_features[f"claimant_recent_{name}"] = _update_window(
                claimant_time_windows[name][claimant], current_time, delta
            )
            recent_features[f"provider_recent_{name}"] = _update_window(
                provider_time_windows[name][provider], current_time, delta
            )
            recent_features[f"garage_recent_{name}"] = _update_window(
                garage_time_windows[name][garage], current_time, delta
            )

        prior_fraud_features = {
            "claimant_prior_fraud_rate": claimant_fraud_sum[claimant] / claimant_claims_prior if claimant_claims_prior else 0.0,
            "provider_prior_fraud_rate": provider_fraud_sum[provider] / provider_claims_prior if provider_claims_prior else 0.0,
            "garage_prior_fraud_rate": garage_fraud_sum[garage] / garage_claims_prior if garage_claims_prior else 0.0,
            "claimant_provider_prior_fraud_rate": cp_pair_fraud_sum[(claimant, provider)] / cp_pair_prior if cp_pair_prior else 0.0,
            "claimant_garage_prior_fraud_rate": cg_pair_fraud_sum[(claimant, garage)] / cg_pair_prior if cg_pair_prior else 0.0,
        }

        category_features = {}
        for col in category_counts:
            value = row_dict.get(col)
            prior_count = category_counts[col][value]
            category_features[f"{col}_prior_count"] = prior_count
            category_features[f"{col}_prior_fraud_rate"] = category_fraud[col][value] / prior_count if prior_count else 0.0

        policy_age_days = 0.0
        if pd.notna(row_dict.get("policy_bind_time")):
            policy_age_days = max((current_time - row_dict["policy_bind_time"]).days, 0)

        numeric_features = {col: float(row_dict.get(col, 0.0)) for col in numeric_columns if col in df.columns}
        claim_component_total = float(row_dict.get("injury_claim", 0.0) + row_dict.get("property_claim", 0.0) + row_dict.get("vehicle_claim", 0.0))
        total_amount = amount if amount else 1.0
        categorical_raw = {col: str(row_dict.get(col, "UNKNOWN")) for col in categorical_columns if col in df.columns}

        rows.append(
            {
                "claim_id": int(row.claim_id),
                "incident_time": current_time,
                "split": row.split,
                "fraud_label": int(row.fraud_label),
                "total_claim_amount": amount,
                "log_claim_amount": float(np.log1p(max(amount, 0.0))),
                "policy_age_days": float(policy_age_days),
                "injury_claim_share": float(getattr(row, "injury_claim", 0.0) / total_amount),
                "property_claim_share": float(getattr(row, "property_claim", 0.0) / total_amount),
                "vehicle_claim_share": float(getattr(row, "vehicle_claim", 0.0) / total_amount),
                "component_sum_gap": float(amount - claim_component_total),
                "claimant_claims_prior": claimant_claims_prior,
                "provider_claims_prior": provider_claims_prior,
                "garage_claims_prior": garage_claims_prior,
                "claimant_unique_providers_prior": claimant_unique_providers_prior,
                "claimant_unique_garages_prior": claimant_unique_garages_prior,
                "provider_unique_claimants_prior": provider_unique_claimants_prior,
                "garage_unique_claimants_prior": garage_unique_claimants_prior,
                "claimant_provider_pair_prior": cp_pair_prior,
                "claimant_garage_pair_prior": cg_pair_prior,
                "claimant_amount_mean_prior": claimant_mean,
                "provider_amount_mean_prior": provider_mean,
                "claimant_amount_z_prior": (amount - claimant_mean) / claimant_std if claimant_std > 0 else 0.0,
                "provider_amount_z_prior": (amount - provider_mean) / provider_std if provider_std > 0 else 0.0,
                **numeric_features,
                **categorical_raw,
                **recent_features,
                **prior_fraud_features,
                **category_features,
            }
        )

        claimant_counts[claimant] += 1
        provider_counts[provider] += 1
        garage_counts[garage] += 1
        cp_pair_counts[(claimant, provider)] += 1
        cg_pair_counts[(claimant, garage)] += 1

        claimant_provider_sets[claimant].add(provider)
        claimant_garage_sets[claimant].add(garage)
        provider_claimant_sets[provider].add(claimant)
        garage_claimant_sets[garage].add(claimant)

        claimant_amount_sum[claimant] += amount
        claimant_amount_sq_sum[claimant] += amount**2
        provider_amount_sum[provider] += amount
        provider_amount_sq_sum[provider] += amount**2
        claimant_fraud_sum[claimant] += int(row.fraud_label)
        provider_fraud_sum[provider] += int(row.fraud_label)
        garage_fraud_sum[garage] += int(row.fraud_label)
        cp_pair_fraud_sum[(claimant, provider)] += int(row.fraud_label)
        cg_pair_fraud_sum[(claimant, garage)] += int(row.fraud_label)

        for name in WINDOWS:
            claimant_time_windows[name][claimant].append(current_time)
            provider_time_windows[name][provider].append(current_time)
            garage_time_windows[name][garage].append(current_time)
        for col in category_counts:
            value = row_dict.get(col)
            category_counts[col][value] += 1
            category_fraud[col][value] += int(row.fraud_label)

    feature_df = pd.DataFrame(rows)
    print(f"[Phase 2] Built feature table with shape {feature_df.shape}")
    return feature_df


def feature_columns(feature_df: pd.DataFrame) -> List[str]:
    ignore = {"claim_id", "incident_time", "split", "fraud_label"}
    return [col for col in feature_df.columns if col not in ignore]


def model_matrix(feature_df: pd.DataFrame, model_columns: List[str] | None = None) -> Tuple[pd.DataFrame, List[str]]:
    raw_cols = feature_columns(feature_df)
    X = pd.get_dummies(feature_df[raw_cols], dummy_na=True)
    if model_columns is None:
        model_columns = X.columns.tolist()
    X = X.reindex(columns=model_columns, fill_value=0)
    return X, model_columns


def train_model(feature_df: pd.DataFrame) -> Dict:
    if community_louvain is None:
        raise ImportError("python-louvain is not installed. Install requirements.txt first.")

    train_df = feature_df[feature_df["split"] == "train"].copy()
    test_df = feature_df[feature_df["split"] == "test"].copy()
    X_train, model_columns = model_matrix(train_df)
    y_train = train_df["fraud_label"]
    X_test, _ = model_matrix(test_df, model_columns)
    y_test = test_df["fraud_label"]

    if xgb is not None:
        print("[Phase 2] Training XGBoost classifier")
        model = xgb.XGBClassifier(
            n_estimators=400,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="binary:logistic",
            eval_metric="auc",
            random_state=42,
            n_jobs=4,
        )
    else:
        print("[Phase 2] XGBoost unavailable, falling back to HistGradientBoostingClassifier")
        model = HistGradientBoostingClassifier(
            learning_rate=0.05,
            max_depth=6,
            max_iter=300,
            min_samples_leaf=20,
            random_state=42,
        )
    model.fit(X_train, y_train)
    print("[Phase 2] Model training complete")

    test_df["fraud_probability"] = model.predict_proba(X_test)[:, 1]
    auc_score = float(roc_auc_score(y_test, test_df["fraud_probability"])) if y_test.nunique() > 1 else 0.0

    precision, recall, thresholds = precision_recall_curve(y_test, test_df["fraud_probability"])
    threshold_at_90_recall = 0.5
    precision_at_90_recall = 0.0
    valid = np.where(recall[:-1] >= 0.90)[0]
    if len(valid) > 0:
        idx = valid[-1]
        threshold_at_90_recall = float(thresholds[idx])
        precision_at_90_recall = float(precision[idx])

    print(f"[Phase 2] Test AUC-ROC: {auc_score:.4f}")
    print(f"[Phase 2] Precision at 90% recall: {precision_at_90_recall:.4f}")
    print(f"[Phase 2] Threshold at 90% recall: {threshold_at_90_recall:.4f}")

    return {
        "model": model,
        "feature_columns": model_columns,
        "train_df": train_df,
        "test_predictions": test_df,
        "metrics": {
            "auc_roc": auc_score,
            "precision_at_90_recall": precision_at_90_recall,
            "threshold_at_90_recall": threshold_at_90_recall,
            "default_ring_threshold": float(min(DEFAULT_THRESHOLD, max(threshold_at_90_recall, float(test_df["fraud_probability"].quantile(0.95))))),
            "pr_auc": float(auc(recall, precision)),
        },
    }


def _temporal_density(timestamps: List[pd.Timestamp]) -> float:
    if len(timestamps) <= 1:
        return 1.0
    timestamps = sorted(timestamps)
    rapid = 0
    for prev, curr in zip(timestamps, timestamps[1:]):
        if curr - prev <= WINDOWS["72h"]:
            rapid += 1
    return float(rapid / max(len(timestamps) - 1, 1))


def detect_rings(df: pd.DataFrame, scored_df: pd.DataFrame, threshold: float = DEFAULT_THRESHOLD) -> Tuple[List[Dict], Dict]:
    if community_louvain is None:
        raise ImportError("python-louvain is not installed. Install requirements.txt first.")

    print(f"[Phase 2] Detecting rings using Louvain with threshold {threshold:.2f}")
    claim_scores = dict(zip(scored_df["claim_id"], scored_df["fraud_probability"]))
    suspicious_ids = set(scored_df.loc[scored_df["fraud_probability"] >= threshold, "claim_id"].tolist())
    suspicious_df = df[df["claim_id"].isin(suspicious_ids)].copy()

    graph = nx.Graph()
    for row in suspicious_df.itertuples(index=False):
        claim_score = float(claim_scores.get(row.claim_id, 0.0))
        graph.add_edge(
            int(row.claimant_id),
            int(row.provider_id),
            weight=claim_score,
            claim_id=int(row.claim_id),
        )
        graph.add_edge(
            int(row.claimant_id),
            int(row.garage_id),
            weight=claim_score,
            claim_id=int(row.claim_id),
        )

    if graph.number_of_edges() == 0:
        print("[Phase 2] No suspicious edges crossed the ring threshold")
        return [], {"nodes": [], "links": []}

    partition = community_louvain.best_partition(graph, weight="weight", random_state=42)
    suspicious_df["ring_id"] = suspicious_df["claimant_id"].map(partition).fillna(-1).astype(int)

    rings = []
    ring_nodes = defaultdict(set)
    for node_id, ring_id in partition.items():
        ring_nodes[ring_id].add(node_id)

    for ring_id, ring_df in suspicious_df.groupby("ring_id"):
        timestamps = ring_df["incident_time"].tolist()
        edge_count = int(len(ring_df) * 2)
        rings.append(
            {
                "ring_id": int(ring_id),
                "claim_count": int(len(ring_df)),
                "node_count": int(len(ring_nodes[ring_id])),
                "avg_fraud_probability": float(ring_df["claim_id"].map(claim_scores).mean()),
                "total_claim_amount": float(ring_df["total_claim_amount"].sum()),
                "temporal_density": _temporal_density(timestamps),
                "policy_numbers": sorted(ring_df["policy_number"].astype(str).unique().tolist())[:10],
            }
        )

    rings.sort(key=lambda ring: (ring["avg_fraud_probability"], ring["claim_count"]), reverse=True)
    print(f"[Phase 2] Found {len(rings)} candidate fraud rings")

    ring_graph = {
        "nodes": [{"id": int(node), "ring_id": int(ring_id)} for node, ring_id in partition.items()],
        "links": [
            {
                "source": int(u),
                "target": int(v),
                "weight": float(data.get("weight", 0.0)),
                "claim_id": int(data.get("claim_id", -1)),
                "ring_id": int(partition.get(u, -1)),
            }
            for u, v, data in graph.edges(data=True)
        ],
    }
    return rings, ring_graph


def build_inference_state(df: pd.DataFrame) -> Dict:
    print("[Phase 2] Building inference state for API scoring")
    categorical_columns = [
        "policy_state",
        "policy_csl",
        "insured_sex",
        "insured_education_level",
        "insured_occupation",
        "insured_hobbies",
        "insured_relationship",
        "incident_type",
        "collision_type",
        "incident_severity",
        "authorities_contacted",
        "incident_state",
        "incident_city",
        "property_damage",
        "police_report_available",
        "auto_make",
        "auto_model",
    ]
    claimant_counts = df.groupby("claimant_key").size().to_dict()
    provider_counts = df.groupby("provider_key").size().to_dict()
    garage_counts = df.groupby("garage_key").size().to_dict()
    claimant_provider_pair = df.groupby(["claimant_key", "provider_key"]).size().to_dict()
    claimant_garage_pair = df.groupby(["claimant_key", "garage_key"]).size().to_dict()

    claimant_unique_providers = df.groupby("claimant_key")["provider_key"].nunique().to_dict()
    claimant_unique_garages = df.groupby("claimant_key")["garage_key"].nunique().to_dict()
    provider_unique_claimants = df.groupby("provider_key")["claimant_key"].nunique().to_dict()
    garage_unique_claimants = df.groupby("garage_key")["claimant_key"].nunique().to_dict()

    claimant_amount_stats = (
        df.groupby("claimant_key")["total_claim_amount"].agg(["mean", "std"]).fillna(0.0).to_dict("index")
    )
    provider_amount_stats = (
        df.groupby("provider_key")["total_claim_amount"].agg(["mean", "std"]).fillna(0.0).to_dict("index")
    )
    garage_fraud_rate = df.groupby("garage_key")["fraud_label"].mean().to_dict()
    provider_fraud_rate = df.groupby("provider_key")["fraud_label"].mean().to_dict()
    claimant_fraud_rate = df.groupby("claimant_key")["fraud_label"].mean().to_dict()
    claimant_provider_pair_fraud = df.groupby(["claimant_key", "provider_key"])["fraud_label"].mean().to_dict()
    claimant_garage_pair_fraud = df.groupby(["claimant_key", "garage_key"])["fraud_label"].mean().to_dict()
    category_counts = {
        col: df.groupby(col).size().to_dict()
        for col in categorical_columns
        if col in df.columns
    }
    category_fraud_rate = {
        col: df.groupby(col)["fraud_label"].mean().to_dict()
        for col in categorical_columns
        if col in df.columns
    }

    return {
        "claimant_counts": claimant_counts,
        "provider_counts": provider_counts,
        "garage_counts": garage_counts,
        "claimant_provider_pair": {f"{k[0]}|||{k[1]}": int(v) for k, v in claimant_provider_pair.items()},
        "claimant_garage_pair": {f"{k[0]}|||{k[1]}": int(v) for k, v in claimant_garage_pair.items()},
        "claimant_unique_providers": claimant_unique_providers,
        "claimant_unique_garages": claimant_unique_garages,
        "provider_unique_claimants": provider_unique_claimants,
        "garage_unique_claimants": garage_unique_claimants,
        "claimant_amount_stats": claimant_amount_stats,
        "provider_amount_stats": provider_amount_stats,
        "garage_fraud_rate": garage_fraud_rate,
        "provider_fraud_rate": provider_fraud_rate,
        "claimant_fraud_rate": claimant_fraud_rate,
        "claimant_provider_pair_fraud": {f"{k[0]}|||{k[1]}": float(v) for k, v in claimant_provider_pair_fraud.items()},
        "claimant_garage_pair_fraud": {f"{k[0]}|||{k[1]}": float(v) for k, v in claimant_garage_pair_fraud.items()},
        "category_counts": category_counts,
        "category_fraud_rate": category_fraud_rate,
    }


def make_single_claim_features(payload: Dict, state: Dict) -> pd.DataFrame:
    claimant = f"claimant::{payload['policy_number']}"
    provider = f"provider::{payload['insured_occupation']}"
    garage = f"garage::{payload['auto_make']}"
    amount = float(payload["total_claim_amount"])
    incident_time = pd.to_datetime(payload["incident_date"])
    policy_bind_time = pd.to_datetime(payload.get("policy_bind_date"), errors="coerce")

    claimant_mean = state["claimant_amount_stats"].get(claimant, {}).get("mean", 0.0)
    claimant_std = state["claimant_amount_stats"].get(claimant, {}).get("std", 0.0) or 0.0
    provider_mean = state["provider_amount_stats"].get(provider, {}).get("mean", 0.0)
    provider_std = state["provider_amount_stats"].get(provider, {}).get("std", 0.0) or 0.0
    policy_age_days = max((incident_time - policy_bind_time).days, 0) if pd.notna(policy_bind_time) else 0.0
    injury_claim = float(payload.get("injury_claim", 0.0) or 0.0)
    property_claim = float(payload.get("property_claim", 0.0) or 0.0)
    vehicle_claim = float(payload.get("vehicle_claim", 0.0) or 0.0)
    total_amount = amount if amount else 1.0

    features = {
        "claim_id": -1,
        "incident_time": incident_time,
        "split": "inference",
        "fraud_label": 0,
        "total_claim_amount": amount,
        "log_claim_amount": float(np.log1p(max(amount, 0.0))),
        "policy_age_days": float(policy_age_days),
        "injury_claim_share": float(injury_claim / total_amount),
        "property_claim_share": float(property_claim / total_amount),
        "vehicle_claim_share": float(vehicle_claim / total_amount),
        "component_sum_gap": float(amount - (injury_claim + property_claim + vehicle_claim)),
        "claimant_claims_prior": int(state["claimant_counts"].get(claimant, 0)),
        "provider_claims_prior": int(state["provider_counts"].get(provider, 0)),
        "garage_claims_prior": int(state["garage_counts"].get(garage, 0)),
        "claimant_unique_providers_prior": int(state["claimant_unique_providers"].get(claimant, 0)),
        "claimant_unique_garages_prior": int(state["claimant_unique_garages"].get(claimant, 0)),
        "provider_unique_claimants_prior": int(state["provider_unique_claimants"].get(provider, 0)),
        "garage_unique_claimants_prior": int(state["garage_unique_claimants"].get(garage, 0)),
        "claimant_provider_pair_prior": int(state["claimant_provider_pair"].get(f'{claimant}|||{provider}', 0)),
        "claimant_garage_pair_prior": int(state["claimant_garage_pair"].get(f'{claimant}|||{garage}', 0)),
        "claimant_amount_mean_prior": float(claimant_mean),
        "provider_amount_mean_prior": float(provider_mean),
        "claimant_amount_z_prior": (amount - claimant_mean) / claimant_std if claimant_std > 0 else 0.0,
        "provider_amount_z_prior": (amount - provider_mean) / provider_std if provider_std > 0 else 0.0,
        "claimant_prior_fraud_rate": float(state["claimant_fraud_rate"].get(claimant, 0.0)),
        "provider_prior_fraud_rate": float(state["provider_fraud_rate"].get(provider, 0.0)),
        "garage_prior_fraud_rate": float(state["garage_fraud_rate"].get(garage, 0.0)),
        "claimant_provider_prior_fraud_rate": float(state["claimant_provider_pair_fraud"].get(f'{claimant}|||{provider}', 0.0)),
        "claimant_garage_prior_fraud_rate": float(state["claimant_garage_pair_fraud"].get(f'{claimant}|||{garage}', 0.0)),
        "claimant_recent_7d": 0,
        "provider_recent_7d": 0,
        "garage_recent_7d": 0,
        "claimant_recent_30d": 0,
        "provider_recent_30d": 0,
        "garage_recent_30d": 0,
        "claimant_recent_90d": 0,
        "provider_recent_90d": 0,
        "garage_recent_90d": 0,
        "claimant_recent_72h": 0,
        "provider_recent_72h": 0,
        "garage_recent_72h": 0,
    }
    passthrough_numeric = [
        "months_as_customer",
        "age",
        "policy_deductable",
        "policy_annual_premium",
        "umbrella_limit",
        "capital-gains",
        "capital-loss",
        "incident_hour_of_the_day",
        "number_of_vehicles_involved",
        "bodily_injuries",
        "witnesses",
        "injury_claim",
        "property_claim",
        "vehicle_claim",
        "auto_year",
    ]
    passthrough_categorical = [
        "policy_state",
        "policy_csl",
        "insured_sex",
        "insured_education_level",
        "insured_occupation",
        "insured_hobbies",
        "insured_relationship",
        "incident_type",
        "collision_type",
        "incident_severity",
        "authorities_contacted",
        "incident_state",
        "incident_city",
        "property_damage",
        "police_report_available",
        "auto_make",
        "auto_model",
    ]
    for col in passthrough_numeric:
        features[col] = float(payload.get(col, 0.0) or 0.0)
    for col in passthrough_categorical:
        value = str(payload.get(col, "UNKNOWN"))
        features[col] = value
        features[f"{col}_prior_count"] = int(state.get("category_counts", {}).get(col, {}).get(value, 0))
        features[f"{col}_prior_fraud_rate"] = float(state.get("category_fraud_rate", {}).get(col, {}).get(value, 0.0))
    return pd.DataFrame([features])


def save_pickle(path: Path, obj: Dict) -> None:
    with path.open("wb") as handle:
        pickle.dump(obj, handle)


def load_pickle(path: Path) -> Dict:
    with path.open("rb") as handle:
        return pickle.load(handle)


def save_json(path: Path, obj: Dict) -> None:
    path.write_text(json.dumps(obj, indent=2, default=str))


def export_graph_json(graph_json: Dict) -> None:
    save_json(GRAPH_EXPORT_PATH, graph_json)


def export_rings_json(rings: List[Dict], ring_graph: Dict) -> None:
    save_json(RINGS_EXPORT_PATH, {"rings": rings, "graph": ring_graph})
