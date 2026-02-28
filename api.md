# OpenAI GPT → Google Gemini API 전환 문서

## 개요

Justice 프로젝트의 AI API를 **OpenAI GPT-4o-mini**에서 **Google Gemini (gemini-3-flash-preview)**로 전환한 과정을 기록합니다.

---

## 변경 대조표

| 항목 | 기존 (OpenAI) | 변경 (Gemini) |
|------|--------------|---------------|
| **모델** | `gpt-4o-mini` | `gemini-3-flash-preview` |
| **엔드포인트 (일반)** | `api.openai.com/v1/chat/completions` | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| **엔드포인트 (스트리밍)** | 동일 URL + `stream: true` | `.../{model}:streamGenerateContent?alt=sse` |
| **인증** | `Authorization: Bearer {key}` | URL 파라미터 `?key={API_KEY}` |
| **요청 형식** | `messages: [{role, content}]` | `systemInstruction` + `contents: [{parts: [{text}]}]` |
| **JSON 모드** | `response_format: {type: "json_object"}` | `generationConfig: {responseMimeType: "application/json"}` |
| **스트리밍 응답 파싱** | `data.choices[0].delta.content` | `data.candidates[0].content.parts[0].text` |

---

## 변경된 파일

### 1. `index.html`

API 키 입력 UI의 라벨과 ID를 변경했습니다.

```diff
- <label for="chatgpt-api-key">ChatGPT API Key (법정 심문용)</label>
- <input type="password" id="chatgpt-api-key" ...
+ <label for="gemini-api-key">Gemini API Key (법정 심문용)</label>
+ <input type="password" id="gemini-api-key" ...
```

### 2. `app.js` — 3개 함수 수정

#### `fetchRealAiAnalysis()` — 판결 분석 (비스트리밍)

```diff
- // OpenAI
- fetch('https://api.openai.com/v1/chat/completions', {
-     headers: { 'Authorization': `Bearer ${apiKey}` },
-     body: JSON.stringify({
-         model: 'gpt-4o-mini',
-         messages: [{ role: 'system', content: systemPrompt }],
-         response_format: { type: "json_object" }
-     })
- });
- const resultString = data.choices[0].message.content;

+ // Gemini
+ fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
+     headers: { 'Content-Type': 'application/json' },
+     body: JSON.stringify({
+         systemInstruction: { parts: [{ text: systemPrompt }] },
+         contents: [{ parts: [{ text: "분석 요청" }] }],
+         generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
+     })
+ });
+ const resultString = data.candidates[0].content.parts[0].text;
```

#### `fetchInitialStatement()` / `fetchAiResponse()` — 심문 채팅 (스트리밍)

```diff
- // OpenAI 스트리밍
- fetch('https://api.openai.com/v1/chat/completions', {
-     headers: { 'Authorization': `Bearer ${apiKey}` },
-     body: JSON.stringify({
-         model: 'gpt-4o-mini',
-         messages: [{ role: 'system', content: systemPrompt }],
-         stream: true
-     })
- });
- // 파싱: data.choices[0].delta.content

+ // Gemini 스트리밍 (SSE)
+ fetch(`https://...gemini-3-flash-preview:streamGenerateContent?alt=sse&key=${apiKey}`, {
+     headers: { 'Content-Type': 'application/json' },
+     body: JSON.stringify({
+         systemInstruction: { parts: [{ text: systemPrompt }] },
+         contents: [{ parts: [{ text: userMessage }] }],
+         generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
+     })
+ });
+ // 파싱: data.candidates[0].content.parts.map(p => p.text).join('')
```

---

## API 키 발급 방법

1. [Google AI Studio](https://aistudio.google.com/) 접속
2. 좌측 메뉴 → **Get API Key** 클릭
3. 키 생성 후 복사 (`AIzaSy...` 형식)
4. `index.html`의 `value` 속성에 붙여넣기 또는 UI에서 직접 입력

---

## 주요 차이점 정리

### 요청 구조

```javascript
// OpenAI
{
    model: "gpt-4o-mini",
    messages: [
        { role: "system", content: "시스템 프롬프트" },
        { role: "user", content: "유저 메시지" }
    ]
}

// Gemini
{
    systemInstruction: { parts: [{ text: "시스템 프롬프트" }] },
    contents: [{ parts: [{ text: "유저 메시지" }] }]
}
```

### 스트리밍 SSE 청크 구조

```javascript
// OpenAI SSE 청크
{ choices: [{ delta: { content: "텍스트 조각" } }] }

// Gemini SSE 청크
{ candidates: [{ content: { parts: [{ text: "텍스트 조각" }] } }] }
```

두 API 모두 `data: ` 접두사의 SSE 형식을 사용하므로, 파싱 루프 구조는 동일하고 **데이터 접근 경로만 다릅니다.**
