import React, { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const NetworkGraph = ({ data, detectedRing, onNodeClick }) => {
  const fgRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef(null);

  const ringNodeIds = useMemo(() => {
    if (!detectedRing?.policy_numbers?.length) return new Set();
    return new Set((data?.nodes || []).filter((node) => String(node.ringId) === String(detectedRing.ring_id)).map((node) => node.id));
  }, [data, detectedRing]);

  const displayData = useMemo(() => {
    const sourceNodes = (data?.nodes || []).map((node) => ({ ...node }));
    const sourceLinks = (data?.links || []).map((link) => ({ ...link }));
    const groups = {
      Claimant: sourceNodes.filter((node) => node.type === 'Claimant'),
      Doctor: sourceNodes.filter((node) => node.type === 'Doctor'),
      Garage: sourceNodes.filter((node) => node.type === 'Garage'),
    };
    const columns = {
      Claimant: 0.2,
      Doctor: 0.5,
      Garage: 0.8,
    };

    Object.entries(groups).forEach(([type, nodes]) => {
      nodes.forEach((node, index) => {
        const gap = dimensions.height / (nodes.length + 1 || 2);
        node.fx = dimensions.width * columns[type];
        node.fy = gap * (index + 1);
      });
    });

    return { nodes: sourceNodes, links: sourceLinks };
  }, [data, dimensions]);

  const graphSummary = useMemo(() => {
    const nodes = displayData.nodes || [];
    const claimants = nodes.filter((node) => node.type === 'Claimant').length;
    const doctors = nodes.filter((node) => node.type === 'Doctor').length;
    const garages = nodes.filter((node) => node.type === 'Garage').length;
    return { claimants, doctors, garages };
  }, [displayData]);

  const suspiciousSignals = useMemo(() => {
    const degreeMap = new Map();

    (data?.links || []).forEach((link) => {
      const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
      const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
      degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
      degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
    });

    const suspiciousNodeIds = new Set(
      (displayData.nodes || [])
        .filter((node) => {
          const degree = degreeMap.get(String(node.id)) || 0;
          const fraudScore = Number(node.fraud_score || 0);
          const sharedEntity = node.type !== 'Claimant' && degree > 1;
          return sharedEntity || fraudScore >= 0.7;
        })
        .map((node) => String(node.id))
    );

    const suspiciousLinks = new Set(
      (data?.links || [])
        .map((link, index) => {
          const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
          const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
          const isSuspicious = suspiciousNodeIds.has(sourceId) || suspiciousNodeIds.has(targetId);
          return isSuspicious ? index : null;
        })
        .filter((value) => value !== null)
    );

    return { suspiciousNodeIds, suspiciousLinks };
  }, [data, displayData]);

  useEffect(() => {
    if (fgRef.current && displayData?.nodes?.length) {
      setTimeout(() => {
        fgRef.current.zoomToFit(400, 60);
      }, 120);
    }
  }, [displayData]);

  // We removed state based time to prevent huge react re-renders
  // ForceGraph2D internal animation frame will just use Date.now() when evaluating nodeCanvasObject


  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getNodeColor = (type) => {
    switch(type) {
      case 'Claimant': return '#8B5CF6';
      case 'Doctor': return '#00D4A0';
      case 'Garage': return '#F6C945';
      default: return '#FFFFFF';
    }
  };

  const getBaseRadius = (type) => {
    switch(type) {
      case 'Claimant': return 7;
      case 'Doctor': return 8;
      case 'Garage': return 7;
      default: return 5;
    }
  };

  const nodeCanvasObject = useMemo(() => {
    return (node, ctx, globalScale) => {
      const isRingMember = detectedRing && ringNodeIds.has(node.id);
      const isSuspicious = suspiciousSignals.suspiciousNodeIds.has(String(node.id));
      const baseRadius = getBaseRadius(node.type);
      const radius = isRingMember ? baseRadius * 1.2 : baseRadius;
      
      const isHovered = node.__hovered;
      const finalRadius = isHovered ? radius * 1.15 : radius;

      if (isSuspicious) {
        const pulse = 6 + Math.sin(Date.now() / 260) * 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, finalRadius + pulse, 0, 2 * Math.PI, false);
        ctx.fillStyle = 'rgba(255, 82, 82, 0.16)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, finalRadius, 0, 2 * Math.PI, false);
      ctx.fillStyle = getNodeColor(node.type);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, finalRadius + 1.8, 0, 2 * Math.PI, false);
      ctx.strokeStyle = isSuspicious ? 'rgba(255,82,82,0.92)' : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = isSuspicious ? 2.5 : 1;
      ctx.stroke();

      const shouldLabel = isHovered || ringNodeIds.size <= 14;
      if (shouldLabel) {
        const label = node.label || node.id;
        const fontSize = 10 / globalScale;
        ctx.font = `600 ${fontSize}px Inter, Sans-Serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, node.x + finalRadius + (8 / globalScale), node.y - (4 / globalScale));
        ctx.fillStyle = isSuspicious ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.62)';
        ctx.font = `500 ${fontSize * 0.82}px Inter, Sans-Serif`;
        ctx.fillText(isSuspicious ? `${node.type} • flagged` : node.type, node.x + finalRadius + (8 / globalScale), node.y + (10 / globalScale));
      }
    };
  }, [detectedRing, ringNodeIds, suspiciousSignals]);

  const linkCanvasObject = useMemo(() => {
    return (link, ctx) => {
      const sourceId = String(link.source.id);
      const targetId = String(link.target.id);
      const isRingEdge = detectedRing &&
        ringNodeIds.has(link.source.id) &&
        ringNodeIds.has(link.target.id);
      const isSuspiciousLink =
        suspiciousSignals.suspiciousNodeIds.has(sourceId) ||
        suspiciousSignals.suspiciousNodeIds.has(targetId);
      const sourceType = link.source.type;
      const targetType = link.target.type;
      const touchesDoctor = sourceType === 'Doctor' || targetType === 'Doctor';
      const touchesGarage = sourceType === 'Garage' || targetType === 'Garage';
      
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);

      if (isSuspiciousLink) {
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = touchesDoctor ? '#FF6B7A' : '#FF9F43';
        ctx.setLineDash([]);
      } else if (isRingEdge) {
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = touchesDoctor
          ? 'rgba(0, 212, 160, 0.38)'
          : touchesGarage
            ? 'rgba(246, 201, 69, 0.34)'
            : 'rgba(255,255,255,0.22)';
        ctx.setLineDash([4, 4]);
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(120, 138, 160, 0.16)';
        ctx.setLineDash([]);
      }
      
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }, [detectedRing, ringNodeIds, suspiciousSignals]);

  const handleNodeHover = (node) => {
    // Modify data to trigger re-render of canvas object with hover state
    if (displayData && displayData.nodes) {
      displayData.nodes.forEach(n => {
        n.__hovered = n === node;
      });
    }
    // Change cursor
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {!displayData.nodes.length ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          color: 'rgba(255,255,255,0.68)',
          textAlign: 'center',
          padding: 32,
          zIndex: 5
        }}>
          Select a ring to view how claimants connect to the same provider or garage.
        </div>
      ) : null}
      <div style={{
        position: 'absolute',
        left: 24,
        top: 24,
        zIndex: 10,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center'
      }}>
        {[
          ['Claimants', graphSummary.claimants, '#8B5CF6'],
          ['Doctors', graphSummary.doctors, '#00D4A0'],
          ['Garages', graphSummary.garages, '#F6C945'],
        ].map(([label, value, color]) => (
          <div key={label} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 999,
            background: 'rgba(10,18,36,0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'white'
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{label}</span>
            <strong style={{ fontSize: 13 }}>{value}</strong>
          </div>
        ))}
      </div>
      <div style={{
        position: 'absolute',
        left: 24,
        top: 72,
        zIndex: 10,
        maxWidth: 420,
        padding: '12px 14px',
        borderRadius: 16,
        background: 'rgba(10,18,36,0.72)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.88)',
        fontSize: 13,
        lineHeight: 1.6
      }}>
        Purple nodes are claimants, green nodes are doctors/providers, and yellow nodes are garages. Green or yellow edges show normal ring context, while the brighter moving red-orange traces show the relationships driving the fraud flag.
      </div>
      <div style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        zIndex: 10,
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap'
      }}>
        {[
          ['Claimant', 'Policyholder making the claim'],
          ['Doctor', 'Shared provider across claims'],
          ['Garage', 'Shared repair location across claims'],
        ].map(([type, meaning]) => (
          <div key={type} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 999,
            background: 'rgba(10,18,36,0.72)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'white',
            fontSize: 12
          }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: getNodeColor(type)
            }} />
            <span>{type}</span>
            <span style={{ color: 'rgba(255,255,255,0.52)' }}>{meaning}</span>
          </div>
        ))}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 999,
          background: 'rgba(10,18,36,0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'white',
          fontSize: 12
        }}>
          <span style={{
            width: 18,
            height: 2,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #FF6B7A, #FF9F43)'
          }} />
          Suspicious link
        </div>
      </div>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={displayData}
        nodeLabel="" // We handle label in canvas
        nodeColor={node => getNodeColor(node.type)}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        linkDirectionalParticles={(link) => {
          const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
          const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
          return suspiciousSignals.suspiciousNodeIds.has(sourceId) || suspiciousSignals.suspiciousNodeIds.has(targetId) ? 2 : 0;
        }}
        linkDirectionalParticleWidth={2.8}
        linkDirectionalParticleColor={() => '#FF5A72'}
        linkDirectionalParticleSpeed={() => 0.008}
        onNodeClick={onNodeClick}
        onNodeHover={handleNodeHover}
        backgroundColor="transparent"
        d3AlphaDecay={0.12}
        d3VelocityDecay={0.45}
        warmupTicks={100}
        cooldownTicks={0}
        enableNodeDrag={false}
      />
    </div>
  );
};

export default NetworkGraph;
