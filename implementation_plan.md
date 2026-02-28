# localStorage 기반 판결 학습 시스템 구현 계획

유저 판결 결과와 설문조사 데이터를 `localStorage`에 축적하고, **100건 이상** 쌓이면 AI 분석 프롬프트에 통계를 주입하여 학습 효과를 만드는 기능을 구현합니다.

---

## 📊 저장소 성능 분석

| 항목 | 분석 |
|------|------|
| **레코드 크기** | 1건 ≈ 300~500 bytes (JSON) |
| **100건** | ≈ 50KB — `localStorage` 용량(5~10MB)의 0.5~1% |
| **1,000건** | ≈ 500KB — 여전히 여유 |
| **JSON.parse 속도** | 100건: < 1ms, 1,000건: < 5ms |
| **성능 영향** | ❌ **유의미한 성능 저하 없음** |

> ✅ `localStorage`는 이 규모에서 성능 저하가 전혀 없으므로, 가장 간단한 방법으로 적합합니다.

---

## 🏗️ 구현 내용

### 변경 파일: `app.js`

### 1. 데이터 저장/조회 유틸 함수 추가

파일 상단 (`DOMContentLoaded` 콜백 내부)에 아래 함수들을 추가합니다.

```javascript
// --- 판결 데이터 저장/조회 (localStorage) ---
const STORAGE_KEY = 'justice_verdicts';
const LEARNING_THRESHOLD = 100; // 100건 이상일 때 학습 데이터 활용

function saveVerdict(data) { ... }           // localStorage에 판결+설문 저장
function getVerdictsByCaseId(caseId) { ... } // 사건별 과거 데이터 조회
function computeStats(verdicts) { ... }      // 통계 계산 (유죄율, 평균 형량 등)
function buildLearningContext(caseId) { ... } // 프롬프트용 컨텍스트 문자열 생성
```

---

### 2. `renderResults()` 수정 — 결과 표시 후 자동 저장

현재는 결과를 화면에 렌더링만 하고 끝나지만, 렌더링 직후 판결 데이터를 localStorage에 저장하는 로직을 추가합니다.

```diff
 function renderResults() {
     // ... 기존 렌더링 로직 ...
+
+    // 판결 데이터 자동 저장
+    saveVerdict({
+        caseId: c.id,
+        timestamp: new Date().toISOString(),
+        verdict: uj.verdict,
+        sentence: uj.sentence || null,
+        reason: uj.reason,
+        emotionScore: ai.emotionScore,
+        legalScore: ai.legalScore,
+        biases: ai.biases
+    });
 }
```

---

### 3. 설문 슬라이더 값 저장

결과 페이지에서 **"다른 사건 판결하기"** 버튼 클릭 시, 설문 슬라이더 5개 값을 마지막 저장된 레코드에 업데이트합니다.

저장되는 설문 항목:
- AI는 나보다 더 법에 충실한가? (1~10)

---

### 4. 결과 등록 버튼 + 로딩바 + 완료 팝업 UI 추가

결과 화면(`step-result`)의 설문 슬라이더 아래에 **"결과 등록"** 버튼을 추가합니다. 기존 "다른 사건 판결하기" 버튼과는 별도로 배치합니다.

**동작 흐름:**
```
[결과 등록] 버튼 클릭
    ↓
버튼 비활성화 + 로딩바(프로그래스 바) 애니메이션 표시
    ↓
localStorage에 판결 + 설문 데이터 저장 처리
    ↓
로딩바 완료 (100%)
    ↓
"결과 등록 완료!!" 팝업(모달) 표시
    ↓
팝업 닫기 → 버튼 "등록 완료 ✓" 상태로 변경 (재클릭 방지)
```

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| `index.html` | 결과 등록 버튼, 로딩바 요소, 완료 팝업 모달 HTML 추가 |
| `styles.css` | 로딩바 애니메이션, 팝업 모달 스타일 추가 |
| `app.js` | 결과 등록 버튼 클릭 핸들러, 로딩 → 저장 → 팝업 로직 |

**UI 구성 (index.html):**

```html
<!-- 설문 슬라이더 아래, "다른 사건 판결하기" 버튼 위에 배치 -->
<div class="register-container">
    <button id="btn-register-result" class="btn primary-btn">결과 등록</button>
    <div id="register-progress" class="register-progress" style="display:none;">
        <div id="register-progress-bar" class="register-progress-bar"></div>
    </div>
</div>

<!-- 완료 팝업 모달 -->
<div id="register-modal" class="modal-overlay" style="display:none;">
    <div class="modal-content">
        <h3>✅ 결과 등록 완료!!</h3>
        <p>판결 결과와 설문이 성공적으로 저장되었습니다.</p>
        <button id="btn-close-modal" class="btn primary-btn">확인</button>
    </div>
</div>
```

---

### 5. `fetchRealAiAnalysis()` 수정 — 학습 데이터 프롬프트 주입

100건 이상 축적 시 AI 분석 프롬프트에 아래와 같은 통계 블록이 자동 삽입됩니다.

```diff
 async function fetchRealAiAnalysis(text) {
     const c = state.selectedCase;
     const uj = state.userJudgment;
+    const learningContext = buildLearningContext(c.id);

     const systemPrompt = `당신은 ... 법률 심리 분석 AI입니다.
+${learningContext}
     [분석 지침] ...`;
 }
```

**100건 이상일 때 주입되는 컨텍스트 예시:**

```
[축적된 국민 법감정 데이터 (152건)]
- 유죄 비율: 72%, 무죄 비율: 28%
- 형량 분포: 벌금형 15%, 집행유예 35%, 징역 1~3년 30%, 징역 3~5년 12%, 징역 5년 이상 5%, 무기징역 2%, 사형 1%
- 평균 감정 개입률: 43%, 평균 법적 합치성: 67%
- 자기 평가 평균: 법충실도 58, 정의충실도 72, 감정흔들림 38, 사회통념 55, AI법충실 60

위 데이터는 이 사건에 대해 다수의 시민이 내린 판결과 자기 평가의 통계입니다.
이를 참고하여 분석의 정확도를 높이되, 법리적 원칙에 어긋나지 않도록 하세요.
```

---

## 📦 저장 데이터 구조

```json
{
    "caseId": "case-1",
    "timestamp": "2026-02-28T14:40:00Z",
    "verdict": "유죄",
    "sentence": "징역 1년~3년",
    "reason": "생계형 범죄이지만...",
    "emotionScore": 35,
    "legalScore": 72,
    "biases": ["상황론적 온정주의", "동정심 기반 관대함"],
    "survey": {
        "q1": 65,
        "q2": 70,
        "q3": 40,
        "q4": 55,
        "q5": 60
    }
}
```

---

## 🔄 동작 흐름도

```
판결 제출 → AI 분석 → 결과 렌더링 → localStorage에 자동 저장
                                          ↓
                              설문 응답 → 설문 데이터 추가 저장
                                          ↓
                                  다음 판결 요청 시:
                                          ↓
                              해당 사건 과거 데이터 조회
                                    ↓           ↓
                             < 100건          ≥ 100건
                                ↓                ↓
                          기존과 동일       통계 계산 후
                          (학습 미적용)    AI 프롬프트에 주입
                                             ↓
                                    AI가 국민 법감정을
                                    참고하여 더 정교한
                                    분석 수행
```

---

## ✅ 검증 방법

1. **데이터 저장 확인**: 판결 제출 후 `F12` → Console → `localStorage.getItem('justice_verdicts')` 입력
2. **100건 미만**: 학습 데이터 미적용, 기존과 동일 동작 확인
3. **100건 이상**: Console에서 더미 데이터 100건 주입 후, AI 분석 프롬프트에 통계 포함 여부 확인
