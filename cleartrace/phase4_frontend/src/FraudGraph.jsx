import { useEffect, useRef } from "react";
import * as d3 from "d3";

const COLORS = {
  claimant: "#7c3aed",
  provider: "#15803d",
  garage: "#ea580c",
};

export default function FraudGraph({ graphData }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !graphData.nodes.length) {
      return;
    }

    console.log("[Frontend] Rendering D3 fraud graph");
    const width = containerRef.current.clientWidth || 900;
    const height = 560;
    const nodes = graphData.nodes.map((node) => ({ ...node }));
    const links = graphData.links.map((link) => ({ ...link }));

    const svg = d3.select(containerRef.current).html("").append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#fffaf5");

    const link = svg
      .append("g")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-opacity", 0.45)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d) => (d.fraud_label ? 2.4 : 1.1))
      .attr("stroke", (d) => (d.fraud_label ? "#dc2626" : "#cbd5e1"));

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => 7 + d.fraud_score * 8)
      .attr("fill", (d) => COLORS[d.type] || "#475569")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.4)
      .call(
        d3.drag()
          .on("start", dragStarted)
          .on("drag", dragged)
          .on("end", dragEnded)
      );

    node.append("title").text((d) => `${d.label} (${d.type})`);

    const label = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.label)
      .attr("font-size", 10)
      .attr("fill", "#3f2d20");

    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(48))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => 12 + d.fraud_score * 10))
      .on("tick", ticked);

    function ticked() {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x + 10).attr("y", (d) => d.y + 4);
    }

    function dragStarted(event) {
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragEnded(event) {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [graphData]);

  return <div ref={containerRef} className="graph-canvas" />;
}
