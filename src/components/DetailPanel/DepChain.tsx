import type { ErrorEntry } from "../../types";
import { esc } from "../../utils/badges";

interface DepChainProps {
  error: ErrorEntry | null;
}

export default function DepChain({ error: e }: DepChainProps) {
  if (!e) {
    return (
      <div className="detail-section" id="depChain">
        <h3>Dependency Chain</h3>
        <div id="depChainContent" style={{ color: "var(--text-dim)", fontSize: 13 }}>
          No chain to display
        </div>
      </div>
    );
  }

  const chain = e.dependency_chain || [];

  if (chain.length === 0) {
    return (
      <div className="detail-section" id="depChain">
        <h3>Dependency Chain</h3>
        <div id="depChainContent" style={{ fontSize: 12, color: "var(--text-dim)" }}>
          No dependency chain available
        </div>
      </div>
    );
  }

  return (
    <div className="detail-section" id="depChain">
      <h3>Dependency Chain</h3>
      <div id="depChainContent">
        {chain.map((node, i) => {
          const isRoot = i === 0;
          const isCur = node === e.full_address;
          const cls = isRoot ? "root" : isCur ? "current" : "";
          return (
            <div key={`${node}-${i}`}>
              <div className={`chain-node ${cls}`}>
                {isRoot && "\u26A0 "}
                {esc(node)}
                {isRoot && (
                  <span style={{ color: "var(--error-red)", marginLeft: "auto", fontSize: 10 }}>ROOT</span>
                )}
                {isCur && (
                  <span style={{ color: "var(--accent)", marginLeft: "auto", fontSize: 10 }}>CURRENT</span>
                )}
              </div>
              {i < chain.length - 1 && <div className="chain-arrow">&#x2193;</div>}
            </div>
          );
        })}
        {e.downstream_impact && e.downstream_impact.length > 0 && (
          <>
            <div className="chain-arrow">&#x2193;</div>
            <div className="chain-node" style={{ borderLeftColor: "var(--warn-amber)" }}>
              {e.downstream_impact.length} more cells affected...
            </div>
          </>
        )}
      </div>
    </div>
  );
}
