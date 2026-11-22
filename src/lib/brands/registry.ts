// 공식 CI 값, 공식 디지털 자료에서 고른 근사값, 색상값이 미확인된 잠정값을 구분한다.
// 네 번째 값은 공식 기본색과 별도로 지정하는 카드 배경색이다.
const entries = [
  // 공식 브랜드 가이드 · Yellow
  // https://www.kakaobank.com/view/about/brand/resource
  ['kakao', '카카오뱅크', '#ffe300', '#ebc638'],
  // 잠정값 · KB금융그룹 공식 CI의 색상표는 이미지로 제공
  // https://www.kbfg.com/kor/about/corporate/ci.htm
  ['kb', 'KB국민은행', '#ffbc00'],
  // 공식 그룹 CI · Shinhan Blue
  // https://shinhangroup.com/kr/about/identity/ci
  ['shinhan', '신한은행', '#0046ff'],
  // 잠정값 · 하나금융그룹 공식 CI에서 디지털 색상값 미확인
  // https://www.hanafn.com/hfm/mnu/aboutus/hanaFnCi.do
  ['hana', '하나은행', '#008485'],
  // 공식 CI · 로고타입 Woori Deep Blue
  // https://spot.wooribank.com/pot/Dream?withyou=BPBKI0056
  ['woori', '우리은행', '#0067ac'],
  // 잠정값 · 농협 공식 CI에서 은행의 디지털 색상값 미확인
  // https://www.nonghyup.com/introduce/ci/cb.do
  ['nh', 'NH농협은행', '#009a50'],
  // 잠정값 · 공식 CI에서 주색 Blue는 확인, 디지털 색상값 미확인
  // https://global.ibk.co.kr/en/company/CI
  ['ibk', 'IBK기업은행', '#005199'],
  // 공식 그룹 브랜드 가이드 · Toss Blue, 계열사 로고에 공통 적용
  // https://brand.toss.im/
  ['toss', '토스뱅크', '#0064ff'],
  // 근사값 · 케이뱅크가 공개한 앱 그래픽 시스템의 코발트 블루
  // https://blog.kbanknow.com/kbank-brand-graphic-generator/
  ['kbank', '케이뱅크', '#2f4ce8'],
  // 공식 CI 가이드 · Mirae Asset Orange
  // https://securities.miraeasset.com/newir/view/pc/en/ciguide.jsp
  ['mirae', '미래에셋증권', '#f58220'],
  // 근사값 · 한국투자증권 공식 MCP 앱 아이콘의 파란 배경
  // https://github.com/koreainvestment/koreainvestment-mcp/blob/0d32fcd5e65024376da94860cf3f8f11456afebc/icon.png
  ['korea-invest', '한국투자증권', '#235bec'],
  // 잠정값 · NH투자증권 공식 CI의 전용색상표는 이미지로 제공
  // https://m.nhsec.com/static/MNHSI0262
  ['nh-invest', 'NH투자증권', '#005ca9'],
  // 잠정값 · 삼성증권 공식 브랜드 페이지의 디지털 색상값 미확인
  // https://samsungsecurities.com/eng/company/brand.do
  ['samsung-invest', '삼성증권', '#1428a0'],
  // 잠정값 · KB금융그룹 CI 참고, 증권사 전용 디지털 색상값 미확인
  // https://www.kbfg.com/kor/about/corporate/ci.htm
  ['kb-invest', 'KB증권', '#ffbc00'],
  // 근사값 · 키움증권 공식 REST API 아이콘의 자홍색 화살표
  // https://github.com/Kiwoom-Securities/Kiwoom-REST-API/blob/c7a3d25449ed4b4238bef378780c41103c67b9e9/mcp_exec/icon.png
  ['kiwoom', '키움증권', '#d50982'],
  // 공식 그룹 브랜드 가이드 · Toss Blue, 계열사 로고에 공통 적용
  // https://brand.toss.im/
  ['toss-invest', '토스증권', '#0064ff'],
  // 공식 그룹 CI · Shinhan Blue. 카드사 CI는 그룹과 같은 심볼을 사용
  // https://shinhangroup.com/kr/about/identity/ci
  // https://www.shinhancard.com/pconts/company/html/promotion/CI/ci_basic.html
  ['shinhan-card', '신한카드', '#0046ff'],
  // 잠정값 · 삼성카드 공식 사이트의 디지털 CI 색상값 미확인
  // https://www.samsungcard.com/
  ['samsung-card', '삼성카드', '#0074c9'],
  // 잠정값 · 현대카드 공식 CI 페이지의 디지털 색상값 미확인
  // https://www.hyundaicard.com/IR/m/include/en/ceabi0501_01_cms01.html
  ['hyundai-card', '현대카드', '#242424'],
  // 공식 CI · KB Yellow
  // https://card.kbcard.com/SVC/DVIEW/HSJMCXCROCIC0025
  ['kb-card', 'KB국민카드', '#ffbc00'],
  // 공식 CI · LOCA Black
  // https://www.lottecard.co.kr/app/LPCOIAF_V100.lc
  ['lotte-card', '롯데카드', '#2c2a26'],
  // 잠정값 · 우리카드 공식 CI의 색상표는 이미지로 제공
  // https://m.wooricard.com/dcmw/yh1/cid/cid04/ciintro/M1CID201S40.do
  ['woori-card', '우리카드', '#007bc3'],
  // 잠정값 · 하나금융그룹 CI 참고, 카드사 전용 디지털 색상값 미확인
  // https://www.hanafn.com/hfm/mnu/aboutus/hanaFnCi.do
  ['hana-card', '하나카드', '#008485'],
  // 잠정값 · 공식 CI의 BC Red 색상표는 이미지로 제공
  // https://www.bccard.com/app/card/html/company/cyber/ci/color/color.jsp
  ['bc-card', 'BC카드', '#e73540'],
  // 잠정값 · 농협 공식 CI 참고, 카드사 전용 디지털 색상값 미확인
  // https://www.nonghyup.com/introduce/ci/cb.do
  ['nh-card', 'NH농협카드', '#009a50'],
] as const;
export const institutions = entries.map(([id, name, color, cardFill]) => ({
  id,
  name,
  color,
  cardFill,
}));
