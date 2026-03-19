import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import BackgroundEffects from './components/BackgroundEffects';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import RingDetail from './pages/RingDetail';

const AppContent = () => {
  const location = useLocation();
  const isDetail = location.pathname.includes('/ring');
  const isHome = location.pathname === '/';

  return (
    <>
      <Navbar />
      <BackgroundEffects dimmed={isDetail} isHome={isHome} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/ring/:ringId" element={<RingDetail />} />
        </Routes>
      </main>
    </>
  );
};

function App() {
  return (
    <Router>
      <div className="app-container">
        <AppContent />
      </div>
    </Router>
  );
}

export default App;
