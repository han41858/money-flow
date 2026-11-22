// 출처를 적은 값은 해당 기관이 공개한 자료에서 확인한 대표색이다.
// 나머지는 공식 CI 대조 전의 잠정값이며, 계열사 간 색상이 같다는 뜻은 아니다.
const entries = [
  // 근사값 · 카카오뱅크 발표자료 표지의 노란 배경
  // https://github.com/OpenChain-Project/OpenChain-KWG/releases/download/meeting-slides-2026/30th-session1-ai-driven-oss-governance.pdf
  ['kakao', '카카오뱅크', '#ffe500'],
  ['kb', 'KB국민은행', '#ffbc00'], // 잠정값 · KB금융
  ['shinhan', '신한은행', '#0046ff'], // 잠정값 · 신한금융
  ['hana', '하나은행', '#008485'], // 잠정값 · 하나금융
  ['woori', '우리은행', '#007bc3'], // 잠정값 · 우리금융
  ['nh', 'NH농협은행', '#009a50'], // 잠정값 · NH농협
  ['ibk', 'IBK기업은행', '#005199'], // 잠정값 · IBK기업은행
  ['toss', '토스뱅크', '#3182f6'], // 잠정값 · 토스
  ['kbank', '케이뱅크', '#24358d'], // 잠정값 · 케이뱅크
  ['mirae', '미래에셋증권', '#f58220'], // 잠정값 · 미래에셋
  // 근사값 · 한국투자증권 공식 MCP 앱 아이콘의 파란 배경
  // https://github.com/koreainvestment/koreainvestment-mcp/blob/0d32fcd5e65024376da94860cf3f8f11456afebc/icon.png
  ['korea-invest', '한국투자증권', '#235bec'],
  ['nh-invest', 'NH투자증권', '#005ca9'], // 잠정값 · NH투자증권
  ['samsung-invest', '삼성증권', '#1428a0'], // 잠정값 · 삼성증권
  ['kb-invest', 'KB증권', '#ffbc00'], // 잠정값 · KB금융
  // 근사값 · 키움증권 공식 REST API 아이콘의 자홍색 화살표
  // https://github.com/Kiwoom-Securities/Kiwoom-REST-API/blob/c7a3d25449ed4b4238bef378780c41103c67b9e9/mcp_exec/icon.png
  ['kiwoom', '키움증권', '#d50982'],
  ['toss-invest', '토스증권', '#3182f6'], // 잠정값 · 토스
  ['shinhan-card', '신한카드', '#0046ff'], // 잠정값 · 신한카드
  ['samsung-card', '삼성카드', '#0074c9'], // 잠정값 · 삼성카드
  ['hyundai-card', '현대카드', '#242424'], // 잠정값 · 현대카드
  ['kb-card', 'KB국민카드', '#ffbc00'], // 잠정값 · KB금융
  ['lotte-card', '롯데카드', '#8c744f'], // 잠정값 · 롯데카드
  ['woori-card', '우리카드', '#007bc3'], // 잠정값 · 우리금융
  ['hana-card', '하나카드', '#008485'], // 잠정값 · 하나금융
  ['bc-card', 'BC카드', '#e73540'], // 잠정값 · BC카드
  ['nh-card', 'NH농협카드', '#009a50'], // 잠정값 · NH농협
] as const;
export const institutions = entries.map(([id, name, color]) => ({
  id,
  name,
  color,
}));
