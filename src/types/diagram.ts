import { z } from 'zod';

const id = z.string().trim().min(1);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const point = z.object({ x: z.number(), y: z.number() });
const nodeCore = z.object({
  id,
  name: id,
  position: point,
  owner: id.optional(),
  groupId: id.optional(),
  institutionId: id.optional(),
});
export const nodeSchema = z.discriminatedUnion('type', [
  nodeCore.extend({ type: z.literal('income'), payer: id.optional() }),
  nodeCore.extend({ type: z.literal('account'), institutionId: id }),
  nodeCore.extend({ type: z.literal('card'), institutionId: id }),
  nodeCore.extend({
    type: z.literal('expense'),
    category: z.enum(['consumption', 'saving', 'loan']).default('consumption'),
  }),
]);
export type MoneyNode = z.infer<typeof nodeSchema>;
export const edgeSchema = z
  .object({
    id,
    source: id,
    target: id,
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    memo: z.string().optional(),
  })
  .refine((e) => e.min <= e.max, '최소 금액은 최대 금액 이하여야 합니다.');
export type MoneyEdge = z.infer<typeof edgeSchema>;

export const diagramSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    name: id,
    description: z.string().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    groups: z.array(
      z.object({
        id,
        name: id,
        color,
        position: point,
        width: z.number().positive(),
        height: z.number().positive(),
      }),
    ),
    customInstitutions: z.array(z.object({ id, name: id, color })),
    viewport: point.extend({ zoom: z.number().positive() }),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    for (const list of [d.nodes, d.edges, d.groups, d.customInstitutions]) {
      if (new Set(list.map((item) => item.id)).size !== list.length)
        issue('중복된 ID입니다.');
    }
    const groups = new Set(d.groups.map((g) => g.id));
    const nodes = new Map(d.nodes.map((n) => [n.id, n]));
    const pairs = new Set<string>();
    for (const n of d.nodes)
      if (n.groupId && !groups.has(n.groupId))
        issue('존재하지 않는 그룹입니다.');
    for (const e of d.edges) {
      const source = nodes.get(e.source),
        target = nodes.get(e.target);
      const key = JSON.stringify([e.source, e.target]);
      if (
        !source ||
        !target ||
        source === target ||
        source.type === 'expense' ||
        target.type === 'income' ||
        pairs.has(key)
      )
        issue('허용되지 않는 연결입니다.');
      pairs.add(key);
    }
  });
export type Diagram = z.infer<typeof diagramSchema>;
