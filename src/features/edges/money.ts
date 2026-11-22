import { scaleSymlog } from 'd3-scale';
import type { MoneyEdge } from '../../types/diagram';

const thickness = scaleSymlog()
  .constant(100000)
  .domain([0, 10000000])
  .range([2, 24])
  .clamp(true);
export const edgeWidth = ({ min, max }: Pick<MoneyEdge, 'min' | 'max'>) =>
  thickness((min + max) / 2);
const comma = new Intl.NumberFormat('ko-KR');

export function exactAmount({ min, max }: Pick<MoneyEdge, 'min' | 'max'>) {
  const low = comma.format(min) + '원';
  return min === max ? low : low + ' ~ ' + comma.format(max) + '원';
}

export function amountLabel(min: number, max = min): string {
  if (min !== max && max >= 100000000)
    return amountLabel(min) + '~' + amountLabel(max);
  if (min !== max) {
    return min % 10000 === 0 && max % 10000 === 0
      ? comma.format(min / 10000) + '~' + comma.format(max / 10000) + '만'
      : comma.format(min) + '~' + comma.format(max);
  }
  if (!min || min % 10000 !== 0) return comma.format(min);
  const eok = Math.floor(min / 100000000);
  const man = (min % 100000000) / 10000;
  return [eok && comma.format(eok) + '억', man && comma.format(man) + '만']
    .filter(Boolean)
    .join(' ');
}

export function sum(edges: MoneyEdge[]) {
  return edges.reduce(
    (total, e) => ({ min: total.min + e.min, max: total.max + e.max }),
    { min: 0, max: 0 },
  );
}
