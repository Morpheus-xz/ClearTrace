import React, { useState, useEffect, useRef } from 'react';
import './BackgroundEffects.css';

const BackgroundEffects = ({ dimmed = false, isHome = true }) => {
  const [vantaEffect, setVantaEffect] = useState(null);
  const myRef = useRef(null);

  useEffect(() => {
    // Destroy effect if not on home page
    if (!isHome && vantaEffect) {
      vantaEffect.destroy();
      setVantaEffect(null);
      return;
    }

    // Only initialize if the global scripts have loaded and we are on home
    if (isHome && !vantaEffect && window.VANTA && window.VANTA.DOTS) {
      const effect = window.VANTA.DOTS({
        el: myRef.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        scale: 1.00,
        scaleMobile: 1.00,
        color: 0x34a705,
        color2: 0xf00a4c,
        backgroundColor: 0x050811
      });
      setVantaEffect(effect);
    }

    return () => {
        if (vantaEffect) vantaEffect.destroy();
    }
  }, [vantaEffect, isHome]);

  // Load handler in case scripts are loaded after React mounts
  useEffect(() => {
    const handleLoad = () => {
      if (isHome && !vantaEffect && window.VANTA && window.VANTA.DOTS) {
        const effect = window.VANTA.DOTS({
          el: myRef.current,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.00,
          minWidth: 200.00,
          scale: 1.00,
          scaleMobile: 1.00,
          color: 0x34a705,
          color2: 0xf00a4c,
          backgroundColor: 0x050811
        });
        setVantaEffect(effect);
      }
    };
    window.addEventListener('load', handleLoad);
    return () => window.removeEventListener('load', handleLoad);
  }, [isHome, vantaEffect]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1 }}>
      {isHome && <div ref={myRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />}
      <div className={`cyber-background ${dimmed ? 'dimmed' : ''}`} style={{ background: 'transparent' }}>
        <div className="radar-grid"></div>
        <div className="scanline"></div>
        <div className="glow glow-top-left"></div>
        <div className="glow glow-bottom-right"></div>
      </div>
    </div>
  );
};

export default BackgroundEffects;
