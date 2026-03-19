import argparse
import json
import sys

from cleartrace_lib.config import GRAPH_ARTIFACT_PATH, GRAPH_EXPORT_PATH, RAW_DATA_PATH
from cleartrace_lib.pipeline import build_graph_artifacts, export_graph_json, save_pickle


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 1: build insurance graph artifacts.")
    parser.add_argument("--csv", default=str(RAW_DATA_PATH), help="Path to insurance_claims.csv")
    args = parser.parse_args()

    try:
        artifacts = build_graph_artifacts(args.csv)
        save_pickle(
            GRAPH_ARTIFACT_PATH,
            {
                "dataframe": artifacts.dataframe,
                "node_lookup": artifacts.node_lookup,
                "node_types": artifacts.node_types,
                "temporal_split_index": artifacts.temporal_split_index,
                "graph_json": artifacts.graph_json,
                "stats": artifacts.stats,
            },
        )
        export_graph_json(artifacts.graph_json)
    except Exception as exc:
        print(f"[Phase 1] Failed: {exc}")
        return 1

    print(f"[Phase 1] Saved graph artifact to {GRAPH_ARTIFACT_PATH}")
    print(f"[Phase 1] Saved graph JSON to {GRAPH_EXPORT_PATH}")
    print("[Phase 1] Completed successfully")
    print(json.dumps(artifacts.stats, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
