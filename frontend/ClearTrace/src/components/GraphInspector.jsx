import React from 'react';
import { Network } from 'lucide-react';
import { useClearTrace } from '../context/ClearTraceContext';
import './GraphInspector.css';

function buildClaimSignals(activeAnalysis) {
  const f = activeAnalysis?.feature_snapshot;
  if (!f) return [];
  const reasons = [];
  if ((f.provider_claims_prior || 0) >= 60) reasons.push(`Provider appears in ${f.provider_claims_prior} prior claims.`);
  if ((f.garage_claims_prior || 0) >= 60) reasons.push(`Garage appears in ${f.garage_claims_prior} prior claims.`);
  if ((f.claimant_prior_fraud_rate || 0) >= 0.5) reasons.push('Policy history carries a high prior fraud rate.');
  if ((f.provider_prior_fraud_rate || 0) >= 0.25) reasons.push(`Provider prior fraud rate is ${(f.provider_prior_fraud_rate * 100).toFixed(0)}%.`);
  if ((f.garage_prior_fraud_rate || 0) >= 0.2) reasons.push(`Garage prior fraud rate is ${(f.garage_prior_fraud_rate * 100).toFixed(0)}%.`);
  if ((f.policy_age_days || 0) <= 120) reasons.push(`Claim arrived only ${Math.round(f.policy_age_days || 0)} days after policy start.`);
  if (!reasons.length) reasons.push('No strong repeat-entity signal dominates this checked claim.');
  return reasons.slice(0, 4);
}

const GraphInspector = ({ activeAnalysis, detectedRing, selectedNode, loading }) => {
  const { metrics, ringReports } = useClearTrace();

  const fraudProbability = activeAnalysis?.risk_score ?? detectedRing?.avg_fraud_probability ?? 0;
  const legitimacyProbability = Math.max(0, 1 - fraudProbability);
  const report = detectedRing ? ringReports[String(detectedRing.ring_id)] : null;
  const claimSignals = buildClaimSignals(activeAnalysis);
  const evidenceRows = [
    { name: activeAnalysis ? 'Checked claim risk' : 'Average ring risk', value: fraudProbability, width: `${Math.min(fraudProbability * 100, 100)}%` },
    { name: 'Time concentration', value: detectedRing?.temporal_density || 0, width: `${Math.min((detectedRing?.temporal_density || 0) * 100, 100)}%` },
    { name: 'Claims linked', value: Math.min((detectedRing?.claim_count || 0) / 10, 1), width: `${Math.min((detectedRing?.claim_count || 0) * 12, 100)}%` },
    { name: 'Model quality', value: metrics?.auc_roc || 0, width: `${Math.min((metrics?.auc_roc || 0) * 100, 100)}%` },
  ];

  return (
    <div className="inspector-container">
      <div className={`inspector-section ${activeAnalysis || detectedRing ? '' : 'disabled'}`}>
        <h4 className="card-title mb-16">Decision Summary</h4>
        <div className="flex-center mb-16">
          <div className="gauge-container">
            <div className="gauge-text">
              <span className="gauge-value">{Math.round(fraudProbability * 100)}%</span>
              <span className="gauge-label">{activeAnalysis ? 'CLAIM RISK' : 'RING RISK'}</span>
            </div>
          </div>
        </div>
        
        <div className="probability-bars">
          <div className="prob-row">
                <span className="prob-label">Fraud</span>
                <div className="prob-bar-container">
                  <div 
                    className="prob-bar fill-red" 
                    style={{ width: activeAnalysis || detectedRing ? `${Math.round(fraudProbability * 100)}%` : '0%' }}
                  ></div>
                </div>
            <span className="prob-val">{Math.round(fraudProbability * 100)}%</span>
          </div>
          <div className="prob-row">
            <span className="prob-label">Legitimate</span>
            <div className="prob-bar-container">
              <div 
                className="prob-bar fill-safe" 
                style={{ width: activeAnalysis || detectedRing ? `${Math.round(legitimacyProbability * 100)}%` : '100%' }}
              ></div>
            </div>
            <span className="prob-val">{Math.round(legitimacyProbability * 100)}%</span>
          </div>
        </div>
      </div>

      <div className="divider"></div>

      <div className={`inspector-section ${activeAnalysis || detectedRing ? '' : 'disabled'}`}>
        <h4 className="card-title mb-16">{detectedRing ? 'Why This Ring Needs Review' : 'Why This Claim Was Scored This Way'}</h4>
        {detectedRing && report ? <p className="insight-copy">{report.graphExplanation}</p> : null}
        {!detectedRing && activeAnalysis ? (
          <p className="insight-copy">{activeAnalysis.brief}</p>
        ) : null}
        <div className="shap-rows">
          {evidenceRows.map((f, i) => (
            <div key={i} className="shap-row">
              <span className="shap-name">{f.name}</span>
              <div className="shap-bar-wrapper">
                <div 
                  className="shap-bar fill-red"
                  style={{ width: f.width }}
                ></div>
              </div>
              <span className="shap-val text-danger">
                {Number(f.value || 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        {!detectedRing && activeAnalysis ? (
          <div className="shap-rows">
            {claimSignals.map((signal) => (
              <div key={signal} className="shap-row">
                <span className="shap-name">{signal}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="divider"></div>

      <div className="inspector-section flex-grow">
        <h4 className="card-title mb-16">Selected Entity</h4>
        
        {loading ? (
          <div className="empty-inspector">
            <span className="empty-text">Loading graph intelligence...</span>
          </div>
        ) : !selectedNode ? (
          <div className="empty-inspector">
            <Network size={24} className="empty-icon" />
            <span className="empty-text">Click a node in the ring map</span>
            <span className="empty-subtext">and this panel will explain why that entity matters</span>
          </div>
        ) : (
          <div className="node-detail slide-in-right">
            <div className={`node-badge badge-${selectedNode.type.toLowerCase()}`}>
              {selectedNode.type}
            </div>
            <h3 className="node-id">{selectedNode.id}</h3>

            <div className="node-stats mt-16">
              <div className="stat-line">
                <span className="stat-label">Entity Type</span>
                <span className="stat-val">{selectedNode.type}</span>
              </div>
              <div className="stat-line">
                <span className="stat-label">Ring Assignment</span>
                <span className="stat-val">{selectedNode.ringId ?? 'Not assigned'}</span>
              </div>
              <div className="stat-line">
                <span className="stat-label">Model marker</span>
                <span className="stat-val">{Math.round((selectedNode.fraud_score || 0) * 100)}%</span>
              </div>
              <div className="stat-line">
                <span className="stat-label">Why it matters</span>
                <span className="stat-val">{selectedNode.type === 'Doctor' ? 'Shared provider' : selectedNode.type === 'Garage' ? 'Shared garage' : 'Linked claimant'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphInspector;
