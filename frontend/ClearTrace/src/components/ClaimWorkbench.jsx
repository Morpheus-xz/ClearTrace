import React from 'react';
import { ArrowRight, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useClearTrace } from '../context/ClearTraceContext';
import './ClaimWorkbench.css';

const fieldGroups = [
  ['policy_number', 'insured_occupation', 'auto_make', 'incident_date'],
  ['total_claim_amount', 'policy_bind_date', 'incident_type', 'incident_severity'],
  ['incident_state', 'incident_city', 'number_of_vehicles_involved', 'witnesses'],
  ['injury_claim', 'property_claim', 'vehicle_claim', 'police_report_available'],
];

const labelMap = {
  policy_number: 'Policy Number',
  insured_occupation: 'Occupation / Provider',
  auto_make: 'Auto Make',
  incident_date: 'Incident Date',
  total_claim_amount: 'Claim Amount',
  policy_bind_date: 'Policy Bind Date',
  incident_type: 'Incident Type',
  incident_severity: 'Incident Severity',
  incident_state: 'Incident State',
  incident_city: 'Incident City',
  number_of_vehicles_involved: 'Vehicles Involved',
  witnesses: 'Witnesses',
  injury_claim: 'Injury Claim',
  property_claim: 'Property Claim',
  vehicle_claim: 'Vehicle Claim',
  police_report_available: 'Police Report',
};

const numericFields = new Set([
  'total_claim_amount',
  'number_of_vehicles_involved',
  'witnesses',
  'injury_claim',
  'property_claim',
  'vehicle_claim',
]);

const compactGroups = [
  ['policy_number', 'insured_occupation', 'auto_make', 'incident_date'],
  ['total_claim_amount', 'incident_type', 'incident_severity', 'number_of_vehicles_involved'],
];

function buildReasons(result) {
  if (!result?.feature_snapshot) return [];
  const f = result.feature_snapshot;
  const compactMode = result?.checked_claim?.__input_mode === 'compact';
  const belowThreshold = Number(result?.risk_score || 0) < Number(result?.threshold || 0);
  if (compactMode && belowThreshold) {
    return ['No strong fraud signal was found from the fields entered in this quick check.'];
  }
  const reasons = [];

  if (compactMode) {
    if (!belowThreshold && (f.provider_claims_prior || 0) >= 60) {
      reasons.push('The entered provider has appeared in many earlier claims.');
    }
    if (!belowThreshold && (f.garage_claims_prior || 0) >= 60) {
      reasons.push('The entered garage has appeared in many earlier claims.');
    }
    if (!belowThreshold && (f.claimant_prior_fraud_rate || 0) >= 0.5) {
      reasons.push('This policy has a strong prior risk history in the trained data.');
    }
    if ((f.claimant_amount_z_prior || 0) >= 1.5 || (f.provider_amount_z_prior || 0) >= 1.5) {
      reasons.push('The entered amount is high compared with similar past patterns.');
    }
    if ((f.number_of_vehicles_involved || 0) >= 3 && /minor/i.test(f.incident_severity || '')) {
      reasons.push('The number of vehicles looks high for the reported damage level.');
    }
    if ((f.incident_severity || '').toLowerCase() === 'total loss' && (f.total_claim_amount || 0) >= 50000) {
      reasons.push('A large total-loss claim naturally increases risk.');
    }
  } else {
    if ((f.provider_claims_prior || 0) >= 60) {
      reasons.push(`This provider appears in ${f.provider_claims_prior} prior claims, which makes repeated shared use worth checking.`);
    }
    if ((f.garage_claims_prior || 0) >= 60) {
      reasons.push(`This garage appears in ${f.garage_claims_prior} prior claims, which can indicate a repeated repair pattern.`);
    }
    if ((f.claimant_prior_fraud_rate || 0) >= 0.5) {
      reasons.push('This policy has a high prior fraud rate in the training history, which strongly increases concern.');
    }
    if ((f.provider_prior_fraud_rate || 0) >= 0.25) {
      reasons.push(`Claims touching this provider had a prior fraud rate of ${(f.provider_prior_fraud_rate * 100).toFixed(0)}%.`);
    }
    if ((f.garage_prior_fraud_rate || 0) >= 0.2) {
      reasons.push(`Claims touching this garage had a prior fraud rate of ${(f.garage_prior_fraud_rate * 100).toFixed(0)}%.`);
    }
    if ((f.claimant_amount_z_prior || 0) >= 1.5 || (f.provider_amount_z_prior || 0) >= 1.5) {
      reasons.push('The amount is meaningfully higher than the historical pattern for the linked claimant or provider.');
    }
    if ((f.component_sum_gap || 0) !== 0) {
      reasons.push('The injury, property, and vehicle components do not fully reconcile to the total claim amount.');
    }
    if ((f.number_of_vehicles_involved || 0) >= 3 && /minor/i.test(f.incident_severity || '')) {
      reasons.push('Multiple vehicles are involved even though the reported damage is minor, which can require closer review.');
    }
    if ((f.policy_age_days || 0) <= 120) {
      reasons.push(`The claim arrived only ${Math.round(f.policy_age_days || 0)} days after policy start, which is relatively early.`);
    }
    if ((f.incident_severity || '').toLowerCase() === 'total loss' && (f.total_claim_amount || 0) >= 50000) {
      reasons.push('A total-loss event with a large amount naturally pushes the model toward a high-risk decision.');
    }
  }

  if (!reasons.length) {
    reasons.push(compactMode
      ? 'From the fields entered here, the model found a pattern strong enough to justify closer review.'
      : 'The model did not find a strong repeat-entity or historical-risk pattern in the returned feature profile.');
  }

  return reasons.slice(0, compactMode ? 2 : 4);
}

function buildDecisionNote(result) {
  if (!result) return '';
  const compactMode = result?.checked_claim?.__input_mode === 'compact';
  if (result.risk_score >= result.threshold) {
    return 'This claim crossed the current review threshold. The system is using your entered claim details together with the historical pattern linked to that policy, provider, and garage.';
  }
  if (result.risk_score >= 0.2) {
    return compactMode
      ? 'This claim did not cross the review threshold. The system saw some background history on the entered entities, but not enough to call it fraud.'
      : 'This claim did not cross the review threshold, but it still carries some weak historical or relationship-based signals.';
  }
  return compactMode
    ? 'This claim stayed below the review threshold and looks closer to a normal claim based on the details entered here.'
    : 'This claim stayed well below the review threshold and looks closer to the normal pattern learned by the model.';
}

function buildCompactPayload(claimDraft) {
  return {
    policy_number: claimDraft.policy_number || '',
    insured_occupation: claimDraft.insured_occupation || '',
    auto_make: claimDraft.auto_make || '',
    incident_date: claimDraft.incident_date || '',
    total_claim_amount: Number(claimDraft.total_claim_amount || 0),
    incident_type: claimDraft.incident_type || 'UNKNOWN',
    incident_severity: claimDraft.incident_severity || 'UNKNOWN',
    number_of_vehicles_involved: Number(claimDraft.number_of_vehicles_involved || 0),
    __input_mode: 'compact',
  };
}

const ClaimWorkbench = ({ compact = false }) => {
  const {
    claimDraft,
    setClaimDraft,
    analyzeClaim,
    analysisLoading,
    analysisError,
    latestAnalysis,
  } = useClearTrace();

  const reasons = buildReasons(latestAnalysis);
  const decisionNote = buildDecisionNote(latestAnalysis);

  const handleChange = (field, value) => {
    setClaimDraft((current) => ({
      ...current,
      [field]: numericFields.has(field) ? Number(value) : value,
    }));
  };

  return (
    <section className="workbench-card">
      <div className="workbench-header">
        <div>
          <p className="eyebrow">Live Claim Analysis</p>
          <h3>{compact ? 'Check one claim quickly' : 'Score a claim against the trained fraud model'}</h3>
        </div>
      </div>

      <form
        className="workbench-form"
        onSubmit={(event) => {
          event.preventDefault();
          analyzeClaim(compact ? buildCompactPayload(claimDraft) : claimDraft);
        }}
      >
        {(compact ? compactGroups : fieldGroups).map((group, index) => (
          <div key={index} className="workbench-grid">
            {group.map((field) => (
              <label key={field} className="field-shell">
                <span>{labelMap[field]}</span>
                <input
                  type={numericFields.has(field) ? 'number' : 'text'}
                  value={claimDraft[field]}
                  onChange={(event) => handleChange(field, event.target.value)}
                />
              </label>
            ))}
          </div>
        ))}

        <button className="submit-button" type="submit" disabled={analysisLoading}>
          {analysisLoading ? 'Checking...' : 'Check Claim'}
          <ArrowRight size={16} />
        </button>
      </form>

      {analysisError ? <div className="analysis-error">{analysisError}</div> : null}

      <div className="analysis-results">
        <div className={`analysis-hero ${latestAnalysis?.risk_score >= latestAnalysis?.threshold ? 'high' : 'low'}`}>
          <div className="analysis-icon">
            {latestAnalysis?.risk_score >= latestAnalysis?.threshold ? <TriangleAlert size={18} /> : <ShieldCheck size={18} />}
          </div>
          <div>
            <p className="eyebrow">Current Decision</p>
            <h4>{latestAnalysis ? `${(latestAnalysis.risk_score * 100).toFixed(1)}% risk score` : 'No claim scored yet'}</h4>
            <p>{latestAnalysis?.brief || 'Submit a claim sample to review the model response and assigned ring.'}</p>
          </div>
        </div>

        <div className="result-grid">
          <Metric label="Ring ID" value={latestAnalysis?.ring_id ?? 'None'} />
          <Metric label="Decision Threshold" value={latestAnalysis?.threshold ?? '--'} />
          <Metric label="Incident Type" value={latestAnalysis?.feature_snapshot?.incident_type ?? '--'} />
          <Metric label="Vehicles Involved" value={latestAnalysis?.feature_snapshot?.number_of_vehicles_involved ?? '--'} />
        </div>
        {latestAnalysis ? (
          <div className="analysis-explanation">
            <div className="explanation-card">
              <span className="explanation-label">Why the model said this</span>
              <ul className="reason-list">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div className="explanation-card subdued">
              <span className="explanation-label">Decision note</span>
              <p>{decisionNote}</p>
            </div>
          </div>
        ) : null}
        {compact ? (
          <p className="analysis-note">This quick check uses the key details investigators usually review first.</p>
        ) : null}
      </div>
    </section>
  );
};

function Metric({ label, value }) {
  return (
    <div className="metric-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default ClaimWorkbench;
