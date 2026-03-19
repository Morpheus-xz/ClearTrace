import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useClearTrace } from '../context/ClearTraceContext';
import './RingDetail.css';

const RingDetail = () => {
  const { ringId } = useParams();
  const { rings, ringReports } = useClearTrace();
  const [escalated, setEscalated] = useState(false);
  const ring = rings.find((item) => String(item.ring_id) === String(ringId));
  const report = ringReports[String(ringId)];

  const handleEscalate = () => {
    setEscalated(true);
    setTimeout(() => setEscalated(false), 3000);
  };

  return (
    <div className="ring-detail-container pb-24">
      {escalated && (
        <div className="toast-notification">
          Ring {ringId} flagged for investigator escalation.
        </div>
      )}
      
      <div className="detail-header">
        <Link to="/dashboard" className="back-link">
          <ArrowLeft size={16} /> Back to Live Ops
        </Link>
        <div className="ring-title-area">
          <ShieldAlert size={28} color="var(--accent-secondary)" />
          <div>
            <h1 className="ring-title">Investigation CT-{ringId}-ALPHA</h1>
            <span className="ring-status">{ring ? 'Critical Verdict: HIGH CONFIDENCE' : 'Ring not found'}</span>
          </div>
        </div>
      </div>

      {!ring ? (
        <div className="detail-card">
          <h3>Ring unavailable</h3>
          <p>No live ring matched this route. Return to the dashboard and select one of the currently detected rings.</p>
        </div>
      ) : (

      <div className="detail-grid">
        <div className="detail-card summary-card">
          <h3>Case Summary</h3>
          <div className="score-display">
            <span className="score-value">{ring ? ring.avg_fraud_probability.toFixed(2) : '--'}</span>
            <span className="score-label">PROBABILITY</span>
          </div>
          <p className="summary-copy">{report?.headline}</p>
          <div className="action-buttons">
            <button className="primary-btn" onClick={handleEscalate}>ISOLATE CLUSTER</button>
            <button className="secondary-btn">EXPORT SUMMARY</button>
          </div>
        </div>

        <div className="detail-card evidence-card">
          <h3>Why This Ring Matters</h3>
          <div className="evidence-grid">
            {(report?.significance || []).map((item) => (
              <div key={item} className="evidence-bloc">
                <p>{item}</p>
              </div>
            ))}
          </div>
          <div className="judge-note">
            <span>Judge-ready narrative</span>
            <p>{report?.judgeNarrative}</p>
          </div>
        </div>

        <div className="detail-card timeline-card">
          <h3>How To Explain This</h3>
          <div className="timeline">
            <div className="timeline-event critical">
              <span className="time">STEP 1</span>
              <span className="desc">Several claims were linked into one connected group instead of appearing as isolated cases.</span>
            </div>
            <div className="timeline-event">
              <span className="time">STEP 2</span>
              <span className="desc">The cluster happened close together in time, which increases the likelihood of coordination.</span>
            </div>
            <div className="timeline-event">
              <span className="time">STEP 3</span>
              <span className="desc">The model gave this group a high fraud score based on prior behavior and claim patterns.</span>
            </div>
            <div className="timeline-event">
              <span className="time">STEP 4</span>
              <span className="desc">{`The potential financial exposure is $${Math.round(ring.total_claim_amount).toLocaleString()}, which justifies immediate review.`}</span>
            </div>
          </div>
        </div>

        <div className="detail-card members-card">
          <h3>Linked Policyholders</h3>
          <div className="member-list">
            {(ring?.policy_numbers || []).map((policy, index) => (
              <div key={policy} className={`member-item ${index < 2 ? 'critical' : ''}`}>
                {policy} <span className="imp">{Math.max(45, Math.round((ring.avg_fraud_probability || 0) * 100) - index * 7)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-card shap-card">
          <h3>Recommended Action</h3>
          <p className="recommendation-copy">{report?.recommendation}</p>
          <div className="shap-bars">
            <div className="shap-row"><span>Average Fraud Probability</span><div className="bar-track"><div className="bar-fill" style={{width: `${Math.round((ring?.avg_fraud_probability || 0) * 100)}%`}}></div></div></div>
            <div className="shap-row"><span>Temporal Density</span><div className="bar-track"><div className="bar-fill" style={{width: `${Math.round((ring?.temporal_density || 0) * 100)}%`}}></div></div></div>
            <div className="shap-row"><span>Cluster Size</span><div className="bar-track"><div className="bar-fill" style={{width: `${Math.min((ring?.node_count || 0) * 12, 100)}%`}}></div></div></div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
export default RingDetail;
