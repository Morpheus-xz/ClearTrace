import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Hexagon, ArrowRight } from 'lucide-react';
import { useClearTrace } from '../context/ClearTraceContext';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  const isDashboard = location.pathname.includes('/dashboard') || location.pathname.includes('/ring');
  const { summary } = useClearTrace();

  return (
    <nav className={`navbar ${isDashboard ? 'dashboard-nav' : 'landing-nav'}`}>
      <div className="nav-left">
        <Link to="/" className="logo-container">
          <Hexagon size={isDashboard ? 15 : 20} className="logo-icon" />
          <span className="logo-text">
            <span className="logo-clear">Clear</span>
            <span className="logo-trace">Trace</span>
          </span>
        </Link>
      </div>

      {!isDashboard ? (
        <div className="nav-right">
          <a href="#how-it-works" className="nav-link">How it works</a>
          <a href="#technology" className="nav-link">Model</a>
          <Link to="/dashboard" className="nav-button primary-btn">
            Open Dashboard <ArrowRight size={16} className="btn-icon" />
          </Link>
        </div>
      ) : (
        <div className="nav-center-dashboard">
          <div className="live-pill">
            <span className="pill-label">Claims Processed:</span>
            <span className="pill-value white-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.claimCount}</span>
          </div>
          <div className="live-pill pill-danger">
            <div className="pulse-dot"></div>
            <span className="pill-label">Rings Detected:</span>
            <span className="pill-value red-text">{summary.ringCount}</span>
          </div>
          <div className="live-pill pill-teal">
            <span className="pill-label">Nodes in Graph:</span>
            <span className="pill-value teal-text">{summary.nodeCount}</span>
          </div>
          <div className="live-pill pill-warning">
            <span className="pill-label">Value at Risk:</span>
            <span className="pill-value warning-text">${Math.round(summary.totalValueAtRisk).toLocaleString()}</span>
          </div>
          <div className="live-pill pill-teal">
            <span className="pill-label">Top Ring Risk:</span>
            <span className="pill-value teal-text">{Math.round(summary.topRingRisk * 100)}%</span>
          </div>
        </div>
      )}

      {isDashboard && (
        <div className="nav-right-dashboard">
          <Link to="/dashboard" className="nav-button primary-btn small-btn">
            Live Dashboard
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
