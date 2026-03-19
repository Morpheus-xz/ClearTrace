import json
import sys

from cleartrace_lib.config import GRAPH_ARTIFACT_PATH, MODEL_ARTIFACT_PATH
from cleartrace_lib.pipeline import (
    build_feature_table,
    build_inference_state,
    detect_rings,
    export_rings_json,
    load_pickle,
    save_pickle,
    train_model,
)


def main() -> int:
    try:
        print(f"[Phase 2] Loading graph artifact from {GRAPH_ARTIFACT_PATH}")
        graph_artifact = load_pickle(GRAPH_ARTIFACT_PATH)
        df = graph_artifact["dataframe"]
        feature_df = build_feature_table(df)
        train_output = train_model(feature_df)
        rings, ring_graph = detect_rings(
            df,
            train_output["test_predictions"],
            threshold=train_output["metrics"]["default_ring_threshold"],
        )
        inference_state = build_inference_state(df[df["split"] == "train"].copy())
        artifact = {
            "model": train_output["model"],
            "feature_columns": train_output["feature_columns"],
            "metrics": train_output["metrics"],
            "test_predictions": train_output["test_predictions"],
            "rings": rings,
            "ring_graph": ring_graph,
            "graph_json": graph_artifact["graph_json"],
            "inference_state": inference_state,
        }
        save_pickle(MODEL_ARTIFACT_PATH, artifact)
        export_rings_json(rings, ring_graph)
    except Exception as exc:
        print(f"[Phase 2] Failed: {exc}")
        return 1

    print(f"[Phase 2] Saved trained artifact to {MODEL_ARTIFACT_PATH}")
    print("[Phase 2] Metrics")
    print(json.dumps(train_output["metrics"], indent=2))
    print(f"[Phase 2] Rings detected: {len(rings)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
