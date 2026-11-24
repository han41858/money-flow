# 이슈 기반 AI 개발

Money Flow의 [AI development 워크플로](../.github/workflows/ai-development.yml)는 기본 브랜치인 `dev`에서 실행됩니다. 개발과 리뷰 단계는 [ai-native의 자동화 지침](https://github.com/han41858/ai-native/blob/16eb8b0655251017a04e0bdc7f8ab5b2afee930d/docs/ai-automation.md)을 따르며, 모델 호출과 편집 검증 모듈은 [Agentopia](https://github.com/han41858/agentopia/tree/39013e0358ab41419c96836cff0eb341aa10f77b/.github/scripts/ai-development)에서 가져와 프로젝트에 맞게 조정했습니다. Videx와 Commit Trail의 이슈 승인, 격리 검사, 상태 관리 방식도 참고했습니다.

## 활성화

1. 워크플로 PR을 `dev`에 머지합니다.
2. 저장소의 **Settings → Environments**에서 `ai-development`를 만들고 **Deployment branches and tags → Selected branches and tags**로 설정합니다. 허용 규칙에는 `dev` 브랜치 한 개만 등록합니다.
3. 해당 Environment에 비밀과 변수를 설정합니다.

   | 종류     | 이름                  | 용도                                                                                                                             |
   | -------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
   | Secret   | `OPENAI_API_KEY`      | Codex 모델의 Responses API                                                                                                       |
   | Secret   | `ANTHROPIC_API_KEY`   | Claude 모델의 Messages API                                                                                                       |
   | Secret   | `AI_AUTOMATION_TOKEN` | 이 저장소에만 접근하는 GitHub App 또는 fine-grained PAT. Contents, Pull requests 쓰기 권한으로 브랜치·커밋·초안 PR을 게시합니다. |
   | Variable | `AI_CODEX_MODEL`      | OpenAI 계정에서 사용할 수 있는 Codex 모델 ID                                                                                     |
   | Variable | `AI_CLAUDE_MODEL`     | Anthropic 계정에서 사용할 수 있는 Claude 모델 ID                                                                                 |

   `AI_AUTOMATION_TOKEN`은 후속 `pull_request` CI 이벤트가 발생하는 자격 증명이어야 합니다. 실행 기록과 리뷰 댓글, 준비 완료 전환, 머지, 이슈 종료에는 각 job의 권한으로 제한한 `GITHUB_TOKEN`을 사용합니다.

4. **Settings → Rules → Rulesets → dev**에서 필수 검사 `verify`와 **Require branches to be up to date before merging**을 활성화합니다. 저장소의 [dev 룰셋 정의](../.github/rulesets/dev.json)와 일치해야 합니다. 그래야 머지 직전 다른 PR이 반영돼도 GitHub가 이전 기준의 CI로 머지하는 것을 막습니다. Environment와 룰셋 설정은 워크플로에서 다시 확인합니다.

## 사용

- 작업과 완료 조건이 적힌 이슈에 저장소 쓰기 권한이 있는 사람이 `ai:develop` 라벨을 붙입니다. 라벨은 자동 개발, `dev` squash merge 및 이슈 종료의 승인입니다. 하나의 이슈에 하나의 작업 브랜치와 초안 PR을 사용합니다. 중단하려면 승인 라벨을 제거하거나 `ai:stop`을 붙입니다.
- Codex가 `src/`, `tests/`, `docs/`, `README.md`의 허용된 텍스트 파일을 수정합니다. 숨김 경로와 도구 설정 파일은 자동 편집에서 제외합니다. 워크플로, 자동화, 의존성 및 도구 설정 변경은 수동 PR로 진행합니다. 파일에 적용한 변경은 자격 증명과 네트워크를 제공하지 않는 Docker에서 포맷, 타입, 린트, 단위 테스트, 빌드, Chromium 검사를 통과한 뒤 게시합니다.
- Claude가 같은 HEAD의 변경과 관련 테스트를 독립 검토합니다. 수정 요청은 Codex가 같은 PR에서 최대 두 번 보완합니다. 승인된 현재 HEAD의 `verify`가 성공하고 승인, 브랜치, PR이 유효하면 `dev`에 squash merge합니다. 머지 커밋이 `dev`에 들어갔고 이슈가 완료 상태인지 각각 확인합니다.
- 작업 기록이 있는 이슈에 승인 라벨을 다시 붙이면 Actions 로그에 기존 상태를 표시하고 중복 실행을 건너뜁니다. 모델을 호출하기 전 준비 단계에서 실패했고 작업 브랜치가 없다면, 변경하지 않은 이슈에 승인 라벨을 다시 붙여 한 번 재개할 수 있습니다. 첫 후보가 격리 검사에서 실패했고 브랜치를 게시하지 않았다면 같은 방식으로 검사 실패를 한 번 재개할 수 있습니다. 실패한 검사 단계는 이슈에 기록합니다. 판별 가능한 검사 오류는 진단을 Codex에 전달해 같은 실행에서 한 번 보완하며, 전체 개발 횟수 한도를 공유합니다. GitHub 읽기 요청의 일시적 전송 실패는 제한적으로 다시 시도합니다. CI 대기가 시간 한도에 도달하거나 종료 요청이 중단되면 Actions에서 `dev`의 **AI development**를 이슈 번호로 수동 실행해 검증·종료 단계만 재개할 수 있습니다. CI가 실패하면 로그를 확인하고 동일 HEAD의 검사를 다시 실행할 수 있습니다. 기준·이슈 범위·작업 HEAD가 바뀌거나 리뷰 보완 한도에 도달하면 이슈와 PR에서 수동으로 이어갑니다.
- 이슈 댓글은 작업 중, 리뷰 중, CI 대기·실패, 사람 확인, 머지됨, 완료 상태를 표시합니다. 진행 상태는 실행마다 댓글 하나를 수정하며 진행 기록을 누적하고, 사람 확인·실패·CI 실패·완료처럼 실행이 멈추거나 끝나는 상태는 새 댓글로 남깁니다. Claude 댓글에는 검토 커밋과 지적 사항을 기록합니다. Actions 로그는 모델 호출 시간·사용량과 검사 단계를 표시합니다. 기존 Vercel `preview` 라벨 정책과 `main` 승격 절차를 따릅니다.

개발 및 리뷰는 각각 최대 15 모델 턴을 사용하고, 모델 요청 한 건은 최대 3분입니다. 개발 job은 65분, 완료 job은 23분으로 제한됩니다. 의존 이슈 큐, 자동 기준 복구·충돌 해소, CI 실패 자동 수정은 초기 범위에서 제외합니다. 새 기준이나 CI 실패에 대한 수정이 필요한 경우 사람이 이어갑니다. 실제 운영 전에는 토큰과 Environment를 설정한 뒤 작은 이슈로 모델 호출부터 이슈 종료까지 확인하세요.
