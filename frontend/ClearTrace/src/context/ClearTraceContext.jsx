import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const ClearTraceContext = createContext(null);
const SAMPLE_CLAIM = {
  policy_number: '119513',
  insured_occupation: 'craft-repair',
  auto_make: 'Saab',
  incident_date: '2015-02-17',
  total_claim_amount: 62400,
  policy_bind_date: '2014-08-12',
  months_as_customer: 250,
  age: 45,
  policy_deductable: 500,
  policy_annual_premium: 1100,
  umbrella_limit: 0,
  'capital-gains': 0,
  'capital-loss': 0,
  incident_hour_of_the_day: 14,
  number_of_vehicles_involved: 2,
  bodily_injuries: 1,
  witnesses: 2,
  injury_claim: 18000,
  property_claim: 12000,
  vehicle_claim: 32400,
  auto_year: 2014,
  policy_state: 'OH',
  policy_csl: '250/500',
  insured_sex: 'MALE',
  insured_education_level: 'JD',
  insured_hobbies: 'reading',
  insured_relationship: 'husband',
  incident_type: 'Multi-vehicle Collision',
  collision_type: 'Rear Collision',
  incident_severity: 'Major Damage',
  authorities_contacted: 'Police',
  incident_state: 'NY',
  incident_city: 'Springfield',
  property_damage: 'YES',
  police_report_available: 'YES',
  auto_model: '95',
};

const LEGITIMATE_CLAIM = {
  policy_number: '555001',
  insured_occupation: 'sales',
  auto_make: 'Toyota',
  incident_date: '2015-03-10',
  total_claim_amount: 4200,
  policy_bind_date: '2012-01-15',
  months_as_customer: 420,
  age: 39,
  policy_deductable: 1000,
  policy_annual_premium: 980,
  umbrella_limit: 0,
  'capital-gains': 0,
  'capital-loss': 0,
  incident_hour_of_the_day: 11,
  number_of_vehicles_involved: 1,
  bodily_injuries: 0,
  witnesses: 1,
  injury_claim: 500,
  property_claim: 900,
  vehicle_claim: 2800,
  auto_year: 2013,
  policy_state: 'NC',
  policy_csl: '250/500',
  insured_sex: 'FEMALE',
  insured_education_level: 'College',
  insured_hobbies: 'movies',
  insured_relationship: 'wife',
  incident_type: 'Parked Car',
  collision_type: '?',
  incident_severity: 'Minor Damage',
  authorities_contacted: 'Police',
  incident_state: 'NC',
  incident_city: 'Arlington',
  property_damage: 'NO',
  police_report_available: 'YES',
  auto_model: 'Camry',
};

function mapNodeType(type) {
  if (type === 'provider') return 'Doctor';
  if (type === 'garage') return 'Garage';
  if (type === 'claimant') return 'Claimant';
  return 'Entity';
}

function buildRingLookup(rings, ringGraph) {
  const byNode = new Map();
  const byRing = new Map();

  (ringGraph?.nodes || []).forEach((node) => {
    byNode.set(String(node.id), String(node.ring_id));
  });

  (rings || []).forEach((ring) => {
    byRing.set(String(ring.ring_id), ring);
  });

  return { byNode, byRing };
}

function formatCurrency(value) {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

function buildRingReport(ring, focusedGraph) {
  if (!ring) return null;

  const densityPct = Math.round((ring.temporal_density || 0) * 100);
  const probabilityPct = Math.round((ring.avg_fraud_probability || 0) * 100);
  const leadPolicies = (ring.policy_numbers || []).slice(0, 4);
  const nodes = focusedGraph?.nodes || [];
  const claimants = nodes.filter((node) => node.type === 'Claimant');
  const doctors = nodes.filter((node) => node.type === 'Doctor');
  const garages = nodes.filter((node) => node.type === 'Garage');
  const doctorNames = doctors.map((node) => node.label).slice(0, 3);
  const garageNames = garages.map((node) => node.label).slice(0, 3);

  return {
    headline: `Ring ${ring.ring_id} links ${ring.claim_count} suspicious claims across ${ring.node_count} connected entities.`,
    summary: `This cluster is high priority because its average fraud probability is ${probabilityPct}% and ${densityPct}% of its sequence occurs within the 72-hour density window.`,
    graphExplanation: `${claimants.length} policyholders connect to ${doctors.length} providers and ${garages.length} garages inside the same suspicious cluster.`,
    significance: [
      `${ring.claim_count} claims are moving through the same connected subgraph, which is unlikely to be random at this scale.`,
      `${ring.node_count} linked entities appear in the cluster, suggesting coordination rather than an isolated claim anomaly.`,
      `The aggregated value at risk is ${formatCurrency(ring.total_claim_amount)}, which makes the cluster operationally important even before manual investigation.`,
    ],
    judgeNarrative: `ClearTrace flagged this ring because multiple claims formed a tightly connected cluster around shared entities and occurred with unusually strong time proximity. The model score and the community structure point to coordinated behavior rather than independent legitimate claims.`,
    policyHighlights: leadPolicies,
    doctorHighlights: doctorNames,
    garageHighlights: garageNames,
    entityBreakdown: {
      claimants: claimants.length,
      doctors: doctors.length,
      garages: garages.length,
    },
    recommendation:
      probabilityPct >= 85
        ? 'Escalate immediately for investigator review, freeze downstream processing if policy permits, and request supporting claim documents for the linked entities.'
        : 'Queue for investigator review and compare linked entities against prior claim histories before payment approval.',
  };
}

export function ClearTraceProvider({ children }) {
  const [health, setHealth] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [rings, setRings] = useState([]);
  const [ringGraph, setRingGraph] = useState({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [claimDraft, setClaimDraft] = useState(SAMPLE_CLAIM);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setError('');
        const [healthData, graph, ringPayload] = await Promise.all([
          api.getHealth(),
          api.getGraphData(),
          api.getFraudRings(),
        ]);
        if (!active) return;

        setHealth(healthData);
        setMetrics(ringPayload.metrics || null);
        setRings(ringPayload.rings || []);
        setRingGraph(ringPayload.ring_graph || { nodes: [], links: [] });

        const ringLookup = buildRingLookup(ringPayload.rings || [], ringPayload.ring_graph || {});
        const enrichedNodes = (graph.nodes || []).map((node) => ({
          ...node,
          id: String(node.id),
          label: node.label || String(node.id),
          type: mapNodeType(node.type),
          ringId: ringLookup.byNode.get(String(node.id)) || null,
        }));

        const enrichedLinks = (graph.links || []).map((link) => ({
          ...link,
          source: String(link.source),
          target: String(link.target),
        }));

        setGraphData({ nodes: enrichedNodes, links: enrichedLinks });
      } catch (err) {
        if (active) {
          console.error('[ClearTrace] Failed to load backend data', err);
          setError('Could not load ClearTrace backend data. Start the FastAPI server on 127.0.0.1:8000.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const ringLookup = useMemo(() => buildRingLookup(rings, ringGraph), [rings, ringGraph]);
  const focusedGraphs = useMemo(() => {
    const graphMap = {};
    (rings || []).forEach((ring) => {
      const ringNodeIds = new Set(
        (graphData.nodes || [])
          .filter((node) => String(node.ringId) === String(ring.ring_id))
          .map((node) => String(node.id))
      );

      const nodes = (graphData.nodes || []).filter((node) => ringNodeIds.has(String(node.id)));
      const links = (graphData.links || []).filter(
        (link) => ringNodeIds.has(String(link.source)) && ringNodeIds.has(String(link.target))
      );

      graphMap[String(ring.ring_id)] = {
        nodes,
        links,
      };
    });
    return graphMap;
  }, [graphData, rings]);

  const ringReports = useMemo(() => {
    const reportMap = {};
    (rings || []).forEach((ring) => {
      reportMap[String(ring.ring_id)] = buildRingReport(ring, focusedGraphs[String(ring.ring_id)]);
    });
    return reportMap;
  }, [rings, focusedGraphs]);

  const summary = useMemo(() => {
    const claimCount = Math.floor((graphData.links?.length || 0) / 2);
    const totalValueAtRisk = rings.reduce((sum, ring) => sum + (ring.total_claim_amount || 0), 0);
    return {
      claimCount,
      nodeCount: graphData.nodes?.length || 0,
      ringCount: rings.length,
      totalValueAtRisk,
      topRingRisk: rings[0]?.avg_fraud_probability || 0,
    };
  }, [graphData, rings]);

  async function analyzeClaim(payload = claimDraft) {
    try {
      setAnalysisLoading(true);
      setAnalysisError('');
      const result = await api.analyzeClaim(payload);
      const checkedAt = new Date().toISOString();
      const analysisId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const enrichedResult = {
        ...result,
        analysis_id: analysisId,
        checked_at: checkedAt,
        checked_claim: { ...payload },
      };
      setLatestAnalysis(enrichedResult);
      setAnalysisHistory((current) => [enrichedResult, ...current].slice(0, 8));
      return enrichedResult;
    } catch (err) {
      console.error('[ClearTrace] Claim analysis failed', err);
      setAnalysisError('Claim analysis failed. Check the backend request schema and server status.');
      throw err;
    } finally {
      setAnalysisLoading(false);
    }
  }

  const value = {
    health,
    graphData,
    rings,
    ringGraph,
    metrics,
    loading,
    error,
    summary,
    ringLookup,
    focusedGraphs,
    ringReports,
    analyzeClaim,
    analysisLoading,
    analysisError,
    latestAnalysis,
    analysisHistory,
    claimDraft,
    setClaimDraft,
    sampleClaim: SAMPLE_CLAIM,
    legitimateClaim: LEGITIMATE_CLAIM,
  };

  return <ClearTraceContext.Provider value={value}>{children}</ClearTraceContext.Provider>;
}

export function useClearTrace() {
  const context = useContext(ClearTraceContext);
  if (!context) {
    throw new Error('useClearTrace must be used inside ClearTraceProvider');
  }
  return context;
}
