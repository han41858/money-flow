import {
  ArrowDownLeft,
  Landmark,
  CreditCard,
  ReceiptText,
  Sprout,
  Coins,
} from 'lucide-react';
import { institutions } from '../../lib/brands/registry';
import type { Diagram, MoneyNode } from '../../types/diagram';

export const kindNames = {
  income: '수입',
  account: '계좌',
  card: '카드',
  expense: '지출',
};
export const kindIcons = {
  income: ArrowDownLeft,
  account: Landmark,
  card: CreditCard,
  expense: ReceiptText,
};
const categoryNames = {
  consumption: '일반 소비',
  saving: '저축·투자',
  loan: '대출 상환',
};
export function describe(node: MoneyNode, diagram: Diagram) {
  const brand =
    diagram.customInstitutions.find((b) => b.id === node.institutionId) ??
    institutions.find((b) => b.id === node.institutionId);
  const category = node.type === 'expense' ? node.category : undefined;
  const subtitle =
    brand?.name ??
    (category
      ? categoryNames[category]
      : node.type === 'income'
        ? (node.payer ?? '월 급여')
        : kindNames[node.type]);
  const color =
    brand?.color ??
    (node.type === 'income'
      ? '#31816c'
      : category === 'saving'
        ? '#638454'
        : '#727987');
  const Icon =
    category === 'saving'
      ? Sprout
      : category === 'loan'
        ? Coins
        : kindIcons[node.type];
  return { kind: kindNames[node.type], subtitle, color, Icon };
}
