import { useEffect, useState } from "react";
import axios from "axios";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import FraudGraph from "./FraudGraph.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const INITIAL_FORM = {
  policy_number: "119513",
  insured_occupation: "craft-repair",
  auto_make: "Saab",
  incident_date: "2015-02-17",
  total_claim_amount: 62400,
  policy_bind_date: "2014-08-12",
  months_as_customer: 250,
  age: 45,
  policy_deductable: 500,
  policy_annual_premium: 1100,
  umbrella_limit: 0,
  "capital-gains": 0,
  "capital-loss": 0,
  incident_hour_of_the_day: 14,
  number_of_vehicles_involved: 2,
  bodily_injuries: 1,
  witnesses: 2,
  injury_claim: 18000,
  property_claim: 12000,
  vehicle_claim: 32400,
  policy_state: "OH",
  policy_csl: "250/500",
  insured_sex: "MALE",
  insured_education_level: "JD",
  insured_hobbies: "reading",
  insured_relationship: "husband",
  incident_type: "Multi-vehicle Collision",
  collision_type: "Rear Collision",
  incident_severity: "Major Damage",
  authorities_contacted: "Police",
  incident_state: "NY",
  incident_city: "Springfield",
  property_damage: "YES",
  police_report_available: "YES",
  auto_model: "95",
};

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [rings, setRings] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiHealth, setApiHealth] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      console.log("[Frontend] Loading graph and ring data");
      try {
        setError("");
        const [healthResponse, graphResponse, ringResponse] = await Promise.all([
          axios.get(`${API_BASE}/health`),
          axios.get(`${API_BASE}/graph-data`),
          axios.get(`${API_BASE}/fraud-rings`),
        ]);
        if (!active) {
          return;
        }
        setApiHealth(healthResponse.data);
        setGraphData(graphResponse.data);
        setRings(ringResponse.data.rings || []);
        setMetrics(ringResponse.data.metrics || null);
      } catch (error) {
        console.error("[Frontend] Failed to load dashboard data", error);
        if (active) {
          setError("Could not reach the ClearTrace backend. Start the FastAPI server on 127.0.0.1:8000.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  async function analyzeClaim(event) {
    event.preventDefault();
    console.log("[Frontend] Sending claim for analysis");
    setAnalyzing(true);
    setError("");

    try {
      const payload = {
        ...formData,
        total_claim_amount: Number(formData.total_claim_amount),
        months_as_customer: Number(formData.months_as_customer),
        age: Number(formData.age),
        policy_deductable: Number(formData.policy_deductable),
        policy_annual_premium: Number(formData.policy_annual_premium),
        umbrella_limit: Number(formData.umbrella_limit),
        "capital-gains": Number(formData["capital-gains"]),
        "capital-loss": Number(formData["capital-loss"]),
        incident_hour_of_the_day: Number(formData.incident_hour_of_the_day),
        number_of_vehicles_involved: Number(formData.number_of_vehicles_involved),
        bodily_injuries: Number(formData.bodily_injuries),
        witnesses: Number(formData.witnesses),
        injury_claim: Number(formData.injury_claim),
        property_claim: Number(formData.property_claim),
        vehicle_claim: Number(formData.vehicle_claim),
      };
      const response = await axios.post(`${API_BASE}/analyze-claim`, payload);
      setAnalysis(response.data);
    } catch (error) {
      console.error("[Frontend] Claim analysis failed", error);
      setError("Claim analysis failed. Check the API logs and request payload.");
    } finally {
      setAnalyzing(false);
    }
  }

  const trendData = rings.map((ring) => ({
    ring: `Ring ${ring.ring_id}`,
    risk: Number((ring.avg_fraud_probability * 100).toFixed(1)),
    density: Number((ring.temporal_density * 100).toFixed(1)),
  }));

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Insurance Fraud Ring Intelligence</p>
          <h1>ClearTrace</h1>
          <p className="hero-copy">
            Graph-native fraud detection with boosted-tree scoring and Louvain ring discovery.
          </p>
        </div>
        <div className="metric-strip">
          <MetricCard label="AUC-ROC" value={metrics ? metrics.auc_roc.toFixed(3) : "--"} />
          <MetricCard
            label="Precision @ 90% Recall"
            value={metrics ? metrics.precision_at_90_recall.toFixed(3) : "--"}
          />
          <MetricCard label="Top Rings" value={String(rings.length)} />
          <MetricCard
            label="API Health"
            value={apiHealth?.status === "ok" ? "Online" : loading ? "..." : "Offline"}
          />
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="dashboard-grid">
        <section className="panel graph-panel">
          <div className="panel-header">
            <h2>Fraud Graph</h2>
            <span>{loading ? "Loading" : `${graphData.nodes.length} nodes / ${graphData.links.length} links`}</span>
          </div>
          <FraudGraph graphData={graphData} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Ring Risk Trend</h2>
          </div>
          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c2410c" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ffedd5" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7d8cc" />
                <XAxis dataKey="ring" stroke="#6b4f3b" />
                <YAxis stroke="#6b4f3b" />
                <Tooltip />
                <Area type="monotone" dataKey="risk" stroke="#c2410c" fill="url(#riskFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Analyze Claim</h2>
            <span>POST /analyze-claim</span>
          </div>
          <form className="claim-form" onSubmit={analyzeClaim}>
            <div className="form-grid">
              <Field label="Policy Number" name="policy_number" value={formData.policy_number} onChange={setFormData} />
              <Field label="Occupation" name="insured_occupation" value={formData.insured_occupation} onChange={setFormData} />
              <Field label="Auto Make" name="auto_make" value={formData.auto_make} onChange={setFormData} />
              <Field label="Incident Date" name="incident_date" value={formData.incident_date} onChange={setFormData} />
              <Field label="Claim Amount" name="total_claim_amount" value={formData.total_claim_amount} onChange={setFormData} type="number" />
              <Field label="Policy Bind Date" name="policy_bind_date" value={formData.policy_bind_date} onChange={setFormData} />
              <Field label="Incident Severity" name="incident_severity" value={formData.incident_severity} onChange={setFormData} />
              <Field label="Incident Type" name="incident_type" value={formData.incident_type} onChange={setFormData} />
            </div>
            <button className="primary-button" type="submit" disabled={analyzing}>
              {analyzing ? "Analyzing..." : "Analyze Claim"}
            </button>
          </form>
          {analysis ? (
            <div className="analysis-card">
              <div className="analysis-score">{(analysis.risk_score * 100).toFixed(1)}%</div>
              <div className="analysis-copy">
                <strong>Risk Score</strong>
                <p>{analysis.brief}</p>
                <p>Ring ID: {analysis.ring_id ?? "None"}</p>
                <p>Threshold: {analysis.threshold}</p>
              </div>
            </div>
          ) : (
            <p className="muted-text">Use the sample payload or edit the fields, then send it to the backend scorer.</p>
          )}
        </section>

        <section className="panel ring-list-panel">
          <div className="panel-header">
            <h2>Investigator Briefs</h2>
          </div>
          <div className="ring-list">
            {rings.map((ring) => (
              <article key={ring.ring_id} className="ring-card">
                <div className="ring-card-top">
                  <strong>Ring {ring.ring_id}</strong>
                  <span>{(ring.avg_fraud_probability * 100).toFixed(1)}% risk</span>
                </div>
                <p>{ring.claim_count} claims, {ring.node_count} entities, temporal density {(ring.temporal_density * 100).toFixed(1)}%</p>
              </article>
            ))}
            {!rings.length && <p>No rings available yet. Train the backend artifact first.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, name, value, onChange, type = "text" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange((current) => ({ ...current, [name]: event.target.value }))}
      />
    </label>
  );
}
