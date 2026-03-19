import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useClearTrace } from '../context/ClearTraceContext';
import './LandingPage.css';

const LandingPage = () => {
  const { metrics, summary } = useClearTrace();
  const [typedText, setTypedText] = useState('');
  const fullText = "Fraud rings don't hide. They repeat.";
  
  useEffect(() => {
    let currentText = '';
    let i = 0;
    const interval = setInterval(() => {
      currentText += fullText[i];
      setTypedText(currentText);
      i++;
      if (i === fullText.length) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="landing-container">
      <section className="hero-section">
        <h1 className="hero-title">
          {typedText}<span className="cursor">|</span>
        </h1>
        <p className="hero-subtitle">
          ClearTrace turns insurance claims into a live relationship graph, scores suspicious behavior with XGBoost, and groups high-risk activity into rings investigators can actually act on.
        </p>
        <Link to="/dashboard" className="cta-button">
          Open Investigation Console <ArrowRight size={18} />
        </Link>
      </section>

      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-label uppercase text-error">Fraud Rings</span>
          <span className="stat-value">{summary.ringCount}<span className="stat-unit"> rings</span></span>
        </div>
        <div className="stat-card">
          <span className="stat-label uppercase">AUC-ROC</span>
          <span className="stat-value">{metrics ? (metrics.auc_roc * 100).toFixed(1) : '--'}<span className="stat-unit">%</span></span>
        </div>
        <div className="stat-card">
          <span className="stat-label uppercase">Value At Risk</span>
          <span className="stat-value">${Math.round(summary.totalValueAtRisk).toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label uppercase">Claims In Graph</span>
          <span className="stat-value">{summary.claimCount}</span>
        </div>
      </section>

      <section className="cases-section" id="how-it-works">
        <h2 className="section-title">How It Works</h2>
        <div className="cases-grid">
          <div className="case-card critical">
            <div className="case-header">
              <span className="case-id">Step 01</span>
              <span className="case-status alert">Graph Build</span>
            </div>
            <h3 className="case-name">Connect claims, providers, garages, and policyholders</h3>
            <p className="case-desc">Every claim becomes part of a relationship graph so repeated entities, shared providers, and suspicious overlap stop hiding inside flat rows.</p>
            <Link to="/dashboard" className="case-link">View Network <ArrowRight size={14} /></Link>
          </div>
          <div className="case-card warning">
            <div className="case-header">
              <span className="case-id">Step 02</span>
              <span className="case-status">Ring Detection</span>
            </div>
            <h3 className="case-name">Score suspicious behavior and prioritize clusters</h3>
            <p className="case-desc">The model assigns fraud probability to claims and Louvain groups high-risk activity into investigation-ready rings with temporal density and value-at-risk context.</p>
            <Link to="/dashboard" className="case-link">Analyze Rings <ArrowRight size={14} /></Link>
          </div>
        </div>
      </section>

      <section className="cases-section" id="technology">
        <h2 className="section-title">Model Signals</h2>
        <div className="cases-grid">
          <div className="case-card critical">
            <div className="case-header">
              <span className="case-id">Temporal Features</span>
              <span className="case-status alert">Leakage Safe</span>
            </div>
            <h3 className="case-name">Recent activity, prior fraud rates, amount deviation</h3>
            <p className="case-desc">The scorer uses only prior behavior when building features, which keeps evaluation honest and makes the dashboard defensible in front of investigators.</p>
          </div>
          <div className="case-card warning">
            <div className="case-header">
              <span className="case-id">Serving Stack</span>
              <span className="case-status">Live API</span>
            </div>
            <h3 className="case-name">FastAPI backend with a React investigation console</h3>
            <p className="case-desc">The same endpoints power the graph, ring summaries, and live claim scoring flow, so the product experience matches the trained model behavior.</p>
          </div>
        </div>
      </section>
    </div>
  );
};
export default LandingPage;
