import { ArrowDownLeft, Landmark, CreditCard, ReceiptText } from 'lucide-react';
import { tint } from '../../lib/brands/palette';
import { institutions } from '../../lib/brands/registry';
import type { Diagram, MoneyNode } from '../../types/diagram';

export const kindNames = {
  income: '수입',
  account: '계좌',
  card: '카드',
  expense: '지출',
};
export function newNodeName(type: MoneyNode['type']) {
  return '새 ' + kindNames[type];
}

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
  const institutionId =
    node.type === 'expense' ? undefined : node.institutionId;
  const customBrand = diagram.customInstitutions.find(
    (brand) => brand.id === institutionId,
  );
  const builtInBrand = customBrand
    ? undefined
    : institutions.find((brand) => brand.id === institutionId);
  const brand = customBrand ?? builtInBrand;
  const category = node.type === 'expense' ? node.category : undefined;
  const subtitle =
    brand?.name ??
    (category
      ? categoryNames[category]
      : node.type === 'income'
        ? (node.payer ?? '월 급여')
        : '금융사 미지정');
  const color =
    brand?.color ??
    (node.type === 'income'
      ? '#31816c'
      : category === 'saving'
        ? '#638454'
        : '#727987');
  return {
    kind: kindNames[node.type],
    subtitle,
    color,
    cardFill: builtInBrand?.cardFill ?? tint(color, 0.18),
    Icon: kindIcons[node.type],
  };
}
