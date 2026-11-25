import { format } from 'prettier';
import formatterOptions from '../../../prettier.config.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBrowserSpec, uiSpecRelevant } from './reproduction.mjs';

const maxBuffer = 8 * 1024 * 1024;
const maxFileBytes = 1024 * 1024;
const toolConfigName = /\.config(?:\.|$)/i;

function outputPage(text, start, span) {
  const lines = text.split('\n');
  const offset = Math.max(0, start - 1);
  const result = lines
    .slice(offset, offset + span)
    .map((line, index) => `${offset + index + 1}: ${line.slice(0, 1500)}`);
  // The next page offset describes the lines actually served, including long minified lines.
  while (result.join('\n').length > 5500) result.pop();
  if (offset + result.length < lines.length)
    result.push(`다음 줄 번호: ${offset + result.length + 1}`);
  return result.join('\n');
}

function isEditable(path) {
  return (
    path.length <= 250 &&
    /^(?:README\.md$|(?:src|docs|tests)\/)/.test(path) &&
    /\.(?:md|tsx?|css)$/.test(path) &&
    path
      .split('/')
      .every(
        (part) =>
          /^[\p{L}\p{N}_.-]+$/u.test(part) &&
          !part.startsWith('.') &&
          part.toLowerCase() !== 'node_modules' &&
          !toolConfigName.test(part),
      )
  );
}

class WorkspaceError extends Error {
  constructor(message) {
    super(message);
    this.diagnostic = message;
  }
}

export class CorrectableEditError extends Error {}

export class EditConflict extends CorrectableEditError {
  constructor(path, index, reason) {
    super(`${path} (${index + 1}번째 편집): ${reason}`);
    this.diagnostic = `${index + 1}번째 편집: ${reason}`;
    this.path = path;
    this.index = index;
    this.reason = reason;
  }
}

export function resolveEdits(edits, { files, read }) {
  const updated = new Map();
  for (const [index, { path, before, after }] of edits.entries()) {
    if (!isEditable(path))
      throw new WorkspaceError(
        '허용 범위 밖의 파일을 편집하려 했습니다. 수동 검토가 필요합니다.',
      );
    const mode = files.get(path);
    const ancestors = path.split('/').slice(0, -1);
    if (
      (mode && mode !== '100644') ||
      ancestors.some((_, i) =>
        files.has(ancestors.slice(0, i + 1).join('/')),
      ) ||
      [...files.keys()].some((file) => file.startsWith(`${path}/`))
    ) {
      throw new WorkspaceError(
        '일반 파일 이외의 경로 또는 기존 폴더를 변경하려 했습니다. 수동 검토가 필요합니다.',
      );
    }
    const current = updated.has(path)
      ? updated.get(path)
      : mode
        ? read(path)
        : null;
    if (before === null) {
      if (current !== null || after === null)
        throw new EditConflict(
          path,
          index,
          '새 파일 편집이 기존 파일 또는 다른 편집과 충돌했습니다.',
        );
      updated.set(path, after);
    } else if (after === null) {
      if (current !== before)
        throw new EditConflict(
          path,
          index,
          '삭제할 파일 내용이 최신 HEAD와 정확히 일치하지 않습니다.',
        );
      updated.set(path, null);
    } else {
      const first = current?.indexOf(before) ?? -1;
      if (!before || first < 0)
        throw new EditConflict(
          path,
          index,
          '편집할 원문을 찾을 수 없습니다. 파일의 실제 내용을 다시 확인하세요.',
        );
      if (current.indexOf(before, first + 1) !== -1)
        throw new EditConflict(
          path,
          index,
          '같은 원문이 여러 곳에 있습니다. 앞뒤 문맥을 포함해 한 곳을 지정하세요.',
        );
      updated.set(
        path,
        current.slice(0, first) + after + current.slice(first + before.length),
      );
    }
    const content = updated.get(path);
    if (
      content !== null &&
      (content.includes('\0') || Buffer.byteLength(content) > maxFileBytes)
    )
      throw new WorkspaceError(
        '편집 결과가 일반 텍스트 파일의 크기 제한을 벗어났습니다.',
      );
  }
  const changes = [...updated].filter(
    ([path, value]) => value !== (files.has(path) ? read(path) : null),
  );
  const finalFiles = new Set(files.keys());
  for (const [path, value] of changes) {
    if (value === null) finalFiles.delete(path);
    else finalFiles.add(path);
  }
  for (const path of finalFiles) {
    const pieces = path.split('/');
    if (
      pieces
        .slice(0, -1)
        .some((_, i) => finalFiles.has(pieces.slice(0, i + 1).join('/')))
    )
      throw new WorkspaceError(
        '여러 편집이 같은 파일과 폴더 경로를 사용합니다. 수동으로 검토하세요.',
      );
  }
  return changes.map(([path, text]) => ({ path, text }));
}

export async function formatChanges(changes, work) {
  const result = [];
  for (const { path, text } of changes) {
    let formatted = null;
    if (text !== null) {
      try {
        formatted = await format(text, { ...formatterOptions, filepath: path });
      } catch (error) {
        if (error.name !== 'SyntaxError') throw error;
        const { line, column } = error.loc?.start ?? {};
        const location = [path, line, column]
          .filter((value) => value != null)
          .join(':');
        const message = `${location} — Prettier가 파일의 문법을 해석하지 못했습니다.`;
        throw Object.assign(new CorrectableEditError(message), {
          diagnostic: message,
        });
      }
    }
    if (formatted !== (work.files.has(path) ? work.read(path) : null))
      result.push({ path, text: formatted });
  }
  return result;
}

function isInspectable(path) {
  return isEditable(path) || path === 'AGENTS.md' || path === 'package.json';
}

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer, timeout: 30_000 });

// No ref points to the candidate. Its tree can be inspected, validated and
// repaired locally, while the real branch retains its last verified HEAD.
export function checkpoint(head, changes) {
  const directory = mkdtempSync(join(tmpdir(), 'money-flow-ai-index-'));
  const run = (args, input) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer,
      timeout: 30_000,
      input,
      env: {
        PATH: process.env.PATH,
        GIT_INDEX_FILE: join(directory, 'index'),
        GIT_AUTHOR_NAME: 'Codex',
        GIT_AUTHOR_EMAIL: 'noreply@openai.com',
        GIT_COMMITTER_NAME: 'Codex',
        GIT_COMMITTER_EMAIL: 'noreply@openai.com',
      },
    }).trim();
  try {
    run(['read-tree', head]);
    const index = changes
      .map(({ path, text }) => {
        if (!isEditable(path))
          throw new WorkspaceError('허용 범위 밖의 파일입니다.');
        const mode = text === null ? '0' : '100644';
        const oid =
          text === null
            ? '0'.repeat(head.length)
            : run(['hash-object', '-w', '--stdin'], text);
        return `${mode} ${oid}\t${path}\0`;
      })
      .join('');
    run(['update-index', '-z', '--index-info'], index);
    const tree = run(['write-tree']);
    return run([
      '-c',
      'commit.gpgSign=false',
      'commit-tree',
      tree,
      '-p',
      head,
      '-m',
      'AI validation candidate',
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function snapshot(base, head) {
  const files = new Map(
    git('ls-tree', '-rz', head)
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const tab = entry.indexOf('\t');
        return [entry.slice(tab + 1), entry.slice(0, 6)];
      }),
  );
  const read = (path) => {
    if (files.get(path) !== '100644')
      throw new WorkspaceError('일반 파일을 찾을 수 없습니다.');
    const text = git('show', `${head}:${path}`);
    if (text.includes('\0') || Buffer.byteLength(text) > maxFileBytes)
      throw new WorkspaceError('텍스트를 읽을 수 없습니다.');
    return text;
  };
  const diff = () =>
    git('diff', '--no-ext-diff', '--no-textconv', base, head, '--');
  const readUiSpecs = new Set();
  return {
    files,
    read,
    existingBranchEdits() {
      return git('diff', '--name-only', '--no-renames', '-z', base, head)
        .split('\0')
        .filter(isEditable)
        .map((path) => ({ path, text: files.has(path) ? read(path) : null }));
    },
    needsUiSpec(paths, declaredSpecs = []) {
      const changed =
        paths ??
        git('diff', '--name-only', '--no-renames', '-z', base, head).split(
          '\0',
        );
      if (!declaredSpecs.length && !changed.some(uiSpecRelevant)) return false;
      const relevant = declaredSpecs.length
        ? declaredSpecs.map(({ file }) => file)
        : changed.filter(isBrowserSpec);
      const existing = relevant.filter((path) => files.has(path));
      if (existing.length)
        return !existing.some((path) => readUiSpecs.has(path));
      // A proposed new test is validated by replaying it against the old code.
      return !(relevant.length && paths) && readUiSpecs.size === 0;
    },
    inspect(name, input) {
      if (name === 'read_diff') return outputPage(diff(), input.line, 120);
      if (name === 'read_file' || name === 'find_in_file') {
        if (!isInspectable(input.path))
          return '허용된 소스 및 문서 범위 밖의 경로입니다.';
        const source = read(input.path);
        if (name === 'find_in_file') {
          if (!input.text.trim())
            return '비어 있지 않은 검색 문자열을 입력하세요.';
          const hits = [];
          for (const [index, line] of source.split('\n').entries()) {
            if (line.includes(input.text))
              hits.push(`${index + 1}: ${line.trim().slice(0, 220)}`);
            if (hits.length === 16) break;
          }
          return hits.join('\n') || '일치하는 줄이 없습니다.';
        }
        const page = outputPage(source, input.line, 120);
        if (isBrowserSpec(input.path) && /^\d+: [^\n]*\S/m.test(page))
          readUiSpecs.add(input.path);
        return page;
      }
      const paths = [...files.keys()].filter(
        (path) =>
          isInspectable(path) &&
          path.toLowerCase().includes(input.query.toLowerCase()),
      );
      const offset = Math.max(0, input.offset);
      const page = paths.slice(offset, offset + 80);
      if (offset + page.length < paths.length)
        page.push(`다음 offset: ${offset + page.length}`);
      return page.join('\n');
    },
  };
}
