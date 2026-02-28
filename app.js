/**
 * app.js
 * 메인 애플리케이션 로직 (SPA 라우팅, 폼 핸들링, Mock AI 분석)
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        currentStep: 'step-intro',
        selectedCase: null,
        userJudgment: {
            verdict: null,
            sentence: null,
            mitigation: false,
            reason: ""
        },
        aiAnalysis: null
    };
    // --- Constants ---
    const API_KEY = "YOUR_GEMINI_API_KEY_HERE"; // Gemini API Key
    const STORAGE_KEY = 'justice_verdicts';
    const LEARNING_THRESHOLD = 100;

    // --- Storage Utils ---
    function saveVerdict(data) {
        try {
            const verdicts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            verdicts.push(data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
        } catch (e) {
            console.error("Failed to save verdict:", e);
        }
    }

    function getVerdictsByCaseId(caseId) {
        try {
            const verdicts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return verdicts.filter(v => v.caseId === caseId);
        } catch (e) {
            return [];
        }
    }

    function computeStats(verdicts) {
        if (verdicts.length === 0) return null;
        const total = verdicts.length;
        const guiltyCount = verdicts.filter(v => v.verdict === '유죄').length;

        // 형량 통계 (추후 상세 분석 가능)
        const sentences = {};
        verdicts.forEach(v => {
            if (v.sentence) {
                sentences[v.sentence] = (sentences[v.sentence] || 0) + 1;
            }
        });

        return {
            total,
            guiltyRate: Math.round((guiltyCount / total) * 100),
            innocentRate: Math.round(((total - guiltyCount) / total) * 100),
            sentences,
            avgEmotion: Math.round(verdicts.reduce((s, v) => s + (v.emotionScore || 0), 0) / total),
            avgLegal: Math.round(verdicts.reduce((s, v) => s + (v.legalScore || 0), 0) / total)
        };
    }

    function buildLearningContext(caseId) {
        const verdicts = getVerdictsByCaseId(caseId);
        if (verdicts.length < LEARNING_THRESHOLD) return "";

        const stats = computeStats(verdicts);
        return `
[축적된 국민 법감정 데이터 (${stats.total}건)]
- 유죄 비율: ${stats.guiltyRate}%, 무죄 비율: ${stats.innocentRate}%
- 평균 감정 개입률: ${stats.avgEmotion}%, 평균 법적 합치성: ${stats.avgLegal}%

위 데이터는 이 사건에 대해 다수의 시민(판사)들이 내린 판결 통계입니다. 
이를 참고하여 분석의 정확도를 높이되, 법리적 원칙에 어긋나지 않도록 하세요.
`;
    }

    // DOM Elements
    const views = document.querySelectorAll('.view-section');
    const caseListEl = document.getElementById('case-list');

    // Scenario Step Elements
    const scTitle = document.getElementById('scenario-title');
    const scDesc = document.getElementById('scenario-desc');
    const scLaw = document.getElementById('scenario-law');
    const btnToInterrogation = document.getElementById('btn-to-interrogation');

    // Interrogation Step Elements
    const btnToJudgmentFromChat = document.getElementById('btn-to-judgment-from-chat');

    // Judgment Step Elements
    const judgmentForm = document.getElementById('judgment-form');
    const sentenceGroup = document.getElementById('sentence-group');
    const verdictRadios = document.querySelectorAll('input[name="verdict"]');

    // Analysis Elements
    const loadingMsg = document.getElementById('loading-msg');

    // Result Step Elements
    const tblUserVerdict = document.getElementById('tbl-user-verdict');
    const tblUserReason = document.getElementById('tbl-user-reason');
    const tblRealVerdict = document.getElementById('tbl-real-verdict');
    const tblRealReason = document.getElementById('tbl-real-reason');
    const tblAiVerdict = document.getElementById('tbl-ai-verdict');
    const tblAiReason = document.getElementById('tbl-ai-reason');

    const emotionBar = document.getElementById('emotion-bar');
    const emotionDesc = document.getElementById('emotion-desc');
    const legalBar = document.getElementById('legal-bar');
    const legalDesc = document.getElementById('legal-desc');
    const biasTagsContainer = document.getElementById('bias-tags-container');
    const emotionReason = document.getElementById('emotion-reason');
    const legalReason = document.getElementById('legal-reason');

    const btnRestart = document.getElementById('btn-restart');

    // --- Initialization ---
    function init() {
        const splash = document.getElementById('splash-screen');

        // 2초 후 스플래시 화면 페이드아웃 및 메인 화면 표시
        setTimeout(() => {
            splash.classList.add('hidden');

            // 페이드아웃 트랜지션(0.8s) 후 DOM에서 숨김 처리
            setTimeout(() => {
                splash.style.display = 'none';
                renderCaseList();
                setupEventListeners();
                setupChatForms();
                renderChatHistory(); // Initialize the first dummy message
            }, 800);

        }, 3000);
    }

    // --- Routing & View Toggling ---
    function navigateTo(stepId) {
        views.forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(stepId);
        if (targetView) {
            targetView.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        state.currentStep = stepId;
    }

    // --- View Rendering ---
    function renderCaseList() {
        caseListEl.innerHTML = '';
        caseData.forEach(c => {
            const card = document.createElement('div');
            card.classList.add('case-card');
            card.innerHTML = `
                <h4>${c.title}</h4>
            `;
            card.addEventListener('click', () => selectCase(c.id));
            caseListEl.appendChild(card);
        });
    }

    function selectCase(id) {
        const c = caseData.find(item => item.id === id);
        if (!c) return;
        state.selectedCase = c;

        // 사건 변경 시 채팅 내역 초기화
        state.chatHistory = {
            prosecutor: [],
            defendant: []
        };
        state.currentRole = 'prosecutor';

        scTitle.textContent = c.title;
        scDesc.textContent = c.scenario;
        scLaw.textContent = c.law;

        navigateTo('step-scenario');
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        btnToInterrogation.addEventListener('click', () => {
            renderChatHistory(); // 심문 방에 들어갈 때 초기화
            navigateTo('step-interrogation');
        });

        btnToJudgmentFromChat.addEventListener('click', () => {
            // Reset form
            judgmentForm.reset();
            sentenceGroup.style.opacity = '1';
            sentenceGroup.style.pointerEvents = 'auto'; // enable
            navigateTo('step-judgment');
        });

        // Toggle sentence select based on verdict
        verdictRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const sentenceSelect = document.getElementById('sentence-select');
                if (e.target.value === '무죄') {
                    sentenceGroup.style.opacity = '0.4';
                    sentenceSelect.disabled = true;
                    sentenceSelect.value = "";
                } else {
                    sentenceGroup.style.opacity = '1';
                    sentenceSelect.disabled = false;
                }
            });
        });

        judgmentForm.addEventListener('submit', handleJudgmentSubmit);
        btnRestart.addEventListener('click', () => {
            // Restart 시에도 설문 데이터 임시 저장 (자동 저장의 일환)
            updateLastVerdictWithSurvey();
            navigateTo('step-intro');
        });

        // Binary Choice Buttons (for AI Comparison)
        const choiceBtns = document.querySelectorAll('.choice-btn');
        const regContainer = document.getElementById('register-container');

        choiceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                choiceBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 선택 시 등록 버튼 노출
                if (regContainer) {
                    regContainer.style.display = 'block';
                    // 시각적 피드백을 위해 부드럽게 나타나도록 애니메이션 (styles.css에 이미 fade-in 등이 있을 수 있음)
                    regContainer.style.animation = 'fadeIn 0.5s ease-out';
                }
            });
        });

        // Result Registration Logic
        const btnRegister = document.getElementById('btn-register-result');
        const regProgress = document.getElementById('register-progress');
        const regProgressBar = document.getElementById('register-progress-bar');
        const modal = document.getElementById('register-modal');
        const btnCloseModal = document.getElementById('btn-close-modal');

        if (btnRegister) {
            btnRegister.addEventListener('click', async () => {
                btnRegister.disabled = true;
                regProgress.style.display = 'block';

                // Progress Bar Animation (심미적 효과)
                let progress = 0;
                const interval = setInterval(() => {
                    progress += 5;
                    regProgressBar.style.width = `${progress}%`;
                    if (progress >= 100) {
                        clearInterval(interval);

                        // 데이터 최종 저장
                        updateLastVerdictWithSurvey();

                        // 성공 모달 표시
                        modal.style.display = 'flex';
                        btnRegister.textContent = "등록 완료 ✓";
                        btnRegister.classList.add('btn-success');
                    }
                }, 50);
            });
        }

        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => {
                modal.style.display = 'none';
                regProgress.style.display = 'none';
            });
        }
    }

    function updateLastVerdictWithSurvey() {
        try {
            const verdicts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            if (verdicts.length === 0) return;

            const lastIndex = verdicts.length - 1;
            // q5는 바이너리 버튼이므로 active 클래스로 판단
            const q5Active = document.querySelector('.choice-btn.positive.active');

            verdicts[lastIndex].survey = {
                q5: q5Active ? 100 : 0
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
        } catch (e) {
            console.error("Survey update failed:", e);
        }
    }


    // State extension for chat history
    state.chatHistory = {
        prosecutor: [],
        defendant: []
    };
    state.currentRole = 'prosecutor';

    // --- Global API Queue System ---
    const apiQueue = [];
    let isApiBusy = false;

    async function processApiQueue() {
        if (isApiBusy || apiQueue.length === 0) return;
        isApiBusy = true;

        const task = apiQueue.shift();
        try {
            await task();
        } catch (error) {
            console.error("Queue task error:", error);
        } finally {
            isApiBusy = false;
            if (apiQueue.length > 0) {
                // 약간의 쿨다운 타임 부여 (429 방어)
                setTimeout(processApiQueue, 1000);
            }
        }
    }

    // --- Chat Room Logic ---
    function setupChatForms() {
        const procForm = document.getElementById('form-prosecutor');
        const defForm = document.getElementById('form-defendant');

        if (procForm) {
            procForm.addEventListener('submit', (e) => handleChatSubmit(e, 'prosecutor'));
        }
        if (defForm) {
            defForm.addEventListener('submit', (e) => handleChatSubmit(e, 'defendant'));
        }
    }

    function renderChatHistory() {
        const procBox = document.getElementById('chat-box-prosecutor');
        const defBox = document.getElementById('chat-box-defendant');

        if (procBox) procBox.innerHTML = '';
        if (defBox) defBox.innerHTML = '';

        if (!state.selectedCase) return;

        // 검사 초기화/렌더링
        if (state.chatHistory['prosecutor'].length === 0) {
            apiQueue.push(() => fetchInitialStatement('prosecutor'));
        } else {
            state.chatHistory['prosecutor'].forEach(msg => {
                appendChatMessage('prosecutor', msg.role, msg.text, false);
            });
        }

        // 피고인 초기화/렌더링
        if (state.chatHistory['defendant'].length === 0) {
            apiQueue.push(() => fetchInitialStatement('defendant'));
        } else {
            state.chatHistory['defendant'].forEach(msg => {
                appendChatMessage('defendant', msg.role, msg.text, false);
            });
        }

        // 큐 실행 시작
        processApiQueue();
    }

    async function fetchInitialStatement(role) {
        const apiKey = API_KEY;
        if (!apiKey) {
            appendChatMessage(role, 'ai', 'API 키 설정이 되어있지 않습니다.');
            return;
        }

        const roleName = role === 'prosecutor' ? '검사' : '피고인';
        const caseContext = `사건 제목: ${state.selectedCase.title}\n사건 개요: ${state.selectedCase.scenario}\n법 조항: ${state.selectedCase.law}`;

        let systemPrompt = "";
        if (role === 'prosecutor') {
            const exactRequest = state.selectedCase.realCase?.prosecutorRequest || "법에 따른 엄벌";
            systemPrompt = `당신은 다음 사건의 엄정한 '검사(Prosecutor)' 역할을 맡았습니다.
${caseContext}

당신은 지금 실제 형사 재판정에서 판사를 향해 **기소 요지(범죄 사실, 죄질의 중대성)를 엄숙히 낭독하고 구형(어떠한 처벌을 내려달라)**하는 첫 발언을 시작해야 합니다.
절대 "질문해 주십시오", "무엇이든 물어보세요" 등의 인공지능 같은 도우미 멘트를 붙이지 마십시오. 질문에 대답하는 것이 아니라 당신이 먼저 발언하는 상황입니다.
"존경하는 재판장님," 으로 시작하여 사건의 악랄함이나 처벌의 필요성을 강조하고, 최종적으로 실감나는 검사의 기소 진술(약 3~4문장 1문단)만을 즉시 작성하십시오.
핵심 지시사항: 당신이 마지막에 구형해야 할 형량은 실제 역사적 기록에 따라 **반드시 '${exactRequest}'**이어야 합니다. 다른 형량을 추론해서는 안 되며, 이 구형량 부분을 반드시 **마크다운 굵게 처리**하여 강조**하십시오.`;
        } else {
            systemPrompt = `당신은 다음 사건의 '피고인(Defendant)' 역할을 맡았습니다.
${caseContext}

당신은 지금 실제 형사 재판정에서 판사를 향해 **최후 변론 또는 첫 모두 진술**을 하는 상황입니다.
절대 "질문해 주십시오", "무엇이든 물어보세요" 등의 인공지능 같은 도우미 멘트를 붙이지 마십시오. 질문에 대답하는 것이 아니라 당신이 먼저 발언하는 상황입니다.
"재판장님," 으로 시작하여 자신의 억울함, 어쩔 수 없었던 정황, 혹은 뼈저린 반성 등을 표현하며 선처를 호소하거나 무죄를 강변하는 실감나는 피고인의 진술(약 3~4문장 1문단)만을 즉시 작성하십시오.
중요: 본인의 억울한 점이나 가장 선처를 받아야 하는 **핵심 항변 사유, 그리고 최종적으로 원하는 바(선처 호소, 무죄 주장 등)는 반드시 **마크다운 굵게 처리**하여 강조**하십시오.`;
        }

        appendChatMessage(role, 'ai', '...', true); // Loading indicator
        const chatBox = document.getElementById(`chat-box-${role}`);
        const loadingNode = chatBox.lastElementChild;

        let response;
        let retries = 0;
        const maxRetries = 3;
        const backoffTimes = [5000, 10000, 15000];

        try {
            while (retries <= maxRetries) {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse&key=${apiKey}`;

                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ parts: [{ text: "재판을 시작하며 첫 진술을 해주세요." }] }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 2048
                        }
                    })
                });

                if (response.status === 429 && retries < maxRetries) {
                    loadingNode.innerHTML = `💡 무료 API 한도 초과 방지 대기 중...<br>(${backoffTimes[retries] / 1000}초 후 자동 재시도 ${retries + 1}/${maxRetries})`;
                    console.warn(`[검사/피고인 초기 발언] API 429 에러 발생. ${backoffTimes[retries]}ms 후 재시도...`);
                    await new Promise(r => setTimeout(r, backoffTimes[retries]));
                    retries++;
                    continue;
                }
                break;
            }

            if (!response || !response.ok) {
                loadingNode.remove();
                if (response && response.status === 429) {
                    throw new Error("API 요청 제한을 초과했습니다. 약 1분 뒤에 페이지를 새로고침 해주세요.");
                }
                throw new Error(`API 오류: ${response ? response.status : '알 수 없음'} (서버 응답 오류)`);
            }

            loadingNode.remove();

            const msgDiv = document.createElement('div');
            msgDiv.classList.add('chat-msg', 'msg-ai');
            chatBox.appendChild(msgDiv);

            let fullAiText = "";
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                                const partText = data.candidates[0].content.parts.map(p => p.text).join('');
                                fullAiText += partText;

                                // 스트리밍 도중 마크다운 볼드 파싱
                                const escapedText = fullAiText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                                const prefix = role === 'prosecutor' ? '검사 : ' : '피고인 : ';
                                msgDiv.innerHTML = `${prefix}` + parseSimpleMarkdown(escapedText);

                                chatBox.scrollTop = chatBox.scrollHeight;
                            }
                        } catch (e) {
                            // Incomplete chunk
                        }
                    }
                }
            }

            state.chatHistory[role].push({ role: 'ai', text: fullAiText });

        } catch (error) {
            console.error(error);
            if (loadingNode && loadingNode.parentNode) loadingNode.remove();
            appendChatMessage(role, 'ai', '오류가 발생했습니다: ' + error.message);
        }
    }

    async function handleChatSubmit(e, targetRole) {
        e.preventDefault();

        // 중복 제출 및 로딩 중 제출 방지
        if (isApiBusy) {
            console.warn("API is currently busy with another request. Please wait.");
            return;
        }

        const form = e.target;
        const chatInput = form.querySelector('input[type="text"]');
        const text = chatInput.value.trim();
        if (!text) return;

        // Display user message
        appendChatMessage(targetRole, 'user', text);
        state.chatHistory[targetRole].push({ role: 'user', text });
        chatInput.value = '';

        // Fetch AI Response via Queue
        apiQueue.push(() => fetchAiResponse(targetRole, text));
        processApiQueue();
    }

    async function fetchAiResponse(targetRole, text) {
        const apiKey = API_KEY;
        if (!apiKey) {
            appendChatMessage(targetRole, 'ai', 'API 키 설정이 되어있지 않습니다.');
            return;
        }

        appendChatMessage(targetRole, 'ai', '...', true); // Loading indicator
        const chatBox = document.getElementById(`chat-box-${targetRole}`);
        const loadingNode = chatBox.lastElementChild;

        try {
            const roleName = targetRole === 'prosecutor' ? '검사' : '피고인';
            const caseContext = `사건 제목: ${state.selectedCase.title}\n사건 개요: ${state.selectedCase.scenario}\n법 조항: ${state.selectedCase.law}`;

            // Construct context from previous messages. We exclude the very last user message because we pass it separately below.
            const historyContext = state.chatHistory[targetRole].slice(0, -1)
                .map(msg => `${msg.role === 'user' ? '사용자(판사)' : roleName}: ${msg.text}`)
                .join('\n');

            let extraProsecutorRules = "";
            if (roleName === '검사') {
                const exactRequest = state.selectedCase.realCase?.prosecutorRequest || "법에 따른 엄벌";
                extraProsecutorRules = `\n당신이 이 재판에서 구형하는 형벌은 실제 역사적 기록에 따라 **반드시 '${exactRequest}'**이어야 합니다. 판사가 형량을 묻거나 답변 중 형량을 언급할 때는 반드시 이 구형량을 고수하십시오.`;
            }

            const systemPrompt = `당신은 다음 사건의 '${roleName}' 역할을 맡았습니다.
${caseContext}${extraProsecutorRules}

사용자는 이 사건을 판결하는 판사입니다. 당신은 '${roleName}'의 입장에서 진행 중인 재판정에서 판사의 심문에 답변하는 중입니다. 
'존경하는 재판장님'과 같은 상투적인 인사말만 남기고 답변을 끊거나, "무엇이든 질문해 주십시오" 같은 안내원 태도를 취하지 마십시오. 판사의 질문이나 지적에 대해 당신의 입장(검사는 엄벌/기소 유지 우려 표명, 피고인은 변호/선처/무죄 호소)을 강변하며 실질적인 대답을 하십시오. 사람처럼 연기하십시오.
중요: 문맥상 가장 중요한 당신의 **주장, 논거, 구형량, 혹은 호소하는 바는 반드시 **마크다운 굵게 처리**하여 강조**하십시오.

이전 대화:
${historyContext}

판사의 질문: ${text}

${roleName}의 대답:`;
            let response;
            let retries = 0;
            const maxRetries = 3;
            const backoffTimes = [5000, 10000, 15000];

            while (retries <= maxRetries) {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse&key=${apiKey}`;

                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ parts: [{ text: text }] }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 2048
                        }
                    })
                });

                if (response.status === 429 && retries < maxRetries) {
                    loadingNode.innerHTML = `💡 무료 API 한도 초과 방지 대기 중...<br>(${backoffTimes[retries] / 1000}초 후 자동 재시도 ${retries + 1}/${maxRetries})`;
                    console.warn(`[대화 답변] API 429 에러 발생. ${backoffTimes[retries]}ms 후 재시도...`);
                    await new Promise(r => setTimeout(r, backoffTimes[retries]));
                    retries++;
                    continue;
                }
                break;
            }

            if (!response || !response.ok) {
                loadingNode.remove();
                if (response && response.status === 429) {
                    throw new Error("API 요청 제한을 초과했습니다. 약 1분 뒤에 다시 채팅을 전송해주세요.");
                }
                throw new Error(`API 오류: ${response ? response.status : '알 수 없음'} (서버 응답 오류)`);
            }

            loadingNode.remove();

            const msgDiv = document.createElement('div');
            msgDiv.classList.add('chat-msg', 'msg-ai');
            chatBox.appendChild(msgDiv);

            let fullAiText = "";
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                                const partText = data.candidates[0].content.parts.map(p => p.text).join('');
                                fullAiText += partText;

                                const escapedText = fullAiText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                                const prefix = targetRole === 'prosecutor' ? '검사 : ' : '피고인 : ';
                                msgDiv.innerHTML = `${prefix}` + parseSimpleMarkdown(escapedText);

                                chatBox.scrollTop = chatBox.scrollHeight;
                            }
                        } catch (e) {
                            // Incomplete chunk
                        }
                    }
                }
            }

            state.chatHistory[targetRole].push({ role: 'ai', text: fullAiText });

        } catch (error) {
            console.error(error);
            if (loadingNode && loadingNode.parentNode) loadingNode.remove();
            appendChatMessage(targetRole, 'ai', '오류가 발생했습니다: ' + error.message);
        }
    }

    // 간단한 마크다운 파서 (문자열 보안 주의)
    function parseSimpleMarkdown(text) {
        // 이중 별표(**텍스트**)를 <strong>태그로 변환
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    function appendChatMessage(targetRole, sender, text, isTemp = false) {
        const chatBox = document.getElementById(`chat-box-${targetRole}`);
        if (!chatBox) return;

        const msgDiv = document.createElement('div');
        msgDiv.classList.add('chat-msg', sender === 'user' ? 'msg-user' : 'msg-ai');
        if (isTemp) msgDiv.classList.add('mock-temp');

        // 화자 접두사 결정
        let prefix = '';
        if (sender === 'user') {
            prefix = '판사(나) : ';
        } else if (sender === 'ai' && !isTemp) {
            prefix = targetRole === 'prosecutor' ? '검사 : ' : '피고인 : ';
        }

        // AI 메시지는 볼드 처리 마크다운 적용, XSS 방지를 위해 textContent 대신 innerHTML을 쓰되 제한적 변환만
        if (sender === 'ai' && !isTemp) {
            // 태그 이스케이프 먼저 수행
            const escapedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            msgDiv.innerHTML = `${prefix}` + parseSimpleMarkdown(escapedText);
        } else {
            msgDiv.textContent = prefix + text;
        }

        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // --- Form Submission & Mock AI Generation ---
    function handleJudgmentSubmit(e) {
        e.preventDefault();

        const formData = new FormData(judgmentForm);
        const verdict = formData.get('verdict');
        const sentence = document.getElementById('sentence-select').value;

        const reason = document.getElementById('reason-input').value;

        if (verdict === '유죄' && !sentence) {
            alert('유죄를 선택하신 경우 형량을 지정해주세요.');
            return;
        }

        state.userJudgment = { verdict, sentence, reason };

        // Start Analysis phase
        navigateTo('step-analysis');
        runMockAnalysis(reason);
    }

    async function runMockAnalysis(text) {
        const progressBar = document.getElementById('analysis-progress-bar');
        if (progressBar) progressBar.style.width = '0%';

        // Start showing loading messages sequentially
        const messages = [
            "법적 합치성을 검토 중입니다...",
            "판단에 개입된 감정적 요소를 추출 중입니다...",
            "인지적·도덕적 편향성을 분석 중입니다...",
            "실제 판례 및 AI 모델의 판결과 비교 중입니다..."
        ];

        let msgIndex = 0;
        if (progressBar) progressBar.style.width = '20%';

        const interval = setInterval(() => {
            msgIndex++;
            if (msgIndex < messages.length) {
                loadingMsg.textContent = messages[msgIndex];
                if (progressBar) {
                    const progress = 20 + (msgIndex * 20); // 20, 40, 60, 80%
                    progressBar.style.width = `${progress}%`;
                }
            }
        }, 1500);

        try {
            await fetchRealAiAnalysis(text);
        } catch (error) {
            console.error("Analysis API failed, falling back to mock:", error);
            generateMockAiData(text); // Fallback if API fails
        } finally {
            clearInterval(interval);
            if (progressBar) progressBar.style.width = '100%';
            loadingMsg.textContent = "분석이 완료되었습니다.";
            setTimeout(() => {
                renderResults();
                navigateTo('step-result');
                // Reset loading msg for next time
                loadingMsg.textContent = messages[0];
                if (progressBar) progressBar.style.width = '0%';
            }, 1000); // 1초 정도 완료 메시지를 보여준 후 이동
        }
    }



    async function fetchRealAiAnalysis(text) {
        const apiKey = API_KEY;
        if (!apiKey) {
            console.error("No API Key found.");
            return;
        }

        const c = state.selectedCase;
        const uj = state.userJudgment;
        const learningContext = buildLearningContext(c.id);

        const systemPrompt = `당신은 판사가 제출한 판결문과 그 기저에 깔린 심리를 분석하는 고도의 법률 심리 분석 AI입니다.
${learningContext}
[분석 지침]
1. emotionScore (0~100): 판단에 개입된 동정, 분노, 보복심 등 감정적 동기의 비율입니다. 법리보다 직관이나 감정에 치우친 표현(예: "그냥 사형", "나쁘니까")이 많을수록 높은 점수를 부여하세요.
2. legalScore (0~100): 제출된 판결 이유가 제공된 법 조항 및 비례의 원칙과 얼마나 부합하는지 나타냅니다. 구체적 법리 근거 없이 극단적 형량을 부과한 경우 매우 낮은 점수를 부여하세요.
3. emotionReason & legalReason: 각각의 점수를 부여한 구체적인 근거를 한국어로 설명하세요.
4. biases: 판결에서 엿보이는 편향성 키워드 2개를 추출하세요.

[사건 정보]
제목: ${c.title}
개요: ${c.scenario}
관련 법: ${c.law}

[사용자의 판결]
판결: ${uj.verdict} ${uj.sentence ? '(' + uj.sentence + ')' : ''}
판결 이유: "${text}"

*반드시* 아래 JSON 형식으로만 응답하세요:
{
  "emotionScore": [숫자],
  "emotionReason": "[설명]",
  "legalScore": [숫자],
  "legalReason": "[설명]",
  "biases": ["키워드1", "키워드2"]
}`;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ parts: [{ text: "사용자 판결에 대한 실시간 MLOps 데이터 분석을 수행하십시오." }] }],
                    generationConfig: {
                        temperature: 0.7,
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const data = await response.json();
            const resultString = data.candidates[0].content.parts[0].text;
            const resultJson = JSON.parse(resultString);

            state.aiAnalysis = {
                emotionScore: typeof resultJson.emotionScore === 'number' ? resultJson.emotionScore : 50,
                emotionReason: resultJson.emotionReason || "상세 분석을 수행할 수 없습니다.",
                legalScore: typeof resultJson.legalScore === 'number' ? resultJson.legalScore : 50,
                legalReason: resultJson.legalReason || "상세 분석을 수행할 수 없습니다.",
                biases: Array.isArray(resultJson.biases) ? resultJson.biases : ["분석 불가"]
            };
        } catch (error) {
            console.error("Gemini Analysis Error:", error);
            generateMockAiData(text);
        }
    }

    function generateMockAiData(text) {
        // Fallback Keyword-based crude mock logic in case API fails
        const lowerText = text.toLowerCase();
        let emotionScore = 10;
        let legalScore = 90;
        let biases = [];

        const emotionalWords = ['불쌍', '안타', '가엾', '괘씸', '나쁜', '분노', '용서', '화', '어쩔 수 없', '억울', '인간적', '죽여', '처단', '보복'];
        const legalWords = ['법', '규정', '원칙', '위반', '전과', '누범', '상해', '고의', '증거', '판례', '합당', '비례'];

        let emCount = emotionalWords.filter(w => lowerText.includes(w)).length;
        let legCount = legalWords.filter(w => lowerText.includes(w)).length;

        // 극단적 판결 감지 (예: 빵 훔쳤는데 사형, 혹은 근거 없는 극단적 형량)
        const isExtremePunishment = state.userJudgment.sentence === '사형' || state.userJudgment.sentence === '무기징역';
        const isMinorCase = state.selectedCase.title.includes('장발장') || state.selectedCase.title.includes('빵');
        const isSuspiciouslyShort = text.length < 15;

        // 근거가 빈약한 극단적 판결이거나, 경미한 사건에 극단적 형량인 경우
        if (isExtremePunishment && (isMinorCase || isSuspiciouslyShort)) {
            emotionScore = 90;
            legalScore = 5;
            const pool = ["과잉 처벌 편향", "보복 심리 중심", "엄벌 만능주의", "비례 원칙 간과", "응보적 정의관", "정의감 과잉", "처벌 지상주의"];
            biases = pool.sort(() => Math.random() - 0.5).slice(0, 2);
        } else {
            emotionScore = Math.min(95, Math.max(5, 30 + (emCount * 20) - (legCount * 5)));
            legalScore = Math.max(5, Math.min(95, 70 + (legCount * 10) - (emCount * 15)));

            const commonPool = [];
            if (emCount > 0) commonPool.push("직관 기반 편향", "정서적 이입", "주관적 판단", "감정적 접근");
            if (legCount === 0 && text.length < 15) commonPool.push("법리적 근거 부재", "상식 기반 판단", "논리 비약 가능성");
            if (text.includes('불쌍') || text.includes('안타')) commonPool.push("상황론적 온정주의", "동정심 기반 관대함", "연민에 의한 판단");

            // 추출된 공통 태그 중 랜덤하게 2개 내외 선택
            if (commonPool.length > 0) {
                biases = commonPool.sort(() => Math.random() - 0.5).slice(0, Math.min(commonPool.length, 2 + Math.floor(Math.random() * 2)));
            }
        }

        if (biases.length === 0) {
            const genericBiases = ["원칙주의적 성향", "객관적 판단 시도", "기계적 법 적용", "상식 기반 판단", "확증 편향 방어"];
            biases.push(genericBiases[Math.floor(Math.random() * genericBiases.length)]);
        }

        state.aiAnalysis = {
            emotionScore,
            emotionReason: isExtremePunishment && isMinorCase ? "범죄의 중대성에 비해 감정적인 보복 심리가 매우 강하게 반영되었습니다." : "입력하신 문장에서 주관적인 감정 표현이 감지되었습니다.",
            legalScore,
            legalReason: isExtremePunishment && isMinorCase ? "죄형법정주의와 비례의 원칙을 크게 벗어난 판결로 분석됩니다." : "법률적 근거보다는 일반적인 상식에 기반한 판단으로 보입니다.",
            biases
        };
    }

    // --- Result Rendering ---
    function renderResults() {
        const c = state.selectedCase;
        const uj = state.userJudgment;
        const ai = state.aiAnalysis;

        // Reset UI for new result
        const regContainer = document.getElementById('register-container');
        if (regContainer) regContainer.style.display = 'none';

        const choiceBtns = document.querySelectorAll('.choice-btn');
        choiceBtns.forEach(b => b.classList.remove('active'));

        const btnRegister = document.getElementById('btn-register-result');
        if (btnRegister) {
            btnRegister.disabled = false;
            btnRegister.textContent = "판결 결과 등록 및 학습 기여";
            btnRegister.classList.remove('btn-success');
        }

        // 1. Progress Bars
        setTimeout(() => {
            emotionBar.style.width = `${ai.emotionScore}%`;
            legalBar.style.width = `${ai.legalScore}%`;
        }, 300); // slight delay for animation effect

        if (emotionDesc) emotionDesc.innerHTML = `분석 결과, 판단의 <span class="highlighter">${ai.emotionScore}%</span>가 감정/직관에 기인한 것으로 보입니다.`;
        if (emotionReason) emotionReason.textContent = ai.emotionReason;
        if (legalDesc) legalDesc.innerHTML = `기존 법리와 양형 기준과의 일치율은 <span class="highlighter">${ai.legalScore}%</span> 입니다.`;
        if (legalReason) legalReason.textContent = ai.legalReason;

        // 2. Bias Tags
        biasTagsContainer.innerHTML = '';
        ai.biases.forEach(tag => {
            const span = document.createElement('span');
            span.classList.add('bias-tag');
            span.textContent = `#${tag}`;
            biasTagsContainer.appendChild(span);
        });

        // --- Automatic Result Save (localStorage) ---
        saveVerdict({
            caseId: c.id,
            timestamp: new Date().toISOString(),
            verdict: uj.verdict,
            sentence: uj.sentence || null,
            reason: uj.reason,
            emotionScore: ai.emotionScore,
            legalScore: ai.legalScore,
            biases: ai.biases,
            survey: { q5: null } // 초기값은 null, 등록 시 업데이트
        });
        // 3. Table Population
        let userFullVerdict = uj.verdict;
        if (uj.verdict === '유죄') {
            userFullVerdict += ` (${uj.sentence})`;
            if (uj.mitigation) userFullVerdict += " + 감경 고려";
        }

        tblUserVerdict.textContent = userFullVerdict;
        tblUserReason.textContent = `"${uj.reason}"`;

        tblRealVerdict.textContent = c.realCase.verdict;
        tblRealReason.textContent = c.realCase.reason;

        tblAiVerdict.textContent = c.aiCase.verdict;
        tblAiReason.textContent = c.aiCase.reason;
    }

    // Start App
    init();
});
