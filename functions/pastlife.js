const JOBS = [
  { id: 1, title: "서원 유생", one: "목(木)의 기운이 강한 ‘사색형’ 전생" },
  { id: 2, title: "궁중 책사", one: "금(金)의 기운이 강한 ‘분석형’ 전생" },
  { id: 3, title: "기마 장수", one: "화(火)의 기운이 강한 ‘행동형’ 전생" },
  { id: 4, title: "산중 수행자", one: "토(土)의 기운이 강한 ‘내면형’ 전생" },
  { id: 5, title: "약초 의원", one: "목(木)의 기운이 섬세한 ‘치유형’ 전생" },
  { id: 6, title: "비단 상단 행수", one: "금(金)의 기운이 강한 ‘현실형’ 전생" },
  { id: 7, title: "궁중 악사", one: "수(水)의 기운이 강한 ‘감성형’ 전생" },
  { id: 8, title: "암행어사", one: "화(火)의 기운이 곧은 ‘정의형’ 전생" },
  { id: 9, title: "별 관측관", one: "수(水)의 기운이 깊은 ‘관찰형’ 전생" },
  { id: 10, title: "떠돌이 무당", one: "수(水) + 화(火)의 직관이 강한 ‘신비형’ 전생" },
  { id: 11, title: "거리의 거지", one: "토(土)의 내려놓음이 강한 ‘방랑형’ 전생" },
  { id: 12, title: "백정 장인", one: "금(金)의 현실감이 강한 ‘기술형’ 전생" },
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const resultId = url.searchParams.get('result');

  // 원본 HTML 가져오기
  const response = await env.ASSETS.fetch(request);
  
  if (!resultId) return response;

  const picked = JOBS.find(j => j.id == resultId);
  if (!picked) return response;

  const shareTitle = `나의 전생은 [${picked.title}]이었습니다!`;
  const shareDesc = `${picked.one} - 지금 당신의 전생을 확인해보세요.`;
  const shareImage = `https://product-builder-lecture-9n4.pages.dev/og-image.png`; // 나중에 결과별 이미지로 교체 가능

  // HTMLRewriter를 사용하여 메타 태그 교체
  return new HTMLRewriter()
    .on('title', {
      element(el) { el.setInnerContent(`${picked.title} | 전생 직업 감별소`); }
    })
    .on('meta[name="description"]', {
      element(el) { el.setAttribute('content', shareDesc); }
    })
    .on('meta[property="og:title"]', {
      element(el) { el.setAttribute('content', shareTitle); }
    })
    .on('meta[property="og:description"]', {
      element(el) { el.setAttribute('content', shareDesc); }
    })
    .on('meta[property="og:image"]', {
      element(el) { el.setAttribute('content', shareImage); }
    })
    .on('meta[name="twitter:title"]', {
      element(el) { el.setAttribute('content', shareTitle); }
    })
    .on('meta[name="twitter:description"]', {
      element(el) { el.setAttribute('content', shareDesc); }
    })
    .on('meta[name="twitter:image"]', {
      element(el) { el.setAttribute('content', shareImage); }
    })
    .transform(response);
}
