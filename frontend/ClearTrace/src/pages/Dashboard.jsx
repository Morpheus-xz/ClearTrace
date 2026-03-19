import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NetworkGraph from '../components/NetworkGraph';
import RingAlerts from '../components/RingAlerts';
import GraphInspector from '../components/GraphInspector';
import ClaimWorkbench from '../components/ClaimWorkbench';
import { useClearTrace } from '../context/ClearTraceContext';
import './Dashboard.css';

function buildCheckedClaimGraph(activeAnalysis) {
  if (!activeAnalysis?.checked_claim) return { nodes: [], links: [] };
  const claim = activeAnalysis.checked_claim;
  const risk = Number(activeAnalysis.risk_score || 0);
  const claimantId = `claimant-${claim.policy_number || 'unknown'}`;
  const doctorId = `doctor-${claim.insured_occupation || 'unknown'}`;
  const garageId = `garage-${claim.auto_make || 'unknown'}`;

  return {
    nodes: [
      {
        id: claimantId,
        label: `Claimant • ${claim.policy_number || 'Unknown Policy'}`,
        type: 'Claimant',
        fraud_score: risk,
        ringId: activeAnalysis.ring_id ?? null,
      },
      {
        id: doctorId,
        label: `Doctor • ${claim.insured_occupation || 'Unknown Provider'}`,
        type: 'Doctor',
        fraud_score: risk,
        ringId: activeAnalysis.ring_id ?? null,
      },
      {
        id: garageId,
        label: `Garage • ${claim.auto_make || 'Unknown Garage'}`,
        type: 'Garage',
        fraud_score: risk,
        ringId: activeAnalysis.ring_id ?? null,
      },
    ],
    links: [
      {
        source: claimantId,
        target: doctorId,
        relation: 'reported_provider',
      },
      {
        source: claimantId,
        target: garageId,
        relation: 'reported_garage',
      },
    ],
  };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { rings, loading, error, focusedGraphs, ringReports, latestAnalysis, analysisHistory } = useClearTrace();
  const [activeRingId, setActiveRingId] = useState(null);
  const [activeAnalysisId, setActiveAnalysisId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [panelMode, setPanelMode] = useState('analyze');

  useEffect(() => {
    if (latestAnalysis?.analysis_id) {
      setActiveAnalysisId(latestAnalysis.analysis_id);
    }
    if (latestAnalysis?.ring_id !== null && latestAnalysis?.ring_id !== undefined) {
      setActiveRingId(String(latestAnalysis.ring_id));
    } else if (latestAnalysis) {
      setActiveRingId(null);
      setSelectedNode(null);
    }
  }, [latestAnalysis]);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    if (node?.ringId) {
      setActiveRingId(String(node.ringId));
    }
  };

  const activeAnalysis = analysisHistory.find((entry) => entry.analysis_id === activeAnalysisId) || latestAnalysis || null;
  const selectedRingId = activeAnalysis?.ring_id ?? activeRingId;
  const activeRing = rings.find((ring) => String(ring.ring_id) === String(selectedRingId)) || null;
  const focusedGraph = activeRing
    ? focusedGraphs[String(activeRing.ring_id)] || { nodes: [], links: [] }
    : buildCheckedClaimGraph(activeAnalysis);
  const ringReport = activeRing ? ringReports[String(activeRing.ring_id)] : null;
  const checkedClaimAlert = analysisHistory.map((entry) => {
    const matchedRing = rings.find((ring) => String(ring.ring_id) === String(entry.ring_id)) || null;
    return {
      analysis_id: entry.analysis_id,
      ring_id: entry.ring_id,
      avg_fraud_probability: entry.risk_score || 0,
      claim_count: 1,
      node_count: matchedRing?.node_count || 0,
      policy_numbers: [entry.checked_claim?.policy_number || 'Unknown'],
      incident_type: entry.checked_claim?.incident_type || 'Not provided',
      incident_severity: entry.checked_claim?.incident_severity || 'Not provided',
      auto_make: entry.checked_claim?.auto_make || 'Not provided',
      vehicles_involved: entry.checked_claim?.number_of_vehicles_involved ?? 'Not provided',
      is_checked_claim: true,
      checked_at: entry.checked_at,
    };
  });
  return (
    <div className="dashboard-container">
      <div className="panel left-panel">
        <div className="panel-shell">
          <div className="panel-heading">
            <p className="panel-kicker">Checked Claim</p>
            <h2>Claim Review Result</h2>
            <p>Only the claim entered in the form appears here.</p>
          </div>
          {activeAnalysis ? (
            <div className="ring-brief-card">
              <span className="ring-brief-label">Checked Claim Summary</span>
              <strong>{activeAnalysis.checked_claim?.policy_number || 'Unknown policy'} scored {(activeAnalysis.risk_score * 100).toFixed(1)}% risk.</strong>
              <p>{activeAnalysis.brief}</p>
            </div>
          ) : null}
        <RingAlerts
          rings={checkedClaimAlert}
          activeRingId={activeAnalysisId}
          loading={loading}
          emptyMessage="Check a claim from the form to see its result here."
          onViewRing={(id) => {
            if (id !== null && id !== undefined) navigate(`/ring/${id}`);
          }}
          onSelectRing={(id, item) => {
            setActiveAnalysisId(item?.analysis_id || null);
            if (id !== null && id !== undefined) {
              setActiveRingId(String(id));
            } else {
              setActiveRingId(null);
              setSelectedNode(null);
            }
          }}
        />
        </div>
      </div>
      <div className="panel center-panel">
        <div className="ambient-overlay">
          {error ? 'BACKEND OFFLINE // CHECK API' : 'LIVE TRACE OPERATIONS // INSURANCE FRAUD'}
        </div>
        <NetworkGraph
          data={focusedGraph}
          detectedRing={activeRing}
          onNodeClick={handleNodeClick}
        />
      </div>
      <div className="panel right-panel">
        <div className="panel-shell">
          <div className="panel-heading compact">
            <p className="panel-kicker">Investigator Tools</p>
            <h2>{panelMode === 'insights' ? 'Ring Insights' : 'Claim Analysis'}</h2>
            <p>{panelMode === 'insights' ? 'Read the selected ring fast, then inspect entities only when needed.' : 'Score a claim without overwhelming the main dashboard.'}</p>
          </div>
          <div className="mode-switch">
            <button
              type="button"
              className={`mode-button ${panelMode === 'insights' ? 'active' : ''}`}
              onClick={() => setPanelMode('insights')}
            >
              Insights
            </button>
            <button
              type="button"
              className={`mode-button ${panelMode === 'analyze' ? 'active' : ''}`}
              onClick={() => setPanelMode('analyze')}
            >
              Check Claim
            </button>
          </div>
        {panelMode === 'analyze' ? <ClaimWorkbench compact /> : null}
        <GraphInspector
          activeAnalysis={activeAnalysis}
          detectedRing={activeRing}
          selectedNode={selectedNode}
          loading={loading}
        />
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
