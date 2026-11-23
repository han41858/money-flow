import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import type { Diagram, MoneyNode } from '../../types/diagram';
import { sum, exactAmount } from '../edges/money';
import { kindNames } from '../nodes/presentation';
import { institutions } from '../../lib/brands/registry';
import { OutgoingConnection } from './OutgoingConnection';
import { editor, nodeOfType, type Kind, type Selection } from './store';
import { TextField } from './fields';

function BrandField({ node, diagram }: { node: MoneyNode; diagram: Diagram }) {
  const brands = [...institutions, ...diagram.customInstitutions];
  const brand = brands.find((b) => b.id === node.institutionId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#31816c');
  const [error, setError] = useState('');
  return (
    <>
      <TextField
        key={node.institutionId}
        label="금융사"
        list="institutions"
        placeholder="금융사 이름 검색"
        value={brand?.name ?? ''}
        commit={(value) => {
          const entry = brands.find((b) => b.name === value);
          if (!entry && value)
            return '목록에서 선택하거나 금융사를 등록하세요.';
          editor.editNode({ ...node, institutionId: entry?.id });
        }}
      />
      <datalist id="institutions">
        {brands.map((b) => (
          <option key={b.id} value={b.name} />
        ))}
      </datalist>
      <button className="text-button" onClick={() => setAdding(!adding)}>
        {adding ? '등록 취소' : '+ 금융사 등록'}
      </button>
      {adding && (
        <form
          className="brand-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (editor.addInstitution(node.id, name, color)) {
              setAdding(false);
              setName('');
              setError('');
            } else setError('새 금융사 이름을 입력하세요.');
          }}
        >
          <label className="field">
            새 금융사 이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="field">
            대표 색상
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <button>등록 후 적용</button>
          {error && <small role="alert">{error}</small>}
        </form>
      )}
    </>
  );
}

export function NodeDetails({
  node,
  diagram,
  select,
  error,
  setError,
}: {
  node: MoneyNode;
  diagram: Diagram;
  select: (s: Selection) => void;
  error: string;
  setError: (message: string) => void;
}) {
  const { nodes, edges } = diagram;
  const owners = [...new Set(nodes.map((n) => n.owner).filter(Boolean))];
  return (
    <>
      <TextField
        key={node.name}
        label="이름"
        value={node.name}
        commit={(name) => {
          if (!name) return '이름을 입력하세요.';
          editor.editNode({ ...node, name });
        }}
      />
      <label className="field">
        유형
        <select
          value={node.type}
          onChange={(e) => {
            const next = nodeOfType(e.target.value as Kind, node);
            setError(
              editor.editNode(next)
                ? ''
                : '이 유형과 맞지 않는 연결선을 먼저 삭제하세요.',
            );
          }}
        >
          {Object.entries(kindNames).map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {node.type !== 'expense' && <BrandField node={node} diagram={diagram} />}
      {node.type === 'income' && (
        <TextField
          key={'payer' + node.payer}
          label="지급처"
          value={node.payer ?? ''}
          commit={(payer) => {
            editor.editNode({ ...node, payer: payer || undefined });
          }}
        />
      )}
      {node.type === 'expense' && (
        <label className="field">
          분류
          <select
            value={node.category}
            onChange={(e) =>
              editor.editNode({
                ...node,
                category: e.target.value as typeof node.category,
              })
            }
          >
            <option value="consumption">일반 소비</option>
            <option value="saving">저축·투자</option>
            <option value="loan">대출 상환</option>
          </select>
        </label>
      )}
      <TextField
        key={'owner' + node.owner}
        label="소유자"
        list="owners"
        value={node.owner ?? ''}
        commit={(owner) => {
          editor.editNode({ ...node, owner: owner || undefined });
        }}
      />
      <datalist id="owners">
        {owners.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <OutgoingConnection
        diagram={diagram}
        source={node}
        selectEdge={(id) => select({ nodes: [], groups: [], edges: [id] })}
      />
      <dl>
        <div className="property">
          <dt>소속 그룹</dt>
          <dd>
            {diagram.groups.find((g) => g.id === node.groupId)?.name ?? '없음'}
          </dd>
        </div>
        {(['target', 'source'] as const).map((end) => (
          <div className="property" key={end}>
            <dt>{end === 'target' ? '월 유입' : '월 유출'}</dt>
            <dd>{exactAmount(sum(edges.filter((e) => e[end] === node.id)))}</dd>
          </div>
        ))}
      </dl>
      {edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .map((e) => (
          <button
            key={e.id}
            className="related"
            onClick={() => select({ groups: [], nodes: [], edges: [e.id] })}
          >
            {e.source === node.id ? (
              <ArrowUpRight size={15} />
            ) : (
              <ArrowDownLeft size={15} />
            )}
            {
              nodes.find(
                (n) => n.id === (e.source === node.id ? e.target : e.source),
              )?.name
            }
            <ChevronRight size={13} />
          </button>
        ))}
    </>
  );
}
