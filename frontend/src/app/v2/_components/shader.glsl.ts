/**
 * 히어로 배경 셰이더 (GLSL ES 3.00).
 *
 * 의도는 "추첨장의 밤" — 어둠 위로 아주 느리게 흐르는 빛의 결. 형태를 알아볼 수 있는
 * 그림이 아니라 **바탕의 질감**이어야 한다. 격자가 이 화면의 주인공이므로 배경이
 * 시선을 끌면 실패다.
 *
 * ── 성능 예산 ────────────────────────────────────────────────
 * 저가 안드로이드 기준 1.5ms/frame 을 넘기지 않도록 다음을 지켰다.
 *   - value noise 3옥타브까지만. 레이마칭·SDF·조건 분기 없음
 *   - pow / exp 사용 안 함. smoothstep 과 mix 로만 계조를 만든다
 *   - 텍스처 없음. 유니폼 3개
 * 렌더 스케일(0.6~0.75)과 dpr 상한은 컴포넌트 쪽에서 건다.
 *
 * ⚠ `precision highp float` 가 필요하다. hash 가 sin 의 큰 곱을 쓰기 때문에 mediump
 *   에서는 눈에 보이는 밴딩이 생긴다. highp fragment 를 지원하지 않는 기기는
 *   컴포넌트의 폴백(CSS 그라디언트) 경로로 빠진다.
 */

/**
 * 정점 셰이더 — 버퍼가 없다.
 *
 * `gl_VertexID` 로 화면을 덮는 삼각형 하나를 만든다. VBO/VAO 셋업 코드가 통째로
 * 사라지고, 드로우콜은 `drawArrays(TRIANGLES, 0, 3)` 한 줄이 된다.
 * (사각형 두 개가 아니라 삼각형 하나인 이유: 대각선 경계에서 픽셀이 두 번 셰이딩되는
 *  낭비가 없다.)
 */
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAG_SRC = `#version 300 es
precision highp float;

uniform float u_time;   // 초 단위 누적 시간(벽시계가 아니다)
uniform vec2  u_res;    // 드로잉 버퍼 크기(px)
uniform float u_seed;   // 회차마다 결을 조금씩 다르게

out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// 격자 보간 value noise. smoothstep 으로 셀 경계를 부드럽게 만든다.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 3옥타브. 더 쌓아도 이 밝기 대역에서는 눈에 띄지 않는다.
float fbm(vec2 p) {
  float v = 0.0;
  v += 0.50 * vnoise(p);
  v += 0.25 * vnoise(p * 2.03 + 11.7);
  v += 0.125 * vnoise(p * 4.11 + 27.3);
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // 종횡비 보정. 이걸 빼면 가로로 늘어난 화면에서 결이 뭉개진다.
  vec2 p = vec2(uv.x * (u_res.x / max(u_res.y, 1.0)), uv.y);

  float t = u_time * 0.035 + u_seed;

  // 서로 다른 속도의 두 층이 겹치며 반복 주기를 감춘다.
  float n1 = fbm(p * 1.55 + vec2(t, -t * 0.55));
  float n2 = fbm(p * 0.85 - vec2(t * 0.62, t * 0.2));
  float n = n1 * 0.65 + n2 * 0.35;

  // 아주 느린 광원 스윕 두 개. 위치가 정확히 반복되지 않도록 주기를 어긋나게 뒀다.
  vec2 l1 = vec2(0.28 + 0.16 * sin(t * 1.10), 0.72 + 0.10 * cos(t * 0.83));
  vec2 l2 = vec2(0.78 + 0.13 * cos(t * 0.71), 0.34 + 0.12 * sin(t * 1.31));
  float g1 = smoothstep(0.85, 0.0, distance(p, l1));
  float g2 = smoothstep(0.95, 0.0, distance(p, l2));

  // 팔레트 — tokens.css 의 --hb-canvas / --hb-accent 계열과 같은 대역이다.
  vec3 base   = vec3(0.027, 0.035, 0.067);
  vec3 indigo = vec3(0.180, 0.205, 0.520);
  vec3 violet = vec3(0.330, 0.190, 0.520);

  vec3 col = base;
  col = mix(col, indigo, n * 0.85);
  col = mix(col, violet, g1 * 0.45);
  col = mix(col, indigo, g2 * 0.35);

  // 결 위에 얇은 필라멘트를 얹어 밋밋함을 깬다. 아주 약하게만.
  float filament = smoothstep(0.62, 0.68, n1);
  col += filament * 0.06;

  // 가장자리로 갈수록 사라져 아래 섹션과 이어진다. 캔버스는 알파 합성된다.
  float vig = smoothstep(1.15, 0.25, length(uv - 0.5));
  float fade = smoothstep(0.0, 0.35, uv.y);  // 하단은 완전히 비운다
  float alpha = vig * fade * 0.92;

  outColor = vec4(col, alpha);
}`
