import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import './RingAlerts.css';

const RingAlerts = ({ rings, activeRingId, loading, onViewRing, onSelectRing, emptyMessage = 'No fraud rings detected yet.' }) => {
  return (
    <div className="alerts-container">
      {loading ? (
        <div className="empty-alerts">
          <p>Scanning network...</p>
        </div>
      ) : !rings.length ? (
        <div className="empty-alerts">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        rings.map((ring) => {
          const confidence = ring.avg_fraud_probability || 0;
          const riskLevel = confidence >= 0.85 ? 'high' : 'medium';
          const description = ring.is_checked_claim
            ? `${ring.incident_type} • ${ring.incident_severity} • ${ring.vehicles_involved} vehicles`
            : `${ring.claim_count} claims linked through ${ring.node_count} connected entities`;
          const pattern = ring.is_checked_claim
            ? `Policy ${ring.policy_numbers?.[0] || 'Unknown'} • ${ring.auto_make}`
            : `${(ring.policy_numbers?.slice(0, 3) || []).join(' • ')}${ring.policy_numbers?.length > 3 ? ' ...' : ''}`;
          const isActive = String(activeRingId) === String(ring.analysis_id ?? ring.ring_id);

          return (
          <div
            key={`${ring.ring_id ?? 'checked'}-${ring.policy_numbers?.[0] ?? 'claim'}`}
            className={`alert-card ${riskLevel} slide-in ${isActive ? 'active' : ''}`}
            onClick={() => onSelectRing(ring.ring_id, ring)}
          >
            <div className="alert-header">
              <span className="alert-id">{ring.is_checked_claim ? 'CHECKED CLAIM' : `RING #${ring.ring_id}`}</span>
              <span className="alert-score">{confidence.toFixed(2)}</span>
            </div>
            
            <div className="confidence-track">
              <div 
                className="confidence-fill" 
                style={{ width: `${confidence * 100}%` }}
              ></div>
            </div>
            
            <p className="alert-desc">{description}</p>
            
            <div className="pattern-tag">
              {ring.is_checked_claim ? pattern : `Key policies: ${pattern}`}
            </div>
            {ring.checked_at ? (
              <div className="pattern-tag">Checked at {new Date(ring.checked_at).toLocaleTimeString()}</div>
            ) : null}
            
            {ring.ring_id !== null && ring.ring_id !== undefined ? (
              <button 
                className="view-ring-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  onViewRing(ring.ring_id);
                }}
              >
                View Ring <ArrowRight size={14} className="btn-icon" />
              </button>
            ) : (
              <div className="pattern-tag">No linked ring was assigned to this checked claim.</div>
            )}
          </div>
        )})
      )}
    </div>
  );
};

export default RingAlerts;
