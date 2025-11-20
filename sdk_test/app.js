import { createGraphNodeClient } from '../z_npm_sdk/dist/index.js';

// 1. 클라이언트 초기화 (로컬 백엔드 주소)
const client = createGraphNodeClient({

});

// UI 헬퍼
const output = document.getElementById('output-area');
function log(data, isError = false) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const className = isError ? 'error-msg' : 'success-msg';
    output.innerHTML = `<span style="color: #888">[${timestamp}]</span> <span class="${className}">${content}</span>\n\n` + output.innerHTML;
}

function handleError(err) {
    console.error(err);
    if (err.response) {
        // SDK HttpError
        err.response.json().then(body => {
            log({ status: err.status, problem: body }, true);
        }).catch(() => {
            log({ status: err.status, statusText: err.statusText }, true);
        });
    } else {
        log(err.message || err, true);
    }
}

// --- Event Listeners ---

// Auth
document.getElementById('btn-login-google').onclick = () => {
    // [수정] SDK의 기본 리다이렉트 방식 대신 '팝업'을 사용하여 테스트 편의성 증대
    // 주의: 백엔드 주소가 정확해야 합니다. (로그 기반: https://taco4graphnode.online)
    // 로컬 테스트라면 'http://localhost:3000'으로 변경하세요.
    const BACKEND_URL = 'https://taco4graphnode.online'; 
    const loginUrl = `${BACKEND_URL}/auth/google/start`;

    const width = 500;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    log(`Opening login popup: ${loginUrl}`);
    
    const popup = window.open(
        loginUrl,
        'google_login',
        `width=${width},height=${height},top=${top},left=${left}`
    );

    if (!popup) {
        return log("Popup blocked! Please allow popups for this site.", true);
    }

    // 팝업이 닫혔는지 주기적으로 확인
    const timer = setInterval(async () => {
        if (popup.closed) {
            clearInterval(timer);
            log("Popup closed. Verifying session...");
            
            try {
                // 팝업 닫힌 후 세션 확인 시도
                const me = await client.me.get();
                log("Login Verified!");
                log(me);
            } catch (e) {
                handleError(e);
                log("Login verification failed. (Check Cross-Site Cookie settings if Backend is remote)", true);
            }
        }
    }, 1000);
};

document.getElementById('btn-me').onclick = async () => {
    try {
        const me = await client.me.get();
        log(me);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-logout').onclick = async () => {
    try {
        await client.me.logout();
        log("Logged out successfully");
    } catch (e) { handleError(e); }
};

// Health
document.getElementById('btn-health').onclick = async () => {
    try {
        const res = await client.health.get();
        log(res);
    } catch (e) { handleError(e); }
};

// Conversations
document.getElementById('btn-list-conv').onclick = async () => {
    try {
        const list = await client.conversations.list();
        log(list);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-conv').onclick = async () => {
    const title = document.getElementById('inp-conv-title').value;
    // FE에서 ID 생성 (UUID)
    const id = crypto.randomUUID();
    
    try {
        const res = await client.conversations.create({ 
            id: id,
            title: title || "New Conversation" 
        });
        log(res);
        // 편의를 위해 ID 입력창에 자동 채움
        document.getElementById('inp-conv-id').value = res.id;
    } catch (e) { handleError(e); }
};

document.getElementById('btn-get-conv').onclick = async () => {
    const id = document.getElementById('inp-conv-id').value;
    if (!id) return alert('ID required');
    try {
        const res = await client.conversations.get(id);
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-del-conv').onclick = async () => {
    const id = document.getElementById('inp-conv-id').value;
    if (!id) return alert('ID required');
    try {
        const res = await client.conversations.delete(id);
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-msg').onclick = async () => {
    const id = document.getElementById('inp-conv-id').value;
    const content = document.getElementById('inp-msg-content').value;
    if (!id || !content) return alert('ID and Content required');
    
    // FE에서 ID 및 타임스탬프 생성
    const msgId = crypto.randomUUID();
    const ts = new Date().toISOString();

    try {
        const res = await client.conversations.createMessage(id, {
            id: msgId,
            role: 'user',
            content: content,
            ts: ts
        });
        log(res);
    } catch (e) { handleError(e); }
};

// Graph
document.getElementById('btn-graph-stats').onclick = async () => {
    try {
        const res = await client.graph.getStats();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-list-nodes').onclick = async () => {
    try {
        const res = await client.graph.listNodes();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-list-edges').onclick = async () => {
    try {
        const res = await client.graph.listEdges();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-list-clusters').onclick = async () => {
    try {
        const res = await client.graph.listClusters();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-node').onclick = async () => {
    try {
        const json = document.getElementById('inp-node-json').value;
        const payload = JSON.parse(json);
        const res = await client.graph.createNode(payload);
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-get-node').onclick = async () => {
    const id = document.getElementById('inp-node-id').value;
    if (!id) return alert('Node ID required');
    try {
        const res = await client.graph.getNode(Number(id));
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-del-node').onclick = async () => {
    const id = document.getElementById('inp-node-id').value;
    if (!id) return alert('Node ID required');
    try {
        await client.graph.deleteNode(Number(id));
        log(`Node ${id} deleted`);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-edge').onclick = async () => {
    try {
        const json = document.getElementById('inp-edge-json').value;
        const payload = JSON.parse(json);
        const res = await client.graph.createEdge(payload);
        log(res);
    } catch (e) { handleError(e); }
};

// [추가] 페이지 로드 시 자동 세션 체크
// 사용자가 Google 로그인 후 {ok:true} 화면에서 '뒤로 가기'나 URL 입력으로 돌아왔을 때,
// 로그인이 잘 되었는지 바로 확인하기 위함.
(async () => {
    try {
        const me = await client.me.get();
        log("Session restored automatically: " + me.displayName);
    } catch (e) {
        // 401 등 에러는 아직 로그인 안 된 상태이므로 무시 (로그만 남김)
        console.log("Auto-check: Not logged in yet or session expired.");
    }
})();
