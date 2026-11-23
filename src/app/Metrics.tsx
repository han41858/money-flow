import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Sprout,
  type LucideIcon,
} from 'lucide-react';
import type { Diagram } from '../types/diagram';
import { amountLabel, sum } from '../features/edges/money';

function Summary({
  icon: Icon,
  label,
  value,
  theme,
}: {
  icon: LucideIcon;
  label: string;
  value: { min: number; max: number };
  theme: string;
}) {
  return (
    <div className={'metric ' + theme}>
      <span className="metric-icon">
        <Icon size={21} />
      </span>
      <div>
        <span>{label}</span>
        <strong>
          {amountLabel(value.min, value.max)}
          <small>원</small>
        </strong>
      </div>
    </div>
  );
}

export function Metrics({ diagram }: { diagram: Diagram }) {
  const { nodes, edges } = diagram;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function expense(category: 'consumption' | 'saving' | 'loan') {
    return sum(
      edges.filter((e) => {
        const n = byId.get(e.target);
        return n?.type === 'expense' && n.category === category;
      }),
    );
  }

  return (
    <div className="metrics">
      <Summary
        icon={ArrowDownLeft}
        theme="income"
        label="월 수입"
        value={sum(edges.filter((e) => byId.get(e.source)?.type === 'income'))}
      />
      <Summary
        icon={ArrowUpRight}
        theme="spend"
        label="월 소비 지출"
        value={expense('consumption')}
      />
      <Summary
        icon={Sprout}
        theme="save"
        label="월 저축·투자"
        value={expense('saving')}
      />
      {nodes.some((n) => n.type === 'expense' && n.category === 'loan') && (
        <Summary
          icon={Coins}
          theme="loan"
          label="월 대출 상환"
          value={expense('loan')}
        />
      )}
    </div>
  );
}
